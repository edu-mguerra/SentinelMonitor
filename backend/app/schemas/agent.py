import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict

class AgentHandshakeRequest(BaseModel):
    temp_token: str = Field(..., description="Token temporário gerado no painel")
    hostname: str
    os_name: Optional[str] = None
    os_version: Optional[str] = None
    kernel: Optional[str] = None
    arch: Optional[str] = None
    agent_version: str = "1.0.0"

class AgentHandshakeResponse(BaseModel):
    agent_token: str = Field(..., description="Token permanente exclusivo deste agente")
    server_id: uuid.UUID
    server_name: str
    collection_interval_seconds: int = 30
    monitored_services: Optional[List[str]] = None

class CpuMetrics(BaseModel):
    usage_percent: float
    cores_count: Optional[int] = None
    load_average: Optional[List[float]] = None

class MemoryMetrics(BaseModel):
    total_bytes: Optional[int] = None
    used_bytes: Optional[int] = None
    available_bytes: Optional[int] = None
    usage_percent: float

class DiskPartition(BaseModel):
    mountpoint: str
    device: Optional[str] = None
    total_bytes: Optional[int] = None
    used_bytes: Optional[int] = None
    free_bytes: Optional[int] = None
    usage_percent: float

class NetworkMetrics(BaseModel):
    bytes_sent: Optional[int] = None
    bytes_recv: Optional[int] = None
    rate_sent_kbps: Optional[float] = None
    rate_recv_kbps: Optional[float] = None

class ServiceStatus(BaseModel):
    name: str
    running: bool

class AgentMetricsPayload(BaseModel):
    agent_version: Optional[str] = "1.0.0"
    recorded_at: Optional[datetime] = None
    system: Optional[Dict[str, Any]] = None
    cpu: CpuMetrics
    memory: MemoryMetrics
    disk: Optional[List[DiskPartition]] = None
    network: Optional[NetworkMetrics] = None
    services: Optional[List[ServiceStatus]] = None
    extra: Optional[Dict[str, Any]] = None
