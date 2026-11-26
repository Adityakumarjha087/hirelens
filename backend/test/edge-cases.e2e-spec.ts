import { ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ResumeRecoveryService } from '../src/resumes/resume-recovery.service';
import { createTestApp, registerUser, resetDb, RESUME, waitFor, type TestContext } from './helpers';

const JOB = {
  title: 'Platform Engineer 🚀',
  description: 'Requirements: 3+ years of experience with Go, Docker and Kubernetes in production environments.',
  location: 'Remote',
};
const NIL_UUID = '00000000-0000-4000-8000-000000000000';

describe('Edge cases & security (integration)', () => {
  let ctx: TestContext;
  let rec: { token: string; id: string };
  let rec2: { token: string; id: string };
  let cand: { token: string; id: string; cookie: string };
  let cand2: { token: string; id: string };
  let jobId: string;
  let resumeId: string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDb(ctx.prisma);
    rec = await registerUser(ctx, 'RECRUITER', 'r1@edge.io', { company: 'Edge' });
    rec2 = await registerUser(ctx, 'RECRUITER', 'r2@edge.io', { company: 'Other' });
    cand = await registerUser(ctx, 'CANDIDATE', 'c1@edge.io');
    cand2 = await registerUser(ctx, 'CANDIDATE', 'c2@edge.io');
    jobId = (await ctx.http().post('/api/jobs').set(auth(rec.token)).send(JOB).expect(201)).body.id;
    const up = await ctx
      .http()
      .post('/api/resumes')
      .set(auth(cand.token))
      .attach('file', RESUME('مريم Zoë 🚀', 'Go, Docker, Kubernetes', 5, 'Dubai'), 'résumé-مريم.txt')
      .expect(202);
    resumeId = up.body.id;
    await waitFor(async () => (await ctx.prisma.resume.findUnique({ where: { id: resumeId } }))?.status === 'PARSED');
  });
  afterAll(() => ctx.app.close());

  describe('input validation', () => {
    it('rejects empty / whitespace-only / oversized fields', async () => {
      await ctx.http().post('/api/auth/register').send({ email: 'w@x.io', password: 'Passw0rd!x', fullName: '    ', role: 'CANDIDATE' }).expect(400);
      await ctx.http().post('/api/jobs').set(auth(rec.token)).send({ ...JOB, title: '   ' }).expect(400);
      await ctx.http().post('/api/jobs').set(auth(rec.token)).send({ ...JOB, description: 'x'.repeat(20001) }).expect(400);
      await ctx.http().post('/api/jobs').set(auth(rec.token)).send({ ...JOB, requiredSkills: Array.from({ length: 41 }, (_, i) => `s${i}`) }).expect(400);
      await ctx.http().post('/api/jobs').set(auth(rec.token)).send({ ...JOB, salaryMin: -1 }).expect(400);
      await ctx.http().post('/api/jobs').set(auth(rec.token)).send('not json').set('Content-Type', 'application/json').expect(400);
      await ctx.http().post(`/api/jobs/${jobId}/applications`).set(auth(cand.token)).send({ coverLetter: 'x'.repeat(5001) }).expect(400);
    });

    it('rejects invalid UUIDs and returns 404 for unknown ids', async () => {
      for (const path of ['/api/jobs/123', '/api/applications/abc', '/api/resumes/not-a-uuid', "/api/jobs/1'%20OR%20'1'='1"]) {
        await ctx.http().get(path).set(auth(rec.token)).expect((r) => expect([400, 403]).toContain(r.status));
      }
      await ctx.http().get(`/api/jobs/${NIL_UUID}`).set(auth(cand.token)).expect(404);
      await ctx.http().get(`/api/applications/${NIL_UUID}`).set(auth(rec.token)).expect(404);
      await ctx.http().post('/api/feedback').set(auth(cand.token)).send({ resumeId: 'nope' }).expect(400);
    });

    it('enforces pagination bounds', async () => {
      await ctx.http().get('/api/jobs?page=0').set(auth(cand.token)).expect(400);
      await ctx.http().get('/api/jobs?pageSize=101').set(auth(cand.token)).expect(400);
      await ctx.http().get('/api/jobs?pageSize=abc').set(auth(cand.token)).expect(400);
      const far = await ctx.http().get('/api/jobs?page=9999').set(auth(cand.token)).expect(200);
      expect(far.body).toMatchObject({ items: [], page: 9999 });
      expect(far.body.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('files', () => {
    const up = (buf: Buffer, name: string) => ctx.http().post('/api/resumes').set(auth(cand.token)).attach('file', buf, name);

    it('rejects wrong MIME / spoofed extensions / empty and oversized files', async () => {
      await up(Buffer.from('MZ\x90\x00 executable'), 'cv.exe').expect(400);
      await up(Buffer.from('\x89PNG\r\n\x1a\n'), 'cv.pdf').expect(400);
      await up(Buffer.from('not a zip archive'), 'cv.docx').expect(400);
      await up(Buffer.from([0x41, 0x00, 0x42, 0x43]), 'cv.txt').expect(400);
      await up(Buffer.alloc(0), 'cv.txt').expect(400);
      await up(Buffer.alloc(5 * 1024 * 1024 + 10, 0x41), 'big.txt').expect(413);
      await up(Buffer.alloc(11 * 1024 * 1024, 0x41), 'huge.txt').expect(413);
    });

    it('marks corrupt-but-plausible files as FAILED instead of crashing', async () => {
      const res = await up(Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from('CORRUPT')]), 'broken.pdf').expect(202);
      const r = await waitFor(async () => {
        const row = await ctx.prisma.resume.findUnique({ where: { id: res.body.id } });
        return row?.status === 'FAILED' ? row : null;
      }, 20_000);
      expect(r.error).toBeTruthy();
      await ctx.http().delete(`/api/resumes/${res.body.id}`).set(auth(cand.token)).expect(204);
    });

    it('preserves unicode / RTL / emoji content and sanitises file names', async () => {
      const r = await ctx.http().get(`/api/resumes/${resumeId}`).set(auth(cand.token)).expect(200);
      expect(r.body.fileName).toBe('r_sum_-_.txt');
      expect(r.body.rawText).toContain('مريم Zoë 🚀');
      expect(r.body.location).toBe('Dubai');
      const j = await ctx.http().get(`/api/jobs?q=${encodeURIComponent('🚀')}`).set(auth(cand.token)).expect(200);
      expect(j.body.items[0].title).toBe('Platform Engineer 🚀');
    });
  });

  describe('authorization (no IDOR)', () => {
    let appId: string;
    beforeAll(async () => {
      appId = (await ctx.http().post(`/api/jobs/${jobId}/applications`).set(auth(cand.token)).send({}).expect(201)).body.id;
    });

    it('blocks other tenants from reading or mutating resources', async () => {
      await ctx.http().get(`/api/jobs/${jobId}/applications`).set(auth(rec2.token)).expect(403);
      await ctx.http().patch(`/api/applications/${appId}/stage`).set(auth(rec2.token)).send({ stage: 'OFFER' }).expect(403);
      await ctx.http().patch(`/api/applications/${appId}/notes`).set(auth(rec2.token)).send({ notes: 'x' }).expect(403);
      await ctx.http().post(`/api/applications/${appId}/interview-questions`).set(auth(rec2.token)).send({}).expect(403);
      await ctx.http().get(`/api/applications/${appId}`).set(auth(cand2.token)).expect(403);
      await ctx.http().get(`/api/resumes/${resumeId}`).set(auth(cand2.token)).expect(403);
      await ctx.http().get(`/api/resumes/${resumeId}/file`).set(auth(cand2.token)).expect(403);
      await ctx.http().get(`/api/resumes/${resumeId}/file`).set(auth(rec2.token)).expect(403);
      await ctx.http().post('/api/feedback').set(auth(cand2.token)).send({ resumeId }).expect(403);
      await ctx.http().delete(`/api/jobs/${jobId}`).set(auth(rec2.token)).expect(403);
      await ctx.http().post(`/api/jobs/${jobId}/applications`).set(auth(cand2.token)).send({ resumeId }).expect(400);
      // Wrong role
      await ctx.http().patch(`/api/applications/${appId}/stage`).set(auth(cand.token)).send({ stage: 'OFFER' }).expect(403);
      await ctx.http().get('/api/analytics/platform').set(auth(rec.token)).expect(403);
    });

    it('rejects expired, tampered and wrongly signed tokens', async () => {
      const jwt = ctx.app.get(JwtService);
      const payload = { sub: cand.id, email: 'c1@edge.io', role: 'RECRUITER', name: 'x' };
      const expired = await jwt.signAsync(payload, { expiresIn: 1 });
      await new Promise((r) => setTimeout(r, 1500));
      await ctx.http().get('/api/auth/me').set(auth(expired)).expect(401);
      const forged = await jwt.signAsync(payload, { secret: 'attacker-secret-attacker-secret' });
      await ctx.http().get(`/api/jobs/${jobId}/applications`).set(auth(forged)).expect(401);
      const [h, , s] = cand.token.split('.');
      const body = Buffer.from(JSON.stringify({ ...payload, role: 'ADMIN', iss: 'hirelens' })).toString('base64url');
      await ctx.http().get('/api/admin/users').set(auth(`${h}.${body}.${s}`)).expect(401);
      await ctx.http().get('/api/auth/me').set('Authorization', 'Basic abc').expect(401);
    });
  });

  describe('concurrency & idempotency', () => {
    it('allows exactly one application under concurrent duplicate submissions', async () => {
      const c = await registerUser(ctx, 'CANDIDATE', 'race@edge.io');
      const up = await ctx.http().post('/api/resumes').set(auth(c.token)).attach('file', RESUME('Race Cond', 'Go', 2), 'r.txt').expect(202);
      await waitFor(async () => (await ctx.prisma.resume.findUnique({ where: { id: up.body.id } }))?.status === 'PARSED');
      const results = await Promise.all(
        Array.from({ length: 6 }, () => ctx.http().post(`/api/jobs/${jobId}/applications`).set(auth(c.token)).send({})),
      );
      const codes = results.map((r) => r.status).sort();
      expect(codes.filter((x) => x === 201)).toHaveLength(1);
      expect(codes.filter((x) => x === 409)).toHaveLength(5);
      expect(await ctx.prisma.application.count({ where: { candidateId: c.id } })).toBe(1);
    });

    it('handles concurrent duplicate registrations with a clean 409', async () => {
      const body = { email: 'dupe@edge.io', password: 'Passw0rd!x', fullName: 'Dupe', role: 'CANDIDATE' };
      const res = await Promise.all(Array.from({ length: 4 }, () => ctx.http().post('/api/auth/register').send(body)));
      expect(res.map((r) => r.status).sort()).toEqual([201, 409, 409, 409]);
      for (const r of res.filter((x) => x.status === 409)) expect(r.body.message).not.toMatch(/prisma|constraint/i);
    });

    it('lets only one concurrent refresh succeed with the same token', async () => {
      const u = await registerUser(ctx, 'CANDIDATE', 'refresh-race@edge.io');
      const res = await Promise.all(Array.from({ length: 4 }, () => ctx.http().post('/api/auth/refresh').set('Cookie', u.cookie)));
      expect(res.filter((r) => r.status === 200)).toHaveLength(1);
    });

    it('keeps a consistent history under concurrent stage moves', async () => {
      const app = await ctx.prisma.application.findFirstOrThrow({ where: { jobId, candidateId: cand.id } });
      const stages = ['SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED'];
      const res = await Promise.all(stages.map((stage) => ctx.http().patch(`/api/applications/${app.id}/stage`).set(auth(rec.token)).send({ stage })));
      expect(res.every((r) => r.status === 200)).toBe(true);
      const final = await ctx.prisma.application.findUniqueOrThrow({ where: { id: app.id }, include: { events: true } });
      expect(stages).toContain(final.stage);
      expect(final.events.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('injection attempts', () => {
    it('treats SQL injection payloads as plain data', async () => {
      const payload = `'; DROP TABLE "User"; --`;
      const res = await ctx.http().get(`/api/jobs?q=${encodeURIComponent(payload)}&location=${encodeURIComponent("' OR 1=1 --")}`).set(auth(cand.token)).expect(200);
      expect(res.body.items).toEqual([]);
      await ctx.http().get(`/api/jobs/${jobId}/applications?skills=${encodeURIComponent("a') OR ('1'='1")}`).set(auth(rec.token)).expect(200);
      expect(await ctx.prisma.user.count()).toBeGreaterThan(0);
    });

    it('stores XSS payloads verbatim as JSON (rendered escaped by the UI) and escapes emails', async () => {
      const xss = '<img src=x onerror=alert(1)>';
      const job = await ctx.http().post('/api/jobs').set(auth(rec.token)).send({ ...JOB, title: `Dev ${xss}` }).expect(201);
      expect(job.body.title).toBe(`Dev ${xss}`);
      expect(job.headers['content-type']).toMatch(/application\/json/);
      expect(job.headers['x-content-type-options']).toBe('nosniff');
      const c = await registerUser(ctx, 'CANDIDATE', 'xss@edge.io', { fullName: `Eve ${xss}` });
      const up = await ctx.http().post('/api/resumes').set(auth(c.token)).attach('file', RESUME('Eve X', 'Go', 1), 'e.txt').expect(202);
      await waitFor(async () => (await ctx.prisma.resume.findUnique({ where: { id: up.body.id } }))?.status === 'PARSED');
      await ctx.http().post(`/api/jobs/${job.body.id}/applications`).set(auth(c.token)).send({}).expect(201);
      const mail = await waitFor(async () => ctx.mailer.sent.find((m) => m.to === 'xss@edge.io'));
      expect(mail.email.html).not.toContain('<img src=x');
      expect(mail.email.html).toContain('&lt;img');
    });
  });

  describe('upstream AI failures', () => {
    it('returns a clean 503 when the AI service is down and creates nothing', async () => {
      const analyze = jest.spyOn(ctx.ai, 'analyzeJob').mockRejectedValueOnce(new ServiceUnavailableException('AI service unavailable'));
      const before = await ctx.prisma.job.count();
      const res = await ctx.http().post('/api/jobs').set(auth(rec.token)).send(JOB).expect(503);
      expect(res.body).toMatchObject({ statusCode: 503, message: 'AI service unavailable' });
      expect(await ctx.prisma.job.count()).toBe(before);
      analyze.mockRestore();

      const c = await registerUser(ctx, 'CANDIDATE', 'down@edge.io');
      const up = await ctx.http().post('/api/resumes').set(auth(c.token)).attach('file', RESUME('Down Time', 'Go', 4), 'd.txt').expect(202);
      await waitFor(async () => (await ctx.prisma.resume.findUnique({ where: { id: up.body.id } }))?.status === 'PARSED');
      jest.spyOn(ctx.ai, 'match').mockRejectedValueOnce(new Error('socket hang up: secret internal detail'));
      const apply = await ctx.http().post(`/api/jobs/${jobId}/applications`).set(auth(c.token)).send({}).expect(500);
      expect(JSON.stringify(apply.body)).not.toContain('secret internal detail');
      expect(await ctx.prisma.application.count({ where: { candidateId: c.id } })).toBe(0);
    });

    it('keeps the main flow working when email delivery fails (retries via queue)', async () => {
      ctx.mailer.failNext = 1;
      const app = await ctx.prisma.application.findFirstOrThrow({ where: { jobId, candidateId: cand.id } });
      const target = app.stage === 'INTERVIEW' ? 'OFFER' : 'INTERVIEW';
      await ctx.http().patch(`/api/applications/${app.id}/stage`).set(auth(rec.token)).send({ stage: target }).expect(200);
      const log = await waitFor(async () =>
        ctx.prisma.emailLog.findFirst({ where: { to: 'c1@edge.io', template: 'stage_changed', status: 'SENT' }, orderBy: { createdAt: 'desc' } }),
      15_000);
      expect(ctx.mailer.failNext).toBe(0); // first attempt failed, BullMQ retry delivered it
      expect(log.sentAt).not.toBeNull();
    });
  });

  describe('queue recovery', () => {
    it('requeues resumes stuck in PROCESSING and fails ones that are hopelessly old', async () => {
      const c = await registerUser(ctx, 'CANDIDATE', 'stuck@edge.io');
      const key = `resumes/${c.id}/stuck.txt`;
      await ctx.storage.put(key, RESUME('Stuck Worker', 'Go, Docker', 3), 'text/plain');
      const stuck = await ctx.prisma.resume.create({
        data: { candidateId: c.id, fileKey: key, fileName: 'stuck.txt', mimeType: 'text/plain', sizeBytes: 10, status: 'PROCESSING' },
      });
      const ancient = await ctx.prisma.resume.create({
        data: { candidateId: c.id, fileKey: key, fileName: 'old.txt', mimeType: 'text/plain', sizeBytes: 10, status: 'PENDING', createdAt: new Date(Date.now() - 3_600_000) },
      });
      await ctx.prisma.$executeRaw`UPDATE "Resume" SET "updatedAt" = now() - interval '10 minutes' WHERE id IN (${stuck.id}::uuid, ${ancient.id}::uuid)`;
      const result = await ctx.app.get(ResumeRecoveryService).sweep();
      expect(result).toEqual({ requeued: 1, failed: 1 });
      await waitFor(async () => (await ctx.prisma.resume.findUnique({ where: { id: stuck.id } }))?.status === 'PARSED');
      expect((await ctx.prisma.resume.findUniqueOrThrow({ where: { id: ancient.id } })).status).toBe('FAILED');
      expect(await ctx.app.get(ResumeRecoveryService).sweep()).toEqual({ requeued: 0, failed: 0 });
    });
  });

  describe('rate limiting', () => {
    it('throttles brute-force login attempts with 429', async () => {
      const attempts = await Promise.all(
        Array.from({ length: 25 }, () => ctx.http().post('/api/auth/login').send({ email: 'c1@edge.io', password: 'wrong' })),
      );
      const codes = attempts.map((a) => a.status);
      expect(codes).toContain(429);
      expect(codes.filter((c) => c === 401).length).toBeLessThanOrEqual(20);
    });
  });
});
