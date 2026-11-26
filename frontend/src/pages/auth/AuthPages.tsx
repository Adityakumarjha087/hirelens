import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Logo, ThemeToggle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldError, Input, Label } from '@/components/ui/form';
import { homeFor, useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
    email: z.string().trim().email('Enter a valid email'),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/(?=.*[A-Za-z])(?=.*\d)/, 'Include at least one letter and one number'),
    role: z.enum(['CANDIDATE', 'RECRUITER']),
    company: z.string().trim().max(100).optional(),
  })
  .refine((v) => v.role !== 'RECRUITER' || (v.company && v.company.length >= 2), {
    message: 'Company is required for recruiters',
    path: ['company'],
  });

function Shell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between p-4">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-xl">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </main>
    </div>
  );
}

const DEMO = [
  { label: 'Candidate', email: 'candidate@hirelens.dev' },
  { label: 'Recruiter', email: 'recruiter@hirelens.dev' },
  { label: 'Admin', email: 'admin@hirelens.dev' },
];

export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const u = await login(values.email, values.password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? homeFor(u.role), { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed');
    }
  });
  const { errors, isSubmitting } = form.formState;
  return (
    <Shell title="Welcome back" description="Sign in to HireLens">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} aria-describedby="email-err" {...form.register('email')} />
          <FieldError id="email-err" message={errors.email?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} aria-describedby="pw-err" {...form.register('password')} />
          <FieldError id="pw-err" message={errors.password?.message} />
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Sign in
        </Button>
      </form>
      <div className="mt-6 rounded-md bg-muted p-3 text-xs">
        <p className="mb-2 font-medium">Demo accounts (password: Password123!)</p>
        <div className="flex flex-wrap gap-2">
          {DEMO.map((d) => (
            <Button
              key={d.email}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                form.setValue('email', d.email);
                form.setValue('password', 'Password123!');
              }}
            >
              {d.label}
            </Button>
          ))}
        </div>
      </div>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        New here?{' '}
        <Link to="/register" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </Shell>
  );
}

export function RegisterPage() {
  const { register: signUp, user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', email: '', password: '', role: 'CANDIDATE', company: '' },
  });
  if (user) return <Navigate to={homeFor(user.role)} replace />;
  const role = form.watch('role');
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      const u = await signUp({ ...v, company: v.role === 'RECRUITER' ? v.company : undefined });
      navigate(homeFor(u.role), { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    }
  });

  return (
    <Shell title="Create your account" description="Hire smarter or get hired faster">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">I am a…</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['CANDIDATE', 'RECRUITER'] as const).map((r) => (
              <label
                key={r}
                className={cn(
                  'cursor-pointer rounded-md border p-3 text-center text-sm font-medium',
                  role === r ? 'border-primary bg-accent text-accent-foreground' : 'hover:bg-muted',
                )}
              >
                <input type="radio" value={r} className="sr-only" {...form.register('role')} />
                {r === 'CANDIDATE' ? 'Job seeker' : 'Recruiter'}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" autoComplete="name" aria-invalid={!!errors.fullName} {...form.register('fullName')} />
          <FieldError message={errors.fullName?.message} />
        </div>
        {role === 'RECRUITER' && (
          <div className="space-y-1.5">
            <Label htmlFor="company">Company</Label>
            <Input id="company" autoComplete="organization" aria-invalid={!!errors.company} {...form.register('company')} />
            <FieldError message={errors.company?.message} />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="reg-email">Email</Label>
          <Input id="reg-email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register('email')} />
          <FieldError message={errors.email?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reg-password">Password</Label>
          <Input id="reg-password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register('password')} />
          <FieldError message={errors.password?.message} />
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Create account
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </Shell>
  );
}
