import { BarChart3, Briefcase, FileText, LogOut, Menu, Moon, Search, Sparkles, Sun, Users, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { homeFor, useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import type { Role } from '@/lib/types';
import { cn } from '@/lib/utils';

const NAV: Record<Role, { to: string; label: string; icon: typeof Briefcase; end?: boolean }[]> = {
  CANDIDATE: [
    { to: '/candidate', label: 'My resumes', icon: FileText, end: true },
    { to: '/jobs', label: 'Find jobs', icon: Search },
    { to: '/candidate/applications', label: 'Applications', icon: Briefcase },
    { to: '/candidate/feedback', label: 'AI feedback', icon: Sparkles },
  ],
  RECRUITER: [
    { to: '/recruiter', label: 'Dashboard', icon: BarChart3, end: true },
    { to: '/recruiter/jobs', label: 'Jobs', icon: Briefcase },
  ],
  ADMIN: [
    { to: '/admin', label: 'Users', icon: Users, end: true },
    { to: '/recruiter', label: 'Analytics', icon: BarChart3, end: true },
    { to: '/recruiter/jobs', label: 'All jobs', icon: Briefcase },
  ],
};

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-bold tracking-tight">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Search className="h-4 w-4" aria-hidden />
      </span>
      HireLens
    </Link>
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-8" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role) && user.role !== 'ADMIN') return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const items = NAV[user.role];
  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-1 md:flex-row">
      {items.map((it) => (
        <NavLink
          key={it.to + it.label}
          to={it.to}
          end={it.end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
              isActive && 'bg-accent text-accent-foreground',
            )
          }
        >
          <it.icon className="h-4 w-4" aria-hidden />
          {it.label}
        </NavLink>
      ))}
    </nav>
  );
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-card focus:p-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
          <Logo />
          <div className="hidden flex-1 md:block">{nav}</div>
          <div className="ml-auto flex items-center gap-1">
            <span className="hidden text-right text-xs leading-tight sm:block">
              <span className="block font-medium">{user.fullName}</span>
              <span className="text-muted-foreground">{user.role.toLowerCase()}</span>
            </span>
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={() => void logout()} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu" aria-expanded={open}>
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        {open && <div className="border-t p-3 md:hidden">{nav}</div>}
      </header>
      <main id="main" className="mx-auto max-w-7xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
