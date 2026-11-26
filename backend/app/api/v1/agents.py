import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_authenticated_agent_server
from app.models.server import Server, ServerStatus, AgentInstallToken, ServerMetric
from app.schemas.agent import (
    AgentHandshakeRequest,
    AgentHandshakeResponse,
    AgentMetricsPayload,
)
from app.core.security import generate_permanent_agent_token, hash_agent_token

router = APIRouter(
    prefix="/agents",
    tags=["Agente Linux (Telemetria)"]
)

@router.post("/handshake", response_model=AgentHandshakeResponse)
async def agent_handshake(
    handshake_in: AgentHandshakeRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Troca o token temporário (one-liner) por um token permanente e exclusivo do agente.
    O token temporário é imediatamente invalidado para impedir reuso.
    """
    now = datetime.now(timezone.utc)

    query = select(AgentInstallToken).where(AgentInstallToken.token == handshake_in.temp_token)
    result = await db.execute(query)
    install_token = result.scalars().first()

    if not install_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Código de instalação temporário inválido."
        )

    if install_token.is_used:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este código de instalação já foi utilizado."
        )

    token_expires_at = install_token.expires_at
    if token_expires_at.tzinfo is None:
        token_expires_at = token_expires_at.replace(tzinfo=timezone.utc)

    if token_expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Código de instalação expirado. Gere um novo no painel."
        )

    install_token.is_used = True
    install_token.used_at = now

    server_res = await db.execute(select(Server).where(Server.id == install_token.server_id))
    server = server_res.scalars().first()
    if not server:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Servidor associado ao token não foi encontrado."
        )

    permanent_token = generate_permanent_agent_token()
    token_hash = hash_agent_token(permanent_token)

    server.agent_token_hash = token_hash
    server.hostname = handshake_in.hostname
    server.os_name = handshake_in.os_name
    server.os_version = handshake_in.os_version
    server.kernel = handshake_in.kernel
    server.arch = handshake_in.arch
    server.agent_version = handshake_in.agent_version
    server.status = ServerStatus.ONLINE
    server.last_communication_at = now

    await db.commit()

    return AgentHandshakeResponse(
        agent_token=permanent_token,
        server_id=server.id,
        server_name=server.name,
        collection_interval_seconds=10,
        monitored_services=server.monitored_services or ["nginx", "docker", "postgres", "mysqld", "apache2"]
    )

@router.post("/metrics", status_code=status.HTTP_200_OK)
async def receive_agent_metrics(
    payload: AgentMetricsPayload,
    server: Server = Depends(get_authenticated_agent_server),
    db: AsyncSession = Depends(get_db)
):
    """
    Recebe o payload de telemetria periódico enviado pelo agente Linux.
    Autenticado exclusivamente via Header 'X-Agent-Token'.
    """
    now = datetime.now(timezone.utc)
    recorded_at = payload.recorded_at or now

    server.status = ServerStatus.ONLINE
    server.last_communication_at = now
    if payload.agent_version:
        server.agent_version = payload.agent_version
    server.last_cpu_percent = payload.cpu.usage_percent
    server.last_ram_percent = payload.memory.usage_percent

    if payload.disk:
        root_disk = next((d for d in payload.disk if d.mountpoint == "/"), payload.disk[0])
        server.last_disk_percent = root_disk.usage_percent

    if payload.system and "uptime_seconds" in payload.system:
        server.uptime_seconds = payload.system["uptime_seconds"]

    metric = ServerMetric(
        server_id=server.id,
        recorded_at=recorded_at,
        cpu_percent=payload.cpu.usage_percent,
        cpu_cores=payload.cpu.cores_count,
        load_avg_1m=payload.cpu.load_average[0] if payload.cpu.load_average and len(payload.cpu.load_average) > 0 else None,
        load_avg_5m=payload.cpu.load_average[1] if payload.cpu.load_average and len(payload.cpu.load_average) > 1 else None,
        load_avg_15m=payload.cpu.load_average[2] if payload.cpu.load_average and len(payload.cpu.load_average) > 2 else None,
        ram_total_bytes=payload.memory.total_bytes,
        ram_used_bytes=payload.memory.used_bytes,
        ram_available_bytes=payload.memory.available_bytes,
        ram_percent=payload.memory.usage_percent,
        disk_data=[d.model_dump() for d in payload.disk] if payload.disk else None,
        network_data=payload.network.model_dump() if payload.network else None,
        services_data=[s.model_dump() for s in payload.services] if payload.services else None,
        extra_data=payload.extra
    )

    db.add(metric)
    await db.commit()

    from app.services.alert_dispatcher import check_server_hardware_thresholds
    await check_server_hardware_thresholds(
        db=db,
        server=server,
        cpu_percent=payload.cpu.usage_percent,
        ram_percent=payload.memory.usage_percent,
        disk_percent=server.last_disk_percent
    )

    services_config = server.monitored_services or ["nginx", "docker", "postgres", "mysqld", "apache2"]

    return {
        "status": "ok",
        "server_id": server.id,
        "received_at": now.isoformat(),
        "config": {
            "services": services_config,
            "interval_seconds": 10
        }
    }
