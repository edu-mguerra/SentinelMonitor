#!/usr/bin/env python3
import os
import sys
import time
import signal
import logging
import json
import platform
import urllib.request
import urllib.error
from typing import Dict, Any, Optional

from collector import collect_payload
from buffer import MetricBuffer

IS_WINDOWS = platform.system() == "Windows"
IS_MACOS = platform.system() == "Darwin"

handlers = []
if sys.stdout is not None:
    handlers.append(logging.StreamHandler(sys.stdout))

_log_file_dir = (
    os.path.join(os.environ.get("ProgramData", "C:\\ProgramData"), "SentinelAgent")
    if IS_WINDOWS
    else ("/Library/Application Support/SentinelAgent" if IS_MACOS else "/var/log/sentinel-agent")
)
try:
    os.makedirs(_log_file_dir, exist_ok=True)
    handlers.append(logging.FileHandler(os.path.join(_log_file_dir, "agent.log"), encoding="utf-8"))
except Exception:
    pass

if not handlers:
    handlers.append(logging.NullHandler())

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=handlers
)
logger = logging.getLogger("sentinel.agent")
DEFAULT_CONFIG_PATH = (
    os.path.join(os.environ.get("ProgramData", "C:\\ProgramData"), "SentinelAgent", "agent.conf")
    if IS_WINDOWS
    else "/etc/sentinel-agent/agent.conf"
)
DEFAULT_BUFFER_PATH = (
    os.path.join(os.environ.get("ProgramData", "C:\\ProgramData"), "SentinelAgent", "buffer.json")
    if IS_WINDOWS
    else (
        "/Library/Application Support/SentinelAgent/buffer.json"
        if IS_MACOS
        else "/var/lib/sentinel-agent/buffer.json"
    )
)

CONFIG_PATH = os.environ.get("SENTINEL_CONFIG_PATH", DEFAULT_CONFIG_PATH)
BUFFER_PATH = os.environ.get("SENTINEL_BUFFER_PATH", DEFAULT_BUFFER_PATH)

running = True

def signal_handler(signum, frame):
    global running
    logger.info(f"Recebido sinal de encerramento ({signum}). Parando agente...")
    running = False

def load_config() -> Dict[str, Any]:
    """Carrega as configurações do arquivo agent.conf ou variáveis de ambiente."""
    config = {
        "api_url": os.environ.get("SENTINEL_API_URL", "http://localhost:10203/api/v1"),
        "agent_token": os.environ.get("SENTINEL_AGENT_TOKEN", ""),
        "interval_seconds": int(os.environ.get("SENTINEL_INTERVAL", "30")),
        "services": [s.strip() for s in os.environ.get("SENTINEL_SERVICES", "nginx,docker,postgres,mysqld,apache2").split(",") if s.strip()]
    }

    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, val = line.split("=", 1)
                    key = key.strip().lower()
                    val = val.strip().strip('"').strip("'")
                    if key == "api_url":
                        config["api_url"] = val.rstrip("/")
                    elif key == "agent_token":
                        config["agent_token"] = val
                    elif key == "interval_seconds":
                        config["interval_seconds"] = int(val)
                    elif key == "services":
                        config["services"] = [s.strip() for s in val.split(",") if s.strip()]
        except Exception as e:
            logger.error(f"Erro ao ler arquivo de configuração {CONFIG_PATH}: {e}")

    return config

def send_metric(api_url: str, token: str, payload: Dict[str, Any]) -> tuple:
    """Envia um payload de métrica para a API usando a biblioteca padrão urllib (sem dependências externas de compilação)."""
    endpoint = f"{api_url}/agents/metrics"
    data_bytes = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        url=endpoint,
        data=data_bytes,
        headers={
            "Content-Type": "application/json",
            "X-Agent-Token": token,
            "User-Agent": f"SentinelAgent/1.0 ({platform.system()})"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status in (200, 201, 204):
                try:
                    resp_body = response.read().decode("utf-8")
                    return True, json.loads(resp_body) if resp_body else None
                except Exception:
                    return True, None
            return False, None
    except urllib.error.HTTPError as e:
        if e.code == 401:
            logger.critical("Token do agente recusado pela API (401 Unauthorized). Verifique o cadastro no painel.")
        else:
            logger.warning(f"Erro HTTP ao enviar métricas ({e.code}): {e.reason}")
        return False, None
    except Exception as e:
        logger.warning(f"Falha de rede ao conectar na API: {e}")
        return False, None

def main():
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    logger.info(f"=== Iniciando Sentinel Agent ({platform.system()}) ===")
    config = load_config()

    if not config["agent_token"]:
        logger.critical(f"Nenhum token configurado. O agente precisa de um agent_token em {CONFIG_PATH} ou na variável SENTINEL_AGENT_TOKEN.")
        sys.exit(1)

    buffer = MetricBuffer(file_path=BUFFER_PATH, max_items=120)
    logger.info(f"API: {config['api_url']} | Intervalo: {config['interval_seconds']}s")

    prev_net_io = None
    prev_net_time = None

    while running:
        start_loop = time.time()
        try:
            payload, prev_net_io, prev_net_time = collect_payload(
                prev_net_io=prev_net_io,
                prev_net_time=prev_net_time,
                services=config["services"]
            )

            buffer.push(payload)

            pending_items = buffer.pop_all()
            failed_items = []
            last_response_data = None

            for idx, item in enumerate(pending_items):
                success, resp_data = send_metric(config["api_url"], config["agent_token"], item)
                if not success:
                    failed_items = pending_items[idx:]
                    break
                if resp_data:
                    last_response_data = resp_data

            if failed_items:
                buffer.rollback(failed_items)
                logger.warning(f"Conexão instável. {len(failed_items)} coletas mantidas no buffer local.")
            else:
                logger.info(f"Métricas enviadas com sucesso ({len(pending_items)} payloads). CPU: {payload['cpu']['usage_percent']}% | RAM: {payload['memory']['usage_percent']}%")

                if last_response_data and isinstance(last_response_data.get("config"), dict):
                    server_services = last_response_data["config"].get("services")
                    if isinstance(server_services, list) and server_services:
                        if set(server_services) != set(config["services"]):
                            logger.info(f"Lista de serviços atualizada dinamicamente pelo painel: {server_services}")
                            config["services"] = server_services

        except Exception as e:
            logger.error(f"Erro inesperado no loop do agente: {e}", exc_info=True)

        elapsed = time.time() - start_loop
        sleep_time = max(1, config["interval_seconds"] - elapsed)

        for _ in range(int(sleep_time)):
            if not running:
                break
            time.sleep(1)

    logger.info("Sentinel Agent finalizado.")

if __name__ == "__main__":
    main()
