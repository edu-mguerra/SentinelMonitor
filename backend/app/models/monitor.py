import enum
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Enum, ForeignKey, Text, Uuid as UUID
from sqlalchemy.orm import relationship
from app.models.base import BaseModel

class MonitorType(str, enum.Enum):
    HTTP = "http"
    HTTPS = "https"
    TCP = "tcp"

class MonitorStatus(str, enum.Enum):
    UP = "up"
    DOWN = "down"
    DEGRADED = "degraded"
    PAUSED = "paused"
    PENDING = "pending"

class Monitor(BaseModel):
    __tablename__ = "monitors"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    name = Column(String(255), nullable=False)
    type = Column(
        Enum(MonitorType, name="monitor_type", native_enum=False),
        nullable=False
    )
    target = Column(String(1024), nullable=False)
    port = Column(Integer, nullable=True)

    interval_seconds = Column(Integer, default=60, nullable=False)
    timeout_seconds = Column(Integer, default=10, nullable=False)
    expected_status_code = Column(Integer, default=200, nullable=False)

    consecutive_failures_threshold = Column(Integer, default=2, nullable=False)
    current_failures = Column(Integer, default=0, nullable=False)

    status = Column(
        Enum(MonitorStatus, name="monitor_status", native_enum=False),
        default=MonitorStatus.PENDING,
        nullable=False
    )
    last_checked_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    organization = relationship("Organization", lazy="selectin")
    checks = relationship(
        "MonitorCheck",
        back_populates="monitor",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="desc(MonitorCheck.created_at)",
        lazy="noload"
    )
    incidents = relationship(
        "Incident",
        back_populates="monitor",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="noload"
    )

    def __repr__(self):
        return f"<Monitor {self.name} [{self.type.value}] target={self.target} status={self.status}>"

class MonitorCheck(BaseModel):
    __tablename__ = "monitor_checks"

    monitor_id = Column(
        UUID(as_uuid=True),
        ForeignKey("monitors.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    response_time_ms = Column(Float, nullable=True)
    status_code = Column(Integer, nullable=True)
    is_success = Column(Boolean, nullable=False)
    error_message = Column(Text, nullable=True)

    ssl_valid = Column(Boolean, nullable=True)
    ssl_expiration_date = Column(DateTime(timezone=True), nullable=True)
    ssl_issuer = Column(String(255), nullable=True)

    monitor = relationship("Monitor", back_populates="checks", lazy="select")

    def __repr__(self):
        return f"<MonitorCheck monitor={self.monitor_id} success={self.is_success} time={self.response_time_ms}ms>"
