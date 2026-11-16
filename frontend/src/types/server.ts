export type ServerStatus = 'online' | 'offline' | 'warning' | 'pending';

export interface DiskData {
  mountpoint: string;
  device?: string;
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  usage_percent: number;
}

export interface NetworkData {
  bytes_sent?: number;
  bytes_recv?: number;
  rate_sent_kbps?: number;
  rate_recv_kbps?: number;
}

export interface ServiceData {
  name: string;
  running: boolean;
}

export interface ExtraTelemetry {
  swap?: {
    total_bytes: number;
    used_bytes: number;
    usage_percent: number;
  };
  disk_io?: {
    read_kbps: number;
    write_kbps: number;
  };
  top_processes?: {
    pid: number;
    name: string;
    cpu_percent: number;
    memory_percent: number;
    memory_mb: number;
  }[];
  network_connections?: {
    established: number;
    time_wait: number;
    listen: number;
    listening_ports: { port: number; process: string }[];
  };
  pm2_apps?: {
    pm_id?: number;
    name: string;
    status: string;
    cpu_percent: number;
    memory_mb: number;
    restarts: number;
    uptime?: number;
  }[];
  docker_containers?: {
    id?: string;
    name: string;
    image: string;
    state: string;
    status: string;
    ports?: string;
    created?: string;
  }[];
  hardware?: {
    cpu_freq_mhz?: number | null;
    battery?: { percent: number; power_plugged: boolean } | null;
    temperatures?: { label: string; current_c: number }[];
  };
  security?: {
    logged_users?: { name: string; host: string; started?: string | null }[];
    ssh_failed_recent?: number;
  };
}

export interface ServerMetric {
  id: string;
  server_id: string;
  recorded_at: string;
  cpu_percent: number;
  cpu_cores?: number;
  load_avg_1m?: number;
  load_avg_5m?: number;
  load_avg_15m?: number;
  ram_total_bytes?: number;
  ram_used_bytes?: number;
  ram_available_bytes?: number;
  ram_percent: number;
  disk_data?: DiskData[];
  network_data?: NetworkData;
  services_data?: ServiceData[];
  extra_data?: ExtraTelemetry;
}

export interface Server {
  id: string;
  organization_id: string;
  name: string;
  hostname?: string;
  os_name?: string;
  os_version?: string;
  kernel?: string;
  arch?: string;
  agent_version?: string;
  status: ServerStatus;
  last_communication_at?: string;
  uptime_seconds?: number;
  last_cpu_percent?: number;
  last_ram_percent?: number;
  last_disk_percent?: number;
  monitored_services?: string[];
  cpu_threshold?: number | null;
  ram_threshold?: number | null;
  disk_threshold?: number | null;
  offline_timeout_seconds?: number | null;
  notify_on_offline?: boolean;
  notify_on_hardware?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ServerWithInstallCommand extends Server {
  install_token: string;
  install_token_expires_at: string;
  install_command: string;
  install_commands?: {
    linux?: string;
    macos?: string;
    windows?: string;
  };
}

export interface ServerDetail extends Server {
  metrics: ServerMetric[];
}

export interface ReleaseItem {
  id: string;
  version: string;
  title?: string;
  changelog: string[];
  is_published?: boolean;
  published_at?: string;
  created_at?: string;
}

export interface AgentReleaseInfo {
  latest_version: string;
  changelog: string[];
  releases_history?: ReleaseItem[];
  update_commands: {
    windows: string;
    linux: string;
    macos: string;
  };
}
