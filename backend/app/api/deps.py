import uuid
from typing import Optional
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import decode_token
from app.database.session import get_db
from app.models.user import User
from app.models.organization import OrganizationMember, MemberRole
from app.schemas.token import TokenPayload

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login"
)

async def get_current_user(
    db: AsyncSession = Depends(get_db),
    token: str = Depends(oauth2_scheme)
) -> User:
    """Extrai e valida o usuário autenticado a partir do Bearer JWT Token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciais inválidas ou token expirado",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_token(token)
    if not payload:
        raise credentials_exception

    token_type = payload.get("type")
    if token_type != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tipo de token inválido. Esperado access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id_str: Optional[str] = payload.get("sub")
    if not user_id_str:
        raise credentials_exception

    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == user_uuid))
    user = result.scalars().first()

    if not user:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário inativo"
        )

    return user

async def get_current_active_superuser(
    current_user: User = Depends(get_current_user)
) -> User:
    """Garante que apenas administradores globais da plataforma acessem a rota."""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado. Privilégios de administrador necessários."
        )
    return current_user

class TenantContext:
    """
    Validador e provedor de contexto de Multi-Tenancy estrito e Privacidade Zero-Knowledge.
    NENHUM usuário (nem mesmo o Master/Superuser) pode ver ou acessar dados de organizações
    às quais não pertença como membro explícito.
    """
    def __init__(self, required_roles: Optional[list[MemberRole]] = None):
        self.required_roles = required_roles

    async def __call__(
        self,
        organization_id: uuid.UUID,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
    ) -> OrganizationMember:
        query = select(OrganizationMember).where(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.user_id == current_user.id
        )
        result = await db.execute(query)
        membership = result.scalars().first()

        if not membership:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acesso negado. Você não pertence a esta organização."
            )

        if self.required_roles:
            role_hierarchy = {
                MemberRole.OWNER: 4,
                MemberRole.ADMIN: 3,
                MemberRole.OPERATOR: 2,
                MemberRole.VIEWER: 1,
            }
            min_required = min([role_hierarchy[r] for r in self.required_roles])
            user_level = role_hierarchy.get(membership.role, 0)

            if user_level < min_required:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Permissão insuficiente. Nível requerido: {[r.value for r in self.required_roles]}"
                )

        return membership

async def get_authenticated_agent_server(
    x_agent_token: str = Header(..., description="Token permanente exclusivo do agente"),
    db: AsyncSession = Depends(get_db)
):
    """Autentica o agente instalado na VPS a partir do header X-Agent-Token."""
    from app.core.security import hash_agent_token
    from app.models.server import Server

    token_hash = hash_agent_token(x_agent_token.strip())
    query = select(Server).where(Server.agent_token_hash == token_hash)
    result = await db.execute(query)
    server = result.scalars().first()

    if not server:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de agente inválido ou revogado."
        )

    return server
