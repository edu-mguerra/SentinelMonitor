import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from app.models.organization import MemberRole
from app.schemas.user import UserResponse

class OrganizationBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    slug: Optional[str] = Field(None, min_length=2, max_length=255)

class OrganizationCreate(OrganizationBase):
    pass

class OrganizationUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    is_active: Optional[bool] = None

class OrganizationResponse(OrganizationBase):
    id: uuid.UUID
    slug: str
    is_active: bool
    user_role: Optional[str] = "owner"
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class OrganizationMemberCreate(BaseModel):
    user_id: uuid.UUID
    role: MemberRole = MemberRole.VIEWER

class OrganizationMemberUpdate(BaseModel):
    role: MemberRole

class OrganizationMemberResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    user_id: uuid.UUID
    role: MemberRole
    created_at: datetime
    user: Optional[UserResponse] = None

    model_config = ConfigDict(from_attributes=True)

class OrganizationWithMembersResponse(OrganizationResponse):
    members: List[OrganizationMemberResponse] = []

    model_config = ConfigDict(from_attributes=True)
