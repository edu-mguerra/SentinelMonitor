import logging
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.server import Server, ServerMetric, ServerMetricHourly
from app.models.incident import Incident
from app.schemas.server import (
    ServerReportResponse,
    ServerReportSummary,
    ServerReportPoint,
    ServerReportIncident,
)

logger = logging.getLogger("sentinel.reports")

def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

def _truncate_hour(dt: datetime) -> datetime:
    utc_dt = _ensure_utc(dt)
    return utc_dt.replace(minute=0, second=0, microsecond=0)

def parse_report_date_range(
    days: int = 30,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Tuple[datetime, datetime]:
    now = datetime.now(timezone.utc)
    br_tz = timezone(timedelta(hours=-3))

    if start_date and end_date:
        try:
            s_raw = start_date.strip()
            e_raw = end_date.strip()
            if len(s_raw) == 10:
                s_dt = datetime.fromisoformat(s_raw).replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=br_tz).astimezone(timezone.utc)
            else:
                s_dt = _ensure_utc(datetime.fromisoformat(s_raw.replace("Z", "+00:00")))

            if len(e_raw) == 10:
                e_dt = datetime.fromisoformat(e_raw).replace(hour=23, minute=59, second=59, microsecond=999999, tzinfo=br_tz).astimezone(timezone.utc)
            else:
                e_dt = _ensure_utc(datetime.fromisoformat(e_raw.replace("Z", "+00:00")))
        except ValueError:
            raise ValueError("Formato de data inválido. Utilize AAAA-MM-DD.")

        if e_dt <= s_dt:
            raise ValueError("A data final deve ser posterior à data inicial.")
        if (e_dt - s_dt).days > 366:
            raise ValueError("O período máximo por relatório é de 365 dias.")
        return s_dt, min(e_dt, now)

    safe_days = max(1, min(365, days))
    return now - timedelta(days=safe_days), now

def _extract_disk_percent(disk_data: Any) -> Optional[float]:
    if not isinstance(disk_data, list) or not disk_data:
        return None
    root = next((d for d in disk_data if isinstance(d, dict) and d.get("mountpoint") == "/"), None)
    target = root if root is not None else disk_data[0]
    if isinstance(target, dict) and target.get("usage_percent") is not None:
        return float(target["usage_percent"])
    return None

def _extract_net_rates(network_data: Any) -> Tuple[Optional[float], Optional[float]]:
    if not isinstance(network_data, dict):
        return None, None
    recv = network_data.get("rate_recv_kbps")
    sent = network_data.get("rate_sent_kbps")
    return (
        float(recv) if recv is not None else None,
        float(sent) if sent is not None else None,
    )

def _summarize_rows(rows: List[Tuple[datetime, float, float, Any, Any]]) -> Dict[str, Any]:
    count = len(rows)
    cpu_sum = 0.0
    cpu_min = float("inf")
    cpu_max = float("-inf")
    cpu_peak_at = None

    ram_sum = 0.0
    ram_min = float("inf")
    ram_max = float("-inf")
    ram_peak_at = None

    disk_vals: List[float] = []
    recv_vals: List[float] = []
    sent_vals: List[float] = []

    for rec_at, cpu, ram, disk_data, net_data in rows:
        rec_utc = _ensure_utc(rec_at)
        c_val = float(cpu or 0.0)
        r_val = float(ram or 0.0)

        cpu_sum += c_val
        if c_val < cpu_min:
            cpu_min = c_val
        if c_val >= cpu_max:
            cpu_max = c_val
            cpu_peak_at = rec_utc

        ram_sum += r_val
        if r_val < ram_min:
            ram_min = r_val
        if r_val >= ram_max:
            ram_max = r_val
            ram_peak_at = rec_utc

        d_val = _extract_disk_percent(disk_data)
        if d_val is not None:
            disk_vals.append(d_val)

        recv_val, sent_val = _extract_net_rates(net_data)
        if recv_val is not None:
            recv_vals.append(recv_val)
        if sent_val is not None:
            sent_vals.append(sent_val)

    return {
        "samples_count": count,
        "cpu_avg": round(cpu_sum / count, 2),
        "cpu_min": round(cpu_min, 2),
        "cpu_max": round(cpu_max, 2),
        "cpu_peak_at": cpu_peak_at,
        "ram_avg": round(ram_sum / count, 2),
        "ram_min": round(ram_min, 2),
        "ram_max": round(ram_max, 2),
        "ram_peak_at": ram_peak_at,
        "disk_avg": round(sum(disk_vals) / len(disk_vals), 2) if disk_vals else None,
        "disk_max": round(max(disk_vals), 2) if disk_vals else None,
        "net_recv_kbps_avg": round(sum(recv_vals) / len(recv_vals), 2) if recv_vals else None,
        "net_recv_kbps_max": round(max(recv_vals), 2) if recv_vals else None,
        "net_sent_kbps_avg": round(sum(sent_vals) / len(sent_vals), 2) if sent_vals else None,
        "net_sent_kbps_max": round(max(sent_vals), 2) if sent_vals else None,
    }

