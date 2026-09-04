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
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = {
    // FormData 时禁止手动设 Content-Type，由浏览器附 multipart boundary
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
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

  // 空响应（如 204 No Content）避免 res.json() 抛错
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!res.ok) {
    const msg = data && typeof data === 'object' && 'error' in data
      ? String((data as { error: unknown }).error)
      : '请求失败';
    throw new Error(msg);
  }
  return (data ?? {}) as T;
}

/**
 * Authenticated download wrapper - for file downloads (Excel/CSV/Markdown etc.).
 * Returns a Blob on success. On error, parses JSON error message.
 */
export async function apiDownload(
  url: string,
  options: ApiFetchOptions = {}
): Promise<{ blob: Blob; filename: string }> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/login';
    throw new Error('登录已过期，请重新登录');
  }

  if (!res.ok) {
    // Error responses are JSON
    let message = '下载失败';
    try {
      const data = await res.json();
      message = data.error || message;
    } catch {
      message = await res.text().catch(() => message);
    }
    throw new Error(message);
  }

  const blob = await res.blob();

  // Parse filename from Content-Disposition header
  const disposition = res.headers.get('Content-Disposition') || '';
  let filename = 'download';
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    try {
      filename = decodeURIComponent(utf8Match[1]);
    } catch {
      filename = utf8Match[1];
    }
  } else {
    const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
    if (plainMatch) filename = plainMatch[1];
  }

  return { blob, filename };
}

export type { SessionUser };
