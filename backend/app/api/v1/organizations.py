import uuid
import re
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_db, get_current_user, TenantContext
from app.models.user import User
from app.models.organization import Organization, OrganizationMember, MemberRole
from app.schemas.organization import (
    OrganizationCreate,
    OrganizationUpdate,
    OrganizationResponse,
    OrganizationWithMembersResponse,
    OrganizationMemberCreate,
    OrganizationMemberResponse,
)

router = APIRouter(prefix="/organizations", tags=["Organizações (Multi-Tenancy)"])

def generate_slug(text: str) -> str:
    slug = text.lower().strip()
    slug = re.sub(r'[^\w\s-]', '', slug)
    slug = re.sub(r'[\s_-]+', '-', slug)
    return slug

@router.get("", response_model=List[OrganizationResponse])
async def list_user_organizations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Lista apenas as organizações às quais o usuário autenticado pertence diretamente.
    O Master NÃO lista e NÃO acessa organizações de outros clientes.
    """
    memberships_res = await db.execute(
        select(OrganizationMember).where(OrganizationMember.user_id == current_user.id)
    )
    role_map = {m.organization_id: (m.role.value if hasattr(m.role, "value") else str(m.role)) for m in memberships_res.scalars().all()}

    query = (
        select(Organization)
        .join(OrganizationMember, Organization.id == OrganizationMember.organization_id)
        .where(OrganizationMember.user_id == current_user.id)
    )
    result = await db.execute(query)
    orgs = result.scalars().all()
    response_list = []
    for o in orgs:
        resp = OrganizationResponse.model_validate(o)
        resp.user_role = role_map.get(o.id, "owner")
        response_list.append(resp)
    return response_list

@router.post("", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
async def create_organization(
    org_in: OrganizationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Cria uma nova organização e define o criador como OWNER."""
    base_slug = org_in.slug or generate_slug(org_in.name)
    slug = base_slug
    counter = 1
    while True:
        check = await db.execute(select(Organization).where(Organization.slug == slug))
        if not check.scalars().first():
            break
        slug = f"{base_slug}-{counter}"
        counter += 1

    org = Organization(
        name=org_in.name,
        slug=slug,
        is_active=True
    )
    db.add(org)
    await db.flush()

    membership = OrganizationMember(
        organization_id=org.id,
        user_id=current_user.id,
        role=MemberRole.OWNER
    )
    db.add(membership)
    await db.commit()
    await db.refresh(org)

    try:
        import asyncio
        from app.services.email_service import send_email, render_org_created_email
        org_html = render_org_created_email(
            org_name=org.name,
            org_slug=org.slug,
            user_name=current_user.full_name or "Administrador"
        )
        asyncio.create_task(send_email(
            to_emails=[current_user.email],
            subject=f"🏢 Organização '{org.name}' criada no Sentinel Monitor",
            html_body=org_html
        ))
    except Exception:
        pass

    return org

@router.get("/{organization_id}", response_model=OrganizationWithMembersResponse)
async def get_organization(
    organization_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.VIEWER]))
):
    """Obtém detalhes da organização. Apenas membros têm acesso."""
    result = await db.execute(select(Organization).where(Organization.id == organization_id))
    org = result.scalars().first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organização não encontrada")
    return org

@router.patch("/{organization_id}", response_model=OrganizationResponse)
async def update_organization(
    organization_id: uuid.UUID,
    org_in: OrganizationUpdate,
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.ADMIN, MemberRole.OWNER]))
):
    """Atualiza o nome ou status da organização (requer privilégio ADMIN ou OWNER)."""
    result = await db.execute(select(Organization).where(Organization.id == organization_id))
    org = result.scalars().first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organização não encontrada")

    if org_in.name is not None:
        org.name = org_in.name
    if org_in.is_active is not None:
        org.is_active = org_in.is_active

    await db.commit()
    await db.refresh(org)
    return org

@router.get("/{organization_id}/members", response_model=List[OrganizationMemberResponse])
async def list_organization_members(
    organization_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.VIEWER]))
):
    """Lista todos os membros e suas respectivas funções na organização."""
    result = await db.execute(
        select(OrganizationMember)
        .where(OrganizationMember.organization_id == organization_id)
    )
    return result.scalars().all()

@router.post("/{organization_id}/members", response_model=OrganizationMemberResponse, status_code=status.HTTP_201_CREATED)
async def add_organization_member(
    organization_id: uuid.UUID,
    member_in: OrganizationMemberCreate,
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.ADMIN, MemberRole.OWNER]))
):
    """Adiciona um novo membro à organização (requer privilégio ADMIN ou OWNER)."""
    user_check = await db.execute(select(User).where(User.id == member_in.user_id))
    user_to_add = user_check.scalars().first()
    if not user_to_add:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário informado não existe")

    existing = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.user_id == member_in.user_id
        )
    )
    if existing.scalars().first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Usuário já é membro desta organização")

    new_member = OrganizationMember(
        organization_id=organization_id,
        user_id=member_in.user_id,
        role=member_in.role
    )
    db.add(new_member)
    await db.commit()
    await db.refresh(new_member)

    return new_member
