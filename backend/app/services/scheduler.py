import asyncio
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, and_, or_
from app.database.session import AsyncSessionLocal
from app.models.monitor import Monitor, MonitorStatus
from app.services.checker import execute_monitor_check
from app.services.alert_dispatcher import check_servers_offline_job

logger = logging.getLogger("sentinel.scheduler")

MAX_CONCURRENT_CHECKS = 25
semaphore = asyncio.Semaphore(MAX_CONCURRENT_CHECKS)

async def _run_single_check(monitor_id):
    """Executa a verificação de um único monitor com sua própria sessão de banco."""
    async with semaphore:
        async with AsyncSessionLocal() as session:
            try:
                result = await session.execute(select(Monitor).where(Monitor.id == monitor_id))
                monitor = result.scalars().first()
                if not monitor or not monitor.is_active or monitor.status == MonitorStatus.PAUSED:
                    return

                await execute_monitor_check(session, monitor)
            except Exception as e:
                logger.error(f"Erro ao verificar monitor {monitor_id}: {str(e)}", exc_info=True)

async def monitor_scheduler_loop():
    """Loop contínuo em background para disparar verificações programadas."""
    logger.info("Iniciando loop do agendador de monitoramento externo...")
    while True:
        try:
            now = datetime.now(timezone.utc)

            async with AsyncSessionLocal() as session:
                await check_servers_offline_job(session)

                query = select(Monitor).where(
                    and_(
                        Monitor.is_active == True,
                        Monitor.status != MonitorStatus.PAUSED
                    )
                )
                result = await session.execute(query)
                monitors = result.scalars().all()

                due_monitor_ids = []
                for m in monitors:
                    if m.last_checked_at is None:
                        due_monitor_ids.append(m.id)
                    else:
                        last_checked = m.last_checked_at
                        if last_checked.tzinfo is None:
                            last_checked = last_checked.replace(tzinfo=timezone.utc)
                        next_run = last_checked + timedelta(seconds=m.interval_seconds)
                        if now >= next_run:
                            due_monitor_ids.append(m.id)

            if due_monitor_ids:
                logger.info(f"Disparando checagem para {len(due_monitor_ids)} monitores...")
                tasks = [_run_single_check(mid) for mid in due_monitor_ids]
                await asyncio.gather(*tasks, return_exceptions=True)

        except asyncio.CancelledError:
            logger.info("Agendador de monitoramento cancelado com sucesso.")
            break
        except Exception as e:
            logger.error(f"Erro no ciclo do agendador de monitoramento: {str(e)}", exc_info=True)

        await asyncio.sleep(5)