async def aggregate_server_metrics_hourly(db: AsyncSession, full_backfill: bool = False) -> None:
    now = datetime.now(timezone.utc)
    current_hour = _truncate_hour(now)

    server_ids_res = await db.execute(select(ServerMetric.server_id).distinct())
    server_ids = [row[0] for row in server_ids_res.all()]

    for sid in server_ids:
        try:
            existing_res = await db.execute(
                select(ServerMetricHourly).where(ServerMetricHourly.server_id == sid)
            )
            existing_by_hour: Dict[datetime, ServerMetricHourly] = {
                _ensure_utc(r.hour_bucket): r for r in existing_res.scalars().all()
            }

            if full_backfill:
                scan_start = current_hour - timedelta(days=30)
            else:
                scan_start = current_hour - timedelta(hours=3)

            raw_res = await db.execute(
                select(
                    ServerMetric.recorded_at,
                    ServerMetric.cpu_percent,
                    ServerMetric.ram_percent,
                    ServerMetric.disk_data,
                    ServerMetric.network_data,
                )
                .where(
                    and_(
                        ServerMetric.server_id == sid,
                        ServerMetric.recorded_at >= scan_start,
                        ServerMetric.recorded_at < current_hour,
                    )
                )
                .order_by(ServerMetric.recorded_at.asc())
            )
            rows = raw_res.all()
            if not rows:
                continue

            buckets: Dict[datetime, List[Tuple[datetime, float, float, Any, Any]]] = defaultdict(list)
            for row in rows:
                h_bucket = _truncate_hour(row[0])
                buckets[h_bucket].append(row)

            refresh_threshold = current_hour - timedelta(hours=2)
            for h_bucket, b_rows in buckets.items():
                existing_row = existing_by_hour.get(h_bucket)
                if existing_row and h_bucket < refresh_threshold and existing_row.samples_count >= len(b_rows):
                    continue

                stats = _summarize_rows(b_rows)
                if existing_row:
                    for key, val in stats.items():
                        setattr(existing_row, key, val)
                else:
                    db.add(ServerMetricHourly(server_id=sid, hour_bucket=h_bucket, **stats))

            await db.commit()
        except Exception as e:
            await db.rollback()
            logger.warning(f"Erro ao consolidar métricas horárias do servidor {sid}: {str(e)}")

def _compute_downtime_minutes(
    incidents: List[Incident],
    window_start: datetime,
    window_end: datetime,
) -> float:
    intervals: List[Tuple[datetime, datetime]] = []
    for inc in incidents:
        title_lower = (inc.title or "").lower()
        is_offline_inc = (
            "desconectado" in title_lower
            or "offline" in title_lower
            or "sem sinal" in title_lower
        )
        if not is_offline_inc:
            continue

        s_at = _ensure_utc(inc.started_at)
        e_at = _ensure_utc(inc.resolved_at) if inc.resolved_at else window_end
        clipped_start = max(s_at, window_start)
        clipped_end = min(e_at, window_end)
        if clipped_end > clipped_start:
            intervals.append((clipped_start, clipped_end))

    if not intervals:
        return 0.0

    intervals.sort(key=lambda x: x[0])
    merged: List[Tuple[datetime, datetime]] = [intervals[0]]
    for cur_start, cur_end in intervals[1:]:
        prev_start, prev_end = merged[-1]
        if cur_start <= prev_end:
            merged[-1] = (prev_start, max(prev_end, cur_end))
        else:
            merged.append((cur_start, cur_end))

    total_seconds = sum((e - s).total_seconds() for s, e in merged)
    return round(total_seconds / 60.0, 2)

