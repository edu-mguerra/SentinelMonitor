import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime, timezone, timedelta
from typing import List, Tuple, Optional
from app.core.config import settings

logger = logging.getLogger("sentinel.email")

BR_TIMEZONE = timezone(timedelta(hours=-3))

def format_datetime_br(dt: Optional[datetime] = None) -> str:
    if dt is None:
        dt = datetime.now(timezone.utc)
    elif dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    br_dt = dt.astimezone(BR_TIMEZONE)
    return br_dt.strftime("%d/%m/%Y às %H:%M:%S")

def _send_smtp_sync(to_emails: List[str], subject: str, html_body: str, text_body: str) -> Tuple[bool, Optional[str]]:
    """Função síncrona que realiza a conexão SMTP e envio via socket TLS."""
    if not settings.SMTP_HOST or not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.warning(f"[EMAIL MOCK] SMTP não configurado. E-mail simulado para {to_emails}: {subject}")
        return True, None

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{settings.EMAILS_FROM_NAME} <{settings.EMAILS_FROM_EMAIL}>"
        msg["To"] = ", ".join(to_emails)

        msg.attach(MIMEText(text_body, "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
        if settings.SMTP_TLS:
            server.starttls()

        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(settings.EMAILS_FROM_EMAIL, to_emails, msg.as_string())
        server.quit()

        logger.info(f"E-mail enviado com sucesso para {to_emails}: {subject}")
        return True, None
    except Exception as e:
        error_msg = f"Falha no envio SMTP: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return False, error_msg

async def send_email(to_emails: List[str], subject: str, html_body: str, text_body: Optional[str] = None) -> Tuple[bool, Optional[str]]:
    """Envio assíncrono que delega o socket SMTP para um executor de thread sem bloquear o event loop."""
    if not to_emails:
        return False, "Nenhum destinatário informado."

    plain_text = text_body or "Notificação do Sentinel Monitor. Abra em um cliente que suporte HTML."
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _send_smtp_sync, to_emails, subject, html_body, plain_text)

SPAM_NOTICE_HTML = """
<div style="background-color: #1e293b; border: 1px dashed #475569; border-radius: 10px; padding: 12px 16px; margin-top: 25px; font-size: 11px; line-height: 1.5; color: #94a3b8;">
  <strong style="color: #f8fafc;">💡 Dica de Segurança:</strong> Para garantir que você e sua equipe nunca percam comunicados críticos de indisponibilidade ou segurança, marque este e-mail como <strong>"Não é Spam"</strong> e adicione <strong>monitorsentinelnotify@gmail.com</strong> aos seus contatos confiáveis.
</div>
"""

BASE_CSS = """
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #090d16; color: #f1f5f9; margin: 0; padding: 30px; }
  .card { max-width: 600px; margin: 0 auto; background-color: #0f172a; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.6); }
  .content { padding: 30px; font-size: 14px; line-height: 1.6; color: #cbd5e1; }
  .field { margin-bottom: 14px; }
  .label { font-size: 11px; text-transform: uppercase; color: #94a3b8; font-weight: 600; margin-bottom: 4px; }
  .value { font-size: 13px; color: #f8fafc; font-family: monospace; background-color: #1e293b; padding: 8px 12px; border-radius: 8px; border: 1px solid #334155; }
  .footer { padding: 20px 30px; background-color: #0b1120; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #1e293b; }
"""

def render_welcome_email(user_name: str, org_name: str) -> str:
    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><style>{BASE_CSS}</style></head>
    <body>
      <div class="card" style="border: 1px solid #3b82f6;">
        <div style="background: linear-gradient(135deg, #1e3a8a, #2563eb); padding: 28px 30px;">
          <span style="background-color: #60a5fa; color: #0f172a; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: bold; text-transform: uppercase;">Boas-Vindas</span>
          <div style="font-size: 22px; font-weight: bold; color: #ffffff; margin-top: 10px;">Bem-vindo ao Sentinel Monitor! 🛡️</div>
        </div>
        <div class="content">
          <p>Olá, <strong>{user_name}</strong>!</p>
          <p>Sua conta foi criada com sucesso e sua organização inicial <strong>{org_name}</strong> já está ativa e pronta para uso.</p>
          <p>Com o Sentinel Monitor, você tem em mãos:</p>
          <ul style="padding-left: 20px; color: #94a3b8;">
            <li><strong style="color: #f1f5f9;">Agente Linux One-Liner:</strong> Instale o agente em suas VPS em 10 segundos com privilégio mínimo.</li>
            <li><strong style="color: #f1f5f9;">Monitores Web & TCP:</strong> Checagens contínuas de disponibilidade HTTP, tempo de resposta e certificados SSL.</li>
            <li><strong style="color: #f1f5f9;">Alertas em Tempo Real:</strong> Notificações instantâneas enviadas diretamente para a sua caixa de entrada.</li>
          </ul>
          {SPAM_NOTICE_HTML}
        </div>
        <div class="footer">Sentinel Monitor • Plataforma de Monitoramento de Infraestrutura</div>
      </div>
    </body>
    </html>
    """

def render_org_created_email(org_name: str, org_slug: str, user_name: str) -> str:
    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><style>{BASE_CSS}</style></head>
    <body>
      <div class="card" style="border: 1px solid #8b5cf6;">
        <div style="background: linear-gradient(135deg, #4c1d95, #7c3aed); padding: 28px 30px;">
          <span style="background-color: #c4b5fd; color: #1e1b4b; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: bold; text-transform: uppercase;">Nova Empresa</span>
          <div style="font-size: 22px; font-weight: bold; color: #ffffff; margin-top: 10px;">Organização '{org_name}' Criada 🏢</div>
        </div>
        <div class="content">
          <p>Olá, <strong>{user_name}</strong>!</p>
          <p>Uma nova organização foi registrada na sua conta Sentinel Monitor com isolamento completo de dados (Multi-Tenancy):</p>
          <div class="field">
            <div class="label">Nome da Empresa</div>
            <div class="value">{org_name}</div>
          </div>
          <div class="field">
            <div class="label">Identificador (Slug)</div>
            <div class="value">{org_slug}</div>
          </div>
          <p>Você já pode cadastrar servidores exclusivos, configurar monitores web e adicionar outros membros de equipe a esta organização.</p>
          {SPAM_NOTICE_HTML}
        </div>
        <div class="footer">Sentinel Monitor • Plataforma Multi-Tenant</div>
      </div>
    </body>
    </html>
    """

def render_vps_offline_email(server_name: str, hostname: str, timeout_seconds: int, detected_at: datetime) -> str:
    detected_str = format_datetime_br(detected_at)
    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><style>{BASE_CSS}</style></head>
    <body>
      <div class="card" style="border: 1px solid #dc2626;">
        <div style="background: linear-gradient(135deg, #7f1d1d, #b91c1c); padding: 28px 30px;">
          <span style="background-color: #ef4444; color: #ffffff; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: bold; text-transform: uppercase;">Alerta Crítico</span>
          <div style="font-size: 22px; font-weight: bold; color: #ffffff; margin-top: 10px;">🚨 Servidor VPS Desconectado</div>
        </div>
        <div class="content">
          <p>O agente instalado no servidor <strong style="color: #f87171;">{server_name}</strong> parou de transmitir sinais de telemetria.</p>
          <div class="field">
            <div class="label">Servidor / Hostname</div>
            <div class="value">{server_name} ({hostname or 'IP não resolvido'})</div>
          </div>
          <div class="field">
            <div class="label">Tempo sem sinal</div>
            <div class="value">Mais de {timeout_seconds} segundos sem comunicação</div>
          </div>
          <div class="field">
            <div class="label">Detectado em</div>
            <div class="value">{detected_str}</div>
          </div>
          <div style="background-color: #1e293b; border-left: 4px solid #ef4444; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #cbd5e1; margin-top: 16px;">
            <strong>Possíveis Causas:</strong><br/>
            • Servidor desligado ou reinicializado sem aviso.<br/>
            • Queda na rota de internet / conectividade da VPS.<br/>
            • Kernel panic ou processo do agente interrompido no systemd.
          </div>
          {SPAM_NOTICE_HTML}
        </div>
        <div class="footer">Sentinel Monitor • Monitoramento de Servidores</div>
      </div>
    </body>
    </html>
    """

def render_hardware_alert_email(server_name: str, metric_name: str, current_val: float, threshold_val: float) -> str:
    now_str = format_datetime_br()
    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><style>{BASE_CSS}</style></head>
    <body>
      <div class="card" style="border: 1px solid #d97706;">
        <div style="background: linear-gradient(135deg, #78350f, #b45309); padding: 28px 30px;">
          <span style="background-color: #f59e0b; color: #1e1b4b; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: bold; text-transform: uppercase;">Aviso de Hardware</span>
          <div style="font-size: 22px; font-weight: bold; color: #ffffff; margin-top: 10px;">⚠️ Sobrecarga de {metric_name} na VPS</div>
        </div>
        <div class="content">
          <p>O servidor <strong>{server_name}</strong> ultrapassou o limite seguro de hardware configurado para sua organização.</p>
          <div class="field">
            <div class="label">Servidor</div>
            <div class="value">{server_name}</div>
          </div>
          <div class="field">
            <div class="label">Métrica Excedida</div>
            <div class="value">{metric_name}: {current_val}% (Limite Máximo: {threshold_val}%)</div>
          </div>
          <div class="field">
            <div class="label">Horário do Registro</div>
            <div class="value">{now_str}</div>
          </div>
          <p style="font-size: 13px; color: #94a3b8; margin-top: 16px;">
            Recomendamos verificar processos em execução através do comando <code style="color: #60a5fa;">top</code> ou <code style="color: #60a5fa;">htop</code> no terminal da sua máquina para evitar travamentos.
          </p>
          {SPAM_NOTICE_HTML}
        </div>
        <div class="footer">Sentinel Monitor • Telemetria de Hardware</div>
      </div>
    </body>
    </html>
    """

def render_incident_alert_email(incident_title: str, resource_name: str, resource_type: str, details: str, started_at: datetime) -> str:
    started_str = format_datetime_br(started_at)
    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><style>{BASE_CSS}</style></head>
    <body>
      <div class="card" style="border: 1px solid #dc2626;">
        <div style="background: linear-gradient(135deg, #7f1d1d, #991b1b); padding: 28px 30px;">
          <span style="background-color: #ef4444; color: #ffffff; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: bold; text-transform: uppercase;">Indisponibilidade</span>
          <div style="font-size: 22px; font-weight: bold; color: #ffffff; margin-top: 10px;">🚨 {incident_title}</div>
        </div>
        <div class="content">
          <div class="field">
            <div class="label">Recurso Afetado</div>
            <div class="value">{resource_name} ({resource_type})</div>
          </div>
          <div class="field">
            <div class="label">Horário de Início</div>
            <div class="value">{started_str}</div>
          </div>
          <div style="background-color: #1e293b; border-left: 4px solid #ef4444; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #cbd5e1; margin-top: 16px; white-space: pre-line;">
            <strong>Causa / Diagnóstico Técnico:</strong><br/>
            {details}
          </div>
          {SPAM_NOTICE_HTML}
        </div>
        <div class="footer">Sentinel Monitor • Monitoramento Externo</div>
      </div>
    </body>
    </html>
    """

def render_recovery_alert_email(incident_title: str, resource_name: str, duration_str: str, resolved_at: datetime) -> str:
    resolved_str = format_datetime_br(resolved_at)
    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><style>{BASE_CSS}</style></head>
    <body>
      <div class="card" style="border: 1px solid #059669;">
        <div style="background: linear-gradient(135deg, #064e3b, #047857); padding: 28px 30px;">
          <span style="background-color: #10b981; color: #ffffff; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: bold; text-transform: uppercase;">Serviço Restaurado</span>
          <div style="font-size: 22px; font-weight: bold; color: #ffffff; margin-top: 10px;">✅ {resource_name} voltou a operar normalmente</div>
        </div>
        <div class="content">
          <div class="field">
            <div class="label">Incidente Concluído</div>
            <div class="value">{incident_title}</div>
          </div>
          <div class="field">
            <div class="label">Horário de Recuperação</div>
            <div class="value">{resolved_str}</div>
          </div>
          <div class="field">
            <div class="label">Duração Total da Indisponibilidade</div>
            <div class="value">{duration_str}</div>
          </div>
          <p style="color: #10b981; font-weight: 500; font-size: 13px; margin-top: 16px;">
            ✓ Todas as verificações automáticas voltaram a responder com sucesso.
          </p>
          {SPAM_NOTICE_HTML}
        </div>
        <div class="footer">Sentinel Monitor • Monitoramento em Tempo Real</div>
      </div>
    </body>
    </html>
    """

def render_pending_approval_user_email(user_name: str, org_name: str) -> str:
    now_str = format_datetime_br()
    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><style>{BASE_CSS}</style></head>
    <body>
      <div class="card" style="border: 1px solid #eab308;">
        <div style="background: linear-gradient(135deg, #713f12, #a16207); padding: 28px 30px;">
          <span style="background-color: #fde047; color: #713f12; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: bold; text-transform: uppercase;">Aprovação Pendente</span>
          <div style="font-size: 22px; font-weight: bold; color: #ffffff; margin-top: 10px;">Cadastro Recebido - Sentinel Monitor 🛡️</div>
        </div>
        <div class="content">
          <p>Olá, <strong>{user_name}</strong>!</p>
          <p>Seu cadastro para a organização <strong>{org_name}</strong> foi realizado com sucesso e está aguardando a aprovação de um <strong>Administrador Master</strong>.</p>
          <div class="field">
            <div class="label">Status da Conta</div>
            <div class="value" style="color: #facc15;">⏳ Em análise pelo Administrador Master</div>
          </div>
          <div class="field">
            <div class="label">Data da Solicitação</div>
            <div class="value">{now_str}</div>
          </div>
          <p style="font-size: 13px; color: #94a3b8; margin-top: 16px;">
            Assim que seu acesso for liberado, você receberá um e-mail de confirmação e poderá acessar normalmente a plataforma.
          </p>
          {SPAM_NOTICE_HTML}
        </div>
        <div class="footer">Sentinel Monitor • Plataforma de Monitoramento</div>
      </div>
    </body>
    </html>
    """

def render_pending_approval_admin_notify_email(user_name: str, user_email: str, org_name: str) -> str:
    now_str = format_datetime_br()
    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><style>{BASE_CSS}</style></head>
    <body>
      <div class="card" style="border: 1px solid #3b82f6;">
        <div style="background: linear-gradient(135deg, #1e3a8a, #2563eb); padding: 28px 30px;">
          <span style="background-color: #60a5fa; color: #0f172a; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: bold; text-transform: uppercase;">Painel Master</span>
          <div style="font-size: 22px; font-weight: bold; color: #ffffff; margin-top: 10px;">👤 Novo Usuário Aguardando Aprovação</div>
        </div>
        <div class="content">
          <p>Um novo usuário completou o cadastro na plataforma e aguarda sua autorização:</p>
          <div class="field">
            <div class="label">Nome Completo</div>
            <div class="value">{user_name}</div>
          </div>
          <div class="field">
            <div class="label">E-mail</div>
            <div class="value">{user_email}</div>
          </div>
          <div class="field">
            <div class="label">Empresa / Organização</div>
            <div class="value">{org_name}</div>
          </div>
          <div class="field">
            <div class="label">Data de Registro</div>
            <div class="value">{now_str}</div>
          </div>
          <p style="margin-top: 18px;">
            Para aprovar ou rejeitar este acesso, entre na aba <strong>Gestão de Usuários</strong> no painel de administração.
          </p>
          {SPAM_NOTICE_HTML}
        </div>
        <div class="footer">Sentinel Monitor • Painel de Controle Master</div>
      </div>
    </body>
    </html>
    """

def render_account_approved_email(user_name: str) -> str:
    now_str = format_datetime_br()
    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><style>{BASE_CSS}</style></head>
    <body>
      <div class="card" style="border: 1px solid #10b981;">
        <div style="background: linear-gradient(135deg, #065f46, #059669); padding: 28px 30px;">
          <span style="background-color: #34d399; color: #064e3b; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: bold; text-transform: uppercase;">Acesso Liberado</span>
          <div style="font-size: 22px; font-weight: bold; color: #ffffff; margin-top: 10px;">🎉 Sua Conta foi Aprovada!</div>
        </div>
        <div class="content">
          <p>Olá, <strong>{user_name}</strong>!</p>
          <p>Sua conta no <strong>Sentinel Monitor</strong> foi aprovada pelo Administrador Master e seu acesso está liberado.</p>
          <div class="field">
            <div class="label">Status</div>
            <div class="value" style="color: #34d399;">✓ Ativo e Liberado</div>
          </div>
          <div class="field">
            <div class="label">Data de Ativação</div>
            <div class="value">{now_str}</div>
          </div>
          <p style="margin-top: 20px;">
            Você já pode fazer login na plataforma e começar a monitorar seus servidores e aplicações.
          </p>
          {SPAM_NOTICE_HTML}
        </div>
        <div class="footer">Sentinel Monitor • Plataforma de Monitoramento</div>
      </div>
    </body>
    </html>
    """

def render_vps_share_invite_email(owner_name: str, owner_email: str, server_name: str) -> str:
    now_str = format_datetime_br()
    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><style>{BASE_CSS}</style></head>
    <body>
      <div class="card" style="border: 1px solid #3b82f6;">
        <div style="background: linear-gradient(135deg, #1e3a8a, #2563eb); padding: 28px 30px;">
          <span style="background-color: #60a5fa; color: #0f172a; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: bold; text-transform: uppercase;">VPS Amiga</span>
          <div style="font-size: 22px; font-weight: bold; color: #ffffff; margin-top: 10px;">🤝 Convite de Acesso a Servidor</div>
        </div>
        <div class="content">
          <p>Olá!</p>
          <p><strong>{owner_name}</strong> ({owner_email}) compartilhou o monitoramento da VPS <strong>{server_name}</strong> com você no Sentinel Monitor.</p>
          <div class="field">
            <div class="label">Servidor Compartilhado</div>
            <div class="value">{server_name}</div>
          </div>
          <div class="field">
            <div class="label">Proprietário</div>
            <div class="value">{owner_name} ({owner_email})</div>
          </div>
          <div class="field">
            <div class="label">Data do Convite</div>
            <div class="value">{now_str}</div>
          </div>
          <p style="margin-top: 20px;">
            Ao aceitar este convite no painel, você poderá acompanhar os gráficos de CPU, memória, processos PM2, containers Docker e também <strong>receberá alertas instantâneos por e-mail</strong> sempre que este servidor sofrer instabilidade.
          </p>
          <p style="margin-top: 12px; font-size: 13px; color: #94a3b8;">
            Acesse o Sentinel Monitor na aba <strong>Servidores</strong> para aceitar o convite.
          </p>
          {SPAM_NOTICE_HTML}
        </div>
        <div class="footer">Sentinel Monitor • Monitoramento Colaborativo de Servidores</div>
      </div>
    </body>
    </html>
    """

def render_vps_share_accepted_email(guest_name: str, guest_email: str, server_name: str) -> str:
    now_str = format_datetime_br()
    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><style>{BASE_CSS}</style></head>
    <body>
      <div class="card" style="border: 1px solid #10b981;">
        <div style="background: linear-gradient(135deg, #064e3b, #047857); padding: 28px 30px;">
          <span style="background-color: #34d399; color: #064e3b; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: bold; text-transform: uppercase;">VPS Amiga Conectada</span>
          <div style="font-size: 22px; font-weight: bold; color: #ffffff; margin-top: 10px;">🤝 Convite Aceito com Sucesso!</div>
        </div>
        <div class="content">
          <p>Olá!</p>
          <p><strong>{guest_name}</strong> ({guest_email}) aceitou seu convite de VPS Amiga para monitorar o servidor <strong>{server_name}</strong>.</p>
          <div class="field">
            <div class="label">Servidor</div>
            <div class="value">{server_name}</div>
          </div>
          <div class="field">
            <div class="label">Usuário Conectado</div>
            <div class="value">{guest_name} ({guest_email})</div>
          </div>
          <div class="field">
            <div class="label">Horário de Conexão</div>
            <div class="value">{now_str}</div>
          </div>
          <p style="margin-top: 20px;">
            A partir de agora, este usuário possui acesso de visualização à telemetria deste servidor e também receberá notificações automáticas de incidentes.
          </p>
          {SPAM_NOTICE_HTML}
        </div>
        <div class="footer">Sentinel Monitor • Compartilhamento de VPS</div>
      </div>
    </body>
    </html>
    """

def render_test_email(org_name: str) -> str:
    now_str = format_datetime_br()
    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><style>{BASE_CSS}</style></head>
    <body>
      <div class="card" style="border: 1px solid #2563eb;">
        <div style="background: linear-gradient(135deg, #1e3a8a, #2563eb); padding: 28px 30px;">
          <span style="background-color: #93c5fd; color: #1e3a8a; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: bold; text-transform: uppercase;">Canal de Teste</span>
          <div style="font-size: 22px; font-weight: bold; color: #ffffff; margin-top: 10px;">🛡️ Teste de Notificação - Sentinel Monitor</div>
        </div>
        <div class="content">
          <p>Olá! Este é um e-mail de teste disparado pela sua plataforma <strong>Sentinel Monitor</strong>.</p>
          <p>Os alertas para a organização <strong style="color: #60a5fa;">{org_name}</strong> estão ativos e prontos para notificar sua equipe instantaneamente em caso de incidentes de infraestrutura.</p>
          <div class="field" style="margin-top: 20px;">
            <div class="label">Disparado em</div>
            <div class="value">{now_str}</div>
          </div>
          {SPAM_NOTICE_HTML}
        </div>
        <div class="footer">Sentinel Monitor • Configuração de Alertas Ativa</div>
      </div>
    </body>
    </html>
    """
