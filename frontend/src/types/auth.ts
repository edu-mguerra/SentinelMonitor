export interface User {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string;
}

export type MemberRole = 'owner' | 'admin' | 'operator' | 'viewer';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  user_role?: string;
  created_at: string;
}

export interface GoogleLoginPayload {
  credential: string;
  email?: string;
  full_name?: string;
  organization_name?: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  full_name?: string;
  organization_name?: string;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string;
}
