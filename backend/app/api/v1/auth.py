import re
from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_db, get_current_user
from app.core.config import settings
from app.core.security import verify_password, get_password_hash, create_access_token, create_refresh_token, decode_token
from app.models.user import User
from app.models.organization import Organization, OrganizationMember, MemberRole
from app.schemas.token import Token, RefreshTokenRequest
from app.schemas.user import UserCreate, UserResponse

router = APIRouter(prefix="/auth", tags=["Autenticação"])

def generate_slug(text: str) -> str:
    """Gera slug limpo a partir de um nome."""
    slug = text.lower().strip()
    slug = re.sub(r'[^\w\s-]', '', slug)
    slug = re.sub(r'[\s_-]+', '-', slug)
    return slug

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db)
):
    """Cadastra um novo usuário no sistema e cria opcionalmente a organização inicial."""
    query = select(User).where(User.email == user_in.email)
    result = await db.execute(query)
    existing_user = result.scalars().first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Já existe uma conta cadastrada com este e-mail."
        )

    master_email = (settings.SMTP_USER or "monitorsentinelnotify@gmail.com").lower().strip()
    is_master_account = user_in.email.lower().strip() == master_email

    new_user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        is_active=True,
        is_superuser=is_master_account
    )
    db.add(new_user)
    await db.flush()

    org_name = user_in.organization_name or (f"Org de {user_in.full_name}" if user_in.full_name else "Minha Organização")
    base_slug = generate_slug(org_name)
    slug = base_slug

    counter = 1
    while True:
        slug_check = await db.execute(select(Organization).where(Organization.slug == slug))
        if not slug_check.scalars().first():
            break
        slug = f"{base_slug}-{counter}"
        counter += 1

    organization = Organization(
        name=org_name,
        slug=slug,
        is_active=True
    )
    db.add(organization)
    await db.flush()

    membership = OrganizationMember(
        organization_id=organization.id,
        user_id=new_user.id,
        role=MemberRole.OWNER
    )
    db.add(membership)
    await db.commit()
    await db.refresh(new_user)

    try:
        from app.services.email_service import send_email, render_welcome_email
        welcome_html = render_welcome_email(
            user_name=new_user.full_name or "Administrador",
            org_name=organization.name
        )
        import asyncio
        asyncio.create_task(send_email(
            to_emails=[new_user.email],
            subject="🛡️ Bem-vindo ao Sentinel Monitor! Sua conta está ativa",
            html_body=welcome_html
        ))
    except Exception:
        pass

    return new_user

@router.post("/login", response_model=Token)
async def login_for_access_token(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    """Autentica o usuário via username (e-mail) e password, retornando par de tokens JWT e configurando Cookie HttpOnly."""
    query = select(User).where(User.email == form_data.username)
    result = await db.execute(query)
    user = result.scalars().first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha incorretos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Conta inativa. Entre em contato com o suporte."
        )

    expected_master = (user.email.lower().strip() == "monitorsentinelnotify@gmail.com")
    if user.is_superuser != expected_master:
        user.is_superuser = expected_master
        await db.commit()
        await db.refresh(user)

    access_token = create_access_token(subject=str(user.id))
    refresh_token = create_refresh_token(subject=str(user.id))

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/"
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }

@router.post("/refresh", response_model=Token)
async def refresh_token(
    refresh_req: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db)
):
    """Gera um novo access_token a partir de um refresh_token válido."""
    payload = decode_token(refresh_req.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token inválido ou expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido",
            headers={"WWW-Authenticate": "Bearer"},
        )

    import uuid
    user_uuid = uuid.UUID(user_id_str)
    result = await db.execute(select(User).where(User.id == user_uuid))
    user = result.scalars().first()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário associado ao token não existe ou está inativo",
            headers={"WWW-Authenticate": "Bearer"},
        )

    new_access_token = create_access_token(subject=str(user.id))
    new_refresh_token = create_refresh_token(subject=str(user.id))

    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer"
    }

@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_user)
):
    """Retorna os dados do usuário atualmente logado."""
    return current_user

from pydantic import BaseModel as PydanticBaseModel

class GoogleLoginRequest(PydanticBaseModel):
    credential: str

