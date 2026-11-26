import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Applicant, RecruiterAnalytics } from '@/lib/types';
import { authRoute, mockFetch, renderPage, USERS } from '@/test/utils';
import { CandidatesPage } from './CandidatesPage';
import { DashboardPage } from './DashboardPage';
import { JobFormPage, jobSchema } from './JobFormPage';
import { groupByStage, PipelinePage } from './PipelinePage';

const app = (id: string, stage: Applicant['stage'], score: number, name = `Cand ${id}`): Applicant => ({
  id,
  jobId: 'j1',
  stage,
  position: 0,
  matchScore: score,
  scoreBreakdown: {
    semantic_similarity: 0.7,
    skill_overlap: 0.6,
    experience_fit: 1,
    weights: { semantic: 0.45, skills: 0.4, experience: 0.15 },
    matched_required: ['Python'],
    missing_required: ['Kafka'],
    matched_nice_to_have: [],
    missing_nice_to_have: [],
    candidate_years: 5,
    required_years: 5,
    explanation: ['Matches 1/2 required skills.'],
  },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  blind: true,
  candidate: { id: null, name, email: null },
  resume: { id: `r${id}`, skills: ['Python'], yearsExperience: 5, location: 'Austin', headline: 'Engineer', profile: null },
});

const job = { id: 'j1', title: 'Backend Engineer', company: 'Acme', blindScreening: true };

describe('CandidatesPage', () => {
  it('lists ranked candidates, shows breakdown and applies filters', async () => {
    const { calls } = mockFetch([
      authRoute(USERS.recruiter),
      { path: '/jobs/j1', body: job },
      { path: '/jobs/j1/applications', body: [app('a', 'APPLIED', 88, 'Candidate 1A2B'), app('b', 'SCREENING', 61)] },
    ]);
    renderPage(<CandidatesPage />, { path: '/recruiter/jobs/:id', route: '/recruiter/jobs/j1' });
    const rows = await screen.findAllByTestId('candidate-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Candidate 1A2B')).toBeInTheDocument();
    expect(screen.getByText('Blind screening on')).toBeInTheDocument();
    await userEvent.click(within(rows[0]).getByRole('button', { name: 'Why this score?' }));
    expect(screen.getByTestId('score-breakdown')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Min score'), '70');
    await userEvent.type(screen.getByLabelText('Skills (comma-separated)'), 'Python, Kafka');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(calls.some((c) => c.url.includes('minScore=70') && c.url.includes('skills=Python%2C+Kafka'))).toBe(true));
  });
});

describe('PipelinePage', () => {
  it('groups applications by stage', () => {
    const g = groupByStage([app('a', 'OFFER', 50), app('b', 'APPLIED', 40), app('c', 'APPLIED', 90)]);
    expect(g.APPLIED.map((a) => a.id)).toEqual(['c', 'b']);
    expect(g.OFFER).toHaveLength(1);
    expect(g.REJECTED).toHaveLength(0);
  });

  it('moves a card and rolls back when the server rejects the move', async () => {
    let stage: Applicant['stage'] = 'APPLIED';
    let fail = false;
    const { spy, calls } = mockFetch([
      authRoute(USERS.recruiter),
      { path: '/jobs/j1', body: job },
      { path: '/jobs/j1/applications', handler: () => [app('a', stage, 80)] },
      {
        method: 'PATCH',
        path: '/applications/a/stage',
        handler: (_u, init) => {
          stage = (JSON.parse(String(init.body)) as { stage: Applicant['stage'] }).stage;
          return app('a', stage, 80);
        },
      },
    ]);
    renderPage(<PipelinePage />, { path: '/recruiter/jobs/:id/pipeline', route: '/recruiter/jobs/j1/pipeline' });
    const applied = await screen.findByTestId('column-APPLIED');
    expect(within(applied).getAllByTestId('kanban-card')).toHaveLength(1);
    await userEvent.selectOptions(screen.getByLabelText('Move Cand a to stage'), 'INTERVIEW');
    await waitFor(() => expect(within(screen.getByTestId('column-INTERVIEW')).getAllByTestId('kanban-card')).toHaveLength(1));
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ stage: 'INTERVIEW' });

    fail = true;
    const original = spy.getMockImplementation()!;
    spy.mockImplementation(async (input, init) =>
      fail && init?.method === 'PATCH' ? new Response(JSON.stringify({ message: 'Conflict' }), { status: 409 }) : original(input, init),
    );
    await userEvent.selectOptions(screen.getByLabelText('Move Cand a to stage'), 'OFFER');
    await waitFor(() => expect(within(screen.getByTestId('column-INTERVIEW')).getAllByTestId('kanban-card')).toHaveLength(1));
    expect(within(screen.getByTestId('column-OFFER')).queryAllByTestId('kanban-card')).toHaveLength(0);
  });
});

