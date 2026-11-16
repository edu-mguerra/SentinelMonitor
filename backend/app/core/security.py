import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Union, Optional
from jose import jwt
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def generate_temp_install_token() -> str:
    """Gera um token temporário de uso único em formato seguro (ex: inst_...)."""
    return f"inst_{secrets.token_urlsafe(24)}"

def generate_permanent_agent_token() -> str:
    """Gera o token permanente exclusivo para o agente Linux (ex: agt_...)."""
    return f"agt_{secrets.token_urlsafe(32)}"

def hash_agent_token(token: str) -> str:
    """Gera hash SHA-256 do token do agente para persistência segura no banco."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def verify_agent_token(token: str, stored_hash: str) -> bool:
    """Valida se o token informado corresponde ao hash armazenado em tempo constante."""
    calc_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    return secrets.compare_digest(calc_hash, stored_hash)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Valida se a senha informada confere com o hash armazenado."""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Gera hash seguro bcrypt da senha."""
    return pwd_context.hash(password)

def create_access_token(subject: Union[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Cria Access Token JWT com validade curta."""
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode = {
        "exp": expire,
        "iat": now,
        "sub": str(subject),
        "type": "access"
    }
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def create_refresh_token(subject: Union[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Cria Refresh Token JWT com validade estendida."""
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    to_encode = {
        "exp": expire,
        "iat": now,
        "sub": str(subject),
        "type": "refresh"
    }
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def decode_token(token: str) -> Optional[dict]:
    """Decodifica e valida assinatura e expiração do token JWT."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except Exception:
        return None
