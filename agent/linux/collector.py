import os
import json
import time
import shutil
import platform
import subprocess
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple
import psutil

AGENT_VERSION = "1.1.0"

_prev_disk_io: Optional[Any] = None
_prev_disk_time: Optional[float] = None

def get_os_info() -> Dict[str, str]:
    """Detecta informações do sistema operacional de forma nativa em Linux, macOS e Windows."""
    system = platform.system()

    if system == "Darwin":
        mac_ver = platform.mac_ver()[0] or platform.release()
        return {
            "os_name": "macOS",
            "os_version": mac_ver,
            "kernel": platform.release(),
            "arch": platform.machine()
        }

    if system == "Windows":
        win_release = platform.release()
        win_ver = platform.version()
        return {
            "os_name": "Windows",
            "os_version": f"{win_release} ({win_ver})" if win_release else win_ver,
            "kernel": win_ver,
            "arch": platform.machine()
        }

    os_name = "Linux"
    os_version = "Unknown"

    if os.path.exists("/etc/os-release"):
        try:
            with open("/etc/os-release", "r") as f:
                for line in f:
                    if line.startswith("NAME="):
                        os_name = line.strip().split("=")[1].replace('"', '')
                    elif line.startswith("VERSION_ID=") or line.startswith("VERSION="):
                        os_version = line.strip().split("=")[1].replace('"', '')
        except Exception:
            pass

    return {
        "os_name": os_name,
        "os_version": os_version,
        "kernel": platform.release(),
        "arch": platform.machine()
    }

def get_uptime_seconds() -> int:
    """Calcula o tempo de atividade do sistema em segundos."""
    try:
        return int(time.time() - psutil.boot_time())
    except Exception:
        return 0

def get_cpu_metrics() -> Dict[str, Any]:
    """Coleta percentual de uso, contagem de núcleos e carga média."""
    try:
        usage_percent = psutil.cpu_percent(interval=0.5)
        cores_count = psutil.cpu_count(logical=True)
        load_average = list(os.getloadavg()) if hasattr(os, "getloadavg") else [0.0, 0.0, 0.0]
        return {
            "usage_percent": round(usage_percent, 1),
            "cores_count": cores_count,
            "load_average": [round(x, 2) for x in load_average]
        }
    except Exception:
        return {"usage_percent": 0.0, "cores_count": 1, "load_average": [0.0, 0.0, 0.0]}

def get_memory_metrics() -> Dict[str, Any]:
    """Coleta memória RAM total, em uso, disponível e percentual."""
    try:
        mem = psutil.virtual_memory()
        return {
            "total_bytes": mem.total,
            "used_bytes": mem.used,
            "available_bytes": mem.available,
            "usage_percent": round(mem.percent, 1)
        }
    except Exception:
        return {"total_bytes": 0, "used_bytes": 0, "available_bytes": 0, "usage_percent": 0.0}

def get_swap_metrics() -> Dict[str, Any]:
    """Coleta uso de memória virtual (Swap)."""
    try:
        swap = psutil.swap_memory()
        return {
            "total_bytes": swap.total,
            "used_bytes": swap.used,
            "usage_percent": round(swap.percent, 1)
        }
    except Exception:
        return {"total_bytes": 0, "used_bytes": 0, "usage_percent": 0.0}

def get_disk_metrics() -> List[Dict[str, Any]]:
    """Coleta espaço total, usado e disponível por partição real montada."""
    partitions_data = []
    ignored_fstypes = {"squashfs", "tmpfs", "devtmpfs", "overlay", "iso9660"}

    try:
        for part in psutil.disk_partitions(all=False):
            if part.fstype in ignored_fstypes or part.mountpoint.startswith("/snap"):
                continue

            try:
                usage = psutil.disk_usage(part.mountpoint)
                partitions_data.append({
                    "mountpoint": part.mountpoint,
                    "device": part.device,
                    "total_bytes": usage.total,
                    "used_bytes": usage.used,
                    "free_bytes": usage.free,
                    "usage_percent": round(usage.percent, 1)
                })
            except (PermissionError, FileNotFoundError, OSError):
                continue
    except Exception:
        pass

    return partitions_data

