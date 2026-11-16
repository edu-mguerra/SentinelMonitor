import uuid
from datetime import datetime, timezone, timedelta
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, TenantContext
from app.models.organization import OrganizationMember, MemberRole
from app.models.server import Server, ServerStatus, AgentInstallToken, ServerMetric
from app.schemas.server import (
    ServerCreate,
    ServerUpdate,
    ServerResponse,
    ServerWithInstallCommandResponse,
    ServerDetailResponse,
    ServerMetricResponse,
)
from app.core.security import generate_temp_install_token
from app.core.config import settings

router = APIRouter(
    prefix="/organizations/{organization_id}/servers",
    tags=["Servidores (VPS)"]
)

def build_install_commands(request: Request, token: str) -> dict[str, str]:
    """Gera os comandos de instalação frictionless one-liner para Linux, macOS e Windows."""
    if settings.PUBLIC_API_URL:
        api_url = settings.PUBLIC_API_URL.rstrip("/")
        if not api_url.endswith("/api/v1"):
            api_url = f"{api_url}/api/v1"
    else:
        base_url = str(request.base_url).rstrip("/")
        api_url = f"{base_url}/api/v1"

    linux_cmd = (
        f'which curl >/dev/null 2>&1 && python3 -c "import ensurepip" >/dev/null 2>&1 || '
        f'(command -v apt-get >/dev/null 2>&1 && apt-get update -qq && apt-get install -y -qq curl python3-venv python3-pip) || '
        f'(command -v yum >/dev/null 2>&1 && yum install -y -q curl python3-pip); '
        f'curl -sL {api_url}/install.sh | sudo bash -s -- --token={token} --api-url={api_url}'
    )
    return {
        "linux": linux_cmd,
        "macos": f"curl -sL {api_url}/install-mac.sh | sudo bash -s -- --token={token} --api-url={api_url}",
        "windows": f'irm "{api_url}/install.ps1?token={token}&api_url={api_url}" | iex',
    }

@router.get("", response_model=List[ServerResponse])
async def list_servers(
    organization_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.VIEWER]))
):
    """Lista todos os servidores vinculados à organização."""
    query = select(Server).where(Server.organization_id == organization_id).order_by(Server.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()

@router.post("", response_model=ServerWithInstallCommandResponse, status_code=status.HTTP_201_CREATED)
async def create_server(
    organization_id: uuid.UUID,
    server_in: ServerCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.OPERATOR, MemberRole.ADMIN, MemberRole.OWNER]))
):
    """
    Cadastra um novo servidor e gera o comando one-liner de instalação com token temporário de uso único (15 min).
    """
    new_server = Server(
        organization_id=organization_id,
        name=server_in.name,
        status=ServerStatus.PENDING
    )
    db.add(new_server)
    await db.flush()

    temp_token_str = generate_temp_install_token()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
    install_token = AgentInstallToken(
        server_id=new_server.id,
        token=temp_token_str,
        expires_at=expires_at,
        is_used=False
    )
    db.add(install_token)
    await db.commit()
    await db.refresh(new_server)

    install_cmds = build_install_commands(request, temp_token_str)

    return ServerWithInstallCommandResponse(
        id=new_server.id,
        organization_id=new_server.organization_id,
        name=new_server.name,
        status=new_server.status,
        hostname=new_server.hostname,
        os_name=new_server.os_name,
        os_version=new_server.os_version,
        kernel=new_server.kernel,
        arch=new_server.arch,
        agent_version=new_server.agent_version,
        last_communication_at=new_server.last_communication_at,
        uptime_seconds=new_server.uptime_seconds,
        last_cpu_percent=new_server.last_cpu_percent,
        last_ram_percent=new_server.last_ram_percent,
        last_disk_percent=new_server.last_disk_percent,
        monitored_services=new_server.monitored_services or ["nginx", "docker", "postgres", "mysqld", "apache2"],
        created_at=new_server.created_at,
        updated_at=new_server.updated_at,
        install_token=temp_token_str,
        install_token_expires_at=expires_at,
        install_command=install_cmds["linux"],
        install_commands=install_cmds
    )

