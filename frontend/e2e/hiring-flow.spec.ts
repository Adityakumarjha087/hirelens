import { expect, test } from '@playwright/test';

const RESUME = `Jordan Rivera
Senior Backend Engineer
jordan.rivera@example.com | +1 512 555 0199 | Austin, TX

SUMMARY
Backend engineer with 7 years of experience building payment systems in Python and Go.

SKILLS
Python, Go, PostgreSQL, Kafka, Docker, Kubernetes, AWS, Terraform

EXPERIENCE
Senior Software Engineer — Plaid Inc (Jan 2021 - Present)
- Built a Kafka pipeline processing 10M events/day
- Responsible for maintaining the ledger service
Software Engineer, Square | Jun 2018 – Dec 2020
- Reduced API latency by 30% with Redis caching

EDUCATION
B.S. in Computer Science, University of Texas at Austin, 2018
`;

test('candidate applies with an AI match score and recruiter moves them through the pipeline', async ({ page, request }) => {
  const runId = `${Date.now()}`;
  const email = `e2e-${runId}@example.com`;
  const jobTitle = `E2E Payments Engineer ${runId}`;

  // Each run gets its own blind-screened job so the test is independent of previous runs / seed data.
  const login = await request.post('/api/auth/login', { data: { email: 'recruiter@hirelens.dev', password: 'Password123!' } });
  expect(login.ok()).toBeTruthy();
  const { accessToken } = (await login.json()) as { accessToken: string };
  const created = await request.post('/api/jobs', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      title: jobTitle,
      location: 'Austin, TX',
      remote: true,
      blindScreening: true,
      description: 'Requirements:\n- 5+ years of experience with Python and PostgreSQL\n- Kafka, Docker and Kubernetes\nNice to have:\n- Go, Terraform',
    },
  });
  expect(created.status()).toBe(201);

  // --- Candidate registers and uploads a resume
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Jordan Rivera');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('E2ePassw0rd!');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'My resumes' })).toBeVisible();

  await page.getByTestId('resume-input').setInputFiles({ name: 'jordan.txt', mimeType: 'text/plain', buffer: Buffer.from(RESUME) });
  const card = page.getByTestId('resume-card').first();
  await expect(card.getByText('Parsed')).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText('Kafka')).toBeVisible();

  // --- AI feedback
  await page.getByRole('link', { name: 'AI feedback' }).first().click();
  await page.getByRole('button', { name: 'Analyze' }).click();
  await expect(page.getByTestId('feedback-result')).toBeVisible();
  await expect(page.getByLabel(/ATS score \d+ out of 100/)).toBeVisible();

  // --- Browse and apply to the seeded payments job
  await page.getByRole('link', { name: 'Find jobs' }).first().click();
  await page.getByLabel('Search jobs').fill(runId);
  await page.getByRole('button', { name: /Search/ }).click();
  await page.getByRole('link', { name: new RegExp(jobTitle) }).click();
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.getByRole('heading', { name: 'My applications' })).toBeVisible();
  const score = page.getByLabel(/Match score \d+ out of 100/).first();
  await expect(score).toBeVisible();
  await page.getByRole('button', { name: 'Show score breakdown' }).first().click();
  await expect(page.getByTestId('score-breakdown')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();

  // --- Recruiter reviews ranked, blind-screened candidates
  await page.goto('/login');
  await page.getByLabel('Email').fill('recruiter@hirelens.dev');
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Hiring dashboard' })).toBeVisible();
  await expect(page.getByTestId('stat-Applicants')).not.toHaveText('0');

  await page.getByRole('link', { name: 'Jobs', exact: true }).click();
  await page.getByRole('link', { name: jobTitle }).click();
  await expect(page.getByText('Blind screening on')).toBeVisible();
  const rows = page.getByTestId('candidate-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first().getByText(/^Candidate [0-9A-F]{4}$/)).toBeVisible();
  await expect(page.getByText('Jordan Rivera')).toHaveCount(0); // identity hidden during screening

  // --- Kanban: move the candidate to Interview via the stage menu; identity is then revealed
  await page.getByRole('link', { name: 'Pipeline' }).click();
  const applied = page.getByTestId('column-APPLIED');
  await expect(applied.getByTestId('kanban-card')).toHaveCount(1);
  await applied.getByTestId('kanban-card').first().getByRole('combobox').selectOption('INTERVIEW');
  await expect(page.getByTestId('column-INTERVIEW').getByTestId('kanban-card')).toHaveCount(1);
  await expect(page.getByTestId('column-INTERVIEW').getByText('Jordan Rivera')).toBeVisible();

  // --- Interview questions on the application detail page
  await page.getByTestId('column-INTERVIEW').getByTestId('kanban-card').first().getByRole('link').click();
  await page.getByRole('tab', { name: 'Interview questions' }).click();
  await page.getByRole('button', { name: 'Generate questions' }).or(page.getByRole('button', { name: 'Regenerate' })).click();
  await expect(page.getByTestId('interview-questions').getByRole('listitem').first()).toBeVisible();
});

test('redirects anonymous users and rejects unauthenticated API calls', async ({ page }) => {
  await page.goto('/recruiter');
  await expect(page).toHaveURL(/\/login/);
  const res = await page.request.get('/api/jobs');
  expect(res.status()).toBe(401);
});
