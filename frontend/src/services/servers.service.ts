import { apiClient } from '@/lib/api';
import {
  Server,
  ServerDetail,
  ServerWithInstallCommand,
  AgentReleaseInfo,
  ServerShare,
  SharedServerItem,
  ShareInviteItem,
  UserSearchResult,
} from '@/types/server';

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

  async listServerShares(orgId: string, serverId: string): Promise<ServerShare[]> {
    return apiClient<ServerShare[]>(`/organizations/${orgId}/servers/${serverId}/shares`);
  },

  async inviteServerShare(orgId: string, serverId: string, email: string): Promise<ServerShare> {
    return apiClient<ServerShare>(`/organizations/${orgId}/servers/${serverId}/shares`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async revokeServerShare(orgId: string, serverId: string, shareId: string): Promise<void> {
    return apiClient<void>(`/organizations/${orgId}/servers/${serverId}/shares/${shareId}`, {
      method: 'DELETE',
    });
  },

  async listSharedServers(): Promise<SharedServerItem[]> {
    return apiClient<SharedServerItem[]>('/shared-servers');
  },

  async listPendingInvites(): Promise<ShareInviteItem[]> {
    return apiClient<ShareInviteItem[]>('/shared-servers/invites');
  },

  async acceptInvite(shareId: string): Promise<SharedServerItem> {
    return apiClient<SharedServerItem>(`/shared-servers/invites/${shareId}/accept`, {
      method: 'POST',
    });
  },

  async rejectInvite(shareId: string): Promise<void> {
    return apiClient<void>(`/shared-servers/invites/${shareId}/reject`, {
      method: 'POST',
    });
  },

  async getSharedServerDetail(serverId: string): Promise<ServerDetail> {
    return apiClient<ServerDetail>(`/shared-servers/${serverId}`);
  },

  async searchUsers(query: string): Promise<UserSearchResult[]> {
    return apiClient<UserSearchResult[]>(`/users/search-shareable?query=${encodeURIComponent(query)}`);
  },
};
