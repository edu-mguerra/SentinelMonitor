import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, ConfigDict

class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    is_active: bool = True

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="Senha deve ter no mínimo 8 caracteres")
    full_name: Optional[str] = None
    organization_name: Optional[str] = Field(None, description="Nome da organização inicial a ser criada")

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    password: Optional[str] = Field(None, min_length=8)
    is_active: Optional[bool] = None

class UserResponse(UserBase):
    id: uuid.UUID
    is_superuser: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class UserLogin(BaseModel):
    email: EmailStr
    password: str
