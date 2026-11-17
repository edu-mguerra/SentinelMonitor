import Cookies from 'js-cookie';

const API_BASE_URL = typeof window !== 'undefined'
  ? '/api/v1'
  : (process.env.INTERNAL_BACKEND_URL || 'http://127.0.0.1:10203') + '/api/v1';

export interface ApiError {
  message: string;
  status: number;
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = typeof window !== 'undefined' 
    ? (Cookies.get('access_token') || localStorage.getItem('sentinel_token')) 
    : null;

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const fetchOptions: RequestInit = {
    ...options,
    headers,
    credentials: 'include',
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions);

  if (!response.ok) {
    let errorDetail = 'Erro inesperado na requisição';
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.detail || errorJson.message || errorDetail;
    } catch {}

    const error: ApiError = {
      message: errorDetail,
      status: response.status,
    };
    throw error;
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}
