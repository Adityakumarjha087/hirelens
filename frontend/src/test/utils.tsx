import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { api } from '@/lib/api';
import { AuthProvider } from '@/lib/auth';
import { ThemeProvider } from '@/lib/theme';

export type Handler = (url: string, init: RequestInit) => unknown;
export interface Route_ {
  method?: string;
  path: string | RegExp;
  status?: number;
  body?: unknown;
  handler?: Handler;
}

export function mockFetch(routes: Route_[]) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init.method ?? 'GET').toUpperCase();
    let parsed: unknown = init.body;
    if (typeof init.body === 'string') parsed = JSON.parse(init.body);
    calls.push({ url, method, body: parsed });
    const route = routes.find(
      (r) => (r.method ?? 'GET') === method && (typeof r.path === 'string' ? url === `/api${r.path}` || url.startsWith(`/api${r.path}?`) : r.path.test(url)),
    );
    if (!route) return new Response(JSON.stringify({ message: `no mock for ${method} ${url}` }), { status: 404 });
    const body = route.handler ? route.handler(url, init) : route.body;
    const status = route.status ?? 200;
    if (status === 204) return new Response(null, { status });
    return new Response(JSON.stringify(body ?? {}), { status, headers: { 'content-type': 'application/json' } });
  });
  return { spy, calls };
}

export const USERS = {
  candidate: { id: 'u1', email: 'c@x.io', fullName: 'Cara Candidate', role: 'CANDIDATE' as const, company: null, createdAt: '2026-01-01T00:00:00Z' },
  recruiter: { id: 'u2', email: 'r@x.io', fullName: 'Rex Recruiter', role: 'RECRUITER' as const, company: 'Acme', createdAt: '2026-01-01T00:00:00Z' },
};

export const authRoute = (user: (typeof USERS)[keyof typeof USERS] | null): Route_ =>
  user ? { method: 'POST', path: '/auth/refresh', body: { accessToken: 'tok', user } } : { method: 'POST', path: '/auth/refresh', status: 401, body: {} };

export function renderPage(ui: ReactElement, { path = '/', route = '/' }: { path?: string; route?: string } = {}) {
  api.setToken(null);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <MemoryRouter initialEntries={[route]}>
            <Routes>
              <Route path={path} element={ui} />
              <Route path="*" element={<div data-testid="redirected" />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}
