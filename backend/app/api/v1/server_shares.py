import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user, TenantContext
from app.models.organization import OrganizationMember, MemberRole
from app.models.server import Server, ServerShare, ShareStatus, ServerMetric
from app.models.user import User
from app.schemas.server import (
    ServerShareCreate,
    ServerShareResponse,
    SharedServerResponse,
    ShareInviteResponse,
    UserSearchResult,
    ServerDetailResponse,
    ServerMetricResponse,
    ServerResponse,
    ServerReportResponse,
)
from app.services.report_service import build_server_report, parse_report_date_range

router = APIRouter(tags=["VPS Amiga (Compartilhamento)"])

@router.get("/users/search-shareable", response_model=List[UserSearchResult])
async def search_users_to_share(
    query: str = Query(..., min_length=2, description="Nome ou e-mail do usuário para busca"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    clean_q = query.strip().lower()
    sql = (
        select(User)
        .where(
            and_(
                User.is_active == True,
                User.id != current_user.id,
                or_(
                    User.email.ilike(f"%{clean_q}%"),
                    User.full_name.ilike(f"%{clean_q}%")
                )
            )
        )
        .limit(8)
    )
    result = await db.execute(sql)
    users = result.scalars().all()
    return users

@router.get("/organizations/{organization_id}/servers/{server_id}/shares", response_model=List[ServerShareResponse])
async def list_server_shares(
    organization_id: uuid.UUID,
    server_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.OPERATOR, MemberRole.ADMIN, MemberRole.OWNER]))
):
    server = (
        await db.execute(
            select(Server).where(
                and_(
                    Server.id == server_id,
                    Server.organization_id == organization_id
                )
            )
        )
    ).scalars().first()
    if not server:
        raise HTTPException(status_code=404, detail="Servidor não encontrado.")

    shares_query = select(ServerShare).where(ServerShare.server_id == server_id).order_by(ServerShare.created_at.desc())
    shares = (await db.execute(shares_query)).scalars().all()

    output = []
    for s in shares:
        shared_name = None
        if s.shared_with_user:
            shared_name = s.shared_with_user.full_name
        output.append(
            ServerShareResponse(
                id=s.id,
                server_id=s.server_id,
                shared_with_email=s.shared_with_email,
                shared_with_name=shared_name,
                status=s.status.value if hasattr(s.status, 'value') else str(s.status),
                created_at=s.created_at,
                accepted_at=s.accepted_at
            )
        )
    return output

@router.post("/organizations/{organization_id}/servers/{server_id}/shares", response_model=ServerShareResponse, status_code=status.HTTP_201_CREATED)
async def invite_server_share(
    organization_id: uuid.UUID,
    server_id: uuid.UUID,
    payload: ServerShareCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.OPERATOR, MemberRole.ADMIN, MemberRole.OWNER]))
):
    target_email = payload.email.strip().lower()
    if not target_email or "@" not in target_email:
        raise HTTPException(status_code=400, detail="E-mail inválido informado.")

    if target_email == current_user.email.lower().strip():
        raise HTTPException(status_code=400, detail="Você não pode compartilhar uma VPS com você mesmo.")

    server = (
        await db.execute(
            select(Server).where(
                and_(
                    Server.id == server_id,
                    Server.organization_id == organization_id
                )
            )
        )
    ).scalars().first()
    if not server:
        raise HTTPException(status_code=404, detail="Servidor não encontrado.")

    existing_share = (
        await db.execute(
            select(ServerShare).where(
                and_(
                    ServerShare.server_id == server_id,
                    ServerShare.shared_with_email == target_email,
                    ServerShare.status != ShareStatus.REJECTED
                )
            )
        )
    ).scalars().first()

    if existing_share:
        if existing_share.status == ShareStatus.ACCEPTED:
            raise HTTPException(status_code=400, detail="Este servidor já está compartilhado com este usuário.")
        else:
            raise HTTPException(status_code=400, detail="Já existe um convite pendente para este e-mail.")

    target_user = (
        await db.execute(select(User).where(User.email == target_email))
    ).scalars().first()

    new_share = ServerShare(
        server_id=server.id,
        owner_user_id=current_user.id,
        shared_with_email=target_email,
        shared_with_user_id=target_user.id if target_user else None,
        status=ShareStatus.PENDING
    )
    db.add(new_share)
    await db.commit()
    await db.refresh(new_share)

    try:
        import asyncio
        from app.services.email_service import send_email, render_vps_share_invite_email
        invite_html = render_vps_share_invite_email(
            owner_name=current_user.full_name or "Administrador",
            owner_email=current_user.email,
            server_name=server.name
        )
        asyncio.create_task(send_email(
            to_emails=[target_email],
            subject=f"🤝 Convite VPS Amiga: Acesso ao Servidor '{server.name}' no Sentinel Monitor",
            html_body=invite_html
        ))
    except Exception:
        pass

    return ServerShareResponse(
        id=new_share.id,
        server_id=new_share.server_id,
        shared_with_email=new_share.shared_with_email,
        shared_with_name=target_user.full_name if target_user else None,
        status=new_share.status.value if hasattr(new_share.status, 'value') else str(new_share.status),
        created_at=new_share.created_at,
        accepted_at=new_share.accepted_at
    )