def get_disk_io_metrics() -> Dict[str, Any]:
    """Calcula taxa de leitura e escrita em disco (KB/s) entre ciclos."""
    global _prev_disk_io, _prev_disk_time
    now = time.time()
    try:
        io = psutil.disk_io_counters()
        if not io:
            return {"read_kbps": 0.0, "write_kbps": 0.0}

        read_kbps = 0.0
        write_kbps = 0.0
        if _prev_disk_io and _prev_disk_time and (now > _prev_disk_time):
            elapsed = now - _prev_disk_time
            read_delta = max(0, io.read_bytes - _prev_disk_io.read_bytes)
            write_delta = max(0, io.write_bytes - _prev_disk_io.write_bytes)
            read_kbps = round((read_delta / elapsed) / 1024, 2)
            write_kbps = round((write_delta / elapsed) / 1024, 2)

        _prev_disk_io = io
        _prev_disk_time = now
        return {"read_kbps": read_kbps, "write_kbps": write_kbps}
    except Exception:
        return {"read_kbps": 0.0, "write_kbps": 0.0}

def get_network_metrics(prev_io: Optional[Any], prev_time: Optional[float]) -> Tuple[Dict[str, Any], Any, float]:
    """Calcula taxas instantâneas de upload e download (KB/s) e total acumulado de bytes."""
    current_time = time.time()
    try:
        net_io = psutil.net_io_counters()
        rate_sent = 0.0
        rate_recv = 0.0

        if prev_io and prev_time and (current_time > prev_time):
            elapsed = current_time - prev_time
            bytes_sent_delta = max(0, net_io.bytes_sent - prev_io.bytes_sent)
            bytes_recv_delta = max(0, net_io.bytes_recv - prev_io.bytes_recv)

            rate_sent = round((bytes_sent_delta / elapsed) / 1024, 2)
            rate_recv = round((bytes_recv_delta / elapsed) / 1024, 2)

        metrics = {
            "bytes_sent": net_io.bytes_sent,
            "bytes_recv": net_io.bytes_recv,
            "rate_sent_kbps": rate_sent,
            "rate_recv_kbps": rate_recv
        }
        return metrics, net_io, current_time
    except Exception:
        return {"bytes_sent": 0, "bytes_recv": 0, "rate_sent_kbps": 0.0, "rate_recv_kbps": 0.0}, None, current_time

def check_services(services_to_track: List[str]) -> List[Dict[str, Any]]:
    """Verifica se processos essenciais estão ativos no sistema sem exigir privilégio root."""
    results = {srv.lower(): False for srv in services_to_track}

    try:
        for proc in psutil.process_iter(['name', 'cmdline']):
            try:
                pname = (proc.info['name'] or '').lower()
                cmdline = ' '.join(proc.info['cmdline'] or []).lower()

                for srv in services_to_track:
                    target = srv.lower()
                    if target in pname or target in cmdline:
                        results[target] = True
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
    except Exception:
        pass

    return [{"name": srv, "running": is_running} for srv, is_running in results.items()]

