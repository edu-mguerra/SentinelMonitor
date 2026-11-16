import os
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Response, Request, HTTPException, Query, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_db
from app.models.agent_release import AgentRelease
from app.core.config import settings

router = APIRouter(tags=["Instalador"])

AGENT_FILES_WHITELIST = {"agent.py", "collector.py", "buffer.py"}
LATEST_AGENT_VERSION = "1.1.0"
AGENT_CHANGELOG = [
    "Top Processos ao vivo (os 8 programas que mais consomem RAM e CPU)",
    "Velocidade de Leitura/Escrita de Disco (I/O em KB/s) e uso de memória Swap",
    "Contagem de conexões TCP (ESTABLISHED / TIME_WAIT / LISTEN) e portas abertas",
    "Monitoramento individual de aplicações PM2 (restarts, memória e status)",
    "Listagem de containers Docker ativos e parados",
    "Clock de CPU, sensores de temperatura e nível de bateria/tomada",
    "Auditoria de usuários conectados e falhas recentes de login SSH (Linux)",
]

def _get_agent_root_dir() -> str:
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    return os.path.abspath(os.path.join(base_dir, "..", "agent"))

def _read_script_file(relative_path: str, fallback: str) -> str:
    full_path = os.path.join(_get_agent_root_dir(), relative_path)
    if os.path.exists(full_path):
        with open(full_path, "r", encoding="utf-8") as f:
            return f.read()
    return fallback

def _sanitize_ps_value(value: Optional[str]) -> str:
    """Remove caracteres que possam quebrar ou injetar comandos em strings PowerShell."""
    if not value:
        return ""
    return value.replace('"', "").replace("'", "").replace("`", "").replace("$", "").strip()

@router.get("/install.sh")
async def get_install_script(request: Request):
    """Serve o script de instalação do agente Linux para execução via curl one-liner."""
    content = _read_script_file("linux/installer.sh", "#!/usr/bin/env bash\necho 'Sentinel Agent Linux Installer'\n")
    return Response(
        content=content,
        media_type="text/x-shellscript",
        headers={"Content-Disposition": "inline; filename=install.sh"}
    )

@router.get("/install-mac.sh")
async def get_mac_install_script(request: Request):
    """Serve o script de instalação do agente macOS (launchd, sem criar usuário)."""
    content = _read_script_file("macos/installer.sh", "#!/usr/bin/env bash\necho 'Sentinel Agent macOS Installer'\n")
    return Response(
        content=content,
        media_type="text/x-shellscript",
        headers={"Content-Disposition": "inline; filename=install-mac.sh"}
    )

@router.get("/install.ps1")
async def get_windows_install_script(
    request: Request,
    token: Optional[str] = Query(default=None),
    api_url: Optional[str] = Query(default=None),
):
    """Serve o script PowerShell de instalação do agente Windows (SYSTEM, sem criar usuário)."""
    content = _read_script_file("windows/installer.ps1", "Write-Host 'Sentinel Agent Windows Installer'\n")
    default_api_url = str(request.base_url).rstrip("/") + "/api/v1"

    safe_token = _sanitize_ps_value(token)
    safe_api_url = _sanitize_ps_value(api_url) or default_api_url

    if safe_token:
        content = content.replace("__TEMP_TOKEN__", safe_token)
    content = content.replace("__API_URL__", safe_api_url)

    return Response(
        content=content,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": "inline; filename=install.ps1"}
    )

@router.get("/agent-files/{filename}")
async def get_agent_file(filename: str):
    """Serve os módulos Python universais do agente para os instaladores Linux, macOS e Windows."""
    if filename not in AGENT_FILES_WHITELIST:
        raise HTTPException(status_code=404, detail="Arquivo de agente não encontrado.")

    file_path = os.path.join(_get_agent_root_dir(), "linux", filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Arquivo de agente indisponível.")

    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    return Response(
        content=content,
        media_type="text/x-python; charset=utf-8",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )

@router.get("/agent-release")
async def get_agent_release(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Retorna a versão mais recente publicada do agente, histórico de releases e comandos de atualização.
    Se o Master Admin ainda não publicou nenhuma versão nova, nenhuma atualização é sinalizada.
    """
    if settings.PUBLIC_API_URL:
        api_url = settings.PUBLIC_API_URL.rstrip("/")
        if not api_url.endswith("/api/v1"):
            api_url = f"{api_url}/api/v1"
    else:
        api_url = str(request.base_url).rstrip("/") + "/api/v1"

    query = (
        select(AgentRelease)
        .where(AgentRelease.is_published == True)
        .order_by(AgentRelease.published_at.desc(), AgentRelease.created_at.desc())
    )
    result = await db.execute(query)
    published_releases = result.scalars().all()

    if not published_releases:
        check_any = await db.execute(select(AgentRelease))
        if not check_any.scalars().first():
            initial = AgentRelease(
                version=LATEST_AGENT_VERSION,
                title="Telemetria Avançada & Top Processos",
                changelog=AGENT_CHANGELOG,
                is_published=True,
                published_at=datetime.now(timezone.utc),
            )
            db.add(initial)
            await db.commit()
            await db.refresh(initial)
            published_releases = [initial]

    if published_releases:
        latest = published_releases[0]
        latest_version = latest.version
        changelog = latest.changelog or []
        history = [
            {
                "id": str(r.id),
                "version": r.version,
                "title": r.title,
                "changelog": r.changelog,
                "published_at": r.published_at.isoformat() if r.published_at else None,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in published_releases
        ]
    else:
        latest_version = "1.0.0"
        changelog = []
        history = []

    return {
        "latest_version": latest_version,
        "changelog": changelog,
        "releases_history": history,
        "update_commands": {
            "windows": (
                'Stop-ScheduledTask -TaskName "SentinelMonitorAgent" -ErrorAction SilentlyContinue; '
                f'Invoke-WebRequest -Uri "{api_url}/agent-files/collector.py" -OutFile "$env:ProgramData\\SentinelAgent\\collector.py" -UseBasicParsing; '
                f'Invoke-WebRequest -Uri "{api_url}/agent-files/agent.py" -OutFile "$env:ProgramData\\SentinelAgent\\agent.py" -UseBasicParsing; '
                'Set-ScheduledTask -TaskName "SentinelMonitorAgent" -Settings (New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)) -ErrorAction SilentlyContinue; '
                'Start-ScheduledTask -TaskName "SentinelMonitorAgent"'
            ),
            "linux": (
                f"sudo sed -i 's/User=sentinel-agent/User=root/g' /etc/systemd/system/sentinel-agent.service 2>/dev/null || true; "
                f"sudo sed -i 's/ProtectHome=true/ProtectHome=false/g' /etc/systemd/system/sentinel-agent.service 2>/dev/null || true; "
                f"sudo systemctl daemon-reload && "
                f"sudo curl -fsSL {api_url}/agent-files/collector.py -o /opt/sentinel-agent/collector.py && "
                f"sudo curl -fsSL {api_url}/agent-files/agent.py -o /opt/sentinel-agent/agent.py && "
                f"sudo systemctl restart sentinel-agent"
            ),
            "macos": (
                f'sudo curl -fsSL {api_url}/agent-files/collector.py -o "/Library/Application Support/SentinelAgent/collector.py" && '
                f'sudo curl -fsSL {api_url}/agent-files/agent.py -o "/Library/Application Support/SentinelAgent/agent.py" && '
                f"sudo launchctl kickstart -k system/com.sentinel.agent"
            ),
        },
    }
