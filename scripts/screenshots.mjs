// Reproducible README screenshots from the seeded demo stack.
// Usage: docker compose up -d --wait && node scripts/screenshots.mjs
// Uses the Playwright install from frontend/ (npm ci there first).
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('@playwright/test');

const BASE = process.env.BASE_URL ?? 'http://localhost:20200';
const OUT = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
const PASSWORD = 'Password123!';
mkdirSync(OUT, { recursive: true });

async function session(browser, email, theme = 'light') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript((t) => localStorage.setItem('hl-theme', t), theme);
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  return { context, page };
}

async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.locator('[aria-busy="true"], .animate-pulse').first().waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(800); // chart animations
}

async function shot(page, name) {
  await settle(page);
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log(`saved docs/screenshots/${name}.png`);
}

async function openJob(page, title) {
  await page.goto(`${BASE}/recruiter/jobs`);
  await page.getByRole('link', { name: title, exact: true }).click();
  await page.getByTestId('candidate-row').first().waitFor();
}

const browser = await chromium.launch();
try {
  // Recruiter screens
  const rec = await session(browser, 'recruiter@hirelens.dev');
  await rec.page.getByRole('heading', { name: 'Hiring dashboard' }).waitFor();
  await rec.page.locator('.recharts-surface').first().waitFor();
  await shot(rec.page, 'recruiter-dashboard');

  await openJob(rec.page, 'Senior Backend Engineer (Payments)');
  await rec.page.getByTestId('candidate-row').nth(1).getByRole('button', { name: 'Why this score?' }).click();
  await rec.page.getByTestId('score-breakdown').waitFor();
  await shot(rec.page, 'ranked-candidates-blind-screening');

  // Same blind-screened job: Applied/Screening cards show aliases, later stages show names.
  await rec.page.getByRole('link', { name: 'Pipeline' }).click();
  await rec.page.getByTestId('kanban-card').first().waitFor();
  await shot(rec.page, 'kanban-pipeline');

  await openJob(rec.page, 'Full-Stack Engineer (React / Node.js)');
  await rec.page.getByRole('link', { name: 'Pipeline' }).click();
  await rec.page.getByTestId('kanban-card').first().waitFor();

  // Interview questions on the candidate in the Interview column
  await rec.page.getByTestId('column-INTERVIEW').getByTestId('kanban-card').first().getByRole('link').click();
  await rec.page.getByRole('tab', { name: 'Interview questions' }).click();
  const generate = rec.page.getByRole('button', { name: /Generate questions/ });
  if (await generate.isVisible()) await generate.click();
  await rec.page.getByTestId('interview-questions').waitFor();
  await shot(rec.page, 'interview-questions');
  await rec.context.close();

  // Candidate feedback against a target job
  const cand = await session(browser, 'candidate@hirelens.dev');
  await cand.page.goto(`${BASE}/candidate/feedback`);
  await cand.page.getByLabel('Target job (optional)').selectOption({ label: 'Machine Learning Engineer, LLM Platform — Lumen Health' });
  await cand.page.getByRole('button', { name: 'Analyze' }).click();
  await cand.page.getByTestId('feedback-result').getByText('for Machine Learning Engineer').waitFor();
  await shot(cand.page, 'candidate-resume-feedback');
  await cand.context.close();

  // Dark mode
  const dark = await session(browser, 'recruiter@hirelens.dev', 'dark');
  await openJob(dark.page, 'Full-Stack Engineer (React / Node.js)');
  await dark.page.getByTestId('candidate-row').first().getByRole('button', { name: 'Why this score?' }).click();
  await shot(dark.page, 'ranked-candidates-dark');
  await dark.context.close();
} finally {
  await browser.close();
}
