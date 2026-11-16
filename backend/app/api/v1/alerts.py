import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, TenantContext
from app.models.organization import OrganizationMember, MemberRole, Organization
from app.models.alert import AlertChannel, AlertChannelType, AlertRule, AlertHistory
from app.schemas.alert import (
    AlertChannelCreate,
    AlertChannelResponse,
    AlertRuleUpdate,
    AlertRuleResponse,
    AlertConfigResponse,
    AlertHistoryResponse,
    TestEmailRequest,
)
from app.services.email_service import send_email, render_test_email

router = APIRouter(
    prefix="/organizations/{organization_id}/alerts",
    tags=["Alertas & Notificações (E-mail)"]
)

@router.get("/config", response_model=AlertConfigResponse)
async def get_alert_config(
    organization_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.VIEWER]))
):
    """Retorna os canais de e-mail e regras de alerta configuradas para a organização."""
    channels_res = await db.execute(
        select(AlertChannel).where(AlertChannel.organization_id == organization_id)
    )
    channels = channels_res.scalars().all()

    rules_res = await db.execute(
        select(AlertRule).where(AlertRule.organization_id == organization_id)
    )
    rule = rules_res.scalars().first()

    if not rule:
        rule = AlertRule(organization_id=organization_id)
        db.add(rule)
        await db.commit()
        await db.refresh(rule)

    return AlertConfigResponse(
        channels=[AlertChannelResponse.model_validate(c) for c in channels],
        rules=AlertRuleResponse.model_validate(rule)
    )

@router.post("/channels", response_model=AlertChannelResponse, status_code=status.HTTP_201_CREATED)
async def create_alert_channel(
    organization_id: uuid.UUID,
    channel_in: AlertChannelCreate,
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.ADMIN, MemberRole.OWNER]))
):
    """Adiciona uma lista de e-mails de destino para receber alertas da organização."""
    channel = AlertChannel(
        organization_id=organization_id,
        type=channel_in.type,
        destination=channel_in.destination,
        is_active=channel_in.is_active
    )
    db.add(channel)
    await db.commit()
    await db.refresh(channel)
    return channel

@router.delete("/channels/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert_channel(
    organization_id: uuid.UUID,
    channel_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.ADMIN, MemberRole.OWNER]))
):
    """Remove um canal de alerta."""
    query = select(AlertChannel).where(
        and_(
            AlertChannel.id == channel_id,
            AlertChannel.organization_id == organization_id
        )
    )
    result = await db.execute(query)
    channel = result.scalars().first()

    if not channel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Canal de alerta não encontrado.")

    await db.delete(channel)
    await db.commit()
    return None

@router.put("/rules", response_model=AlertRuleResponse)
async def update_alert_rules(
    organization_id: uuid.UUID,
    rules_in: AlertRuleUpdate,
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.ADMIN, MemberRole.OWNER]))
):
    """Atualiza limites e parâmetros de disparo de alertas da organização."""
    query = select(AlertRule).where(AlertRule.organization_id == organization_id)
    result = await db.execute(query)
    rule = result.scalars().first()

    if not rule:
        rule = AlertRule(organization_id=organization_id)
        db.add(rule)

    rule.cpu_threshold = rules_in.cpu_threshold
    rule.ram_threshold = rules_in.ram_threshold
    rule.disk_threshold = rules_in.disk_threshold
    rule.server_offline_timeout_seconds = rules_in.server_offline_timeout_seconds
    rule.notify_on_recovery = rules_in.notify_on_recovery

    await db.commit()
    await db.refresh(rule)
    return rule

@router.post("/test", status_code=status.HTTP_200_OK)
async def send_test_email(
    organization_id: uuid.UUID,
    test_req: TestEmailRequest,
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.OPERATOR, MemberRole.ADMIN, MemberRole.OWNER]))
):
    """Dispara um e-mail de teste real para validar a entrega das notificações na caixa de entrada."""
    org_res = await db.execute(select(Organization).where(Organization.id == organization_id))
    org = org_res.scalars().first()
    org_name = org.name if org else "Sentinel Monitor"

    recipients = []
    if test_req.recipient:
        recipients = [test_req.recipient]
    else:
        channels_res = await db.execute(
            select(AlertChannel).where(
                and_(
                    AlertChannel.organization_id == organization_id,
                    AlertChannel.type == AlertChannelType.EMAIL,
                    AlertChannel.is_active == True
                )
            )
        )
        channels = channels_res.scalars().all()
        for ch in channels:
            recipients.extend([e.strip() for e in ch.destination.split(",") if "@" in e])

    if not recipients:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum e-mail de destinatário foi configurado ou informado."
        )

    subject = f"[TESTE] Sentinel Monitor - Alertas Ativos ({org_name})"
    html_body = render_test_email(org_name)

    success, error_msg = await send_email(recipients, subject, html_body)

    for r in recipients:
        history = AlertHistory(
            organization_id=organization_id,
            channel_type="email",
            recipient=r,
            subject=subject,
            content_preview="E-mail de Teste de Configuração",
            is_success=success,
            error_message=error_msg
        )
        db.add(history)
    await db.commit()

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Falha ao enviar e-mail de teste: {error_msg}"
        )

    return {"status": "success", "recipients": recipients, "message": "E-mail de teste enviado com sucesso!"}

@router.get("/history", response_model=List[AlertHistoryResponse])
async def list_alert_history(
    organization_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMember = Depends(TenantContext(required_roles=[MemberRole.VIEWER]))
):
    """Lista as últimas 50 notificações enviadas para auditoria."""
    query = (
        select(AlertHistory)
        .where(AlertHistory.organization_id == organization_id)
        .order_by(AlertHistory.sent_at.desc())
        .limit(50)
    )
    result = await db.execute(query)
    return result.scalars().all()
