import { INestApplication, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AiClient } from '../src/ai/ai-client';
import type {
  AiHealth,
  AnalyzeJobResponse,
  FeedbackJob,
  FeedbackResponse,
  InterviewResponse,
  MatchRequest,
  MatchResult,
  ParseResumeResponse,
  ResumeProfile,
} from '../src/ai/ai.types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { Mailer } from '../src/notifications/mailer.service';
import type { RenderedEmail } from '../src/notifications/templates';
import { PrismaService } from '../src/prisma/prisma.service';
import { MemoryStorage, ObjectStorage } from '../src/storage/storage.service';

const KNOWN_SKILLS = [
  'Python',
  'Go',
  'PostgreSQL',
  'Kafka',
  'Docker',
  'Kubernetes',
  'React',
  'TypeScript',
  'Node.js',
  'AWS',
];

export function skillsIn(text: string): string[] {
  return KNOWN_SKILLS.filter((s) => new RegExp(`\\b${s.replace('.', '\\.')}\\b`, 'i').test(text));
}

/** Deterministic in-process stand-in for the Python AI service. */
export class FakeAiClient extends AiClient {
  indexed = new Map<string, string>();
  calls: string[] = [];
  healthy = true;

  parseResume(file: Buffer): Promise<ParseResumeResponse> {
    this.calls.push('parse');
    const text = file.toString('utf8');
    if (text.includes('CORRUPT'))
      return Promise.reject(new UnprocessableEntityException('Could not read file'));
    const lines = text.split('\n').filter(Boolean);
    const years = Number(/(\d+)\s+years/.exec(text)?.[1] ?? 0);
    const location = /Location:\s*(.+)/.exec(text)?.[1]?.trim() ?? null;
    const profile: ResumeProfile = {
      name: lines[0]?.trim() ?? '',
      email: /[\w.+-]+@[\w.-]+/.exec(text)?.[0] ?? null,
      phone: null,
      location,
      summary: `${lines[0]} is an engineer. She likes code.`,
      skills: skillsIn(text),
      experience: [
        {
          title: 'Engineer',
          company: 'Acme',
          start: '2020',
          end: 'Present',
          duration_months: years * 12,
          highlights: [],
        },
      ],
      education: [{ institution: 'State University', degree: 'B.S.', field: 'CS', year: '2015' }],
      projects: [],
      years_of_experience: years,
    };
    return Promise.resolve({
      profile,
      text,
      redacted_text: text.replace(profile.name, '[CANDIDATE]'),
      redacted_profile: {
        ...profile,
        name: '',
        email: null,
        summary: '[CANDIDATE] is an engineer. They like code.',
        education: [{ ...profile.education[0], year: null }],
      },
      entities: [],
      meta: { llm_provider: 'fake', source: 'heuristic', ner_provider: 'rule', char_count: text.length },
    });
  }

  analyzeJob(title: string, description: string): Promise<AnalyzeJobResponse> {
    this.calls.push('analyze');
    const [req, nice = ''] = description.split(/nice to have/i);
    const required = skillsIn(`${title} ${req}`);
    return Promise.resolve({
      analysis: {
        required_skills: required,
        nice_to_have_skills: skillsIn(nice).filter((s) => !required.includes(s)),
        min_years_experience: Number(/(\d+)\+?\s+years/.exec(description)?.[1] ?? 0),
        seniority: /senior/i.test(title) ? 'senior' : 'mid',
        keywords: required,
      },
      llm_provider: 'fake',
      source: 'heuristic',
    });
  }

  indexResume(id: string, text: string): Promise<void> {
    this.indexed.set(`resume:${id}`, text);
    return Promise.resolve();
  }

  indexJob(id: string, text: string): Promise<void> {
    this.indexed.set(`job:${id}`, text);
    return Promise.resolve();
  }

  deleteJob(id: string): Promise<void> {
    this.indexed.delete(`job:${id}`);
    return Promise.resolve();
  }

  deleteResume(id: string): Promise<void> {
    this.indexed.delete(`resume:${id}`);
    return Promise.resolve();
  }

  match(req: MatchRequest): Promise<MatchResult[]> {
    this.calls.push('match');
    const required = req.job.required_skills;
    return Promise.resolve(
      req.candidates.map((c) => {
        const have = new Set(c.skills.map((s) => s.toLowerCase()));
        const matched = required.filter((s) => have.has(s.toLowerCase()));
        const overlap = required.length ? matched.length / required.length : 0.5;
        const exp = req.job.min_years_experience
          ? Math.min(1, c.years_of_experience / req.job.min_years_experience)
          : 1;
        return {
          resume_id: c.resume_id,
          score: Math.round((0.5 * overlap + 0.3 * 0.6 + 0.2 * exp) * 1000) / 10,
          breakdown: {
            semantic_similarity: 0.6,
            skill_overlap: overlap,
            experience_fit: exp,
            weights: { semantic: 0.3, skills: 0.5, experience: 0.2 },
            matched_required: matched,
            missing_required: required.filter((s) => !matched.includes(s)),
            matched_nice_to_have: [],
            missing_nice_to_have: req.job.nice_to_have_skills,
            candidate_years: c.years_of_experience,
            required_years: req.job.min_years_experience,
            explanation: [`Matches ${matched.length}/${required.length} required skills.`],
          },
        };
      }),
    );
  }

