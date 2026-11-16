import { apiClient } from '@/lib/api';
import { Incident } from '@/types/incident';

export const incidentsService = {
  async listIncidents(orgId: string, status?: string): Promise<Incident[]> {
    const url = status 
      ? `/organizations/${orgId}/incidents?status=${status}` 
      : `/organizations/${orgId}/incidents`;
    return apiClient<Incident[]>(url);
  },

  async updateIncidentStatus(orgId: string, incidentId: string, status: 'acknowledged' | 'resolved'): Promise<Incident> {
    return apiClient<Incident>(`/organizations/${orgId}/incidents/${incidentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },
};