async def build_server_report(
    db: AsyncSession,
    server: Server,
    start_dt: datetime,
    end_dt: datetime,
) -> ServerReportResponse:
    period_start = _ensure_utc(start_dt)
    period_end = _ensure_utc(end_dt)
    current_hour = _truncate_hour(datetime.now(timezone.utc))

    rollup_res = await db.execute(
        select(ServerMetricHourly)
        .where(
            and_(
                ServerMetricHourly.server_id == server.id,
                ServerMetricHourly.hour_bucket >= _truncate_hour(period_start),
                ServerMetricHourly.hour_bucket <= period_end,
            )
        )
        .order_by(ServerMetricHourly.hour_bucket.asc())
    )
    rollups = rollup_res.scalars().all()
    rollup_map: Dict[datetime, Dict[str, Any]] = {}
    for r in rollups:
        h_dt = _ensure_utc(r.hour_bucket)
        rollup_map[h_dt] = {
            "timestamp": h_dt,
            "samples_count": r.samples_count,
            "cpu_avg": r.cpu_avg,
            "cpu_min": r.cpu_min,
            "cpu_max": r.cpu_max,
            "cpu_peak_at": _ensure_utc(r.cpu_peak_at) if r.cpu_peak_at else h_dt,
            "ram_avg": r.ram_avg,
            "ram_min": r.ram_min,
            "ram_max": r.ram_max,
            "ram_peak_at": _ensure_utc(r.ram_peak_at) if r.ram_peak_at else h_dt,
            "disk_avg": r.disk_avg,
            "disk_max": r.disk_max,
            "net_recv_kbps_avg": r.net_recv_kbps_avg,
            "net_recv_kbps_max": r.net_recv_kbps_max,
            "net_sent_kbps_avg": r.net_sent_kbps_avg,
            "net_sent_kbps_max": r.net_sent_kbps_max,
        }

    live_start = max(period_start, current_hour) if rollup_map else period_start
    if period_end >= live_start:
        live_res = await db.execute(
            select(
                ServerMetric.recorded_at,
                ServerMetric.cpu_percent,
                ServerMetric.ram_percent,
                ServerMetric.disk_data,
                ServerMetric.network_data,
            )
            .where(
                and_(
                    ServerMetric.server_id == server.id,
                    ServerMetric.recorded_at >= live_start,
                    ServerMetric.recorded_at <= period_end,
                )
            )
            .order_by(ServerMetric.recorded_at.asc())
        )
        live_rows = live_res.all()
        live_buckets: Dict[datetime, List[Tuple[datetime, float, float, Any, Any]]] = defaultdict(list)
        for row in live_rows:
            live_buckets[_truncate_hour(row[0])].append(row)

        for h_dt, b_rows in live_buckets.items():
            if h_dt in rollup_map and h_dt < current_hour:
                continue
            stats = _summarize_rows(b_rows)
            rollup_map[h_dt] = {"timestamp": h_dt, **stats}

    sorted_hours = sorted(rollup_map.keys())
    series: List[ServerReportPoint] = []

    total_samples = 0
    cpu_weighted_sum = 0.0
    ram_weighted_sum = 0.0
    cpu_min = float("inf")
    cpu_max = float("-inf")
    cpu_peak_at: Optional[datetime] = None
    ram_min = float("inf")
    ram_max = float("-inf")
    ram_peak_at: Optional[datetime] = None

    disk_weighted_sum = 0.0
    disk_weight = 0
    disk_max_val: Optional[float] = None

    recv_weighted_sum = 0.0
    recv_weight = 0
    recv_max_val: Optional[float] = None

    sent_weighted_sum = 0.0
    sent_weight = 0
    sent_max_val: Optional[float] = None

    for h_dt in sorted_hours:
        pt = rollup_map[h_dt]
        n = pt["samples_count"]
        total_samples += n
        cpu_weighted_sum += pt["cpu_avg"] * n
        ram_weighted_sum += pt["ram_avg"] * n

        if pt["cpu_min"] < cpu_min:
            cpu_min = pt["cpu_min"]
        if pt["cpu_max"] >= cpu_max:
            cpu_max = pt["cpu_max"]
            cpu_peak_at = pt["cpu_peak_at"]

        if pt["ram_min"] < ram_min:
            ram_min = pt["ram_min"]
        if pt["ram_max"] >= ram_max:
            ram_max = pt["ram_max"]
            ram_peak_at = pt["ram_peak_at"]

        if pt["disk_avg"] is not None:
            disk_weighted_sum += pt["disk_avg"] * n
            disk_weight += n
        if pt["disk_max"] is not None:
            disk_max_val = pt["disk_max"] if disk_max_val is None else max(disk_max_val, pt["disk_max"])

        if pt["net_recv_kbps_avg"] is not None:
            recv_weighted_sum += pt["net_recv_kbps_avg"] * n
            recv_weight += n
        if pt["net_recv_kbps_max"] is not None:
            recv_max_val = pt["net_recv_kbps_max"] if recv_max_val is None else max(recv_max_val, pt["net_recv_kbps_max"])

        if pt["net_sent_kbps_avg"] is not None:
            sent_weighted_sum += pt["net_sent_kbps_avg"] * n
            sent_weight += n
        if pt["net_sent_kbps_max"] is not None:
            sent_max_val = pt["net_sent_kbps_max"] if sent_max_val is None else max(sent_max_val, pt["net_sent_kbps_max"])

        series.append(
            ServerReportPoint(
                timestamp=pt["timestamp"],
                samples_count=n,
                cpu_avg=round(pt["cpu_avg"], 1),
                cpu_min=round(pt["cpu_min"], 1),
                cpu_max=round(pt["cpu_max"], 1),
                ram_avg=round(pt["ram_avg"], 1),
                ram_min=round(pt["ram_min"], 1),
                ram_max=round(pt["ram_max"], 1),
                disk_avg=round(pt["disk_avg"], 1) if pt["disk_avg"] is not None else None,
                disk_max=round(pt["disk_max"], 1) if pt["disk_max"] is not None else None,
                net_recv_kbps_avg=round(pt["net_recv_kbps_avg"], 2) if pt["net_recv_kbps_avg"] is not None else None,
                net_sent_kbps_avg=round(pt["net_sent_kbps_avg"], 2) if pt["net_sent_kbps_avg"] is not None else None,
            )
        )

    inc_res = await db.execute(
        select(Incident)
        .where(
            and_(
                Incident.server_id == server.id,
                Incident.started_at <= period_end,
                or_(Incident.resolved_at.is_(None), Incident.resolved_at >= period_start),
            )
        )
        .order_by(Incident.started_at.desc())
    )
    incidents_rows = inc_res.scalars().all()

    server_created = _ensure_utc(server.created_at) if server.created_at else period_start
    effective_start = max(period_start, server_created)
    if effective_start >= period_end:
        effective_start = period_start

    downtime_minutes = _compute_downtime_minutes(incidents_rows, effective_start, period_end)
    total_window_minutes = max(1.0, (period_end - effective_start).total_seconds() / 60.0)
    uptime_percent = round(max(0.0, min(100.0, (1.0 - (downtime_minutes / total_window_minutes)) * 100.0)), 2)

    report_incidents: List[ServerReportIncident] = []
    for inc in incidents_rows:
        s_at = _ensure_utc(inc.started_at)
        r_at = _ensure_utc(inc.resolved_at) if inc.resolved_at else None
        dur_min = round(((r_at or period_end) - s_at).total_seconds() / 60.0, 1)
        report_incidents.append(
            ServerReportIncident(
                id=inc.id,
                title=inc.title,
                severity=inc.severity.value if hasattr(inc.severity, "value") else str(inc.severity),
                status=inc.status.value if hasattr(inc.status, "value") else str(inc.status),
                started_at=s_at,
                resolved_at=r_at,
                duration_minutes=max(0.0, dur_min),
            )
        )

    summary = ServerReportSummary(
        total_samples=total_samples,
        uptime_percent=uptime_percent if total_samples > 0 or incidents_rows else 100.0,
        total_downtime_minutes=downtime_minutes,
        incidents_count=len(report_incidents),
        cpu_avg=round(cpu_weighted_sum / total_samples, 1) if total_samples > 0 else 0.0,
        cpu_min=round(cpu_min, 1) if total_samples > 0 else 0.0,
        cpu_max=round(cpu_max, 1) if total_samples > 0 else 0.0,
        cpu_peak_at=cpu_peak_at,
        ram_avg=round(ram_weighted_sum / total_samples, 1) if total_samples > 0 else 0.0,
        ram_min=round(ram_min, 1) if total_samples > 0 else 0.0,
        ram_max=round(ram_max, 1) if total_samples > 0 else 0.0,
        ram_peak_at=ram_peak_at,
        disk_avg=round(disk_weighted_sum / disk_weight, 1) if disk_weight > 0 else None,
        disk_max=round(disk_max_val, 1) if disk_max_val is not None else None,
        disk_current=round(server.last_disk_percent, 1) if server.last_disk_percent is not None else None,
        net_recv_kbps_avg=round(recv_weighted_sum / recv_weight, 2) if recv_weight > 0 else None,
        net_recv_kbps_max=round(recv_max_val, 2) if recv_max_val is not None else None,
        net_sent_kbps_avg=round(sent_weighted_sum / sent_weight, 2) if sent_weight > 0 else None,
        net_sent_kbps_max=round(sent_max_val, 2) if sent_max_val is not None else None,
    )

    period_days = max(1, round((period_end - period_start).total_seconds() / 86400))

    return ServerReportResponse(
        server_id=server.id,
        server_name=server.name,
        hostname=server.hostname,
        os_name=server.os_name,
        os_version=server.os_version,
        period_start=period_start,
        period_end=period_end,
        period_days=period_days,
        summary=summary,
        series=series,
        incidents=report_incidents,
    )