def get_top_processes(limit: int = 8) -> List[Dict[str, Any]]:
    """Lista os processos que mais consomem RAM e CPU no momento."""
    procs = []
    cores = psutil.cpu_count(logical=True) or 1
    try:
        for proc in psutil.process_iter(['pid', 'name', 'memory_percent', 'memory_info', 'cpu_percent']):
            try:
                pid = proc.info['pid']
                name = proc.info['name'] or ''
                if pid == 0 or name.lower() in {'system idle process', 'idle'}:
                    continue
                mem_pct = round(proc.info['memory_percent'] or 0.0, 1)
                mem_rss = proc.info['memory_info'].rss if proc.info['memory_info'] else 0
                raw_cpu = proc.info['cpu_percent'] or 0.0
                cpu_pct = round(min(100.0, raw_cpu / cores), 1)
                procs.append({
                    "pid": pid,
                    "name": name[:60],
                    "cpu_percent": cpu_pct,
                    "memory_percent": mem_pct,
                    "memory_mb": round(mem_rss / (1024 * 1024), 1),
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
        procs.sort(key=lambda p: (p["memory_percent"], p["cpu_percent"]), reverse=True)
        return procs[:limit]
    except Exception:
        return []

def get_network_connections() -> Dict[str, Any]:
    """Conta conexões TCP ativas e lista portas em escuta (LISTEN)."""
    counts = {"established": 0, "time_wait": 0, "listen": 0}
    ports_map: Dict[int, str] = {}
    try:
        for conn in psutil.net_connections(kind='inet'):
            status = getattr(conn, 'status', '')
            if status == 'ESTABLISHED':
                counts["established"] += 1
            elif status == 'TIME_WAIT':
                counts["time_wait"] += 1
            elif status == 'LISTEN':
                counts["listen"] += 1
                if conn.laddr and conn.laddr.port not in ports_map:
                    proc_name = ""
                    if conn.pid:
                        try:
                            proc_name = psutil.Process(conn.pid).name()
                        except Exception:
                            proc_name = ""
                    ports_map[conn.laddr.port] = proc_name

        listening_ports = [
            {"port": p, "process": ports_map[p]}
            for p in sorted(ports_map.keys())[:25]
        ]
        return {**counts, "listening_ports": listening_ports}
    except Exception:
        return {**counts, "listening_ports": []}

def get_pm2_apps() -> List[Dict[str, Any]]:
    """Lista aplicações gerenciadas pelo PM2 para root e outros usuários."""
    import glob

    pm2_bin = shutil.which("pm2")
    if not pm2_bin:
        for candidate in ["/usr/local/bin/pm2", "/usr/bin/pm2", "/bin/pm2"]:
            if os.path.exists(candidate):
                pm2_bin = candidate
                break
        if not pm2_bin:
            nvm_candidates = glob.glob("/root/.nvm/versions/node/*/bin/pm2") + glob.glob("/home/*/.nvm/versions/node/*/bin/pm2")
            if nvm_candidates:
                pm2_bin = nvm_candidates[0]

    if not pm2_bin:
        return []

    pm2_homes = ["/root/.pm2"]
    pm2_homes.extend(glob.glob("/home/*/.pm2"))
    pm2_homes = list(dict.fromkeys([h for h in pm2_homes if os.path.exists(h)]))
    if not pm2_homes:
        pm2_homes = [None]

    all_apps = []
    seen_names = set()

    for home in pm2_homes:
        try:
            env_vars = os.environ.copy()
            if home:
                env_vars["PM2_HOME"] = home
            out = subprocess.check_output(
                [pm2_bin, "jlist"],
                env=env_vars,
                stderr=subprocess.DEVNULL,
                timeout=5,
                text=True
            )
            raw_list = json.loads(out)
            for item in raw_list:
                name = item.get("name", "unknown")
                if name in seen_names:
                    continue
                seen_names.add(name)
                env = item.get("pm2_env") or {}
                monit = item.get("monit") or {}
                all_apps.append({
                    "pm_id": item.get("pm_id"),
                    "name": name,
                    "status": env.get("status", "unknown"),
                    "cpu_percent": monit.get("cpu", 0),
                    "memory_mb": round((monit.get("memory", 0) or 0) / (1024 * 1024), 1),
                    "restarts": env.get("restart_time", 0),
                    "uptime": env.get("pm_uptime"),
                })
        except Exception:
            continue

    return all_apps[:100]

def get_docker_containers() -> List[Dict[str, Any]]:
    """Lista containers Docker (caso Docker CLI esteja disponível)."""
    docker_bin = shutil.which("docker")
    if not docker_bin:
        return []
    try:
        out = subprocess.check_output(
            [docker_bin, "ps", "-a", "--format", "{{json .}}"],
            stderr=subprocess.DEVNULL,
            timeout=3,
            text=True,
        )
        containers = []
        for line in out.strip().splitlines():
            if not line.strip():
                continue
            item = json.loads(line)
            containers.append({
                "id": (item.get("ID") or "")[:12],
                "name": (item.get("Names") or "").lstrip("/"),
                "image": item.get("Image", ""),
                "state": (item.get("State") or "").lower(),
                "status": item.get("Status", ""),
                "ports": item.get("Ports", ""),
                "created": item.get("CreatedAt", ""),
            })
        return containers[:50]
    except Exception:
        return []

def get_hardware_info() -> Dict[str, Any]:
    """Coleta frequência da CPU, bateria (se notebook) e sensores de temperatura."""
    info: Dict[str, Any] = {"cpu_freq_mhz": None, "battery": None, "temperatures": []}
    try:
        freq = psutil.cpu_freq()
        if freq and freq.current:
            info["cpu_freq_mhz"] = round(freq.current, 0)
    except Exception:
        pass

    try:
        if hasattr(psutil, "sensors_battery"):
            bat = psutil.sensors_battery()
            if bat is not None:
                info["battery"] = {
                    "percent": round(bat.percent, 1),
                    "power_plugged": bool(bat.power_plugged),
                }
    except Exception:
        pass

    try:
        if hasattr(psutil, "sensors_temperatures"):
            temps = psutil.sensors_temperatures() or {}
            collected = []
            for chip, entries in temps.items():
                for entry in entries[:3]:
                    if entry.current and entry.current > 0:
                        collected.append({
                            "label": entry.label or chip,
                            "current_c": round(entry.current, 1),
                        })
            info["temperatures"] = collected[:6]
    except Exception:
        pass

    return info

def get_security_info() -> Dict[str, Any]:
    """Coleta usuários conectados no momento e falhas recentes de SSH (Linux)."""
    logged_users = []
    try:
        for u in psutil.users():
            logged_users.append({
                "name": u.name,
                "host": u.host or "local",
                "started": datetime.fromtimestamp(u.started, tz=timezone.utc).isoformat() if u.started else None,
            })
    except Exception:
        pass

    ssh_failed_recent = 0
    if platform.system() == "Linux":
        for log_path in ("/var/log/auth.log", "/var/log/secure"):
            if os.path.exists(log_path):
                try:
                    with open(log_path, "rb") as f:
                        f.seek(0, os.SEEK_END)
                        size = f.tell()
                        f.seek(max(0, size - 65536))
                        chunk = f.read().decode("utf-8", errors="ignore")
                        ssh_failed_recent = sum(
                            1 for line in chunk.splitlines()
                            if "Failed password" in line or "Invalid user" in line
                        )
                    break
                except Exception:
                    pass

    return {
        "logged_users": logged_users[:10],
        "ssh_failed_recent": ssh_failed_recent,
    }

def collect_payload(
    prev_net_io: Optional[Any] = None,
    prev_net_time: Optional[float] = None,
    services: Optional[List[str]] = None
) -> Tuple[Dict[str, Any], Any, float]:
    """Coleta o snapshot completo de métricas estruturadas."""
    os_info = get_os_info()
    net_metrics, new_io, new_time = get_network_metrics(prev_net_io, prev_net_time)

    default_services = services or ["nginx", "docker", "postgres", "mysqld", "apache2"]
    services_status = check_services(default_services)

    payload = {
        "agent_version": AGENT_VERSION,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "system": {
            "hostname": platform.node(),
            "uptime_seconds": get_uptime_seconds(),
            **os_info
        },
        "cpu": get_cpu_metrics(),
        "memory": get_memory_metrics(),
        "disk": get_disk_metrics(),
        "network": net_metrics,
        "services": services_status,
        "extra": {
            "swap": get_swap_metrics(),
            "disk_io": get_disk_io_metrics(),
            "top_processes": get_top_processes(limit=8),
            "network_connections": get_network_connections(),
            "pm2_apps": get_pm2_apps(),
            "docker_containers": get_docker_containers(),
            "hardware": get_hardware_info(),
            "security": get_security_info(),
        },
    }

    return payload, new_io, new_time
