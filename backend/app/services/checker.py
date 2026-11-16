import asyncio
import time
from urllib.parse import urlparse
import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.monitor import Monitor, MonitorCheck, MonitorType
from app.services.ssrf_protection import validate_target_url, validate_tcp_target, SSRFValidationError
from app.services.ssl_checker import get_ssl_info
from app.services.incident_service import handle_monitor_check_result

async def execute_monitor_check(db: AsyncSession, monitor: Monitor) -> MonitorCheck:
    """Executa a verificação assíncrona de um monitor (HTTP, HTTPS ou TCP) e registra o resultado."""
    if monitor.type in [MonitorType.HTTP, MonitorType.HTTPS]:
        check = await _check_http(monitor)
    elif monitor.type == MonitorType.TCP:
        check = await _check_tcp(monitor)
    else:
        raise ValueError(f"Tipo de monitor desconhecido: {monitor.type}")

    check.monitor_id = monitor.id
    db.add(check)

    await handle_monitor_check_result(
        db=db,
        monitor=monitor,
        is_success=check.is_success,
        error_message=check.error_message
    )

    await db.commit()
    await db.refresh(check)
    return check

async def _check_http(monitor: Monitor) -> MonitorCheck:
    """Realiza a verificação HTTP/HTTPS com validação de SSRF e coleta de dados SSL."""
    url = monitor.target
    timeout = float(monitor.timeout_seconds)

    try:
        _, hostname, port = validate_target_url(url)
    except SSRFValidationError as e:
        return MonitorCheck(
            is_success=False,
            error_message=f"Falha de segurança SSRF: {str(e)}",
            status_code=None,
            response_time_ms=None
        )

    ssl_valid = None
    ssl_expiration_date = None
    ssl_issuer = None

    if monitor.type == MonitorType.HTTPS or url.lower().startswith("https://"):
        try:
            ssl_valid, ssl_expiration_date, ssl_issuer, _ = await get_ssl_info(
                hostname=hostname,
                port=port,
                timeout=min(timeout, 5.0)
            )
        except Exception:
            ssl_valid = False

    start_time = time.perf_counter()
    headers = {"User-Agent": "SentinelMonitor/1.0 (+https://sentinelmonitor.io)"}

    try:
        async with httpx.AsyncClient(
            timeout=timeout,
            follow_redirects=True,
            verify=True
        ) as client:
            response = await client.get(url, headers=headers)
            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)

            is_success = (response.status_code == monitor.expected_status_code)
            error_msg = None if is_success else f"Status HTTP retornado: {response.status_code} (esperado: {monitor.expected_status_code})"

            return MonitorCheck(
                is_success=is_success,
                status_code=response.status_code,
                response_time_ms=elapsed_ms,
                error_message=error_msg,
                ssl_valid=ssl_valid,
                ssl_expiration_date=ssl_expiration_date,
                ssl_issuer=ssl_issuer
            )

    except httpx.TimeoutException:
        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
        return MonitorCheck(
            is_success=False,
            status_code=None,
            response_time_ms=elapsed_ms,
            error_message=f"Tempo limite de resposta esgotado ({timeout}s)",
            ssl_valid=ssl_valid,
            ssl_expiration_date=ssl_expiration_date,
            ssl_issuer=ssl_issuer
        )
    except httpx.ConnectError as e:
        return MonitorCheck(
            is_success=False,
            status_code=None,
            response_time_ms=None,
            error_message=f"Falha ao conectar no servidor: {str(e)}",
            ssl_valid=ssl_valid,
            ssl_expiration_date=ssl_expiration_date,
            ssl_issuer=ssl_issuer
        )
    except Exception as e:
        return MonitorCheck(
            is_success=False,
            status_code=None,
            response_time_ms=None,
            error_message=f"Erro inesperado: {str(e)}",
            ssl_valid=ssl_valid,
            ssl_expiration_date=ssl_expiration_date,
            ssl_issuer=ssl_issuer
        )

async def _check_tcp(monitor: Monitor) -> MonitorCheck:
    """Realiza a verificação de porta TCP com validação de SSRF."""
    host = monitor.target
    port = monitor.port or 80
    timeout = float(monitor.timeout_seconds)

    try:
        validate_tcp_target(host, port)
    except SSRFValidationError as e:
        return MonitorCheck(
            is_success=False,
            error_message=f"Falha de segurança SSRF: {str(e)}",
            status_code=None,
            response_time_ms=None
        )

    start_time = time.perf_counter()
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port),
            timeout=timeout
        )
        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
        writer.close()
        await writer.wait_closed()

        return MonitorCheck(
            is_success=True,
            status_code=None,
            response_time_ms=elapsed_ms,
            error_message=None
        )

    except asyncio.TimeoutError:
        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
        return MonitorCheck(
            is_success=False,
            status_code=None,
            response_time_ms=elapsed_ms,
            error_message=f"Tempo limite esgotado ao tentar conectar na porta TCP {port}"
        )
    except Exception as e:
        return MonitorCheck(
            is_success=False,
            status_code=None,
            response_time_ms=None,
            error_message=f"Falha na conexão TCP {host}:{port}: {str(e)}"
        )
