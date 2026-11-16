import enum
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Enum, ForeignKey, Text, Uuid as UUID
from sqlalchemy.orm import relationship
from app.models.base import BaseModel

class AlertChannelType(str, enum.Enum):
    EMAIL = "email"
    TELEGRAM = "telegram"
    WEBHOOK = "webhook"

class AlertChannel(BaseModel):
    """Canal de notificação por organização (ex: e-mails de destino)."""
    __tablename__ = "alert_channels"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    type = Column(
        Enum(AlertChannelType, name="alert_channel_type", native_enum=False),
        default=AlertChannelType.EMAIL,
        nullable=False
    )
    destination = Column(String(512), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    organization = relationship("Organization", lazy="selectin")

    def __repr__(self):
        return f"<AlertChannel type={self.type} destination={self.destination}>"

class AlertRule(BaseModel):
    """Regras e limites de alerta configuráveis para a organização."""
    __tablename__ = "alert_rules"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True
    )

    cpu_threshold = Column(Float, default=85.0, nullable=False)
    ram_threshold = Column(Float, default=90.0, nullable=False)
    disk_threshold = Column(Float, default=90.0, nullable=False)

    server_offline_timeout_seconds = Column(Integer, default=120, nullable=False)

    notify_on_recovery = Column(Boolean, default=True, nullable=False)

    organization = relationship("Organization", lazy="selectin")

    def __repr__(self):
        return f"<AlertRule org={self.organization_id} cpu={self.cpu_threshold}% ram={self.ram_threshold}%>"

class AlertHistory(BaseModel):
    """Auditoria de todas as notificações enviadas pelo sistema."""
    __tablename__ = "alert_history"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    channel_type = Column(String(50), default="email", nullable=False)
    recipient = Column(String(255), nullable=False)
    subject = Column(String(255), nullable=False)
    content_preview = Column(Text, nullable=True)
    is_success = Column(Boolean, nullable=False)
    error_message = Column(Text, nullable=True)
    sent_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    organization = relationship("Organization", lazy="selectin")

    def __repr__(self):
        return f"<AlertHistory to={self.recipient} subject={self.subject} success={self.is_success}>"
