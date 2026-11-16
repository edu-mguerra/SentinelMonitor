import enum
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Enum, ForeignKey, Text, Boolean, Uuid as UUID
from sqlalchemy.orm import relationship
from app.models.base import BaseModel

class IncidentSeverity(str, enum.Enum):
    CRITICAL = "critical"
    WARNING = "warning"
    INFO = "info"

class IncidentStatus(str, enum.Enum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"

class Incident(BaseModel):
    __tablename__ = "incidents"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    monitor_id = Column(
        UUID(as_uuid=True),
        ForeignKey("monitors.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )
    server_id = Column(
        UUID(as_uuid=True),
        nullable=True,
        index=True
    )

    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    severity = Column(
        Enum(IncidentSeverity, name="incident_severity", native_enum=False),
        default=IncidentSeverity.CRITICAL,
        nullable=False
    )
    status = Column(
        Enum(IncidentStatus, name="incident_status", native_enum=False),
        default=IncidentStatus.OPEN,
        nullable=False,
        index=True
    )

    started_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)

    recovery_alert_sent = Column(Boolean, default=False, nullable=False)

    monitor = relationship("Monitor", back_populates="incidents", lazy="selectin")
    organization = relationship("Organization", lazy="selectin")

    def __repr__(self):
        return f"<Incident {self.title} status={self.status} severity={self.severity}>"
