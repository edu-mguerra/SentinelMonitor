import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_db, get_current_active_superuser
from app.models.user import User
from app.models.agent_release import AgentRelease
from app.models.organization import OrganizationMember, MemberRole
from app.models.server import Server

router = APIRouter(prefix="/admin", tags=["Administração Master"])

class AdminUserItem(BaseModel):
    id: uuid.UUID
    email: str
    full_name: Optional[str] = None
    is_active: bool
    is_superuser: bool
    created_at: datetime
    servers_count: int = 0

    model_config = ConfigDict(from_attributes=True)

class AgentReleaseCreate(BaseModel):
    version: str
    title: Optional[str] = None
    changelog: List[str]
    is_published: bool = False

class AgentReleaseResponse(BaseModel):
    id: uuid.UUID
    version: str
    title: Optional[str] = None
    changelog: List[str]
    is_published: bool
    published_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

@router.get("/users", response_model=List[AdminUserItem])
async def list_registered_users(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(get_current_active_superuser)
):
    """
    Retorna exclusivamente a lista de contas/usuários cadastrados na plataforma (Nome e E-mail).
    Acesso restrito exclusivamente à Conta Master (is_superuser=True).
    O Master NÃO acessa servidores, métricas, dados internos ou credenciais dos usuários.
    """
    query = select(User).order_by(User.created_at.desc())
    result = await db.execute(query)
    users = result.scalars().all()

    counts_query = (
        select(OrganizationMember.user_id, func.count(Server.id))
        .join(Server, Server.organization_id == OrganizationMember.organization_id)
        .where(OrganizationMember.role == MemberRole.OWNER)
        .group_by(OrganizationMember.user_id)
    )
    counts_res = await db.execute(counts_query)
    servers_map = {row[0]: row[1] for row in counts_res.all()}

    output = []
    for u in users:
        item = AdminUserItem(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            is_active=u.is_active,
            is_superuser=u.is_superuser,
            created_at=u.created_at,
            servers_count=servers_map.get(u.id, 0)
        )
        output.append(item)
    return output

@router.post("/users/{user_id}/approve", response_model=AdminUserItem)
async def approve_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(get_current_active_superuser)
):
    """
    Aprova o acesso de um usuário pendente e envia e-mail de notificação de liberação de conta.
    """
    query = select(User).where(User.id == user_id)
    result = await db.execute(query)
    target_user = result.scalars().first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    target_user.is_active = True
    await db.commit()
    await db.refresh(target_user)

    try:
        import asyncio
        from app.services.email_service import send_email, render_account_approved_email
        approved_html = render_account_approved_email(target_user.full_name or "Usuário")
        asyncio.create_task(send_email(
            to_emails=[target_user.email],
            subject="🎉 Sua conta no Sentinel Monitor foi aprovada!",
            html_body=approved_html
        ))
    except Exception:
        pass

    return target_user

@router.post("/users/{user_id}/toggle-active", response_model=AdminUserItem)
async def toggle_user_active(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(get_current_active_superuser)
):
    """
    Alterna o status ativo/inativo de um usuário cadastrado.
    """
    if user_id == admin_user.id:
        raise HTTPException(status_code=400, detail="Você não pode desativar seu próprio usuário administrador.")

    query = select(User).where(User.id == user_id)
    result = await db.execute(query)
    target_user = result.scalars().first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    target_user.is_active = not target_user.is_active
    await db.commit()
    await db.refresh(target_user)
    return target_user

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(get_current_active_superuser)
):
    """
    Exclui permanentemente um usuário da plataforma.
    """
    if user_id == admin_user.id:
        raise HTTPException(status_code=400, detail="Você não pode excluir seu próprio usuário administrador.")

    query = select(User).where(User.id == user_id)
    result = await db.execute(query)
    target_user = result.scalars().first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    await db.delete(target_user)
    await db.commit()
    return {"message": f"Usuário {target_user.email} excluído com sucesso."}

@router.get("/releases", response_model=List[AgentReleaseResponse])
async def list_agent_releases(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(get_current_active_superuser)
):
    """
    Lista todas as versões e releases do Sentinel Agent (Rascunhos e Publicadas).
    Exclusivo para o Master Admin.
    """
    query = select(AgentRelease).order_by(AgentRelease.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/releases", response_model=AgentReleaseResponse, status_code=status.HTTP_201_CREATED)
async def create_agent_release(
    payload: AgentReleaseCreate,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(get_current_active_superuser)
):
    """
    Cria uma nova versão do agente (como rascunho ou publicada imediatamente).
    Somente após ser publicada é que o painel dos clientes passa a avisar sobre a atualização.
    """
    version_clean = payload.version.strip().lstrip("v")
    if not version_clean:
        raise HTTPException(status_code=400, detail="Número de versão inválido.")

    existing = await db.execute(select(AgentRelease).where(AgentRelease.version == version_clean))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"A versão v{version_clean} já está cadastrada.")

    cleaned_changelog = [item.strip() for item in payload.changelog if item.strip()]
    if not cleaned_changelog:
        raise HTTPException(status_code=400, detail="Informe pelo menos 1 item no que há de novo (changelog).")

    now = datetime.now(timezone.utc)
    new_release = AgentRelease(
        version=version_clean,
        title=payload.title.strip() if payload.title else f"Atualização v{version_clean}",
        changelog=cleaned_changelog,
        is_published=payload.is_published,
        published_at=now if payload.is_published else None,
        created_by_user_id=str(admin_user.id)
    )

    db.add(new_release)
    await db.commit()
    await db.refresh(new_release)
    return new_release

@router.post("/releases/{release_id}/publish", response_model=AgentReleaseResponse)
async def publish_agent_release(
    release_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(get_current_active_superuser)
):
    """
    Solta / publica a atualização para distribuição geral.
    A partir desta ação, todas as VPSs cadastradas que possuem versão anterior
    passam a exibir o sinal de atualização no painel dos clientes.
    """
    result = await db.execute(select(AgentRelease).where(AgentRelease.id == release_id))
    release = result.scalar_one_or_none()
    if not release:
        raise HTTPException(status_code=404, detail="Release não encontrada.")

    release.is_published = True
    release.published_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(release)
    return release

@router.delete("/releases/{release_id}")
async def delete_agent_release(
    release_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(get_current_active_superuser)
):
    """Exclui uma versão de agente do catálogo Master."""
    result = await db.execute(select(AgentRelease).where(AgentRelease.id == release_id))
    release = result.scalar_one_or_none()
    if not release:
        raise HTTPException(status_code=404, detail="Release não encontrada.")

    await db.delete(release)
    await db.commit()
    return {"message": f"Versão v{release.version} removida com sucesso."}
