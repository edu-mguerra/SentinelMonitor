from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, JSON
from app.models.base import BaseModel

class AgentRelease(BaseModel):
    """
    Tabela de versões e releases do Sentinel Agent gerenciadas exclusivamente pelo Master Admin.
    Apenas versões com `is_published=True` são distribuídas e geram notificações no painel dos clientes.
    """
    __tablename__ = "agent_releases"

    version = Column(String(50), nullable=False, unique=True, index=True)
    title = Column(String(255), nullable=True)
    changelog = Column(JSON, nullable=False, default=list)
    is_published = Column(Boolean, default=False, nullable=False, index=True)
    published_at = Column(DateTime(timezone=True), nullable=True)
    created_by_user_id = Column(String(36), nullable=True)

    def __repr__(self):
        return f"<AgentRelease version={self.version} published={self.is_published}>"