@router.delete("/organizations/{organization_id}/servers/{server_id}/shares/{share_id}")
async def revoke_server_share(
    organization_id: uuid.UUID,
    server_id: uuid.UUID,
    share_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.OPERATOR, MemberRole.ADMIN, MemberRole.OWNER]))
):
    share = (
        await db.execute(
            select(ServerShare).where(
                and_(
                    ServerShare.id == share_id,
                    ServerShare.server_id == server_id
                )
            )
        )
    ).scalars().first()
    if not share:
        raise HTTPException(status_code=404, detail="Compartilhamento não encontrado.")

    await db.delete(share)
    await db.commit()
    return {"message": "Compartilhamento revogado com sucesso."}

@router.get("/shared-servers", response_model=List[SharedServerResponse])
async def list_shared_servers_with_me(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = (
        select(ServerShare)
        .where(
            and_(
                or_(
                    ServerShare.shared_with_email == current_user.email.lower().strip(),
                    ServerShare.shared_with_user_id == current_user.id
                ),
                ServerShare.status == ShareStatus.ACCEPTED
            )
        )
        .order_by(ServerShare.accepted_at.desc())
    )
    result = await db.execute(query)
    shares = result.scalars().all()

    output = []
    for s in shares:
        if not s.server:
            continue
        output.append(
            SharedServerResponse(
                share_id=s.id,
                server=ServerResponse.model_validate(s.server),
                owner_name=s.owner.full_name or "Proprietário" if s.owner else "Proprietário",
                owner_email=s.owner.email if s.owner else "",
                shared_at=s.accepted_at or s.created_at
            )
        )
    return output

@router.get("/shared-servers/invites", response_model=List[ShareInviteResponse])
async def list_pending_share_invites(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = (
        select(ServerShare)
        .where(
            and_(
                or_(
                    ServerShare.shared_with_email == current_user.email.lower().strip(),
                    ServerShare.shared_with_user_id == current_user.id
                ),
                ServerShare.status == ShareStatus.PENDING
            )
        )
        .order_by(ServerShare.created_at.desc())
    )
    result = await db.execute(query)
    invites = result.scalars().all()

    output = []
    for inv in invites:
        if not inv.server:
            continue
        output.append(
            ShareInviteResponse(
                id=inv.id,
                server_id=inv.server_id,
                server_name=inv.server.name,
                owner_name=inv.owner.full_name or "Proprietário" if inv.owner else "Proprietário",
                owner_email=inv.owner.email if inv.owner else "",
                created_at=inv.created_at
            )
        )
    return output

@router.post("/shared-servers/invites/{share_id}/accept", response_model=SharedServerResponse)
async def accept_share_invite(
    share_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    share = (
        await db.execute(
            select(ServerShare).where(
                and_(
                    ServerShare.id == share_id,
                    or_(
                        ServerShare.shared_with_email == current_user.email.lower().strip(),
                        ServerShare.shared_with_user_id == current_user.id
                    ),
                    ServerShare.status == ShareStatus.PENDING
                )
            )
        )
    ).scalars().first()

    if not share:
        raise HTTPException(status_code=404, detail="Convite não encontrado ou já processado.")

    now = datetime.now(timezone.utc)
    share.status = ShareStatus.ACCEPTED
    share.accepted_at = now
    share.shared_with_user_id = current_user.id

    await db.commit()
    await db.refresh(share)

    try:
        import asyncio
        from app.services.email_service import send_email, render_vps_share_accepted_email
        if share.owner and share.server:
            notify_html = render_vps_share_accepted_email(
                guest_name=current_user.full_name or "Usuário",
                guest_email=current_user.email,
                server_name=share.server.name
            )
            asyncio.create_task(send_email(
                to_emails=[share.owner.email],
                subject=f"🤝 Convite de VPS Amiga Aceito: '{share.server.name}'",
                html_body=notify_html
            ))
    except Exception:
        pass

    return SharedServerResponse(
        share_id=share.id,
        server=ServerResponse.model_validate(share.server),
        owner_name=share.owner.full_name or "Proprietário" if share.owner else "Proprietário",
        owner_email=share.owner.email if share.owner else "",
        shared_at=share.accepted_at or share.created_at
    )

@router.post("/shared-servers/invites/{share_id}/reject")
async def reject_share_invite(
    share_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    share = (
        await db.execute(
            select(ServerShare).where(
                and_(
                    ServerShare.id == share_id,
                    or_(
                        ServerShare.shared_with_email == current_user.email.lower().strip(),
                        ServerShare.shared_with_user_id == current_user.id
                    ),
                    ServerShare.status == ShareStatus.PENDING
                )
            )
        )
    ).scalars().first()

    if not share:
        raise HTTPException(status_code=404, detail="Convite não encontrado.")

    share.status = ShareStatus.REJECTED
    await db.commit()
    return {"message": "Convite recusado com sucesso."}

@router.get("/shared-servers/{server_id}", response_model=ServerDetailResponse)
async def get_shared_server_detail(
    server_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    share = (
        await db.execute(
            select(ServerShare).where(
                and_(
                    ServerShare.server_id == server_id,
                    or_(
                        ServerShare.shared_with_email == current_user.email.lower().strip(),
                        ServerShare.shared_with_user_id == current_user.id
                    ),
                    ServerShare.status == ShareStatus.ACCEPTED
                )
            )
        )
    ).scalars().first()

    if not share or not share.server:
        raise HTTPException(status_code=403, detail="Você não possui permissão para visualizar esta VPS.")

    metrics_query = (
        select(ServerMetric)
        .where(ServerMetric.server_id == server_id)
        .order_by(ServerMetric.recorded_at.desc())
        .limit(60)
    )
    metrics_res = await db.execute(metrics_query)
    metrics = metrics_res.scalars().all()

    base_data = ServerResponse.model_validate(share.server).model_dump()
    return ServerDetailResponse(
        **base_data,
        metrics=[ServerMetricResponse.model_validate(m) for m in metrics]
    )

@router.get("/shared-servers/{server_id}/report", response_model=ServerReportResponse)
async def get_shared_server_report(
    server_id: uuid.UUID,
    days: int = Query(30, ge=1, le=365),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    share = (
        await db.execute(
            select(ServerShare).where(
                and_(
                    ServerShare.server_id == server_id,
                    or_(
                        ServerShare.shared_with_email == current_user.email.lower().strip(),
                        ServerShare.shared_with_user_id == current_user.id
                    ),
                    ServerShare.status == ShareStatus.ACCEPTED
                )
            )
        )
    ).scalars().first()

    if not share or not share.server:
        raise HTTPException(status_code=403, detail="Você não possui permissão para visualizar esta VPS.")

    try:
        start_dt, end_dt = parse_report_date_range(days=days, start_date=start_date, end_date=end_date)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return await build_server_report(db, share.server, start_dt, end_dt)
