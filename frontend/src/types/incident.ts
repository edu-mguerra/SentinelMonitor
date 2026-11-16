export type IncidentSeverity = 'critical' | 'warning' | 'info';
export type IncidentStatus = 'open' | 'acknowledged' | 'resolved';

export interface Incident {
  id: string;
  organization_id: string;
  monitor_id?: string;
  server_id?: string;
  title: string;
  description?: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  started_at: string;
  resolved_at?: string;
  acknowledged_at?: string;
  created_at: string;
}
