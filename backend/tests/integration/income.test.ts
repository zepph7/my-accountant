import request from 'supertest';
import app from '../../src/app';
import { pool } from '../../src/config/db';

const RUN_ID = `it-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface Actor {
  token: string;
  userId: string;
  sourceId: string;
}

const makeActor = async (name: string): Promise<Actor> => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      email: `${RUN_ID}-${name}@test.local`,
      password: 'Str0ngPassphrase',
      firstName: 'Test',
      lastName: 'User',
      timezone: 'Africa/Nairobi',
    });

  const token = res.body.data.accessToken;
  const source = await request(app)
    .post('/api/income-sources')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Salary' });

  return { token, userId: res.body.data.user.id, sourceId: source.body.data.id };
};

let alice: Actor;
let bob: Actor;

beforeAll(async () => {
  alice = await makeActor('alice');
  bob = await makeActor('bob');
});

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`${RUN_ID}-%`]);
  await pool.end();
});

const auth = (a: Actor) => ({ Authorization: `Bearer ${a.token}` });

describe('POST /api/incomes — distribution', () => {
  it('records an income and distributes it across the seeded categories', async () => {
    const res = await request(app)
      .post('/api/incomes')
      .set(auth(alice))
      .send({ sourceId: alice.sourceId, date: '2026-07-25', amount: '1000.00', wallet: 'account' });

    expect(res.status).toBe(201);

    const amounts = res.body.data.distribution.map((d: { amount: string }) => d.amount);
    expect(amounts.sort()).toEqual(['100.00', '100.00', '200.00', '600.00']);
    expect(res.body.data.warning).toBeUndefined();
  });

  // The rounding invariant, verified through the real transaction rather than
  // only in the pure unit test.
  it('distributes an awkward amount so the splits sum exactly', async () => {
    const res = await request(app)
      .post('/api/incomes')
      .set(auth(alice))
      .send({ date: '2026-07-26', amount: '333.33', wallet: 'cash' });

    const total = res.body.data.distribution.reduce(
      (sum: number, d: { amount: string }) => sum + Math.round(Number(d.amount) * 100),
      0
    );
    expect(total).toBe(33333);
  });

  it('persists the distribution and returns it on GET', async () => {
    const createRes = await request(app)
      .post('/api/incomes')
      .set(auth(alice))
      .send({ date: '2026-07-27', amount: '500.00' });

    const getRes = await request(app)
      .get(`/api/incomes/${createRes.body.data.id}`)
      .set(auth(alice));

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.distribution).toHaveLength(4);
    expect(getRes.body.data.distribution[0].category_name).toBe('Essentials');
    expect(getRes.body.data.distribution[0].percentage_applied).toBe('60.00');
  });

  it('warns without blocking when percentages do not total 100', async () => {
    await pool.query(
      `UPDATE distribution_categories SET percentage = 10 WHERE user_id = $1 AND name = 'Essentials'`,
      [bob.userId]
    );

    const res = await request(app)
      .post('/api/incomes')
      .set(auth(bob))
      .send({ date: '2026-07-25', amount: '100.00' });

    expect(res.status).toBe(201);
    expect(res.body.data.warning).toMatch(/50\.00%/);
  });

  it('rejects a non-positive amount', async () => {
    const res = await request(app)
      .post('/api/incomes')
      .set(auth(alice))
      .send({ date: '2026-07-25', amount: '0' });

    expect(res.status).toBe(400);
  });

  it('rejects more than two decimal places', async () => {
    const res = await request(app)
      .post('/api/incomes')
      .set(auth(alice))
      .send({ date: '2026-07-25', amount: '10.999' });

    expect(res.status).toBe(400);
  });
});

/**
 * The single most important behaviour in a multi-tenant finance API: Alice must
 * not be able to read, modify, or delete anything belonging to Bob — even with
 * a valid token and a correct resource id.
 */
describe('tenant isolation', () => {
  let bobIncomeId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/incomes')
      .set(auth(bob))
      .send({ date: '2026-07-20', amount: '750.00' });
    bobIncomeId = res.body.data.id;
  });

  it("hides Bob's income from Alice's list", async () => {
    const res = await request(app).get('/api/incomes?limit=100').set(auth(alice));
    const ids = res.body.data.map((i: { id: string }) => i.id);

    expect(ids).not.toContain(bobIncomeId);
  });

  it("returns 404 when Alice fetches Bob's income by id", async () => {
    const res = await request(app).get(`/api/incomes/${bobIncomeId}`).set(auth(alice));
    expect(res.status).toBe(404);
  });

  it("returns 404 when Alice updates Bob's income", async () => {
    const res = await request(app)
      .patch(`/api/incomes/${bobIncomeId}`)
      .set(auth(alice))
      .send({ amount: '1.00' });

    expect(res.status).toBe(404);

    // And Bob's data is untouched.
    const check = await request(app).get(`/api/incomes/${bobIncomeId}`).set(auth(bob));
    expect(check.body.data.amount).toBe('750.00');
  });

  it("returns 404 when Alice deletes Bob's income", async () => {
    const res = await request(app).delete(`/api/incomes/${bobIncomeId}`).set(auth(alice));
    expect(res.status).toBe(404);

    const check = await request(app).get(`/api/incomes/${bobIncomeId}`).set(auth(bob));
    expect(check.status).toBe(200);
  });

  it("rejects attaching Alice's income to Bob's source", async () => {
    const res = await request(app)
      .post('/api/incomes')
      .set(auth(alice))
      .send({ sourceId: bob.sourceId, date: '2026-07-25', amount: '10.00' });

    expect(res.status).toBe(400);
  });

  it('requires authentication', async () => {
    expect((await request(app).get('/api/incomes')).status).toBe(401);
    expect((await request(app).get('/api/income-sources')).status).toBe(401);
  });
});

describe('PATCH /api/incomes/:id', () => {
  it('recomputes the distribution when the amount changes', async () => {
    const create = await request(app)
      .post('/api/incomes')
      .set(auth(alice))
      .send({ date: '2026-07-28', amount: '1000.00' });

    const res = await request(app)
      .patch(`/api/incomes/${create.body.data.id}`)
      .set(auth(alice))
      .send({ amount: '2000.00' });

    expect(res.status).toBe(200);
    const essentials = res.body.data.distribution.find(
      (d: { category_name: string }) => d.category_name === 'Essentials'
    );
    expect(essentials.amount).toBe('1200.00');
  });

  it('leaves the distribution alone when only notes change', async () => {
    const create = await request(app)
      .post('/api/incomes')
      .set(auth(alice))
      .send({ date: '2026-07-29', amount: '400.00' });

    const res = await request(app)
      .patch(`/api/incomes/${create.body.data.id}`)
      .set(auth(alice))
      .send({ notes: 'July bonus' });

    expect(res.status).toBe(200);
    expect(res.body.data.notes).toBe('July bonus');
    expect(res.body.data.distribution).toHaveLength(4);
  });
});

describe('DELETE /api/incomes/:id', () => {
  it('soft-deletes the income and its splits together', async () => {
    const create = await request(app)
      .post('/api/incomes')
      .set(auth(alice))
      .send({ date: '2026-07-30', amount: '600.00' });
    const id = create.body.data.id;

    expect((await request(app).delete(`/api/incomes/${id}`).set(auth(alice))).status).toBe(204);
    expect((await request(app).get(`/api/incomes/${id}`).set(auth(alice))).status).toBe(404);

    // Row survives for recovery; splits are soft-deleted alongside it.
    const row = await pool.query('SELECT deleted_at FROM incomes WHERE id = $1', [id]);
    expect(row.rows[0].deleted_at).not.toBeNull();

    const live = await pool.query(
      'SELECT COUNT(*)::int n FROM distributed_incomes WHERE income_id = $1 AND deleted_at IS NULL',
      [id]
    );
    expect(live.rows[0].n).toBe(0);
  });
});

describe('pagination and filtering', () => {
  it('returns pagination metadata', async () => {
    const res = await request(app).get('/api/incomes?page=1&limit=2').set(auth(alice));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(2);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 2 });
    expect(res.body.pagination.totalPages).toBeGreaterThanOrEqual(1);
  });

  it('filters by date range', async () => {
    const res = await request(app)
      .get('/api/incomes?from=2026-07-27&to=2026-07-29')
      .set(auth(alice));

    const dates = res.body.data.map((i: { date: string }) => i.date.slice(0, 10));
    expect(dates.every((d: string) => d >= '2026-07-27' && d <= '2026-07-29')).toBe(true);
  });

  it('filters by wallet', async () => {
    const res = await request(app).get('/api/incomes?wallet=cash').set(auth(alice));
    expect(res.body.data.every((i: { wallet: string }) => i.wallet === 'cash')).toBe(true);
  });

  it('rejects a limit above the cap', async () => {
    const res = await request(app).get('/api/incomes?limit=5000').set(auth(alice));
    expect(res.status).toBe(400);
  });

  // The ORDER BY allowlist — an arbitrary sort column must never reach SQL.
  it('rejects an unknown sort column', async () => {
    const res = await request(app).get('/api/incomes?sort=password_hash').set(auth(alice));
    expect(res.status).toBe(400);
  });
});
