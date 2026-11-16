'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { User, Organization, LoginCredentials, RegisterCredentials, GoogleLoginPayload } from '@/types/auth';
import { authService } from '@/services/auth.service';

interface AuthContextType {
  user: User | null;
  organizations: Organization[];
  currentOrganization: Organization | null;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  loginWithGoogle: (payload: string | GoogleLoginPayload) => Promise<void>;
  createOrganization: (name: string) => Promise<Organization>;
  switchOrganization: (org: Organization) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const loadUserData = async () => {
    try {
      const userData = await authService.getMe();
      setUser(userData);

      const orgs = await authService.getOrganizations();
      setOrganizations(orgs);

      const savedOrgId = localStorage.getItem('sentinel_org_id');
      const foundOrg = orgs.find((o) => o.id === savedOrgId) || orgs[0] || null;
      setCurrentOrganization(foundOrg);
    } catch {

      logout();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const token = Cookies.get('access_token') || localStorage.getItem('sentinel_token');
    if (token) {
      loadUserData();
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (credentials: LoginCredentials) => {
    setIsLoading(true);
    try {
      const tokenData = await authService.login(credentials);
      Cookies.set('access_token', tokenData.access_token, { expires: 1, sameSite: 'lax' });
      localStorage.setItem('sentinel_token', tokenData.access_token);

      await loadUserData();
      router.push('/');
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (credentials: RegisterCredentials) => {
    setIsLoading(true);
    try {
      await authService.register(credentials);

      await login({ email: credentials.email, password: credentials.password });
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async (payload: string | GoogleLoginPayload) => {
    setIsLoading(true);
    try {
      const tokenData = await authService.loginWithGoogle(payload);
      Cookies.set('access_token', tokenData.access_token, { expires: 1, sameSite: 'lax' });
      localStorage.setItem('sentinel_token', tokenData.access_token);

      await loadUserData();
      router.push('/');
    } finally {
      setIsLoading(false);
    }
  };

  const createOrganization = async (name: string): Promise<Organization> => {
    const newOrg = await authService.createOrganization(name);
    const orgs = await authService.getOrganizations();
    setOrganizations(orgs);
    const matched = orgs.find((o) => o.id === newOrg.id) || newOrg;
    setCurrentOrganization(matched);
    localStorage.setItem('sentinel_org_id', matched.id);
    return matched;
  };

  const switchOrganization = (org: Organization) => {
    setCurrentOrganization(org);
    localStorage.setItem('sentinel_org_id', org.id);
  };

  const logout = () => {
    Cookies.remove('access_token');
    localStorage.removeItem('sentinel_token');
    localStorage.removeItem('sentinel_org_id');
    setUser(null);
    setOrganizations([]);
    setCurrentOrganization(null);
    authService.logout();
    router.push('/login');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        organizations,
        currentOrganization,
        isLoading,
        login,
        register,
        loginWithGoogle,
        createOrganization,
        switchOrganization,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
}
