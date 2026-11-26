import { createTestApp, makeAdmin, registerUser, resetDb, type TestContext } from './helpers';

describe('Auth (integration)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDb(ctx.prisma);
  });
  afterAll(() => ctx.app.close());

  it('registers, returns an httpOnly refresh cookie and never leaks the password hash', async () => {
    const res = await ctx
      .http()
      .post('/api/auth/register')
      .send({ email: 'Alice@Example.com ', password: 'Passw0rd!x', fullName: ' Alice ', role: 'CANDIDATE' })
      .expect(201);
    expect(res.body.user).toMatchObject({ email: 'alice@example.com', fullName: 'Alice', role: 'CANDIDATE' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.accessToken).toEqual(expect.any(String));
    const cookie = ([] as string[]).concat(res.headers['set-cookie'])[0];
    expect(cookie).toMatch(/hl_refresh=.+HttpOnly/);
    expect(cookie).toMatch(/Path=\/api\/auth/);
  });

  it('rejects duplicate emails, weak passwords, admin self-registration and unknown fields', async () => {
    const base = { email: 'alice@example.com', password: 'Passw0rd!x', fullName: 'Alice', role: 'CANDIDATE' };
    await ctx.http().post('/api/auth/register').send(base).expect(409);
    const weak = await ctx
      .http()
      .post('/api/auth/register')
      .send({ ...base, email: 'b@x.io', password: 'short' })
      .expect(400);
    expect(weak.body).toMatchObject({ statusCode: 400, message: 'Validation failed' });
    expect(weak.body.details.join(' ')).toMatch(/password/);
    await ctx
      .http()
      .post('/api/auth/register')
      .send({ ...base, email: 'c@x.io', role: 'ADMIN' })
      .expect(400);
    await ctx
      .http()
      .post('/api/auth/register')
      .send({ ...base, email: 'd@x.io', isAdmin: true })
      .expect(400);
  });

  it('logs in and serves /me; rejects bad credentials with a generic message', async () => {
    const ok = await ctx
      .http()
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'Passw0rd!x' })
      .expect(200);
    const me = await ctx
      .http()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${ok.body.accessToken}`)
      .expect(200);
    expect(me.body.email).toBe('alice@example.com');
    const bad = await ctx
      .http()
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'nope' })
      .expect(401);
    const unknown = await ctx
      .http()
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: 'nope' })
      .expect(401);
    expect(bad.body.message).toBe(unknown.body.message);
    await ctx.http().get('/api/auth/me').expect(401);
    await ctx.http().get('/api/auth/me').set('Authorization', 'Bearer garbage').expect(401);
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const { cookie } = await registerUser(ctx, 'RECRUITER', 'rot@example.com', { company: 'Acme' });
    const first = await ctx.http().post('/api/auth/refresh').set('Cookie', cookie).expect(200);
    const rotated = ([] as string[]).concat(first.headers['set-cookie'])[0];
    expect(rotated).not.toEqual(cookie);
    expect(first.body.user.role).toBe('RECRUITER');
    // Re-using the old token is treated as theft: the whole family is revoked.
    await ctx.http().post('/api/auth/refresh').set('Cookie', cookie).expect(401);
    await ctx.http().post('/api/auth/refresh').set('Cookie', rotated).expect(401);
  });

  it('accepts the refresh token in the body and logs out', async () => {
    const { cookie } = await registerUser(ctx, 'CANDIDATE', 'body@example.com');
    const token = /hl_refresh=([^;]+)/.exec(cookie)![1];
    const res = await ctx.http().post('/api/auth/refresh').send({ refreshToken: token }).expect(200);
    const next = /hl_refresh=([^;]+)/.exec(([] as string[]).concat(res.headers['set-cookie'])[0])![1];
    await ctx.http().post('/api/auth/logout').send({ refreshToken: next }).expect(204);
    await ctx.http().post('/api/auth/refresh').send({ refreshToken: next }).expect(401);
    await ctx.http().post('/api/auth/refresh').send({}).expect(401);
    await ctx.http().post('/api/auth/logout').send({}).expect(204);
  });

  it('enforces RBAC and lets admins manage users', async () => {
    const cand = await registerUser(ctx, 'CANDIDATE', 'rbac@example.com');
    await ctx.http().get('/api/admin/users').set('Authorization', `Bearer ${cand.token}`).expect(403);
    const admin = await makeAdmin(ctx, 'root@example.com');
    const list = await ctx
      .http()
      .get('/api/admin/users?role=CANDIDATE&q=rbac')
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.total).toBe(1);
    const upd = await ctx
      .http()
      .patch(`/api/admin/users/${cand.id}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ isActive: false })
      .expect(200);
    expect(upd.body.isActive).toBe(false);
    await ctx
      .http()
      .post('/api/auth/login')
      .send({ email: 'rbac@example.com', password: 'Passw0rd!x' })
      .expect(401);
    const me = await ctx.http().get('/api/auth/me').set('Authorization', `Bearer ${admin}`).expect(200);
    await ctx
      .http()
      .patch(`/api/admin/users/${me.body.id}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ role: 'CANDIDATE' })
      .expect(400);
    await ctx
      .http()
      .patch('/api/admin/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${admin}`)
      .send({ role: 'RECRUITER' })
      .expect(404);
    await ctx
      .http()
      .patch('/api/admin/users/not-a-uuid')
      .set('Authorization', `Bearer ${admin}`)
      .send({})
      .expect(400);
  });

  it('reports health including dependency checks', async () => {
    const res = await ctx.http().get('/api/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.database.status).toBe('up');
    expect(res.body.checks.redis.status).toBe('up');
    ctx.ai.healthy = false;
    const degraded = await ctx.http().get('/api/health').expect(200);
    expect(degraded.body.status).toBe('degraded');
    ctx.ai.healthy = true;
    expect(res.headers['x-request-id']).toBeDefined();
  });
});
