import request from 'supertest';
import app from '../../src/app';
import { pool } from '../../src/config/db';

const RUN_ID = `it-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface Actor {
  token: string;
  userId: string;
  categoryId: string;
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
  const category = await request(app)
    .post('/api/expense-categories')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Groceries' });

  return { token, userId: res.body.data.user.id, categoryId: category.body.data.id };
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

describe('POST /api/expenses', () => {
  it('records an expense with no distribution', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set(auth(alice))
      .send({
        categoryId: alice.categoryId,
        occurredAt: '2026-07-25T19:30:00+03:00',
        amount: '45.50',
        description: 'Weekly shop',
        payee: 'Naivas',
        wallet: 'mpesa',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe('45.50');
    expect(res.body.data.wallet).toBe('mpesa');
    // Expenses are recorded freely — no splits, by design.
    expect(res.body.data.distribution).toBeUndefined();
  });

  it('accepts a bare date when the exact time is unknown', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set(auth(alice))
      .send({ occurredAt: '2026-07-24', amount: '10.00' });

    expect(res.status).toBe(201);
  });

  it('preserves the instant across the timezone offset', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set(auth(alice))
      .send({ occurredAt: '2026-07-23T21:15:00+03:00', amount: '12.00' });

    // 21:15 in Nairobi is 18:15 UTC — the instant must survive the round trip.
    expect(new Date(res.body.data.occurred_at).toISOString()).toBe('2026-07-23T18:15:00.000Z');
  });

  it('rejects a non-positive amount', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set(auth(alice))
      .send({ occurredAt: '2026-07-25', amount: '0' });

    expect(res.status).toBe(400);
  });

  it('rejects unknown fields', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set(auth(alice))
      .send({ occurredAt: '2026-07-25', amount: '5.00', userId: bob.userId });

    expect(res.status).toBe(400);
  });
});

describe('tenant isolation — expenses', () => {
  let bobExpenseId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set(auth(bob))
      .send({ occurredAt: '2026-07-22T10:00:00+03:00', amount: '99.00' });
    bobExpenseId = res.body.data.id;
  });

  it("hides Bob's expense from Alice's list", async () => {
    const res = await request(app).get('/api/expenses?limit=100').set(auth(alice));
    expect(res.body.data.map((e: { id: string }) => e.id)).not.toContain(bobExpenseId);
  });

  it("returns 404 for Alice reading, updating, or deleting Bob's expense", async () => {
    expect((await request(app).get(`/api/expenses/${bobExpenseId}`).set(auth(alice))).status).toBe(404);
    expect(
      (await request(app).patch(`/api/expenses/${bobExpenseId}`).set(auth(alice)).send({ amount: '1.00' }))
        .status
    ).toBe(404);
    expect((await request(app).delete(`/api/expenses/${bobExpenseId}`).set(auth(alice))).status).toBe(404);

    const check = await request(app).get(`/api/expenses/${bobExpenseId}`).set(auth(bob));
    expect(check.body.data.amount).toBe('99.00');
  });

  it("rejects attaching Alice's expense to Bob's category", async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set(auth(alice))
      .send({ categoryId: bob.categoryId, occurredAt: '2026-07-25', amount: '5.00' });

    expect(res.status).toBe(400);
  });

  it('requires authentication', async () => {
    expect((await request(app).get('/api/expenses')).status).toBe(401);
    expect((await request(app).get('/api/expense-categories')).status).toBe(401);
  });
});

describe('filtering', () => {
  /**
   * The inclusive-end-of-day case. occurred_at is a TIMESTAMPTZ, so a bare
   * `to=2026-07-25` naively casts to midnight and would exclude everything that
   * happened during that day.
   */
  it('includes same-day expenses when `to` is a bare date', async () => {
    await request(app)
      .post('/api/expenses')
      .set(auth(alice))
      .send({ occurredAt: '2026-07-26T23:45:00+03:00', amount: '7.00' });

    const res = await request(app)
      .get('/api/expenses?from=2026-07-26&to=2026-07-26&limit=100')
      .set(auth(alice));

    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('filters by category and wallet', async () => {
    const byCategory = await request(app)
      .get(`/api/expenses?categoryId=${alice.categoryId}&limit=100`)
      .set(auth(alice));
    expect(
      byCategory.body.data.every((e: { category_id: string }) => e.category_id === alice.categoryId)
    ).toBe(true);

    const byWallet = await request(app).get('/api/expenses?wallet=mpesa&limit=100').set(auth(alice));
    expect(byWallet.body.data.every((e: { wallet: string }) => e.wallet === 'mpesa')).toBe(true);
  });

  it('searches description and payee', async () => {
    const res = await request(app).get('/api/expenses?search=Naivas&limit=100').set(auth(alice));
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('rejects an unknown sort column', async () => {
    const res = await request(app).get('/api/expenses?sort=user_id').set(auth(alice));
    expect(res.status).toBe(400);
  });
});

describe('expense categories', () => {
  it('rejects a duplicate name differing only in case', async () => {
    await request(app).post('/api/expense-categories').set(auth(alice)).send({ name: 'Transport' });
    const res = await request(app)
      .post('/api/expense-categories')
      .set(auth(alice))
      .send({ name: 'transport' });

    expect(res.status).toBe(409);
  });

  it('allows two users to hold the same category name', async () => {
    const res = await request(app)
      .post('/api/expense-categories')
      .set(auth(bob))
      .send({ name: 'Transport' });

    expect(res.status).toBe(201);
  });

  it('soft-deletes and frees the name for reuse', async () => {
    const create = await request(app)
      .post('/api/expense-categories')
      .set(auth(alice))
      .send({ name: 'Temporary' });

    expect(
      (await request(app).delete(`/api/expense-categories/${create.body.data.id}`).set(auth(alice)))
        .status
    ).toBe(204);

    // The partial unique index only covers live rows, so the name is reusable.
    const again = await request(app)
      .post('/api/expense-categories')
      .set(auth(alice))
      .send({ name: 'Temporary' });

    expect(again.status).toBe(201);
  });
});
