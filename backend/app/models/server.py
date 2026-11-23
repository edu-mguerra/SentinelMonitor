import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, BigInteger, Float, Boolean, DateTime, Enum, ForeignKey, Text, JSON, Uuid as UUID
from sqlalchemy.orm import relationship
from app.models.base import BaseModel

class ServerStatus(str, enum.Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    WARNING = "warning"
    PENDING = "pending"

class ShareStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"

class Server(BaseModel):
    __tablename__ = "servers"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    name = Column(String(255), nullable=False)
    hostname = Column(String(255), nullable=True)

    os_name = Column(String(100), nullable=True)
    os_version = Column(String(100), nullable=True)
    kernel = Column(String(100), nullable=True)
    arch = Column(String(50), nullable=True)
    agent_version = Column(String(50), nullable=True)

    status = Column(
        Enum(ServerStatus, name="server_status", native_enum=False),
        default=ServerStatus.PENDING,
        nullable=False
    )
    last_communication_at = Column(DateTime(timezone=True), nullable=True)
    uptime_seconds = Column(BigInteger, nullable=True)

    last_cpu_percent = Column(Float, nullable=True)
    last_ram_percent = Column(Float, nullable=True)
    last_disk_percent = Column(Float, nullable=True)

    monitored_services = Column(
        JSON,
        default=lambda: ["nginx", "docker", "postgres", "mysqld", "apache2"],
        nullable=False
    )

    cpu_threshold = Column(Float, nullable=True)
    ram_threshold = Column(Float, nullable=True)
    disk_threshold = Column(Float, nullable=True)
    offline_timeout_seconds = Column(Integer, nullable=True)
    notify_on_offline = Column(Boolean, default=True, nullable=False)
    notify_on_hardware = Column(Boolean, default=True, nullable=False)

    agent_token_hash = Column(String(255), nullable=True, unique=True, index=True)

    organization = relationship("Organization", lazy="selectin")
    install_tokens = relationship(
        "AgentInstallToken",
        back_populates="server",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="noload"
    )
    metrics = relationship(
        "ServerMetric",
        back_populates="server",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="desc(ServerMetric.recorded_at)",
        lazy="noload"
    )
    shares = relationship(
        "ServerShare",
        back_populates="server",
        cascade="all, delete-orphan",
        lazy="selectin"
    )

    def __repr__(self):
        return f"<Server {self.name} status={self.status} os={self.os_name}>"

class AgentInstallToken(BaseModel):
    """
    Token temporário de uso único gerado para o comando one-liner.
    Expira em 15 minutos e é invalidado logo após o primeiro handshake.
    """
    __tablename__ = "agent_install_tokens"

    server_id = Column(
        UUID(as_uuid=True),
        ForeignKey("servers.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    token = Column(String(128), unique=True, index=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    is_used = Column(Boolean, default=False, nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)

    server = relationship("Server", back_populates="install_tokens", lazy="select")

    def __repr__(self):
        return f"<AgentInstallToken token={self.token[:8]}... used={self.is_used}>"

class ServerMetric(BaseModel):
    """
    Métricas de telemetria coletadas pelo agente Linux.
    Modelada para séries temporais com particionamento por recorded_at.
    """
    __tablename__ = "server_metrics"

    server_id = Column(
        UUID(as_uuid=True),
        ForeignKey("servers.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    recorded_at = Column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
        default=lambda: datetime.now(timezone.utc)
    )

    cpu_percent = Column(Float, nullable=False)
    cpu_cores = Column(Integer, nullable=True)
    load_avg_1m = Column(Float, nullable=True)
    load_avg_5m = Column(Float, nullable=True)
    load_avg_15m = Column(Float, nullable=True)

    ram_total_bytes = Column(BigInteger, nullable=True)
    ram_used_bytes = Column(BigInteger, nullable=True)
    ram_available_bytes = Column(BigInteger, nullable=True)
    ram_percent = Column(Float, nullable=False)

    disk_data = Column(JSON, nullable=True)
    network_data = Column(JSON, nullable=True)

    services_data = Column(JSON, nullable=True)

    extra_data = Column(JSON, nullable=True)

    server = relationship("Server", back_populates="metrics", lazy="select")

    def __repr__(self):
        return f"<ServerMetric server={self.server_id} cpu={self.cpu_percent}% ram={self.ram_percent}% time={self.recorded_at}>"

class ServerShare(BaseModel):
    """
    Representa o compartilhamento de uma VPS ('VPS Amiga') entre usuários.
    Permite que outro usuário acompanhe telemetria e receba alertas da mesma VPS.
    """
    __tablename__ = "server_shares"

    server_id = Column(
        UUID(as_uuid=True),
        ForeignKey("servers.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    owner_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    shared_with_email = Column(String(255), nullable=False, index=True)
    shared_with_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    status = Column(
        Enum(ShareStatus, name="server_share_status", native_enum=False),
        default=ShareStatus.PENDING,
        nullable=False
    )
    accepted_at = Column(DateTime(timezone=True), nullable=True)

    server = relationship("Server", back_populates="shares", lazy="selectin")
    owner = relationship("User", foreign_keys=[owner_user_id], lazy="selectin")
    shared_with_user = relationship("User", foreign_keys=[shared_with_user_id], lazy="selectin")

    def __repr__(self):
        return f"<ServerShare server={self.server_id} to={self.shared_with_email} status={self.status}>"
