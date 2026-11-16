export type MonitorType = 'http' | 'https' | 'tcp';
export type MonitorStatus = 'up' | 'down' | 'degraded' | 'paused' | 'pending';

export interface MonitorCheck {
  id: string;
  monitor_id: string;
  response_time_ms?: number;
  status_code?: number;
  is_success: boolean;
  error_message?: string;
  ssl_valid?: boolean;
  ssl_expiration_date?: string;
  ssl_issuer?: string;
  created_at: string;
}

export interface Monitor {
  id: string;
  organization_id: string;
  name: string;
  type: MonitorType;
  target: string;
  port?: number;
  interval_seconds: number;
  timeout_seconds: number;
  expected_status_code: number;
  consecutive_failures_threshold: number;
  current_failures: number;
  status: MonitorStatus;
  last_checked_at?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MonitorDetail extends Monitor {
  checks: MonitorCheck[];
}

export interface MonitorCreatePayload {
  name: string;
  type: MonitorType;
  target: string;
  port?: number;
  interval_seconds?: number;
  timeout_seconds?: number;
  expected_status_code?: number;
  consecutive_failures_threshold?: number;
}