  feedback(
    resumeText: string,
    _profile: ResumeProfile | null,
    job: FeedbackJob | null,
  ): Promise<FeedbackResponse> {
    this.calls.push('feedback');
    const have = skillsIn(resumeText);
    const missing = (job?.required_skills ?? []).filter((s) => !have.includes(s));
    return Promise.resolve({
      feedback: {
        ats_score: 70,
        checks: [{ id: 'contact_email', label: 'Email', passed: true, weight: 10, tip: 'Add email' }],
        missing_keywords: missing,
        present_keywords: have,
        bullet_rewrites: [
          { original: 'worked on stuff', suggestion: 'Developed stuff.', reason: 'Action verb' },
        ],
        strengths: ['Clear'],
        summary: 'Good',
      },
      llm_provider: 'fake',
      source: 'heuristic',
    });
  }

  interviewQuestions(profile: ResumeProfile, job: FeedbackJob, count = 8): Promise<InterviewResponse> {
    this.calls.push('interview');
    const questions = Array.from({ length: count }, (_, i) => ({
      question: `Q${i + 1}: tell me about ${profile.skills[i % Math.max(1, profile.skills.length)] ?? job.title}`,
      category: 'technical' as const,
      difficulty: 'medium' as const,
      rationale: 'test',
    }));
    return Promise.resolve({ questions, llm_provider: 'fake', source: 'heuristic' });
  }

  health(): Promise<AiHealth> {
    if (!this.healthy) return Promise.reject(new Error('down'));
    return Promise.resolve({
      status: 'ok',
      llm_provider: 'fake',
      embedding_provider: 'hashing',
      ner_provider: 'rule',
      vector_store: 'memory',
      version: 't',
    });
  }
}

export class CapturingMailer extends Mailer {
  sent: { to: string; email: RenderedEmail }[] = [];
  failNext = 0;

  send(to: string, email: RenderedEmail): Promise<void> {
    if (this.failNext > 0) {
      this.failNext--;
      return Promise.reject(new Error('smtp down'));
    }
    this.sent.push({ to, email });
    return Promise.resolve();
  }
}

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  ai: FakeAiClient;
  mailer: CapturingMailer;
  storage: MemoryStorage;
  http: () => ReturnType<typeof request>;
}

export async function createTestApp(): Promise<TestContext> {
  const ai = new FakeAiClient();
  const mailer = new CapturingMailer();
  const storage = new MemoryStorage();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AiClient)
    .useValue(ai)
    .overrideProvider(Mailer)
    .useValue(mailer)
    .overrideProvider(ObjectStorage)
    .useValue(storage)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma, ai, mailer, storage, http: () => request(app.getHttpServer()) };
}

export async function resetDb(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "ApplicationEvent","Application","ResumeFeedback","Resume","Job","RefreshToken","EmailLog","User" CASCADE',
  );
}

export async function waitFor<T>(
  fn: () => Promise<T | null | undefined | false>,
  timeoutMs = 10_000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 100));
  }
}

export async function registerUser(
  ctx: TestContext,
  role: 'CANDIDATE' | 'RECRUITER',
  email: string,
  extra: Record<string, string> = {},
): Promise<{ token: string; id: string; cookie: string }> {
  const res = await ctx
    .http()
    .post('/api/auth/register')
    .send({ email, password: 'Passw0rd!x', fullName: `User ${email.split('@')[0]}`, role, ...extra })
    .expect(201);
  const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0] ?? '';
  return { token: res.body.accessToken as string, id: res.body.user.id as string, cookie };
}

export async function makeAdmin(ctx: TestContext, email: string): Promise<string> {
  const user = await registerUser(ctx, 'CANDIDATE', email);
  await ctx.prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
  const res = await ctx.http().post('/api/auth/login').send({ email, password: 'Passw0rd!x' }).expect(200);
  return res.body.accessToken as string;
}

export const RESUME = (name: string, skills: string, years: number, location = 'Austin, TX') =>
  Buffer.from(
    `${name}\n${name.toLowerCase().replace(' ', '.')}@mail.com\nLocation: ${location}\nSKILLS\n${skills}\n${years} years of experience\n`,
  );
