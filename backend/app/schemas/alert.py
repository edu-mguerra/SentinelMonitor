import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from app.models.alert import AlertChannelType

class AlertChannelBase(BaseModel):
    type: AlertChannelType = AlertChannelType.EMAIL
    destination: str = Field(..., description="E-mails de destino separados por vírgula")
    is_active: bool = True

class AlertChannelCreate(AlertChannelBase):
    pass

class AlertChannelResponse(AlertChannelBase):
    id: uuid.UUID
    organization_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class AlertRuleBase(BaseModel):
    cpu_threshold: float = Field(85.0, ge=10.0, le=100.0, description="Limite de CPU (%)")
    ram_threshold: float = Field(90.0, ge=10.0, le=100.0, description="Limite de Memória RAM (%)")
    disk_threshold: float = Field(90.0, ge=10.0, le=100.0, description="Limite de Disco (%)")
    server_offline_timeout_seconds: int = Field(120, ge=60, le=3600, description="Tempo sem sinal para considerar VPS offline (segundos)")
    notify_on_recovery: bool = Field(True, description="Enviar e-mail quando o serviço for restaurado")

class AlertRuleUpdate(AlertRuleBase):
    pass

class AlertRuleResponse(AlertRuleBase):
    id: uuid.UUID
    organization_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class AlertConfigResponse(BaseModel):
    channels: List[AlertChannelResponse]
    rules: AlertRuleResponse

class AlertHistoryResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    channel_type: str
    recipient: str
    subject: str
    content_preview: Optional[str] = None
    is_success: bool
    error_message: Optional[str] = None
    sent_at: datetime

    model_config = ConfigDict(from_attributes=True)

class TestEmailRequest(BaseModel):
    recipient: Optional[str] = Field(None, description="Destinatário específico para o e-mail de teste")
