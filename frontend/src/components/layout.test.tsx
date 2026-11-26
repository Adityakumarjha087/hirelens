import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { authRoute, mockFetch, renderPage, USERS } from '@/test/utils';
import { RequireAuth, ThemeToggle } from './layout';

describe('RequireAuth', () => {
  it('redirects anonymous users to login', async () => {
    mockFetch([authRoute(null)]);
    renderPage(<RequireAuth><p>secret</p></RequireAuth>);
    await waitFor(() => expect(screen.getByTestId('redirected')).toBeInTheDocument());
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('redirects users with the wrong role', async () => {
    mockFetch([authRoute(USERS.candidate)]);
    renderPage(<RequireAuth roles={['RECRUITER']}><p>recruiters only</p></RequireAuth>);
    await waitFor(() => expect(screen.getByTestId('redirected')).toBeInTheDocument());
  });

  it('renders content for the right role', async () => {
    mockFetch([authRoute(USERS.recruiter)]);
    renderPage(<RequireAuth roles={['RECRUITER']}><p>recruiters only</p></RequireAuth>);
    expect(await screen.findByText('recruiters only')).toBeInTheDocument();
  });
});

describe('ThemeToggle', () => {
  it('toggles dark mode on the root element', async () => {
    mockFetch([authRoute(null)]);
    renderPage(<ThemeToggle />);
    const btn = await screen.findByRole('button', { name: /Switch to dark mode/ });
    await userEvent.click(btn);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: /Switch to light mode/ }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
