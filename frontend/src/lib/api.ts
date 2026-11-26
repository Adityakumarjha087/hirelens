import type { AuthResponse } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

type Listener = (token: string | null) => void;

/** Thin fetch client: bearer access token in memory, refresh token in an httpOnly cookie. */
class ApiClient {
  private accessToken: string | null = null;
  private refreshing: Promise<AuthResponse | null> | null = null;
  private listeners = new Set<Listener>();

  constructor(private readonly base = '/api') {}

  setToken(token: string | null): void {
    this.accessToken = token;
    this.listeners.forEach((l) => l(token));
  }

  onTokenChange(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** Single-flight refresh so concurrent 401s trigger only one rotation. */
  refresh(): Promise<AuthResponse | null> {
    this.refreshing ??= fetch(`${this.base}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          this.setToken(null);
          return null;
        }
        const data = (await res.json()) as AuthResponse;
        this.setToken(data.accessToken);
        return data;
      })
      .catch(() => null)
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }

  async request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    const headers = new Headers(init.headers);
    if (this.accessToken) headers.set('Authorization', `Bearer ${this.accessToken}`);
    if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    const res = await fetch(`${this.base}${path}`, { ...init, headers, credentials: 'include' });
    if (res.status === 401 && retry && !path.startsWith('/auth/')) {
      const refreshed = await this.refresh();
      if (refreshed) return this.request<T>(path, init, false);
    }
    if (!res.ok) {
      let body: { message?: string; details?: unknown } = {};
      try {
        body = (await res.json()) as typeof body;
      } catch {
        /* empty body */
      }
      throw new ApiError(body.message ?? res.statusText ?? 'Request failed', res.status, body.details);
    }
    if (res.status === 204) return undefined as T;
    const type = res.headers.get('content-type') ?? '';
    return (type.includes('application/json') ? await res.json() : await res.blob()) as T;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }
  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) });
  }
  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
  }
  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

export const api = new ApiClient();

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}
