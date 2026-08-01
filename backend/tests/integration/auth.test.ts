import request from 'supertest';
import app from '../../src/app';
import { pool } from '../../src/config/db';

/**
 * Integration tests run against the real database.
 *
 * Every user created here carries a unique, recognisable email so the afterAll
 * cleanup can remove exactly this run's rows and nothing else — parallel runs
 * or a developer's own data must never be touched. Deleting the user cascades
 * to refresh_tokens and distribution_categories.
 */
const RUN_ID = `it-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const emailFor = (name: string) => `${RUN_ID}-${name}@test.local`;

const VALID_PASSWORD = 'Str0ngPassphrase';

const registerPayload = (name: string) => ({
  email: emailFor(name),
  password: VALID_PASSWORD,
  firstName: 'Test',
  lastName: 'User',
  timezone: 'Africa/Nairobi',
});

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`${RUN_ID}-%`]);
  await pool.end();
});

describe('POST /api/auth/register', () => {
  it('creates an account and returns a token pair', async () => {
    const res = await request(app).post('/api/auth/register').send(registerPayload('happy'));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
    expect(res.body.data.user.email).toBe(emailFor('happy'));
    // The hash must never cross the wire.
    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  it('seeds the four default distribution categories totalling 100%', async () => {
    const res = await request(app).post('/api/auth/register').send(registerPayload('seed'));
    const userId = res.body.data.user.id;

    const { rows } = await pool.query<{ name: string; percentage: string }>(
      'SELECT name, percentage FROM distribution_categories WHERE user_id = $1 ORDER BY percentage DESC',
      [userId]
    );

    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.name)).toEqual([
      'Essentials',
      'Savings',
      'Investments',
      'Emergency',
    ]);
    expect(rows.reduce((sum, r) => sum + Number(r.percentage), 0)).toBe(100);
  });

  it('rejects a duplicate email with 409', async () => {
    await request(app).post('/api/auth/register').send(registerPayload('dupe'));
    const res = await request(app).post('/api/auth/register').send(registerPayload('dupe'));

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('rejects a duplicate email differing only in case', async () => {
    await request(app).post('/api/auth/register').send(registerPayload('case'));
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...registerPayload('case'), email: emailFor('case').toUpperCase() });

    expect(res.status).toBe(409);
  });

  it('rejects a weak password with 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...registerPayload('weak'), password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('password');
  });

  it('rejects unknown fields rather than silently dropping them', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...registerPayload('extra'), role: 'admin' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  beforeAll(async () => {
    await request(app).post('/api/auth/register').send(registerPayload('login'));
  });

  it('signs in with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: emailFor('login'), password: VALID_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
  });

  it('returns the same error for a wrong password and an unknown email', async () => {
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: emailFor('login'), password: 'WrongPassword1' });

    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: emailFor('nobody'), password: VALID_PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    // Identical wording — otherwise the endpoint enumerates accounts.
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });
});

describe('GET /api/auth/me', () => {
  it('rejects a request with no token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a tampered token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.real.token');

    expect(res.status).toBe(401);
  });

  it('returns the authenticated user', async () => {
    const reg = await request(app).post('/api/auth/register').send(registerPayload('me'));
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${reg.body.data.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(emailFor('me'));
    expect(res.body.data.timezone).toBe('Africa/Nairobi');
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates the refresh token', async () => {
    const reg = await request(app).post('/api/auth/register').send(registerPayload('rotate'));
    const original = reg.body.data.refreshToken;

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: original });

    expect(res.status).toBe(200);
    expect(res.body.data.refreshToken).not.toBe(original);
  });

  // The security property that makes rotation worth having.
  it('detects reuse and revokes every session for that user', async () => {
    const reg = await request(app).post('/api/auth/register').send(registerPayload('reuse'));
    const stolen = reg.body.data.refreshToken;

    const first = await request(app).post('/api/auth/refresh').send({ refreshToken: stolen });
    expect(first.status).toBe(200);

    // Replaying the already-rotated token.
    const replay = await request(app).post('/api/auth/refresh').send({ refreshToken: stolen });
    expect(replay.status).toBe(401);
    expect(replay.body.message).toMatch(/reuse detected/i);

    // The legitimate successor must now be dead too.
    const successor = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: first.body.data.refreshToken });
    expect(successor.status).toBe(401);
  });

  it('rejects an unknown refresh token', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'nope' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the refresh token and is idempotent', async () => {
    const reg = await request(app).post('/api/auth/register').send(registerPayload('logout'));
    const token = reg.body.data.refreshToken;

    expect((await request(app).post('/api/auth/logout').send({ refreshToken: token })).status).toBe(200);
    // Second logout still succeeds — a dead session is not an error.
    expect((await request(app).post('/api/auth/logout').send({ refreshToken: token })).status).toBe(200);
    // But the token can no longer be exchanged.
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: token })).status).toBe(401);
  });
});

describe('health probes', () => {
  it('reports liveness without touching the database', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('reports readiness including the database', async () => {
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body.checks.database).toBe('up');
  });
});
