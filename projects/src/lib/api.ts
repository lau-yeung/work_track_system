import { SessionUser } from './auth';

const TOKEN_KEY = 'worktime_token';

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export interface ApiFetchOptions extends RequestInit {
  params?: Record<string, string>;
}

/**
 * Authenticated fetch wrapper - automatically injects Authorization header
 * from localStorage token.
 */
export async function apiFetch<T = unknown>(
  url: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    // Token expired or invalid, clear storage
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/login';
    throw new Error('登录已过期，请重新登录');
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '请求失败');
  }
  return data as T;
}

export type { SessionUser };
