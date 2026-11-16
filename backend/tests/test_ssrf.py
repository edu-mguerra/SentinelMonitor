import pytest
from app.services.ssrf_protection import (
    validate_target_url,
    validate_tcp_target,
    SSRFValidationError,
)

def test_ssrf_blocks_localhost_and_loopback():
    with pytest.raises(SSRFValidationError, match="loopback/localhost é proibido"):
        validate_target_url("http://localhost:8000/api")

    with pytest.raises(SSRFValidationError, match="loopback/localhost é proibido"):
        validate_target_url("http://127.0.0.1/status")

def test_ssrf_blocks_cloud_metadata():
    with pytest.raises(SSRFValidationError, match="privado ou restrito"):
        validate_target_url("http://169.254.169.254/latest/meta-data/")

def test_ssrf_blocks_private_networks():
    with pytest.raises(SSRFValidationError, match="privado ou restrito"):
        validate_target_url("http://192.168.1.100/router")

    with pytest.raises(SSRFValidationError, match="privado ou restrito"):
        validate_target_url("http://10.0.0.1:8080")

def test_ssrf_blocks_unsupported_schemes():
    with pytest.raises(SSRFValidationError, match="Esquema de URL não suportado"):
        validate_target_url("ftp://ftp.example.com/file.txt")

    with pytest.raises(SSRFValidationError, match="Esquema de URL não suportado"):
        validate_target_url("file:///etc/passwd")

def test_ssrf_tcp_target_validation():
    with pytest.raises(SSRFValidationError, match="loopback/localhost é proibido"):
        validate_tcp_target("127.0.0.1", 5432)

    with pytest.raises(SSRFValidationError, match="Porta inválida"):
        validate_tcp_target("google.com", 70000)
