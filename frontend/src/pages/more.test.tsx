import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ApplicantDetail, MyApplication } from '@/lib/types';
import { authRoute, mockFetch, renderPage, USERS } from '@/test/utils';
import { AdminUsersPage } from './admin/AdminUsersPage';
import { MyApplicationsPage } from './candidate/JobsPage';
import { Landing } from './Landing';
import { ApplicationDetailPage } from './recruiter/ApplicationDetailPage';
import { JobsListPage } from './recruiter/JobsListPage';

const breakdown = {
  semantic_similarity: 0.7, skill_overlap: 0.6, experience_fit: 1, weights: { semantic: 0.45, skills: 0.4, experience: 0.15 },
  matched_required: ['Python'], missing_required: [], matched_nice_to_have: [], missing_nice_to_have: [], candidate_years: 5, required_years: 3,
  explanation: ['Strong fit.'],
};

describe('ApplicationDetailPage', () => {
  const detail: ApplicantDetail = {
    id: 'a1', jobId: 'j1', stage: 'SCREENING', position: 0, matchScore: 77, scoreBreakdown: breakdown,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', blind: true,
    candidate: { id: null, name: 'Candidate 9F3C', email: null },
    resume: { id: 'r1', skills: ['Python'], yearsExperience: 5, location: 'Austin', headline: 'Engineer', profile: {
      name: '', email: null, phone: null, location: 'Austin', summary: 'They build things.', skills: ['Python'],
      experience: [{ title: 'Engineer', company: 'Acme', start: '2020', end: 'Present', duration_months: 60, highlights: ['Built X'] }],
      education: [{ institution: 'MIT', degree: 'B.S.', field: 'CS', year: null }], projects: [], years_of_experience: 5 } },
    coverLetter: 'Hello', recruiterNotes: 'old', interviewQuestions: null, resumeText: '[CANDIDATE]',
    events: [{ id: 'e1', fromStage: null, toStage: 'APPLIED', createdAt: '2026-01-01T00:00:00Z' }, { id: 'e2', fromStage: 'APPLIED', toStage: 'SCREENING', createdAt: '2026-01-02T00:00:00Z' }],
    job: { id: 'j1', title: 'Backend', company: 'Acme', blindScreening: true },
  };

  it('shows blind notice, breakdown, generates questions and saves notes', async () => {
    let questions: unknown = null;
    const { calls } = mockFetch([
      authRoute(USERS.recruiter),
      { path: '/applications/a1', handler: () => ({ ...detail, interviewQuestions: questions }) },
      { method: 'POST', path: '/applications/a1/interview-questions', handler: () => (questions = [{ question: 'Explain Python GIL', category: 'technical', difficulty: 'hard', rationale: 'depth' }]) },
      { method: 'PATCH', path: '/applications/a1/notes', body: {} },
      { method: 'PATCH', path: '/applications/a1/stage', body: {} },
    ]);
    renderPage(<ApplicationDetailPage />, { path: '/recruiter/applications/:id', route: '/recruiter/applications/a1' });
    expect(await screen.findByRole('note')).toHaveTextContent(/Blind screening/);
    expect(screen.queryByRole('button', { name: /Resume/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('score-breakdown')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Interview questions' }));
    await userEvent.click(screen.getByRole('button', { name: /Generate questions/ }));
    expect(await screen.findByText('Explain Python GIL')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Recruiter notes'));
    await userEvent.type(screen.getByLabelText('Recruiter notes'), 'Strong ✅');
    await userEvent.click(screen.getByRole('button', { name: 'Save notes' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH' && c.url.endsWith('/notes'))?.body).toEqual({ notes: 'Strong ✅' }));
    await userEvent.selectOptions(screen.getByLabelText('Pipeline stage'), 'INTERVIEW');
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/stage'))?.body).toEqual({ stage: 'INTERVIEW' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Profile' }));
    expect(screen.getByText('They build things.')).toBeInTheDocument();
  });

  it('renders an error state for forbidden applications', async () => {
    mockFetch([authRoute(USERS.recruiter), { path: '/applications/a1', status: 403, body: { message: 'Forbidden resource' } }]);
    renderPage(<ApplicationDetailPage />, { path: '/recruiter/applications/:id', route: '/recruiter/applications/a1' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden resource');
  });
});

describe('MyApplicationsPage', () => {
  it('lists applications with stage and expandable breakdown', async () => {
    const apps: MyApplication[] = [{ id: 'a', stage: 'OFFER', matchScore: 91, scoreBreakdown: breakdown, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', resumeId: 'r', job: { id: 'j', title: 'Backend', company: 'Acme', location: 'X', remote: true, status: 'OPEN' } }];
    mockFetch([authRoute(USERS.candidate), { path: '/applications/mine', body: apps }]);
    renderPage(<MyApplicationsPage />);
    expect(await screen.findByText('Offer')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show score breakdown' }));
    expect(screen.getByText('Strong fit.')).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    mockFetch([authRoute(USERS.candidate), { path: '/applications/mine', body: [] }]);
    renderPage(<MyApplicationsPage />);
    expect(await screen.findByText('No applications yet')).toBeInTheDocument();
  });
});

describe('AdminUsersPage', () => {
  it('lists users and changes a role', async () => {
    const admin = { ...USERS.candidate, id: 'me', role: 'ADMIN' as const };
    const { calls } = mockFetch([
      authRoute(admin),
      { path: '/admin/users', body: { items: [admin, { ...USERS.recruiter, isActive: true }], total: 2, page: 1, pageSize: 20 } },
      { method: 'PATCH', path: '/admin/users/u2', body: USERS.recruiter },
    ]);
    renderPage(<AdminUsersPage />);
    expect(await screen.findByText('Rex Recruiter')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Role for r@x.io'), 'ADMIN');
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ role: 'ADMIN' }));
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(2));
  });
});

describe('JobsListPage & Landing', () => {
  it('lists recruiter jobs with stats', async () => {
    mockFetch([authRoute(USERS.recruiter), { path: '/jobs', body: { items: [{ id: 'j', title: 'Backend', status: 'OPEN', blindScreening: true, location: 'NYC', applicantCount: 4, avgMatchScore: 66.4, requiredSkills: ['Go'] }], total: 1, page: 1, pageSize: 100 } }]);
    renderPage(<JobsListPage />);
    expect(await screen.findByText('Backend')).toBeInTheDocument();
    expect(screen.getByText(/4 applicants · avg score 66/)).toBeInTheDocument();
    expect(screen.getByText('Blind screening')).toBeInTheDocument();
  });

  it('renders the marketing page for anonymous visitors', async () => {
    mockFetch([authRoute(null)]);
    renderPage(<Landing />);
    expect(await screen.findByRole('heading', { name: /Find the right candidate/ })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Create free account|Get started/ }).length).toBeGreaterThan(0);
  });
});
