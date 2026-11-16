import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, TenantContext
from app.models.organization import OrganizationMember, MemberRole
from app.models.monitor import Monitor, MonitorType, MonitorCheck
from app.schemas.monitor import (
    MonitorCreate,
    MonitorUpdate,
    MonitorResponse,
    MonitorDetailResponse,
    MonitorCheckResponse,
)
from app.services.ssrf_protection import validate_target_url, validate_tcp_target, SSRFValidationError
from app.services.checker import execute_monitor_check

router = APIRouter(
    prefix="/organizations/{organization_id}/monitors",
    tags=["Monitores Externos (HTTP/HTTPS/TCP)"]
)

@router.get("", response_model=List[MonitorResponse])
async def list_monitors(
    organization_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.VIEWER]))
):
    """Lista todos os monitores cadastrados na organização."""
    query = select(Monitor).where(Monitor.organization_id == organization_id).order_by(Monitor.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()

def _normalize_monitor_target(monitor_type: MonitorType, raw_target: str, raw_port: Optional[int]) -> tuple[str, Optional[int]]:
    """Permite informar IP:Porta ou host sem esquema e normaliza para validação."""
    target = raw_target.strip()
    port = raw_port

    if monitor_type in (MonitorType.HTTP, MonitorType.HTTPS):
        if "://" not in target:
            target = f"{monitor_type.value}://{target}"
        return target, None

    if monitor_type == MonitorType.TCP and port is None and target.count(":") == 1:
        host_part, port_part = target.split(":", 1)
        if port_part.isdigit():
            target = host_part.strip()
            port = int(port_part)

    return target, port

@router.post("", response_model=MonitorResponse, status_code=status.HTTP_201_CREATED)
async def create_monitor(
    organization_id: uuid.UUID,
    monitor_in: MonitorCreate,
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.OPERATOR, MemberRole.ADMIN, MemberRole.OWNER]))
):
    """Cria um novo monitor HTTP, HTTPS ou TCP com validação antecipada contra SSRF."""
    normalized_target, normalized_port = _normalize_monitor_target(
        monitor_in.type, monitor_in.target, monitor_in.port
    )

    if monitor_in.type == MonitorType.TCP:
        if not normalized_port:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Monitores TCP exigem a especificação de uma porta."
            )
        try:
            validate_tcp_target(normalized_target, normalized_port)
        except SSRFValidationError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    else:
        try:
            validate_target_url(normalized_target)
        except SSRFValidationError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    new_monitor = Monitor(
        organization_id=organization_id,
        name=monitor_in.name,
        type=monitor_in.type,
        target=normalized_target,
        port=normalized_port,
        interval_seconds=monitor_in.interval_seconds,
        timeout_seconds=monitor_in.timeout_seconds,
        expected_status_code=monitor_in.expected_status_code,
        consecutive_failures_threshold=monitor_in.consecutive_failures_threshold,
        is_active=True
    )

    db.add(new_monitor)
    await db.commit()
    await db.refresh(new_monitor)

    return new_monitor

@router.get("/{monitor_id}", response_model=MonitorDetailResponse)
async def get_monitor(
    organization_id: uuid.UUID,
    monitor_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.VIEWER]))
):
    """Retorna os detalhes de um monitor com histórico recente de verificações."""
    query = select(Monitor).where(
        and_(
            Monitor.id == monitor_id,
            Monitor.organization_id == organization_id
        )
    )
    result = await db.execute(query)
    monitor = result.scalars().first()

    if not monitor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Monitor não encontrado.")

    checks_query = (
        select(MonitorCheck)
        .where(MonitorCheck.monitor_id == monitor_id)
        .order_by(MonitorCheck.created_at.desc())
        .limit(50)
    )
    checks_res = await db.execute(checks_query)
    checks = checks_res.scalars().all()

    resp = MonitorDetailResponse.model_validate(monitor)
    resp.checks = [MonitorCheckResponse.model_validate(c) for c in checks]
    return resp

@router.patch("/{monitor_id}", response_model=MonitorResponse)
async def update_monitor(
    organization_id: uuid.UUID,
    monitor_id: uuid.UUID,
    monitor_in: MonitorUpdate,
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.OPERATOR, MemberRole.ADMIN, MemberRole.OWNER]))
):
    """Atualiza as configurações de um monitor existente."""
    query = select(Monitor).where(
        and_(
            Monitor.id == monitor_id,
            Monitor.organization_id == organization_id
        )
    )
    result = await db.execute(query)
    monitor = result.scalars().first()

    if not monitor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Monitor não encontrado.")

    new_target = monitor_in.target or monitor.target
    new_port = monitor_in.port if monitor_in.port is not None else monitor.port

    if monitor_in.target or monitor_in.port:
        if monitor.type == MonitorType.TCP:
            try:
                validate_tcp_target(new_target, new_port or 80)
            except SSRFValidationError as e:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        else:
            try:
                validate_target_url(new_target)
            except SSRFValidationError as e:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    update_data = monitor_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(monitor, field, value)

    await db.commit()
    await db.refresh(monitor)
    return monitor

@router.delete("/{monitor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_monitor(
    organization_id: uuid.UUID,
    monitor_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.ADMIN, MemberRole.OWNER]))
):
    """Remove um monitor da organização."""
    query = select(Monitor).where(
        and_(
            Monitor.id == monitor_id,
            Monitor.organization_id == organization_id
        )
    )
    result = await db.execute(query)
    monitor = result.scalars().first()

    if not monitor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Monitor não encontrado.")

    await db.delete(monitor)
    await db.commit()
    return None

@router.post("/{monitor_id}/check", response_model=MonitorCheckResponse)
async def trigger_manual_check(
    organization_id: uuid.UUID,
    monitor_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.OPERATOR, MemberRole.ADMIN, MemberRole.OWNER]))
):
    """Dispara uma verificação imediata (on-demand) do monitor."""
    query = select(Monitor).where(
        and_(
            Monitor.id == monitor_id,
            Monitor.organization_id == organization_id
        )
    )
    result = await db.execute(query)
    monitor = result.scalars().first()

    if not monitor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Monitor não encontrado.")

    check = await execute_monitor_check(db, monitor)
    return check
