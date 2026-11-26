import { describe, expect, it, vi } from 'vitest';
import { mockFetch } from '@/test/utils';
import { api, ApiError, qs } from './api';

describe('api client', () => {
  it('refreshes once on 401 and retries the original request', async () => {
    api.setToken('expired');
    const responses = [401, 200];
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/auth/refresh') return new Response(JSON.stringify({ accessToken: 'fresh', user: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
      const status = responses.shift()!;
      const auth = new Headers(init?.headers).get('Authorization');
      return new Response(JSON.stringify({ auth }), { status, headers: { 'content-type': 'application/json' } });
    });
    const [a, b] = await Promise.all([api.get<{ auth: string }>('/jobs'), api.refresh()]);
    expect(a.auth).toBe('Bearer fresh');
    expect(b?.accessToken).toBe('fresh');
    const refreshCalls = spy.mock.calls.filter((c) => String(c[0]) === '/api/auth/refresh');
    expect(refreshCalls).toHaveLength(1);
  });

  it('throws ApiError with server message and details', async () => {
    mockFetch([{ method: 'POST', path: '/jobs', status: 400, body: { message: 'Validation failed', details: ['title too short'] } }]);
    const err = await api.post('/jobs', { title: 'x' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, message: 'Validation failed', details: ['title too short'] });
  });

  it('handles 204 and non-JSON bodies', async () => {
    const { spy } = mockFetch([]);
    spy.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(api.delete('/resumes/1')).resolves.toBeUndefined();
    spy.mockResolvedValueOnce(new Response('oops', { status: 502, statusText: 'Bad Gateway' }));
    await expect(api.get('/x')).rejects.toMatchObject({ status: 502 });
    spy.mockResolvedValueOnce(new Response('%PDF', { status: 200, headers: { 'content-type': 'application/pdf' } }));
    // Blob identity differs between undici and jsdom realms on some Node versions; check behaviour.
    const file = (await api.get('/file')) as Blob;
    expect(file.type).toBe('application/pdf');
    expect(file.size).toBe(4);
  });

  it('builds query strings skipping empty values and encoding unicode', () => {
    expect(qs({ a: 1, b: '', c: undefined, d: null, e: false })).toBe('?a=1&e=false');
    expect(qs({ q: 'Café & 🚀' })).toBe('?q=Caf%C3%A9+%26+%F0%9F%9A%80');
    expect(qs({})).toBe('');
  });
});
