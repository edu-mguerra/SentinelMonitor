import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.incident import Incident, IncidentStatus, IncidentSeverity
from app.models.alert import AlertChannel, AlertChannelType, AlertRule, AlertHistory
from app.models.organization import OrganizationMember, MemberRole
from app.models.user import User
from app.models.server import Server, ServerStatus, ServerShare, ShareStatus
from app.models.monitor import Monitor
from app.services.email_service import (
    send_email,
    render_incident_alert_email,
    render_recovery_alert_email,
    render_vps_offline_email,
    render_hardware_alert_email,
)

logger = logging.getLogger("sentinel.alerts")

async def get_org_alert_emails(db: AsyncSession, organization_id) -> List[str]:
    """Busca a lista de e-mails configurados para a organização (ou o e-mail do owner como fallback)."""
    query = select(AlertChannel).where(
        and_(
            AlertChannel.organization_id == organization_id,
            AlertChannel.type == AlertChannelType.EMAIL,
            AlertChannel.is_active == True
        )
    )
    result = await db.execute(query)
    channels = result.scalars().all()

    recipients = []
    for ch in channels:
        emails = [e.strip() for e in ch.destination.split(",") if "@" in e]
        recipients.extend(emails)

    if recipients:
        return list(set(recipients))

    owner_query = (
        select(User.email)
        .join(OrganizationMember, User.id == OrganizationMember.user_id)
        .where(
            and_(
                OrganizationMember.organization_id == organization_id,
                OrganizationMember.role == MemberRole.OWNER
            )
        )
    )
    owner_res = await db.execute(owner_query)
    owner_email = owner_res.scalars().first()
    return [owner_email] if owner_email else []

async def get_server_alert_emails(db: AsyncSession, server: Server) -> List[str]:
    recipients = await get_org_alert_emails(db, server.organization_id)

    share_query = select(ServerShare.shared_with_email).where(
        and_(
            ServerShare.server_id == server.id,
            ServerShare.status == ShareStatus.ACCEPTED
        )
    )
    share_res = await db.execute(share_query)
    shared_emails = [e.strip() for e in share_res.scalars().all() if e and "@" in e]

    all_emails = list(dict.fromkeys(recipients + shared_emails))
    return all_emails

async def notify_incident_created(db: AsyncSession, incident: Incident) -> None:
    """Dispara e-mail de alerta quando um incidente de indisponibilidade é aberto."""
    try:
        subject = f"🚨 [ALERTA CRÍTICO] {incident.title}"
        resource_name = "Recurso Monitorado"
        resource_type = "Serviço"
        recipients: List[str] = []

        if incident.monitor_id:
            m_res = await db.execute(select(Monitor).where(Monitor.id == incident.monitor_id))
            mon = m_res.scalars().first()
            if mon:
                resource_name = mon.name
                resource_type = f"Monitor Web ({mon.type.value.upper()}: {mon.target})"
                subject = f"🚨 [ALERTA CRÍTICO] Indisponibilidade em '{mon.name}' ({mon.target})"
            recipients = await get_org_alert_emails(db, incident.organization_id)
        elif incident.server_id:
            s_res = await db.execute(select(Server).where(Server.id == incident.server_id))
            srv = s_res.scalars().first()
            if srv:
                resource_name = srv.name
                resource_type = f"Servidor VPS ({srv.hostname or 'Host'})"
                subject = f"🚨 [ALERTA CRÍTICO] Falha no Servidor '{srv.name}'"
                recipients = await get_server_alert_emails(db, srv)
            else:
                recipients = await get_org_alert_emails(db, incident.organization_id)
        else:
            recipients = await get_org_alert_emails(db, incident.organization_id)

        if not recipients:
            logger.info(f"Nenhum destinatário de e-mail encontrado para o incidente {incident.id}")
            return

        html_body = render_incident_alert_email(
            incident_title=incident.title,
            resource_name=resource_name,
            resource_type=resource_type,
            details=incident.description or "Sem detalhes adicionais.",
            started_at=incident.started_at
        )

        success, err = await send_email(recipients, subject, html_body)

        for r in recipients:
            history = AlertHistory(
                organization_id=incident.organization_id,
                channel_type="email",
                recipient=r,
                subject=subject,
                content_preview=incident.title,
                is_success=success,
                error_message=err
            )
            db.add(history)
        await db.commit()
    except Exception as e:
        logger.error(f"Erro ao processar notificação de criação de incidente: {e}", exc_info=True)

