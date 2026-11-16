import { apiClient } from '@/lib/api';
import { Monitor, MonitorDetail, MonitorCheck, MonitorCreatePayload } from '@/types/monitor';

export const monitorsService = {
  async listMonitors(orgId: string): Promise<Monitor[]> {
    return apiClient<Monitor[]>(`/organizations/${orgId}/monitors`);
  },

  async createMonitor(orgId: string, payload: MonitorCreatePayload): Promise<Monitor> {
    return apiClient<Monitor>(`/organizations/${orgId}/monitors`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getMonitor(orgId: string, monitorId: string): Promise<MonitorDetail> {
    return apiClient<MonitorDetail>(`/organizations/${orgId}/monitors/${monitorId}`);
  },

  async triggerCheck(orgId: string, monitorId: string): Promise<MonitorCheck> {
    return apiClient<MonitorCheck>(`/organizations/${orgId}/monitors/${monitorId}/check`, {
      method: 'POST',
    });
  },

  async deleteMonitor(orgId: string, monitorId: string): Promise<void> {
    return apiClient<void>(`/organizations/${orgId}/monitors/${monitorId}`, {
      method: 'DELETE',
    });
  },
};
