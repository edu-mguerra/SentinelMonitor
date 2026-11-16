import { apiClient } from '@/lib/api';
import { AlertConfig, AlertChannel, AlertRule, AlertHistory } from '@/types/alert';

export const alertsService = {
  async getConfig(orgId: string): Promise<AlertConfig> {
    return apiClient<AlertConfig>(`/organizations/${orgId}/alerts/config`);
  },

  async addChannel(orgId: string, destination: string): Promise<AlertChannel> {
    return apiClient<AlertChannel>(`/organizations/${orgId}/alerts/channels`, {
      method: 'POST',
      body: JSON.stringify({ type: 'email', destination, is_active: true }),
    });
  },

  async deleteChannel(orgId: string, channelId: string): Promise<void> {
    return apiClient<void>(`/organizations/${orgId}/alerts/channels/${channelId}`, {
      method: 'DELETE',
    });
  },

  async updateRules(orgId: string, rules: Partial<AlertRule>): Promise<AlertRule> {
    return apiClient<AlertRule>(`/organizations/${orgId}/alerts/rules`, {
      method: 'PUT',
      body: JSON.stringify(rules),
    });
  },

  async sendTestEmail(orgId: string, recipient?: string): Promise<{ status: string; message: string }> {
    return apiClient<{ status: string; message: string }>(`/organizations/${orgId}/alerts/test`, {
      method: 'POST',
      body: JSON.stringify({ recipient }),
    });
  },

  async getHistory(orgId: string): Promise<AlertHistory[]> {
    return apiClient<AlertHistory[]>(`/organizations/${orgId}/alerts/history`);
  },
};
