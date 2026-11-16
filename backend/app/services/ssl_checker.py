import asyncio
import ssl
from datetime import datetime, timezone
from typing import Optional, Tuple

def _parse_ssl_date(date_str: str) -> Optional[datetime]:
    """Converte o formato de data retornado pelo getpeercert (ex: 'May 15 12:00:00 2027 GMT') para datetime UTC."""
    try:
        dt = datetime.strptime(date_str, "%b %d %H:%M:%S %Y %Z")
        return dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None

def _get_ssl_info_sync(hostname: str, port: int = 443, timeout: float = 5.0) -> Tuple[bool, Optional[datetime], Optional[str], Optional[str]]:
    """
    Executa a conexão TLS e extrai informações do certificado.
    Retorna: (is_valid, expiration_date, issuer, error_message)
    """
    context = ssl.create_default_context()

    try:
        with context.wrap_socket(
            ssl.socket(),
            server_hostname=hostname,
        ) as s:
            s.settimeout(timeout)
            s.connect((hostname, port))
            cert = s.getpeercert()

            if not cert:
                return False, None, None, "Nenhum certificado SSL retornado pelo servidor."

            not_after_str = cert.get("notAfter")
            expiration_date = _parse_ssl_date(not_after_str) if not_after_str else None

            issuer = None
            for item in cert.get("issuer", ()):
                for key, val in item:
                    if key == "organizationName":
                        issuer = val
                        break
                    elif key == "commonName" and not issuer:
                        issuer = val

            is_valid = True
            if expiration_date and expiration_date < datetime.now(timezone.utc):
                is_valid = False
                return is_valid, expiration_date, issuer, "Certificado SSL expirado."

            return is_valid, expiration_date, issuer, None

    except ssl.SSLCertVerificationError as e:
        return False, None, None, f"Falha na validação do certificado SSL: {e.verify_message}"
    except Exception as e:
        return False, None, None, f"Erro na conexão SSL: {str(e)}"

async def get_ssl_info(hostname: str, port: int = 443, timeout: float = 5.0) -> Tuple[bool, Optional[datetime], Optional[str], Optional[str]]:
    """Versão assíncrona que não bloqueia o event loop do asyncio."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _get_ssl_info_sync, hostname, port, timeout)
