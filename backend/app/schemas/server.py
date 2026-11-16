import uuid
from datetime import datetime
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field, ConfigDict
from app.models.server import ServerStatus

class ServerBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=255, description="Nome de identificação do servidor (ex: VPS Produção 01)")

class ServerCreate(ServerBase):
    pass

class ServerUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    monitored_services: Optional[List[str]] = Field(None, description="Lista de serviços para o agente monitorar (ex: ['nginx', 'docker', 'redis', 'pm2'])")
    cpu_threshold: Optional[float] = Field(None, ge=10.0, le=100.0, description="Limite personalizado de CPU (%) ou null para padrão da organização")
    ram_threshold: Optional[float] = Field(None, ge=10.0, le=100.0, description="Limite personalizado de RAM (%) ou null para padrão da organização")
    disk_threshold: Optional[float] = Field(None, ge=10.0, le=100.0, description="Limite personalizado de Disco (%) ou null para padrão da organização")
    offline_timeout_seconds: Optional[int] = Field(None, ge=60, le=3600, description="Tempo sem sinal personalizado (segundos) ou null para padrão")
    notify_on_offline: Optional[bool] = Field(None, description="Alertar quando este servidor ficar offline")
    notify_on_hardware: Optional[bool] = Field(None, description="Alertar quando CPU/RAM/Disco ultrapassar o limite")

class ServerMetricResponse(BaseModel):
    id: uuid.UUID
    server_id: uuid.UUID
    recorded_at: datetime
    cpu_percent: float
    cpu_cores: Optional[int] = None
    load_avg_1m: Optional[float] = None
    load_avg_5m: Optional[float] = None
    load_avg_15m: Optional[float] = None
    ram_total_bytes: Optional[int] = None
    ram_used_bytes: Optional[int] = None
    ram_available_bytes: Optional[int] = None
    ram_percent: float
    disk_data: Optional[Any] = None
    network_data: Optional[Any] = None
    services_data: Optional[Any] = None
    extra_data: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)

class ServerResponse(ServerBase):
    id: uuid.UUID
    organization_id: uuid.UUID
    hostname: Optional[str] = None
    os_name: Optional[str] = None
    os_version: Optional[str] = None
    kernel: Optional[str] = None
    arch: Optional[str] = None
    agent_version: Optional[str] = None
    status: ServerStatus
    last_communication_at: Optional[datetime] = None
    uptime_seconds: Optional[int] = None
    last_cpu_percent: Optional[float] = None
    last_ram_percent: Optional[float] = None
    last_disk_percent: Optional[float] = None
    monitored_services: List[str] = ["nginx", "docker", "postgres", "mysqld", "apache2"]
    cpu_threshold: Optional[float] = None
    ram_threshold: Optional[float] = None
    disk_threshold: Optional[float] = None
    offline_timeout_seconds: Optional[int] = None
    notify_on_offline: bool = True
    notify_on_hardware: bool = True
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class ServerWithInstallCommandResponse(ServerResponse):
    install_token: str
    install_token_expires_at: datetime
    install_command: str
    install_commands: Optional[Dict[str, str]] = None

class ServerDetailResponse(ServerResponse):
    metrics: List[ServerMetricResponse] = []

    model_config = ConfigDict(from_attributes=True)
