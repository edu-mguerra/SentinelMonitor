import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from app.models.incident import IncidentSeverity, IncidentStatus

class IncidentResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    monitor_id: Optional[uuid.UUID] = None
    server_id: Optional[uuid.UUID] = None
    title: str
    description: Optional[str] = None
    severity: IncidentSeverity
    status: IncidentStatus
    started_at: datetime
    resolved_at: Optional[datetime] = None
    acknowledged_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class IncidentUpdate(BaseModel):
    status: Optional[IncidentStatus] = None
