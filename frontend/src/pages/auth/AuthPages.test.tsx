import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { authRoute, mockFetch, renderPage, USERS } from '@/test/utils';
import { LoginPage, RegisterPage, registerSchema } from './AuthPages';

describe('LoginPage', () => {
  it('shows validation errors for empty and invalid input', async () => {
    mockFetch([authRoute(null)]);
    renderPage(<LoginPage />, { path: '/login', route: '/login' });
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Email'), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('surfaces server errors and logs in with demo credentials', async () => {
    let attempts = 0;
    const { calls } = mockFetch([
      authRoute(null),
      {
        method: 'POST',
        path: '/auth/login',
        handler: () => (attempts++ === 0 ? { accessToken: 't', user: USERS.recruiter } : null),
      },
    ]);
    renderPage(<LoginPage />, { path: '/login', route: '/login' });
    await userEvent.click(await screen.findByRole('button', { name: 'Recruiter' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByTestId('redirected')).toBeInTheDocument());
    const login = calls.find((c) => c.url === '/api/auth/login');
    expect(login?.body).toEqual({ email: 'recruiter@hirelens.dev', password: 'Password123!' });
  });

  it('shows the API error message on bad credentials', async () => {
    mockFetch([authRoute(null), { method: 'POST', path: '/auth/login', status: 401, body: { message: 'Invalid email or password' } }]);
    renderPage(<LoginPage />, { path: '/login', route: '/login' });
    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });
});

describe('RegisterPage', () => {
  it('requires a company for recruiters and a strong password', async () => {
    mockFetch([authRoute(null)]);
    renderPage(<RegisterPage />, { path: '/register', route: '/register' });
    await userEvent.click(await screen.findByText('Recruiter'));
    await userEvent.type(screen.getByLabelText('Full name'), 'Rex');
    await userEvent.type(screen.getByLabelText('Email'), 'rex@x.io');
    await userEvent.type(screen.getByLabelText('Password'), 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Company is required for recruiters')).toBeInTheDocument();
    expect(screen.getByText('Include at least one letter and one number')).toBeInTheDocument();
  });

  it('validates unicode names and trims whitespace in the schema', () => {
    const ok = registerSchema.safeParse({ fullName: '  مريم 🚀 Zoë ', email: ' z@x.io ', password: 'abc12345', role: 'CANDIDATE' });
    expect(ok.success && ok.data.fullName).toBe('مريم 🚀 Zoë');
    expect(registerSchema.safeParse({ fullName: ' ', email: 'z@x.io', password: 'abc12345', role: 'CANDIDATE' }).success).toBe(false);
    expect(registerSchema.safeParse({ fullName: 'x'.repeat(101), email: 'z@x.io', password: 'abc12345', role: 'CANDIDATE' }).success).toBe(false);
  });
});