@router.get("/{server_id}", response_model=ServerDetailResponse)
async def get_server(
    organization_id: uuid.UUID,
    server_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.VIEWER]))
):
    """Retorna os dados cadastrais do servidor e suas métricas mais recentes."""
    query = select(Server).where(
        and_(
            Server.id == server_id,
            Server.organization_id == organization_id
        )
    )
    result = await db.execute(query)
    server = result.scalars().first()

    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Servidor não encontrado.")

    metrics_query = (
        select(ServerMetric)
        .where(ServerMetric.server_id == server_id)
        .order_by(ServerMetric.recorded_at.desc())
        .limit(60)
    )
    metrics_res = await db.execute(metrics_query)
    metrics = metrics_res.scalars().all()

    resp = ServerDetailResponse.model_validate(server)
    resp.metrics = [ServerMetricResponse.model_validate(m) for m in metrics]
    return resp

@router.patch("/{server_id}", response_model=ServerResponse)
async def update_server(
    organization_id: uuid.UUID,
    server_id: uuid.UUID,
    server_in: ServerUpdate,
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.OPERATOR, MemberRole.ADMIN, MemberRole.OWNER]))
):
    """Atualiza o nome do servidor."""
    query = select(Server).where(
        and_(
            Server.id == server_id,
            Server.organization_id == organization_id
        )
    )
    result = await db.execute(query)
    server = result.scalars().first()

    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Servidor não encontrado.")

    if server_in.name is not None:
        server.name = server_in.name
    if server_in.monitored_services is not None:
        cleaned_services = list(dict.fromkeys(s.strip().lower() for s in server_in.monitored_services if s.strip()))
        server.monitored_services = cleaned_services

    for alert_field in (
        "cpu_threshold",
        "ram_threshold",
        "disk_threshold",
        "offline_timeout_seconds",
        "notify_on_offline",
        "notify_on_hardware",
    ):
        if alert_field in server_in.model_fields_set:
            val = getattr(server_in, alert_field)
            if alert_field in ("notify_on_offline", "notify_on_hardware") and val is None:
                continue
            setattr(server, alert_field, val)

    await db.commit()
    await db.refresh(server)
    return server

@router.delete("/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_server(
    organization_id: uuid.UUID,
    server_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.ADMIN, MemberRole.OWNER]))
):
    """Exclui o servidor e todo o histórico de métricas associado."""
    query = select(Server).where(
        and_(
            Server.id == server_id,
            Server.organization_id == organization_id
        )
    )
    result = await db.execute(query)
    server = result.scalars().first()

    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Servidor não encontrado.")

    await db.delete(server)
    await db.commit()
    return None

@router.post("/{server_id}/token", response_model=ServerWithInstallCommandResponse)
async def regenerate_install_token(
    organization_id: uuid.UUID,
    server_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.ADMIN, MemberRole.OWNER]))
):
    """Gera um novo token temporário para reinstalação do agente no servidor."""
    query = select(Server).where(
        and_(
            Server.id == server_id,
            Server.organization_id == organization_id
        )
    )
    result = await db.execute(query)
    server = result.scalars().first()

    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Servidor não encontrado.")

    temp_token_str = generate_temp_install_token()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
    install_token = AgentInstallToken(
        server_id=server.id,
        token=temp_token_str,
        expires_at=expires_at,
        is_used=False
    )
    db.add(install_token)
    await db.commit()
    await db.refresh(server)

    install_cmds = build_install_commands(request, temp_token_str)

    return ServerWithInstallCommandResponse(
        id=server.id,
        organization_id=server.organization_id,
        name=server.name,
        status=server.status,
        hostname=server.hostname,
        os_name=server.os_name,
        os_version=server.os_version,
        kernel=server.kernel,
        arch=server.arch,
        agent_version=server.agent_version,
        last_communication_at=server.last_communication_at,
        uptime_seconds=server.uptime_seconds,
        last_cpu_percent=server.last_cpu_percent,
        last_ram_percent=server.last_ram_percent,
        last_disk_percent=server.last_disk_percent,
        monitored_services=server.monitored_services or ["nginx", "docker", "postgres", "mysqld", "apache2"],
        created_at=server.created_at,
        updated_at=server.updated_at,
        install_token=temp_token_str,
        install_token_expires_at=expires_at,
        install_command=install_cmds["linux"],
        install_commands=install_cmds
    )
