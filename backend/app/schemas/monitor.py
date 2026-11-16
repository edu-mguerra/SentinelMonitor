import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict, field_validator
from app.models.monitor import MonitorType, MonitorStatus

class MonitorBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    type: MonitorType
    target: str = Field(..., min_length=3, max_length=1024, description="URL (para HTTP/HTTPS) ou Host/IP (para TCP)")
    port: Optional[int] = Field(None, ge=1, le=65535, description="Porta TCP (obrigatório se type for TCP)")
    interval_seconds: int = Field(60, ge=30, le=86400, description="Intervalo entre checagens em segundos (mínimo 30s)")
    timeout_seconds: int = Field(10, ge=1, le=60, description="Tempo limite de resposta em segundos")
    expected_status_code: int = Field(200, ge=100, le=599, description="Código HTTP esperado")
    consecutive_failures_threshold: int = Field(2, ge=1, le=10, description="Falhas consecutivas para abrir incidente")

    @field_validator("port")
    @classmethod
    def validate_port_for_tcp(cls, v, info):
        return v

class MonitorCreate(MonitorBase):
    pass

class MonitorUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    target: Optional[str] = Field(None, min_length=3, max_length=1024)
    port: Optional[int] = Field(None, ge=1, le=65535)
    interval_seconds: Optional[int] = Field(None, ge=30, le=86400)
    timeout_seconds: Optional[int] = Field(None, ge=1, le=60)
    expected_status_code: Optional[int] = Field(None, ge=100, le=599)
    consecutive_failures_threshold: Optional[int] = Field(None, ge=1, le=10)
    is_active: Optional[bool] = None
    status: Optional[MonitorStatus] = None

class MonitorCheckResponse(BaseModel):
    id: uuid.UUID
    monitor_id: uuid.UUID
    response_time_ms: Optional[float] = None
    status_code: Optional[int] = None
    is_success: bool
    error_message: Optional[str] = None
    ssl_valid: Optional[bool] = None
    ssl_expiration_date: Optional[datetime] = None
    ssl_issuer: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class MonitorResponse(MonitorBase):
    id: uuid.UUID
    organization_id: uuid.UUID
    status: MonitorStatus
    current_failures: int
    last_checked_at: Optional[datetime] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class MonitorDetailResponse(MonitorResponse):
    checks: List[MonitorCheckResponse] = []

    model_config = ConfigDict(from_attributes=True)
