from typing import List, Union, Optional
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "Sentinel Monitor"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"

    DATABASE_URL: str = "postgresql+asyncpg://sentinel:sentinel_secret@localhost:5432/sentinel_db"
    DATABASE_SYNC_URL: str = "postgresql://sentinel:sentinel_secret@localhost:5432/sentinel_db"

    SECRET_KEY: str = "dev_secret_key_change_me_to_a_secure_random_string_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    SMTP_HOST: Optional[str] = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_TLS: bool = True
    EMAILS_FROM_EMAIL: str = "monitorsentinelnotify@gmail.com"
    EMAILS_FROM_NAME: str = "Sentinel Monitor"

    GOOGLE_CLIENT_ID: Optional[str] = None
    PUBLIC_API_URL: Optional[str] = None

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, list):
            return v
        return []

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

settings = Settings()
