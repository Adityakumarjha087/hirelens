import {
  createTestApp,
  makeAdmin,
  registerUser,
  resetDb,
  RESUME,
  waitFor,
  type TestContext,
} from './helpers';

const JOB = {
  title: 'Senior Backend Engineer',
  description:
    'Requirements: 5+ years of experience with Python, PostgreSQL, Kafka and Docker. Nice to have: Kubernetes and Go.',
  location: 'Austin, TX',
  remote: true,
  blindScreening: true,
};

describe('Hiring flow (integration)', () => {
  let ctx: TestContext;
  let recruiter: { token: string; id: string };
  let other: { token: string };
  let alice: { token: string; id: string };
  let bob: { token: string; id: string };
  let jobId: string;
  let aliceResume: string;
  let aliceApp: string;
  let bobApp: string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDb(ctx.prisma);
    recruiter = await registerUser(ctx, 'RECRUITER', 'rec@corp.io', { company: 'Corp' });
    other = await registerUser(ctx, 'RECRUITER', 'other@corp.io');
    alice = await registerUser(ctx, 'CANDIDATE', 'alice@mail.com');
    bob = await registerUser(ctx, 'CANDIDATE', 'bob@mail.com');
  });
  afterAll(() => ctx.app.close());

  const upload = (token: string, buf: Buffer, name: string) =>
    ctx.http().post('/api/resumes').set(auth(token)).attach('file', buf, name);

  const parsed = (token: string, id: string) =>
    waitFor(async () => {
      const r = await ctx.http().get(`/api/resumes/${id}`).set(auth(token));
      return r.body.status === 'PARSED' || r.body.status === 'FAILED' ? r.body : null;
    });

  it('uploads resumes and parses them asynchronously through the queue', async () => {
    const res = await upload(
      alice.token,
      RESUME('Alice Smith', 'Python, PostgreSQL, Kafka, Docker, Kubernetes', 7),
      'alice.txt',
    ).expect(202);
    expect(res.body).toMatchObject({ status: 'PENDING', isPrimary: true, mimeType: 'text/plain' });
    aliceResume = res.body.id;
    const done = await parsed(alice.token, aliceResume);
    expect(done.status).toBe('PARSED');
    expect(done.skills).toEqual(expect.arrayContaining(['Python', 'Kafka']));
    expect(done.yearsExperience).toBe(7);
    expect(ctx.ai.indexed.has(`resume:${aliceResume}`)).toBe(true);

    const pdf = Buffer.concat([
      Buffer.from('%PDF-1.4\n'),
      RESUME('Bob Jones', 'React, TypeScript', 2, 'Berlin'),
    ]);
    const bobRes = await upload(bob.token, pdf, 'bob.pdf').expect(202);
    expect(bobRes.body.mimeType).toBe('application/pdf');
    expect((await parsed(bob.token, bobRes.body.id)).status).toBe('PARSED');

    const list = await ctx.http().get('/api/resumes').set(auth(alice.token)).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].rawText).toBeUndefined();
  });

  it('rejects bad uploads and protects resumes', async () => {
    await upload(alice.token, Buffer.from('\x89PNG...'), 'photo.png').expect(400);
    await ctx.http().post('/api/resumes').set(auth(alice.token)).expect(400);
    await upload(recruiter.token, RESUME('X', 'Go', 1), 'x.txt').expect(403);
    await ctx.http().get(`/api/resumes/${aliceResume}`).set(auth(bob.token)).expect(403);
    const corrupt = await upload(alice.token, Buffer.from('CORRUPT resume content here'), 'bad.txt').expect(
      202,
    );
    const failed = await waitFor(async () => {
      const r = await ctx.prisma.resume.findUnique({ where: { id: corrupt.body.id } });
      return r?.status === 'FAILED' ? r : null;
    }, 20_000);
    expect(failed.error).toMatch(/Could not read/);
    await ctx.http().delete(`/api/resumes/${corrupt.body.id}`).set(auth(alice.token)).expect(204);
  });

  it('creates a job with AI-extracted skills and lists it', async () => {
    const preview = await ctx
      .http()
      .post('/api/jobs/analyze')
      .set(auth(recruiter.token))
      .send({ title: JOB.title, description: JOB.description })
      .expect(200);
    expect(preview.body.required_skills).toEqual(['Python', 'PostgreSQL', 'Kafka', 'Docker']);

    const res = await ctx.http().post('/api/jobs').set(auth(recruiter.token)).send(JOB).expect(201);
    jobId = res.body.id;
    expect(res.body).toMatchObject({
      company: 'Corp',
      requiredSkills: ['Python', 'PostgreSQL', 'Kafka', 'Docker'],
      niceToHaveSkills: ['Go', 'Kubernetes'],
      minYearsExperience: 5,
      seniority: 'senior',
      status: 'OPEN',
    });
    expect(ctx.ai.indexed.has(`job:${jobId}`)).toBe(true);

    await ctx.http().post('/api/jobs').set(auth(alice.token)).send(JOB).expect(403);
    await ctx
      .http()
      .post('/api/jobs')
      .set(auth(recruiter.token))
      .send({ ...JOB, description: 'short' })
      .expect(400);
    const draft = await ctx
      .http()
      .post('/api/jobs')
      .set(auth(recruiter.token))
      .send({ ...JOB, title: 'Draft role', status: 'DRAFT' })
      .expect(201);

    const pub = await ctx
      .http()
      .get('/api/jobs?q=backend&skills=Kafka&remote=true')
      .set(auth(alice.token))
      .expect(200);
    expect(pub.body.items.map((j: { id: string }) => j.id)).toEqual([jobId]);
    await ctx.http().get(`/api/jobs/${draft.body.id}`).set(auth(alice.token)).expect(404);
    const mine = await ctx.http().get('/api/jobs?mine=true').set(auth(recruiter.token)).expect(200);
    expect(mine.body.total).toBe(2);
    const otherMine = await ctx.http().get('/api/jobs?mine=true').set(auth(other.token)).expect(200);
    expect(otherMine.body.total).toBe(0);
    await ctx.http().patch(`/api/jobs/${jobId}`).set(auth(other.token)).send({ remote: false }).expect(403);
    await ctx.http().delete(`/api/jobs/${draft.body.id}`).set(auth(recruiter.token)).expect(204);
  });

  it('applies with explainable match scores and notifies both sides via the email queue', async () => {
    const a = await ctx
      .http()
      .post(`/api/jobs/${jobId}/applications`)
      .set(auth(alice.token))
      .send({ coverLetter: 'Hi!' })
      .expect(201);
    aliceApp = a.body.id;
    expect(a.body.matchScore).toBeGreaterThan(80);
    expect(a.body.scoreBreakdown.matched_required).toEqual(['Python', 'PostgreSQL', 'Kafka', 'Docker']);
    const b = await ctx
      .http()
      .post(`/api/jobs/${jobId}/applications`)
      .set(auth(bob.token))
      .send({})
      .expect(201);
    bobApp = b.body.id;
    expect(b.body.matchScore).toBeLessThan(a.body.matchScore);
    await ctx.http().post(`/api/jobs/${jobId}/applications`).set(auth(alice.token)).send({}).expect(409);

    const job = await ctx.http().get(`/api/jobs/${jobId}`).set(auth(alice.token)).expect(200);
    expect(job.body.myApplicationId).toBe(aliceApp);

    await waitFor(() => Promise.resolve(ctx.mailer.sent.length >= 4));
    const subjects = ctx.mailer.sent.map((m) => `${m.to}:${m.email.subject}`);
    expect(subjects).toEqual(
      expect.arrayContaining([
        'alice@mail.com:Application received: Senior Backend Engineer',
        'rec@corp.io:New applicant for Senior Backend Engineer',
      ]),
    );
    const logs = await waitFor(async () => {
      const l = await ctx.prisma.emailLog.findMany({ where: { status: 'SENT' } });
      return l.length >= 4 ? l : null;
    });
    expect(logs.length).toBeGreaterThanOrEqual(4);
  });

  it('ranks and filters candidates with blind screening applied', async () => {
    const res = await ctx
      .http()
      .get(`/api/jobs/${jobId}/applications`)
      .set(auth(recruiter.token))
      .expect(200);
    expect(res.body.map((x: { id: string }) => x.id)).toEqual([aliceApp, bobApp]);
    const top = res.body[0];
    expect(top.blind).toBe(true);
    expect(top.candidate.name).toMatch(/^Candidate [0-9A-F]{4}$/);
    expect(top.candidate.email).toBeNull();
    expect(top.resume.profile.name).toBe('');
    expect(top.resume.profile.education[0].year).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain('Alice');

    const q = (s: string) =>
      ctx.http().get(`/api/jobs/${jobId}/applications?${s}`).set(auth(recruiter.token));
    expect((await q('minScore=80').expect(200)).body).toHaveLength(1);
    expect((await q('skills=python,kafka').expect(200)).body).toHaveLength(1);
    expect((await q('location=berlin').expect(200)).body[0].id).toBe(bobApp);
    expect((await q('minYears=3&maxYears=10').expect(200)).body).toHaveLength(1);
    expect((await q('sort=recent').expect(200)).body[0].id).toBe(bobApp);
    await q('minScore=500').expect(400);
    await ctx.http().get(`/api/jobs/${jobId}/applications`).set(auth(other.token)).expect(403);
    await ctx.http().get(`/api/jobs/${jobId}/applications`).set(auth(alice.token)).expect(403);

    const detail = await ctx
      .http()
      .get(`/api/applications/${aliceApp}`)
      .set(auth(recruiter.token))
      .expect(200);
    expect(detail.body.resumeText).toContain('[CANDIDATE]');
    expect(detail.body.resumeText).not.toContain('Alice Smith');
    await ctx.http().get(`/api/resumes/${aliceResume}/file`).set(auth(recruiter.token)).expect(403);
  });

  it('moves applications through the Kanban pipeline and reveals identity after screening', async () => {
    const s = await ctx
      .http()
      .patch(`/api/applications/${aliceApp}/stage`)
      .set(auth(recruiter.token))
      .send({ stage: 'SCREENING', position: 0 })
      .expect(200);
    expect(s.body.blind).toBe(true);
    const i = await ctx
      .http()
      .patch(`/api/applications/${aliceApp}/stage`)
      .set(auth(recruiter.token))
      .send({ stage: 'INTERVIEW' })
      .expect(200);
    expect(i.body.blind).toBe(false);
    expect(i.body.candidate.name).toBe('User alice');
    const file = await ctx
      .http()
      .get(`/api/resumes/${aliceResume}/file`)
      .set(auth(recruiter.token))
      .expect(200);
    expect(file.headers['content-disposition']).toContain('alice.txt');
    await ctx
      .http()
      .patch(`/api/applications/${aliceApp}/stage`)
      .set(auth(recruiter.token))
      .send({ stage: 'OFFER' })
      .expect(200);
    await ctx
      .http()
      .patch(`/api/applications/${bobApp}/stage`)
      .set(auth(recruiter.token))
      .send({ stage: 'REJECTED' })
      .expect(200);
    await ctx
      .http()
      .patch(`/api/applications/${bobApp}/stage`)
      .set(auth(recruiter.token))
      .send({ stage: 'HIRED' })
      .expect(400);
    await ctx
      .http()
      .patch(`/api/applications/${bobApp}/stage`)
      .set(auth(alice.token))
      .send({ stage: 'OFFER' })
      .expect(403);

    const detail = await ctx
      .http()
      .get(`/api/applications/${aliceApp}`)
      .set(auth(recruiter.token))
      .expect(200);
    expect(detail.body.events.map((e: { toStage: string }) => e.toStage)).toEqual([
      'APPLIED',
      'SCREENING',
      'INTERVIEW',
      'OFFER',
    ]);
    await waitFor(() =>
      Promise.resolve(ctx.mailer.sent.some((m) => m.email.subject.startsWith('Application update'))),
    );

    const mine = await ctx.http().get('/api/applications/mine').set(auth(alice.token)).expect(200);
    expect(mine.body[0]).toMatchObject({ stage: 'OFFER', job: { title: 'Senior Backend Engineer' } });
    const own = await ctx.http().get(`/api/applications/${aliceApp}`).set(auth(alice.token)).expect(200);
    expect(own.body.recruiterNotes).toBeNull();
    await ctx.http().get(`/api/applications/${aliceApp}`).set(auth(bob.token)).expect(403);
  });

  it('generates and caches interview questions; stores notes', async () => {
    const q1 = await ctx
      .http()
      .post(`/api/applications/${aliceApp}/interview-questions`)
      .set(auth(recruiter.token))
      .send({ count: 5 })
      .expect(200);
    expect(q1.body).toHaveLength(5);
    const calls = ctx.ai.calls.filter((c) => c === 'interview').length;
    await ctx
      .http()
      .post(`/api/applications/${aliceApp}/interview-questions`)
      .set(auth(recruiter.token))
      .send({})
      .expect(200);
    expect(ctx.ai.calls.filter((c) => c === 'interview').length).toBe(calls);
    const q3 = await ctx
      .http()
      .post(`/api/applications/${aliceApp}/interview-questions`)
      .set(auth(recruiter.token))
      .send({ regenerate: true, count: 3 })
      .expect(200);
    expect(q3.body).toHaveLength(3);
    await ctx
      .http()
      .patch(`/api/applications/${aliceApp}/notes`)
      .set(auth(recruiter.token))
      .send({ notes: 'Strong system design' })
      .expect(200);
    const d = await ctx.http().get(`/api/applications/${aliceApp}`).set(auth(recruiter.token)).expect(200);
    expect(d.body.recruiterNotes).toBe('Strong system design');
    expect(d.body.interviewQuestions).toHaveLength(3);
  });

  it('rescores applicants when job requirements change', async () => {
    const before = (await ctx.prisma.application.findUniqueOrThrow({ where: { id: bobApp } })).matchScore;
    await ctx
      .http()
      .patch(`/api/jobs/${jobId}`)
      .set(auth(recruiter.token))
      .send({ requiredSkills: ['React', 'TypeScript'] })
      .expect(200);
    const after = (await ctx.prisma.application.findUniqueOrThrow({ where: { id: bobApp } })).matchScore;
    expect(after).toBeGreaterThan(before);
    const r = await ctx
      .http()
      .post(`/api/jobs/${jobId}/applications/rescore`)
      .set(auth(recruiter.token))
      .expect(200);
    expect(r.body.rescored).toBe(2);
    await ctx
      .http()
      .patch(`/api/jobs/${jobId}`)
      .set(auth(recruiter.token))
      .send({ description: JOB.description + ' Updated text here.' })
      .expect(200);
  });

  it('gives candidates AI resume feedback with keyword gaps', async () => {
    const fb = await ctx
      .http()
      .post('/api/feedback')
      .set(auth(bob.token))
      .send({
        resumeId: (await ctx.prisma.resume.findFirstOrThrow({ where: { candidateId: bob.id } })).id,
        jobId,
      })
      .expect(201);
    expect(fb.body.atsScore).toBe(70);
    expect(fb.body.result.bullet_rewrites).toHaveLength(1);
    expect(fb.body.jobTitle).toBe('Senior Backend Engineer');
    const hist = await ctx.http().get('/api/feedback').set(auth(bob.token)).expect(200);
    expect(hist.body).toHaveLength(1);
    await ctx
      .http()
      .post('/api/feedback')
      .set(auth(alice.token))
      .send({ resumeId: fb.body.resumeId })
      .expect(403);
    await ctx
      .http()
      .post('/api/feedback')
      .set(auth(bob.token))
      .send({ resumeId: fb.body.resumeId, jobId: '00000000-0000-0000-0000-000000000000' })
      .expect(404);
  });

  it('serves recruiter analytics: applicants per job, average score, time-to-hire, funnel', async () => {
    await ctx.prisma.application.update({
      where: { id: aliceApp },
      data: {
        createdAt: new Date(Date.now() - 10 * 86_400_000),
        offeredAt: new Date(Date.now() - 3 * 86_400_000),
      },
    });
    const res = await ctx
      .http()
      .get('/api/analytics/recruiter?days=14')
      .set(auth(recruiter.token))
      .expect(200);
    expect(res.body.totals).toMatchObject({
      jobs: 1,
      openJobs: 1,
      applicants: 2,
      offers: 1,
      avgTimeToHireDays: 7,
    });
    expect(res.body.totals.avgMatchScore).toBeGreaterThan(0);
    expect(res.body.applicantsPerJob[0]).toMatchObject({ jobId, applicants: 2 });
    expect(res.body.stageFunnel).toEqual(
      expect.arrayContaining([
        { stage: 'OFFER', count: 1 },
        { stage: 'REJECTED', count: 1 },
      ]),
    );
    expect(res.body.applicationsOverTime).toHaveLength(14);
    expect(res.body.scoreDistribution.reduce((s: number, b: { count: number }) => s + b.count, 0)).toBe(2);
    expect(res.body.timeToHireByJob[0].days).toBe(7);
    expect(res.body.topSkills.length).toBeGreaterThan(0);
    await ctx.http().get('/api/analytics/recruiter').set(auth(alice.token)).expect(403);
    const admin = await makeAdmin(ctx, 'boss@corp.io');
    const plat = await ctx.http().get('/api/analytics/platform').set(auth(admin)).expect(200);
    expect(plat.body.usersByRole.CANDIDATE).toBeGreaterThanOrEqual(2);
    const all = await ctx.http().get('/api/analytics/recruiter').set(auth(admin)).expect(200);
    expect(all.body.totals.jobs).toBe(1);
  });

  it('manages resumes: primary flag, reprocess, delete protection', async () => {
    const second = await upload(alice.token, RESUME('Alice Smith', 'Go, AWS', 3), 'alice2.txt').expect(202);
    expect(second.body.isPrimary).toBe(false);
    await parsed(alice.token, second.body.id);
    const p = await ctx
      .http()
      .patch(`/api/resumes/${second.body.id}/primary`)
      .set(auth(alice.token))
      .expect(200);
    expect(p.body.isPrimary).toBe(true);
    await ctx.http().post(`/api/resumes/${second.body.id}/reprocess`).set(auth(alice.token)).expect(202);
    await parsed(alice.token, second.body.id);
    await ctx.http().delete(`/api/resumes/${aliceResume}`).set(auth(alice.token)).expect(400);
    await ctx.http().delete(`/api/resumes/${second.body.id}`).set(auth(alice.token)).expect(204);
    await ctx.http().get(`/api/resumes/${second.body.id}`).set(auth(alice.token)).expect(404);
  });

  it('closes jobs and blocks new applications', async () => {
    await ctx
      .http()
      .patch(`/api/jobs/${jobId}`)
      .set(auth(recruiter.token))
      .send({ status: 'CLOSED' })
      .expect(200);
    const carol = await registerUser(ctx, 'CANDIDATE', 'carol@mail.com');
    await ctx.http().post(`/api/jobs/${jobId}/applications`).set(auth(carol.token)).send({}).expect(404);
    const job = await ctx.prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.closedAt).not.toBeNull();
  });
});