async def notify_incident_resolved(db: AsyncSession, incident: Incident) -> None:
    """Dispara e-mail de recuperação quando o serviço volta ao ar."""
    try:
        rule_res = await db.execute(select(AlertRule).where(AlertRule.organization_id == incident.organization_id))
        rule = rule_res.scalars().first()
        if rule and not rule.notify_on_recovery:
            return

        subject = f"✅ [RESTABELECIDO] {incident.title}"
        resource_name = incident.title
        recipients: List[str] = []

        if incident.monitor_id:
            m_res = await db.execute(select(Monitor).where(Monitor.id == incident.monitor_id))
            mon = m_res.scalars().first()
            if mon:
                resource_name = f"{mon.name} ({mon.target})"
            recipients = await get_org_alert_emails(db, incident.organization_id)
        elif incident.server_id:
            s_res = await db.execute(select(Server).where(Server.id == incident.server_id))
            srv = s_res.scalars().first()
            if srv:
                resource_name = f"Servidor {srv.name}"
                recipients = await get_server_alert_emails(db, srv)
            else:
                recipients = await get_org_alert_emails(db, incident.organization_id)
        else:
            recipients = await get_org_alert_emails(db, incident.organization_id)

        if not recipients:
            return

        duration_str = "--"
        if incident.resolved_at and incident.started_at:
            delta = incident.resolved_at - incident.started_at
            minutes = int(delta.total_seconds() // 60)
            seconds = int(delta.total_seconds() % 60)
            duration_str = f"{minutes}m {seconds}s"

        html_body = render_recovery_alert_email(
            incident_title=incident.title,
            resource_name=resource_name,
            duration_str=duration_str,
            resolved_at=incident.resolved_at or datetime.now(timezone.utc)
        )

        success, err = await send_email(recipients, subject, html_body)

        for r in recipients:
            history = AlertHistory(
                organization_id=incident.organization_id,
                channel_type="email",
                recipient=r,
                subject=subject,
                content_preview=f"Recuperado: {incident.title}",
                is_success=success,
                error_message=err
            )
            db.add(history)
        await db.commit()
    except Exception as e:
        logger.error(f"Erro ao processar notificação de recuperação: {e}", exc_info=True)

async def check_servers_offline_job(db: AsyncSession) -> None:
    """
    Varredura periódica de servidores sem sinal: detecta VPS que pararam de enviar telemetria,
    marca como OFFLINE, abre incidente crítico e envia e-mail de alerta específico.
    """
    now = datetime.now(timezone.utc)

    query = select(Server).where(Server.status == ServerStatus.ONLINE)
    result = await db.execute(query)
    online_servers = result.scalars().all()

    for srv in online_servers:
        if not srv.last_communication_at:
            continue

        last_comm = srv.last_communication_at
        if last_comm.tzinfo is None:
            last_comm = last_comm.replace(tzinfo=timezone.utc)

        rule_query = select(AlertRule).where(AlertRule.organization_id == srv.organization_id)
        rule_res = await db.execute(rule_query)
        rule = rule_res.scalars().first()
        timeout_seconds = (
            srv.offline_timeout_seconds
            if srv.offline_timeout_seconds is not None
            else (rule.server_offline_timeout_seconds if rule else 120)
        )

        if now - last_comm > timedelta(seconds=timeout_seconds):
            logger.warning(f"Servidor {srv.name} sem comunicação há mais de {timeout_seconds}s. Marcando como OFFLINE.")
            srv.status = ServerStatus.OFFLINE

            if not getattr(srv, "notify_on_offline", True):
                await db.commit()
                continue

            inc_query = select(Incident).where(
                and_(
                    Incident.server_id == srv.id,
                    Incident.status.in_([IncidentStatus.OPEN, IncidentStatus.ACKNOWLEDGED])
                )
            )
            existing_inc = (await db.execute(inc_query)).scalars().first()

            if not existing_inc:
                incident = Incident(
                    organization_id=srv.organization_id,
                    server_id=srv.id,
                    title=f"Servidor '{srv.name}' desconectado / sem sinal",
                    description=(
                        f"O agente instalado no servidor {srv.name} ({srv.hostname or 'IP não resolvido'}) "
                        f"parou de transmitir telemetria há mais de {timeout_seconds} segundos.\n"
                        f"A VPS pode ter sido desligada, sofrido kernel panic ou perdido a rota de internet."
                    ),
                    severity=IncidentSeverity.CRITICAL,
                    status=IncidentStatus.OPEN,
                    started_at=now
                )
                db.add(incident)
                await db.commit()
                await db.refresh(incident)

                recipients = await get_server_alert_emails(db, srv)
                if recipients:
                    subject = f"🚨 [VPS DESCONECTADA] O servidor '{srv.name}' parou de responder"
                    html_body = render_vps_offline_email(
                        server_name=srv.name,
                        hostname=srv.hostname or "Não registrado",
                        timeout_seconds=timeout_seconds,
                        detected_at=now
                    )
                    success, err = await send_email(recipients, subject, html_body)
                    for r in recipients:
                        db.add(AlertHistory(
                            organization_id=srv.organization_id,
                            channel_type="email",
                            recipient=r,
                            subject=subject,
                            content_preview=f"VPS {srv.name} sem sinal",
                            is_success=success,
                            error_message=err
                        ))
                    await db.commit()

async def check_server_hardware_thresholds(
    db: AsyncSession,
    server: Server,
    cpu_percent: float,
    ram_percent: float,
    disk_percent: Optional[float]
) -> None:
    """Verifica se CPU, RAM ou Disco ultrapassaram os limites (do servidor ou da organização) e dispara alerta."""
    if not getattr(server, "notify_on_hardware", True):
        return

    rule_query = select(AlertRule).where(AlertRule.organization_id == server.organization_id)
    rule_res = await db.execute(rule_query)
    rule = rule_res.scalars().first()

    cpu_limit = server.cpu_threshold if server.cpu_threshold is not None else (rule.cpu_threshold if rule else 85.0)
    ram_limit = server.ram_threshold if server.ram_threshold is not None else (rule.ram_threshold if rule else 90.0)
    disk_limit = server.disk_threshold if server.disk_threshold is not None else (rule.disk_threshold if rule else 90.0)

    now = datetime.now(timezone.utc)
    exceeded_metric = None
    current_val = 0.0
    threshold_val = 0.0

    if cpu_percent > cpu_limit:
        exceeded_metric = "Uso de CPU"
        current_val = cpu_percent
        threshold_val = cpu_limit
    elif ram_percent > ram_limit:
        exceeded_metric = "Memória RAM"
        current_val = ram_percent
        threshold_val = ram_limit
    elif disk_percent and disk_percent > disk_limit:
        exceeded_metric = "Disco Primário"
        current_val = disk_percent
        threshold_val = disk_limit

    if exceeded_metric:
        cooldown_since = now - timedelta(hours=1)
        recent_alert = await db.execute(
            select(AlertHistory).where(
                and_(
                    AlertHistory.organization_id == server.organization_id,
                    AlertHistory.subject.like(f"%{exceeded_metric}%{server.name}%"),
                    AlertHistory.sent_at >= cooldown_since
                )
            )
        )
        if recent_alert.scalars().first():
            return

        recipients = await get_server_alert_emails(db, server)
        if recipients:
            subject = f"⚠️ [ALERTA DE HARDWARE] {exceeded_metric} atingiu {current_val}% na VPS '{server.name}'"
            html_body = render_hardware_alert_email(
                server_name=server.name,
                metric_name=exceeded_metric,
                current_val=current_val,
                threshold_val=threshold_val
            )
            success, err = await send_email(recipients, subject, html_body)
            for r in recipients:
                db.add(AlertHistory(
                    organization_id=server.organization_id,
                    channel_type="email",
                    recipient=r,
                    subject=subject,
                    content_preview=f"{exceeded_metric} em {current_val}%",
                    is_success=success,
                    error_message=err
                ))
            await db.commit()
