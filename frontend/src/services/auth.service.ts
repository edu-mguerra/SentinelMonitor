import { apiClient } from '@/lib/api';
import { User, Organization, TokenResponse, LoginCredentials, RegisterCredentials, GoogleLoginPayload } from '@/types/auth';

export const authService = {
  async login(credentials: LoginCredentials): Promise<TokenResponse> {
    const formData = new URLSearchParams();
    formData.append('username', credentials.email);
    formData.append('password', credentials.password);

    return apiClient<TokenResponse>('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });
  },

  async register(credentials: RegisterCredentials): Promise<User> {
    return apiClient<User>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  async loginWithGoogle(payload: string | GoogleLoginPayload): Promise<TokenResponse> {
    const bodyData = typeof payload === 'string' ? { credential: payload } : payload;
    return apiClient<TokenResponse>('/auth/google', {
      method: 'POST',
      body: JSON.stringify(bodyData),
    });
  },

  async getMe(): Promise<User> {
    return apiClient<User>('/auth/me', {
      method: 'GET',
    });
  },

  async getOrganizations(): Promise<Organization[]> {
    return apiClient<Organization[]>('/organizations', {
      method: 'GET',
    });
  },

  async createOrganization(name: string): Promise<Organization> {
    return apiClient<Organization>('/organizations', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  async logout(): Promise<void> {
    try {
      await apiClient('/auth/logout', { method: 'POST' });
    } catch {

    }
  },
};
