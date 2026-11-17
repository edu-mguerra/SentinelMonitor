import { apiClient } from '@/lib/api';
import { AdminUser } from '@/types/auth';
import { ReleaseItem } from '@/types/server';

export interface CreateReleasePayload {
  version: string;
  title?: string;
  changelog: string[];
  is_published?: boolean;
}

export const adminService = {
  async listUsers(): Promise<AdminUser[]> {
    return apiClient<AdminUser[]>('/admin/users');
  },

  async approveUser(id: string): Promise<AdminUser> {
    return apiClient<AdminUser>(`/admin/users/${id}/approve`, {
      method: 'POST',
    });
  },

  async toggleUserActive(id: string): Promise<AdminUser> {
    return apiClient<AdminUser>(`/admin/users/${id}/toggle-active`, {
      method: 'POST',
    });
  },

  async deleteUser(id: string): Promise<{ message: string }> {
    return apiClient<{ message: string }>(`/admin/users/${id}`, {
      method: 'DELETE',
    });
  },

  async listReleases(): Promise<ReleaseItem[]> {
    return apiClient<ReleaseItem[]>('/admin/releases');
  },

  async createRelease(payload: CreateReleasePayload): Promise<ReleaseItem> {
    return apiClient<ReleaseItem>('/admin/releases', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async publishRelease(id: string): Promise<ReleaseItem> {
    return apiClient<ReleaseItem>(`/admin/releases/${id}/publish`, {
      method: 'POST',
    });
  },

  async deleteRelease(id: string): Promise<{ message: string }> {
    return apiClient<{ message: string }>(`/admin/releases/${id}`, {
      method: 'DELETE',
    });
  },
};
