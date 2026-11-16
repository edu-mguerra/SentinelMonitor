export interface AlertChannel {
  id: string;
  organization_id: string;
  type: 'email' | 'telegram' | 'webhook';
  destination: string;
  is_active: boolean;
  created_at: string;
}

export interface AlertRule {
  id: string;
  organization_id: string;
  cpu_threshold: number;
  ram_threshold: number;
  disk_threshold: number;
  server_offline_timeout_seconds: number;
  notify_on_recovery: boolean;
  created_at: string;
  updated_at: string;
}

export interface AlertConfig {
  channels: AlertChannel[];
  rules: AlertRule;
}

export interface AlertHistory {
  id: string;
  organization_id: string;
  channel_type: string;
  recipient: string;
  subject: string;
  content_preview?: string;
  is_success: boolean;
  error_message?: string;
  sent_at: string;
}
