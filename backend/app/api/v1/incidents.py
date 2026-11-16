import uuid
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, TenantContext
from app.models.organization import OrganizationMember, MemberRole
from app.models.incident import Incident, IncidentStatus
from app.schemas.incident import IncidentResponse, IncidentUpdate

router = APIRouter(
    prefix="/organizations/{organization_id}/incidents",
    tags=["Incidentes"]
)

@router.get("", response_model=List[IncidentResponse])
async def list_incidents(
    organization_id: uuid.UUID,
    status: Optional[IncidentStatus] = Query(None, description="Filtrar por status do incidente"),
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.VIEWER]))
):
    """Lista todos os incidentes da organização."""
    conditions = [Incident.organization_id == organization_id]
    if status:
        conditions.append(Incident.status == status)

    query = select(Incident).where(and_(*conditions)).order_by(Incident.started_at.desc())
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/{incident_id}", response_model=IncidentResponse)
async def get_incident(
    organization_id: uuid.UUID,
    incident_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.VIEWER]))
):
    """Retorna detalhes de um incidente."""
    query = select(Incident).where(
        and_(
            Incident.id == incident_id,
            Incident.organization_id == organization_id
        )
    )
    result = await db.execute(query)
    incident = result.scalars().first()

    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incidente não encontrado.")

    return incident

@router.patch("/{incident_id}", response_model=IncidentResponse)
async def update_incident(
    organization_id: uuid.UUID,
    incident_id: uuid.UUID,
    incident_in: IncidentUpdate,
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.OPERATOR, MemberRole.ADMIN, MemberRole.OWNER]))
):
    """Atualiza o estado de um incidente (ex: reconhecer ou resolver manualmente)."""
    query = select(Incident).where(
        and_(
            Incident.id == incident_id,
            Incident.organization_id == organization_id
        )
    )
    result = await db.execute(query)
    incident = result.scalars().first()

    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incidente não encontrado.")

    now = datetime.now(timezone.utc)
    if incident_in.status == IncidentStatus.ACKNOWLEDGED:
        incident.status = IncidentStatus.ACKNOWLEDGED
        incident.acknowledged_at = now
    elif incident_in.status == IncidentStatus.RESOLVED:
        incident.status = IncidentStatus.RESOLVED
        incident.resolved_at = now
    elif incident_in.status == IncidentStatus.OPEN:
        incident.status = IncidentStatus.OPEN
        incident.resolved_at = None

    await db.commit()
    await db.refresh(incident)
    return incident