@router.post("/google", response_model=Token)
async def login_with_google(
    payload: GoogleLoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    """
    Endpoint de login social oficial com Google OAuth2.
    Valida criptograficamente o token junto aos servidores do Google (oauth2.googleapis.com).
    NUNCA aceita e-mails sem assinatura válida do Google.
    """
    if not payload.credential or len(payload.credential.strip()) < 20:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticação do Google ausente ou inválido."
        )

    target_email = ""
    target_name = ""

    import httpx
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            if payload.credential.count(".") == 2:
                g_res = await client.get(
                    "https://oauth2.googleapis.com/tokeninfo",
                    params={"id_token": payload.credential}
                )
                if g_res.status_code == 200:
                    g_data = g_res.json()
                    if settings.GOOGLE_CLIENT_ID and g_data.get("aud") != settings.GOOGLE_CLIENT_ID:
                        raise HTTPException(
                            status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="O token do Google não pertence a este aplicativo (Client ID divergente)."
                        )
                    if str(g_data.get("email_verified")).lower() == "true":
                        target_email = g_data.get("email", "").strip().lower()
                        target_name = g_data.get("name") or target_email.split("@")[0]
            else:
                t_res = await client.get(
                    "https://oauth2.googleapis.com/tokeninfo",
                    params={"access_token": payload.credential}
                )
                if t_res.status_code == 200 and settings.GOOGLE_CLIENT_ID:
                    t_data = t_res.json()
                    token_client = t_data.get("aud") or t_data.get("azp")
                    if token_client and token_client != settings.GOOGLE_CLIENT_ID:
                        raise HTTPException(
                            status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="O token do Google não pertence a este aplicativo (Client ID divergente)."
                        )

                g_res = await client.get(
                    "https://www.googleapis.com/oauth2/v3/userinfo",
                    headers={"Authorization": f"Bearer {payload.credential}"}
                )
                if g_res.status_code == 200:
                    g_data = g_res.json()
                    if g_data.get("email_verified") is True or str(g_data.get("email_verified")).lower() == "true":
                        target_email = g_data.get("email", "").strip().lower()
                        target_name = g_data.get("name") or target_email.split("@")[0]
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Não foi possível validar o token junto aos servidores do Google."
        )

    if not target_email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token do Google inválido, expirado ou não autenticado pelo Google."
        )

    master_default_email = "monitorsentinelnotify@gmail.com"
    is_master = (target_email == master_default_email)

    query = select(User).where(User.email == target_email)
    result = await db.execute(query)
    user = result.scalars().first()

    if not user:
        import secrets
        user = User(
            email=target_email,
            full_name=target_name,
            hashed_password=get_password_hash(secrets.token_urlsafe(32)),
            is_active=True,
            is_superuser=is_master
        )
        db.add(user)
        await db.flush()

        org_name = "Sentinel Master HQ" if is_master else f"Organização de {target_name}"
        base_slug = generate_slug(org_name) or f"org-{str(user.id)[:8]}"
        slug = base_slug
        counter = 1
        while True:
            slug_check = await db.execute(select(Organization).where(Organization.slug == slug))
            if not slug_check.scalars().first():
                break
            slug = f"{base_slug}-{counter}"
            counter += 1

        org = Organization(name=org_name, slug=slug, is_active=True)
        db.add(org)
        await db.flush()

        membership = OrganizationMember(organization_id=org.id, user_id=user.id, role=MemberRole.OWNER)
        db.add(membership)
        await db.commit()
        await db.refresh(user)

        try:
            import asyncio
            from app.services.email_service import send_email, render_welcome_email
            welcome_html = render_welcome_email(
                user_name=user.full_name or "Administrador",
                org_name=org.name
            )
            asyncio.create_task(send_email(
                to_emails=[user.email],
                subject="🛡️ Bem-vindo ao Sentinel Monitor! Login Google conectado",
                html_body=welcome_html
            ))
        except Exception:
            pass
    else:
        if user.is_superuser != is_master:
            user.is_superuser = is_master
            await db.commit()
            await db.refresh(user)

    access_token = create_access_token(subject=str(user.id))
    refresh_token = create_refresh_token(subject=str(user.id))

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/"
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }
