import { apiClient } from '@/lib/api';
import { Server, ServerDetail, ServerWithInstallCommand, AgentReleaseInfo } from '@/types/server';

export const serversService = {
  async listServers(orgId: string): Promise<Server[]> {
    return apiClient<Server[]>(`/organizations/${orgId}/servers`);
  },

  async createServer(orgId: string, name: string): Promise<ServerWithInstallCommand> {
    return apiClient<ServerWithInstallCommand>(`/organizations/${orgId}/servers`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  async getServer(orgId: string, serverId: string): Promise<ServerDetail> {
    return apiClient<ServerDetail>(`/organizations/${orgId}/servers/${serverId}`);
  },

  async deleteServer(orgId: string, serverId: string): Promise<void> {
    return apiClient<void>(`/organizations/${orgId}/servers/${serverId}`, {
      method: 'DELETE',
    });
  },

  async updateServer(
    orgId: string,
    serverId: string,
    data: {
      name?: string;
      monitored_services?: string[];
      cpu_threshold?: number | null;
      ram_threshold?: number | null;
      disk_threshold?: number | null;
      offline_timeout_seconds?: number | null;
      notify_on_offline?: boolean;
      notify_on_hardware?: boolean;
    }
  ): Promise<Server> {
    return apiClient<Server>(`/organizations/${orgId}/servers/${serverId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async regenerateToken(orgId: string, serverId: string): Promise<ServerWithInstallCommand> {
    return apiClient<ServerWithInstallCommand>(`/organizations/${orgId}/servers/${serverId}/token`, {
      method: 'POST',
    });
  },

  async getAgentRelease(): Promise<AgentReleaseInfo> {
    return apiClient<AgentReleaseInfo>('/agent-release');
  },
};
