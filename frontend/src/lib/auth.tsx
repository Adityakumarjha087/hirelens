import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import type { AuthResponse, Role, User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: { email: string; password: string; fullName: string; role: Exclude<Role, 'ADMIN'>; company?: string }) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void api.refresh().then((res) => {
      if (!cancelled) {
        setUser(res?.user ?? null);
        setLoading(false);
      }
    });
    const off = api.onTokenChange((t) => {
      if (!t) setUser(null);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  const accept = useCallback((res: AuthResponse) => {
    api.setToken(res.accessToken);
    setUser(res.user);
    return res.user;
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      login: async (email, password) => accept(await api.post<AuthResponse>('/auth/login', { email, password })),
      register: async (input) => accept(await api.post<AuthResponse>('/auth/register', input)),
      logout: async () => {
        await api.post('/auth/logout').catch(() => undefined);
        api.setToken(null);
        setUser(null);
      },
    }),
    [user, loading, accept],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function homeFor(role: Role): string {
  return role === 'RECRUITER' ? '/recruiter' : role === 'ADMIN' ? '/admin' : '/candidate';
}