describe('DashboardPage', () => {
  it('renders KPI tiles from analytics', async () => {
    const data: RecruiterAnalytics = {
      totals: { jobs: 3, openJobs: 2, applicants: 11, avgMatchScore: 61.6, offers: 2, avgTimeToHireDays: 17.5 },
      applicantsPerJob: [{ jobId: 'j1', title: 'Backend', applicants: 5, avgScore: 61, status: 'OPEN' }],
      stageFunnel: [{ stage: 'APPLIED', count: 4 }],
      scoreDistribution: [{ bucket: '60-80', count: 5 }],
      applicationsOverTime: [{ date: '2026-11-01', count: 2 }],
      timeToHireByJob: [{ jobId: 'j1', title: 'Backend', days: 14, offers: 1 }],
      topSkills: [{ skill: 'Python', count: 7 }],
    };
    mockFetch([authRoute(USERS.recruiter), { path: '/analytics/recruiter', body: data }]);
    renderPage(<DashboardPage />);
    expect(await screen.findByTestId('stat-Applicants')).toHaveTextContent('11');
    expect(screen.getByTestId('stat-Avg match score')).toHaveTextContent('61.6');
    expect(screen.getByTestId('stat-Avg time to hire')).toHaveTextContent('17.5d');
    expect(screen.getByText('Python')).toBeInTheDocument();
  });
});

describe('JobFormPage', () => {
  it('validates salary range and required fields', () => {
    const base = { title: 'Dev', description: 'x'.repeat(30), location: 'NYC', remote: false, employmentType: 'FULL_TIME', status: 'OPEN', blindScreening: true };
    expect(jobSchema.safeParse({ ...base, salaryMin: 200, salaryMax: 100 }).success).toBe(false);
    expect(jobSchema.safeParse({ ...base, salaryMin: '', salaryMax: NaN }).success).toBe(true);
    expect(jobSchema.safeParse({ ...base, description: '   short   ' }).success).toBe(false);
  });

  it('extracts skills with AI and publishes the job', async () => {
    const { calls } = mockFetch([
      authRoute(USERS.recruiter),
      { method: 'POST', path: '/jobs/analyze', body: { required_skills: ['Python', 'Kafka'], nice_to_have_skills: ['Go'], min_years_experience: 5, seniority: 'senior', keywords: [], source: 'heuristic' } },
      { method: 'POST', path: '/jobs', status: 201, body: { id: 'new-job' } },
    ]);
    renderPage(<JobFormPage />);
    await userEvent.type(await screen.findByLabelText('Job title'), 'Senior Backend Engineer');
    await userEvent.type(screen.getByLabelText('Location'), 'Remote');
    await userEvent.type(screen.getByLabelText('Description'), 'We need 5+ years of Python and Kafka. Nice to have: Go.');
    await userEvent.click(screen.getByRole('button', { name: /Extract skills/ }));
    expect(await screen.findByRole('button', { name: 'Remove Kafka' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Kafka' }));
    await userEvent.type(screen.getByLabelText('Required skills'), 'Docker{enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Publish job' }));
    await waitFor(() => expect(screen.getByTestId('redirected')).toBeInTheDocument());
    const post = calls.find((c) => c.method === 'POST' && c.url === '/api/jobs');
    expect(post?.body).toMatchObject({ title: 'Senior Backend Engineer', requiredSkills: ['Python', 'Docker'], niceToHaveSkills: ['Go'], minYearsExperience: 5, blindScreening: true });
  });
});


