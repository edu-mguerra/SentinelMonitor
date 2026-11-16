import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_db, get_current_active_superuser
from app.models.user import User
from app.models.agent_release import AgentRelease

router = APIRouter(prefix="/admin", tags=["Administração Master"])

class AdminUserItem(BaseModel):
    id: uuid.UUID
    email: str
    full_name: Optional[str] = None
    is_active: bool
    is_superuser: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class AgentReleaseCreate(BaseModel):
    version: str
    title: Optional[str] = None
    changelog: List[str]
    is_published: bool = False

class AgentReleaseResponse(BaseModel):
    id: uuid.UUID
    version: str
    title: Optional[str] = None
    changelog: List[str]
    is_published: bool
    published_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

@router.get("/users", response_model=List[AdminUserItem])
async def list_registered_users(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(get_current_active_superuser)
):
    """
    Retorna exclusivamente a lista de contas/usuários cadastrados na plataforma (Nome e E-mail).
    Acesso restrito exclusivamente à Conta Master (is_superuser=True).
    O Master NÃO acessa servidores, métricas, dados internos ou credenciais dos usuários.
    """
    query = select(User).order_by(User.created_at.desc())
    result = await db.execute(query)
    users = result.scalars().all()
    return users

@router.get("/releases", response_model=List[AgentReleaseResponse])
async def list_agent_releases(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(get_current_active_superuser)
):
    """
    Lista todas as versões e releases do Sentinel Agent (Rascunhos e Publicadas).
    Exclusivo para o Master Admin.
    """
    query = select(AgentRelease).order_by(AgentRelease.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/releases", response_model=AgentReleaseResponse, status_code=status.HTTP_201_CREATED)
async def create_agent_release(
    payload: AgentReleaseCreate,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(get_current_active_superuser)
):
    """
    Cria uma nova versão do agente (como rascunho ou publicada imediatamente).
    Somente após ser publicada é que o painel dos clientes passa a avisar sobre a atualização.
    """
    version_clean = payload.version.strip().lstrip("v")
    if not version_clean:
        raise HTTPException(status_code=400, detail="Número de versão inválido.")

    existing = await db.execute(select(AgentRelease).where(AgentRelease.version == version_clean))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"A versão v{version_clean} já está cadastrada.")

    cleaned_changelog = [item.strip() for item in payload.changelog if item.strip()]
    if not cleaned_changelog:
        raise HTTPException(status_code=400, detail="Informe pelo menos 1 item no que há de novo (changelog).")

    now = datetime.now(timezone.utc)
    new_release = AgentRelease(
        version=version_clean,
        title=payload.title.strip() if payload.title else f"Atualização v{version_clean}",
        changelog=cleaned_changelog,
        is_published=payload.is_published,
        published_at=now if payload.is_published else None,
        created_by_user_id=str(admin_user.id)
    )

    db.add(new_release)
    await db.commit()
    await db.refresh(new_release)
    return new_release

@router.post("/releases/{release_id}/publish", response_model=AgentReleaseResponse)
async def publish_agent_release(
    release_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(get_current_active_superuser)
):
    """
    Solta / publica a atualização para distribuição geral.
    A partir desta ação, todas as VPSs cadastradas que possuem versão anterior
    passam a exibir o sinal de atualização no painel dos clientes.
    """
    result = await db.execute(select(AgentRelease).where(AgentRelease.id == release_id))
    release = result.scalar_one_or_none()
    if not release:
        raise HTTPException(status_code=404, detail="Release não encontrada.")

    release.is_published = True
    release.published_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(release)
    return release

@router.delete("/releases/{release_id}")
async def delete_agent_release(
    release_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(get_current_active_superuser)
):
    """Exclui uma versão de agente do catálogo Master."""
    result = await db.execute(select(AgentRelease).where(AgentRelease.id == release_id))
    release = result.scalar_one_or_none()
    if not release:
        raise HTTPException(status_code=404, detail="Release não encontrada.")

    await db.delete(release)
    await db.commit()
    return {"message": f"Versão v{release.version} removida com sucesso."}
