from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.monitor import Monitor, MonitorStatus
from app.models.incident import Incident, IncidentStatus, IncidentSeverity
from app.services.alert_dispatcher import notify_incident_created, notify_incident_resolved

async def handle_monitor_check_result(
    db: AsyncSession,
    monitor: Monitor,
    is_success: bool,
    error_message: Optional[str] = None
) -> None:
    """
    Processa o resultado de uma verificação de monitoramento, controlando o limiar
    de falhas consecutivas e abrindo ou resolvendo incidentes automaticamente.
    """
    now = datetime.now(timezone.utc)
    monitor.last_checked_at = now

    if is_success:
        monitor.current_failures = 0
        monitor.status = MonitorStatus.UP

        query = select(Incident).where(
            and_(
                Incident.monitor_id == monitor.id,
                Incident.status.in_([IncidentStatus.OPEN, IncidentStatus.ACKNOWLEDGED])
            )
        )
        result = await db.execute(query)
        open_incidents = result.scalars().all()

        for inc in open_incidents:
            inc.status = IncidentStatus.RESOLVED
            inc.resolved_at = now
            await notify_incident_resolved(db, inc)

    else:
        monitor.current_failures += 1

        if monitor.current_failures >= monitor.consecutive_failures_threshold:
            monitor.status = MonitorStatus.DOWN

            query = select(Incident).where(
                and_(
                    Incident.monitor_id == monitor.id,
                    Incident.status.in_([IncidentStatus.OPEN, IncidentStatus.ACKNOWLEDGED])
                )
            )
            result = await db.execute(query)
            existing_incident = result.scalars().first()

            if not existing_incident:
                title = f"Indisponibilidade detectada em '{monitor.name}'"
                desc = (
                    f"O monitor {monitor.name} ({monitor.type.value.upper()}: {monitor.target}) "
                    f"falhou {monitor.current_failures} vezes consecutivas.\n"
                    f"Último erro: {error_message or 'Destino inacessível ou tempo limite esgotado'}"
                )
                new_incident = Incident(
                    organization_id=monitor.organization_id,
                    monitor_id=monitor.id,
                    title=title,
                    description=desc,
                    severity=IncidentSeverity.CRITICAL,
                    status=IncidentStatus.OPEN,
                    started_at=now
                )
                db.add(new_incident)
                await db.flush()
                await notify_incident_created(db, new_incident)
        else:
            monitor.status = MonitorStatus.DEGRADED
