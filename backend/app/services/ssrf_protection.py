from __future__ import annotations
import ipaddress
import socket
from urllib.parse import urlparse
from typing import Tuple, Union

class SSRFValidationError(Exception):
    """Exceção levantada quando um alvo de monitoramento viola políticas de segurança SSRF."""
    pass

BLOCKED_METADATA_IPS = {
    ipaddress.ip_address("169.254.169.254"),
    ipaddress.ip_address("169.254.170.2"),
    ipaddress.ip_address("fd00:ec2::254"),
}

def is_ip_safe(ip: Union[ipaddress.IPv4Address, ipaddress.IPv6Address]) -> bool:
    """Verifica se um endereço IP é público e seguro para monitoramento externo."""
    if ip in BLOCKED_METADATA_IPS:
        return False

    if (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    ):
        return False

    return True

def validate_hostname_or_ip(host: str, port: int = 80) -> None:
    """
    Resolve o host via DNS e valida todos os endereços IP retornados.
    Bloqueia destinos locais, redes privadas e metadados de nuvem.
    """
    cleaned_host = host.strip().lower()

    if cleaned_host in {"localhost", "127.0.0.1", "::1", "0.0.0.0"}:
        raise SSRFValidationError("Destino inválido: monitoramento de loopback/localhost é proibido.")

    try:
        ip = ipaddress.ip_address(cleaned_host)
        if not is_ip_safe(ip):
            raise SSRFValidationError(f"Destino inválido: o endereço IP {ip} é privado ou restrito.")
        return
    except ValueError:
        pass

    try:
        addr_info = socket.getaddrinfo(cleaned_host, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror as e:
        raise SSRFValidationError(f"Não foi possível resolver o domínio '{cleaned_host}': {e.strerror}")

    if not addr_info:
        raise SSRFValidationError(f"Nenhum endereço IP associado ao host '{cleaned_host}'.")

    for entry in addr_info:
        sockaddr = entry[4]
        resolved_ip_str = sockaddr[0]
        try:
            resolved_ip = ipaddress.ip_address(resolved_ip_str)
            if not is_ip_safe(resolved_ip):
                raise SSRFValidationError(
                    f"Destino inseguro: o host '{cleaned_host}' resolve para o endereço restrito {resolved_ip}."
                )
        except ValueError:
            raise SSRFValidationError(f"Endereço retornado inválido: {resolved_ip_str}")

def validate_target_url(url: str) -> Tuple[str, str, int]:
    """
    Valida uma URL de monitoramento HTTP/HTTPS contra ataques SSRF.
    Retorna uma tupla (schema, hostname, port).
    """
    if not url or not isinstance(url, str):
        raise SSRFValidationError("A URL não pode estar vazia.")

    parsed = urlparse(url.strip())

    if parsed.scheme.lower() not in {"http", "https"}:
        raise SSRFValidationError(f"Esquema de URL não suportado: '{parsed.scheme}'. Utilize apenas HTTP ou HTTPS.")

    if not parsed.hostname:
        raise SSRFValidationError("A URL fornecida não contém um hostname válido.")

    port = parsed.port or (443 if parsed.scheme.lower() == "https" else 80)
    validate_hostname_or_ip(parsed.hostname, port)

    return parsed.scheme.lower(), parsed.hostname, port

def validate_tcp_target(host: str, port: int) -> None:
    """Valida um alvo de monitoramento TCP contra ataques SSRF e portas restritas."""
    if not 1 <= port <= 65535:
        raise SSRFValidationError(f"Porta inválida: {port}. Deve estar entre 1 e 65535.")

    validate_hostname_or_ip(host, port)
