import { SeedService } from '../src/seed/seed.service';
import { CANDIDATES, renderResume } from '../src/seed/seed-data';
import { createTestApp, resetDb, type TestContext } from './helpers';

describe('Seed (integration)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDb(ctx.prisma);
  });
  afterAll(() => ctx.app.close());

  it('seeds a realistic, usable dataset once', async () => {
    const seed = ctx.app.get(SeedService);
    expect(await seed.seedIfEmpty()).toBe(true);
    expect(await ctx.prisma.user.count()).toBe(1 + 2 + CANDIDATES.length);
    expect(await ctx.prisma.job.count()).toBe(5);
    expect(await ctx.prisma.application.count()).toBe(16);
    expect(await ctx.prisma.resume.count({ where: { status: 'PARSED' } })).toBe(CANDIDATES.length);
    const offers = await ctx.prisma.application.count({
      where: { stage: 'OFFER', offeredAt: { not: null } },
    });
    expect(offers).toBe(3);
    expect(await seed.seedIfEmpty()).toBe(false);
    const login = await ctx
      .http()
      .post('/api/auth/login')
      .send({ email: 'recruiter@hirelens.dev', password: 'Password123!' })
      .expect(200);
    expect(login.body.user.role).toBe('RECRUITER');
  });

  it('renders resumes with standard sections', () => {
    const text = renderResume(CANDIDATES[0]);
    for (const h of ['SUMMARY', 'SKILLS', 'EXPERIENCE', 'EDUCATION', 'PROJECTS']) expect(text).toContain(h);
  });

  it('reports failure without throwing', async () => {
    await resetDb(ctx.prisma);
    const seed = ctx.app.get(SeedService);
    jest.spyOn(seed, 'seed').mockRejectedValueOnce(new Error('boom'));
    expect(await seed.seedIfEmpty()).toBe(false);
  });
});
