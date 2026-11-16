import enum
from sqlalchemy import Column, String, Boolean, Enum, ForeignKey, UniqueConstraint, Uuid as UUID
from sqlalchemy.orm import relationship
from app.models.base import BaseModel

class MemberRole(str, enum.Enum):
    OWNER = "owner"
    ADMIN = "admin"
    OPERATOR = "operator"
    VIEWER = "viewer"

class Organization(BaseModel):
    __tablename__ = "organizations"

    name = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, index=True, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    members = relationship(
        "OrganizationMember",
        back_populates="organization",
        cascade="all, delete-orphan",
        lazy="selectin"
    )

    def __repr__(self):
        return f"<Organization {self.name} ({self.slug})>"

class OrganizationMember(BaseModel):
    __tablename__ = "organization_members"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    role = Column(
        Enum(MemberRole, name="member_role", native_enum=False),
        default=MemberRole.VIEWER,
        nullable=False
    )

    organization = relationship("Organization", back_populates="members", lazy="selectin")
    user = relationship("User", back_populates="memberships", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("organization_id", "user_id", name="uq_org_member"),
    )

    def __repr__(self):
        return f"<OrganizationMember user={self.user_id} org={self.organization_id} role={self.role}>"
