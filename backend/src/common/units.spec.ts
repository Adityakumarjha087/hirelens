import { BadRequestException, HttpException, HttpStatus, type ArgumentsHost } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { candidateAlias, isBlind, profileFor } from '../applications/anonymize';
import { durationToSeconds, validateEnv } from '../config/configuration';
import { renderEmail } from '../notifications/templates';
import { detectResumeType, safeFileName } from '../resumes/file-type';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';

function host() {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const h = {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ url: '/x', id: 'req-1' }) }),
  } as unknown as ArgumentsHost;
  return { h, res };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();
  const run = (err: unknown) => {
    const { h, res } = host();
    filter.catch(err, h);
    return {
      status: res.status.mock.calls[0][0] as number,
      body: res.json.mock.calls[0][0] as Record<string, unknown>,
    };
  };

  it('formats HttpExceptions and validation errors', () => {
    expect(run(new BadRequestException(['a must be string']))).toMatchObject({
      status: 400,
      body: { message: 'Validation failed', details: ['a must be string'] },
    });
    expect(run(new HttpException('teapot', 418)).body).toMatchObject({
      message: 'teapot',
      requestId: 'req-1',
    });
    expect(run(new HttpException({ message: 'x', details: { f: 1 } }, 409)).body.details).toEqual({ f: 1 });
  });

  it('maps Prisma errors and masks unknown errors', () => {
    const p = (code: string) => new Prisma.PrismaClientKnownRequestError('m', { code, clientVersion: 'x' });
    expect(run(p('P2002')).status).toBe(HttpStatus.CONFLICT);
    expect(run(p('P2025')).status).toBe(HttpStatus.NOT_FOUND);
    const unknown = run(new Error('db password is hunter2'));
    expect(unknown.status).toBe(500);
    expect(JSON.stringify(unknown.body)).not.toContain('hunter2');
  });
});

describe('config', () => {
  it('parses durations', () => {
    expect(durationToSeconds('15m')).toBe(900);
    expect(durationToSeconds('2h')).toBe(7200);
    expect(durationToSeconds('7d')).toBe(604800);
    expect(durationToSeconds('45')).toBe(45);
    expect(() => durationToSeconds('soon')).toThrow();
  });

  it('validates env and coerces types', () => {
    const cfg = validateEnv({
      DATABASE_URL: 'postgres://x',
      JWT_ACCESS_SECRET: 'x'.repeat(20),
      PORT: '4000',
      COOKIE_SECURE: 'true',
    });
    expect(cfg.PORT).toBe(4000);
    expect(cfg.COOKIE_SECURE).toBe(true);
    expect(() => validateEnv({ DATABASE_URL: 'x', JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });
});

describe('email templates', () => {
  it('renders every template and escapes HTML', () => {
    const vars = {
      name: '<b>Eve</b>',
      jobTitle: 'Dev',
      company: 'Co',
      score: 88,
      role: 'CANDIDATE',
      stage: 'INTERVIEW',
    };
    for (const t of ['welcome', 'application_received', 'new_applicant', 'stage_changed'] as const) {
      const e = renderEmail(t, vars);
      expect(e.subject.length).toBeGreaterThan(5);
      expect(e.html).not.toContain('<b>Eve</b>');
      expect(e.html).toContain('&lt;b&gt;Eve&lt;/b&gt;');
    }
    expect(renderEmail('stage_changed', { stage: 'WEIRD', jobTitle: 'x' }).text).toContain('moved to WEIRD');
  });
});

describe('file type detection', () => {
  it('sniffs magic bytes, not extensions', () => {
    expect(detectResumeType('cv.pdf', Buffer.from('%PDF-1.7'))).toBe('application/pdf');
    expect(detectResumeType('cv.docx', Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toMatch(/wordprocessingml/);
    expect(detectResumeType('cv.pdf', Buffer.from('MZ evil'))).toBeNull();
    expect(detectResumeType('cv.txt', Buffer.from('plain'))).toBe('text/plain');
    expect(detectResumeType('cv.txt', Buffer.from([0x41, 0x00, 0x42]))).toBeNull();
    expect(safeFileName('../../etc/pass wd.txt')).toBe('pass_wd.txt');
    expect(safeFileName('')).toBe('resume');
  });
});

describe('anonymization', () => {
  it('applies only during initial screening stages', () => {
    expect(isBlind({ blindScreening: true }, 'APPLIED')).toBe(true);
    expect(isBlind({ blindScreening: true }, 'INTERVIEW')).toBe(false);
    expect(isBlind({ blindScreening: false }, 'APPLIED')).toBe(false);
    expect(candidateAlias('abc')).toMatch(/^Candidate [0-9A-F]{4}$/);
    expect(candidateAlias('abc')).toBe(candidateAlias('abc'));
    const profile = { name: 'Ann', email: 'a@x', phone: '1' } as never;
    expect(profileFor({ profile }, true)).toMatchObject({ name: '', email: null, phone: null });
    expect(profileFor({ profile, redactedProfile: { name: '' } }, true)).toEqual({ name: '' });
    expect(profileFor(null, false)).toBeNull();
  });
});
