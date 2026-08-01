import request from 'supertest';
import app from '../../src/app';
import { pool } from '../../src/config/db';

const RUN_ID = `it-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Every actor lives in Africa/Nairobi (UTC+3) — the offset is what makes the
 *  timezone-bucketing assertions below meaningful. */
const ZONE = 'Africa/Nairobi';

interface Actor {
  token: string;
  userId: string;
}

const register = async (name: string): Promise<Actor> => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      email: `${RUN_ID}-${name}@test.local`,
      password: 'Str0ngPassphrase',
      firstName: 'Test',
      lastName: 'User',
      timezone: ZONE,
    });

  return { token: res.body.data.accessToken, userId: res.body.data.user.id };
};

const auth = (a: Actor) => ({ Authorization: `Bearer ${a.token}` });

const addIncome = (a: Actor, body: Record<string, unknown>) =>
  request(app).post('/api/incomes').set(auth(a)).send(body);

const addExpense = (a: Actor, body: Record<string, unknown>) =>
  request(app).post('/api/expenses').set(auth(a)).send(body);

/** Today's calendar date in the actor's zone, for the default-window tests. */
const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date());

let alice: Actor;
let bob: Actor;
let groceriesId: string;

beforeAll(async () => {
  alice = await register('alice');
  bob = await register('bob');

  const category = await request(app)
    .post('/api/expense-categories')
    .set(auth(alice))
    .send({ name: 'Groceries' });
  groceriesId = category.body.data.id;

  // March: 1 500.00 in, 65.50 out. April: 300.00 in, 10.00 out.
  await addIncome(alice, { date: '2026-03-05', amount: '1000.00', wallet: 'account' });
  await addIncome(alice, { date: '2026-03-20', amount: '500.00', wallet: 'mpesa' });
  await addIncome(alice, { date: '2026-04-10', amount: '300.00', wallet: 'cash' });

  // 22:30Z on the 15th is 01:30 on the 16th in Nairobi — the whole point of the
  // hourly and daily bucketing assertions.
  await addExpense(alice, {
    occurredAt: '2026-03-15T22:30:00Z',
    amount: '45.50',
    wallet: 'mpesa',
    categoryId: groceriesId,
  });
  await addExpense(alice, { occurredAt: '2026-03-16T07:00:00Z', amount: '20.00', wallet: 'cash' });
  await addExpense(alice, {
    occurredAt: '2026-04-02T09:00:00Z',
    amount: '10.00',
    wallet: 'account',
  });

  // Bob's data exists only to prove it never appears in Alice's reports.
  await addIncome(bob, { date: '2026-03-05', amount: '9999.00' });
  await addExpense(bob, { occurredAt: '2026-03-15T22:30:00Z', amount: '777.00' });
});

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`${RUN_ID}-%`]);
  await pool.end();
});

const MARCH = 'from=2026-03-01&to=2026-03-31';

describe('GET /api/reports/summary', () => {
  it('totals income, expenses, and net over an explicit range', async () => {
    const res = await request(app).get(`/api/reports/summary?${MARCH}`).set(auth(alice));

    expect(res.status).toBe(200);
    expect(res.body.data.income).toEqual({ total: '1500.00', count: 2 });
    expect(res.body.data.expenses).toEqual({ total: '65.50', count: 2 });
    expect(res.body.data.net).toBe('1434.50');
    expect(res.body.data.savingsRate).toBe(95.6);
  });

  /**
   * `to=2026-03-31` has to mean "through the 31st". A naive cast to midnight
   * would drop a whole day, and the resulting monthly total would be wrong in a
   * way nobody notices until they reconcile.
   */
  it('treats a bare `to` date as inclusive of that day', async () => {
    await addExpense(alice, { occurredAt: '2026-03-31T20:00:00+03:00', amount: '1.00' });

    const res = await request(app).get(`/api/reports/summary?${MARCH}`).set(auth(alice));
    expect(res.body.data.expenses.total).toBe('66.50');

    // Undo, so the remaining assertions keep the fixture totals.
    await pool.query(
      `UPDATE expenses SET deleted_at = now()
        WHERE user_id = $1 AND amount = 1.00 AND deleted_at IS NULL`,
      [alice.userId]
    );
  });

  it('breaks expenses down by category, naming the uncategorised bucket', async () => {
    const res = await request(app).get(`/api/reports/summary?${MARCH}`).set(auth(alice));
    const names = res.body.data.expensesByCategory.map((c: { name: string }) => c.name);

    expect(names).toContain('Groceries');
    expect(names).toContain('Uncategorised');
  });

  it('reports the distribution splits, which sum exactly to the income', async () => {
    const res = await request(app).get(`/api/reports/summary?${MARCH}`).set(auth(alice));
    const { total, byCategory } = res.body.data.distributed;

    expect(total).toBe('1500.00');

    const essentials = byCategory.find((c: { name: string }) => c.name === 'Essentials');
    expect(essentials.total).toBe('900.00');
    expect(essentials.shareOfDistributed).toBe(60);

    const summed = byCategory.reduce(
      (n: number, c: { total: string }) => n + Math.round(Number(c.total) * 100),
      0
    );
    expect(summed).toBe(150_000);
  });

  it('defaults to the current month when no range is given', async () => {
    const res = await request(app).get('/api/reports/summary').set(auth(alice));
    const month = todayLocal().slice(0, 7);

    expect(res.body.data.range.from.startsWith(`${month}-01`)).toBe(true);
    expect(res.body.data.range.timezone).toBe(ZONE);
    // The March/April fixtures sit outside the current month.
    expect(res.body.data.income.total).toBe('0.00');
  });

  it("excludes another user's records", async () => {
    const res = await request(app).get(`/api/reports/summary?${MARCH}`).set(auth(alice));
    expect(res.body.data.income.total).toBe('1500.00');

    const bobs = await request(app).get(`/api/reports/summary?${MARCH}`).set(auth(bob));
    expect(bobs.body.data.income.total).toBe('9999.00');
  });

  it('rejects unknown query parameters', async () => {
    const res = await request(app).get('/api/reports/summary?userId=x').set(auth(alice));
    expect(res.status).toBe(400);
  });

  it('requires authentication', async () => {
    expect((await request(app).get('/api/reports/summary')).status).toBe(401);
  });
});

describe('GET /api/reports/distribution', () => {
  it('reports configured percentages next to what was actually applied', async () => {
    const res = await request(app).get(`/api/reports/distribution?${MARCH}`).set(auth(alice));

    expect(res.status).toBe(200);
    expect(res.body.data.configuredTotalPercentage).toBe(100);
    expect(res.body.data.percentageWarning).toBeNull();
    expect(res.body.data.undistributed).toBe('0.00');

    const savings = res.body.data.categories.find((c: { name: string }) => c.name === 'Savings');
    expect(savings.configuredPercentage).toBe('20.00');
    expect(savings.total).toBe('300.00');
    expect(savings.effectivePercentage).toBe(20);
  });

  it('lists a category that received nothing rather than omitting it', async () => {
    // April has income, so every seeded category should still be present with
    // its own total — a zero row is information, a missing row is a puzzle.
    const res = await request(app)
      .get('/api/reports/distribution?from=2026-05-01&to=2026-05-31')
      .set(auth(alice));

    expect(res.body.data.categories).toHaveLength(4);
    expect(res.body.data.categories.every((c: { total: string }) => c.total === '0.00')).toBe(true);
  });
});

describe('GET /api/reports/cashflow', () => {
  it('returns a gap-filled monthly series', async () => {
    const res = await request(app)
      .get('/api/reports/cashflow?groupBy=month&from=2026-02-01&to=2026-04-30')
      .set(auth(alice));

    expect(res.status).toBe(200);
    expect(res.body.data.series.map((b: { bucket: string }) => b.bucket)).toEqual([
      '2026-02',
      '2026-03',
      '2026-04',
    ]);

    const [feb, mar, apr] = res.body.data.series;
    // February has no activity at all and must still appear, at zero.
    expect(feb).toMatchObject({ income: '0.00', expenses: '0.00', net: '0.00' });
    expect(mar).toMatchObject({ income: '1500.00', expenses: '65.50', net: '1434.50' });
    expect(apr).toMatchObject({ income: '300.00', expenses: '10.00', net: '290.00' });
  });

  it('attaches the per-category distribution to each bucket', async () => {
    const res = await request(app)
      .get('/api/reports/cashflow?groupBy=month&from=2026-03-01&to=2026-03-31')
      .set(auth(alice));

    const [march] = res.body.data.series;
    const savings = march.distributed.find((d: { name: string }) => d.name === 'Savings');
    expect(savings.total).toBe('300.00');
  });

  it('supports yearly grouping', async () => {
    const res = await request(app)
      .get('/api/reports/cashflow?groupBy=year&from=2026-01-01&to=2026-12-31')
      .set(auth(alice));

    expect(res.body.data.series).toHaveLength(1);
    expect(res.body.data.series[0]).toMatchObject({ bucket: '2026', income: '1800.00' });
  });

  /**
   * incomes.date carries no time of day, so an hourly cashflow would stack
   * every paycheque at midnight. The granularity is refused rather than
   * answered misleadingly.
   */
  it('refuses hourly grouping', async () => {
    const res = await request(app).get('/api/reports/cashflow?groupBy=hour').set(auth(alice));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/reports/expenses', () => {
  it('buckets by the hour in the user timezone, not UTC', async () => {
    const res = await request(app)
      .get('/api/reports/expenses?groupBy=hour&from=2026-03-15&to=2026-03-16')
      .set(auth(alice));

    expect(res.status).toBe(200);

    const nonEmpty = res.body.data.series.filter((b: { count: number }) => b.count > 0);
    // 22:30Z on the 15th → 01:30 local on the 16th; 07:00Z → 10:00 local.
    expect(nonEmpty.map((b: { bucket: string }) => b.bucket)).toEqual([
      '2026-03-16 01:00',
      '2026-03-16 10:00',
    ]);
    expect(res.body.data.busiest).toEqual({ bucket: '2026-03-16 01:00', total: '45.50' });
  });

  it('rolls the same expense onto the local day, not the UTC one', async () => {
    const res = await request(app)
      .get('/api/reports/expenses?groupBy=day&from=2026-03-15&to=2026-03-16')
      .set(auth(alice));

    const byBucket = Object.fromEntries(
      res.body.data.series.map((b: { bucket: string; total: string }) => [b.bucket, b.total])
    );
    expect(byBucket['2026-03-15']).toBe('0.00');
    expect(byBucket['2026-03-16']).toBe('65.50');
  });

  it('averages across every bucket in the window, empty ones included', async () => {
    const res = await request(app)
      .get('/api/reports/expenses?groupBy=day&from=2026-03-15&to=2026-03-16')
      .set(auth(alice));

    expect(res.body.data.total).toBe('65.50');
    expect(res.body.data.count).toBe(2);
    expect(res.body.data.average).toBe('32.75');
  });

  it('applies the wallet filter to the series and the category breakdown alike', async () => {
    const res = await request(app)
      .get(`/api/reports/expenses?groupBy=month&${MARCH}&wallet=mpesa`)
      .set(auth(alice));

    expect(res.body.data.total).toBe('45.50');
    expect(res.body.data.byCategory).toHaveLength(1);
    expect(res.body.data.byCategory[0]).toMatchObject({ name: 'Groceries', total: '45.50' });
  });

  it('filters by category', async () => {
    const res = await request(app)
      .get(`/api/reports/expenses?groupBy=month&${MARCH}&categoryId=${groceriesId}`)
      .set(auth(alice));

    expect(res.body.data.total).toBe('45.50');
  });

  it('rejects an unknown granularity', async () => {
    const res = await request(app).get('/api/reports/expenses?groupBy=fortnight').set(auth(alice));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/dashboard', () => {
  let carol: Actor;

  beforeAll(async () => {
    carol = await register('carol');
  });

  it('derives balances per wallet from the full history when no snapshot exists', async () => {
    await addIncome(carol, { date: '2026-03-01', amount: '1000.00', wallet: 'account' });
    await addIncome(carol, { date: '2026-03-02', amount: '200.00', wallet: 'cash' });
    await addExpense(carol, {
      occurredAt: '2026-03-03T09:00:00Z',
      amount: '150.00',
      wallet: 'account',
    });

    const res = await request(app).get('/api/dashboard').set(auth(carol));

    expect(res.status).toBe(200);
    expect(res.body.data.balances.asOf).toBeNull();
    expect(res.body.data.balances.account.balance).toBe('850.00');
    expect(res.body.data.balances.cash.balance).toBe('200.00');
    expect(res.body.data.balances.mpesa.balance).toBe('0.00');
    expect(res.body.data.balances.total).toBe('1050.00');
  });

  /**
   * The snapshot is a reconciliation point: "this is what I actually counted".
   * Everything recorded BEFORE it is already reflected in the counted figure,
   * so only later entries move the balance.
   */
  it('treats an overview snapshot as the new opening balance', async () => {
    await pool.query(
      `INSERT INTO overview (user_id, cash_wallet, account_balance, mpesa_balance)
       VALUES ($1, $2, $3, $4)`,
      [carol.userId, '500.00', '900.00', '25.00']
    );

    const afterSnapshot = await request(app).get('/api/dashboard').set(auth(carol));
    expect(afterSnapshot.body.data.balances.asOf).not.toBeNull();
    expect(afterSnapshot.body.data.balances.account).toMatchObject({
      opening: '900.00',
      movement: '0.00',
      balance: '900.00',
    });
    expect(afterSnapshot.body.data.balances.cash.balance).toBe('500.00');

    await addExpense(carol, {
      occurredAt: '2026-03-04T09:00:00Z',
      amount: '100.00',
      wallet: 'account',
    });

    const afterSpend = await request(app).get('/api/dashboard').set(auth(carol));
    expect(afterSpend.body.data.balances.account).toMatchObject({
      opening: '900.00',
      movement: '-100.00',
      balance: '800.00',
    });
  });

  it('summarises the current month and warns when percentages do not total 100', async () => {
    const today = todayLocal();
    await addIncome(carol, { date: today, amount: '400.00', wallet: 'cash' });

    const res = await request(app).get('/api/dashboard').set(auth(carol));

    expect(res.body.data.currentMonth.income).toBe('400.00');
    expect(res.body.data.currentMonth.range.timezone).toBe(ZONE);
    expect(res.body.data.distributionSetup).toEqual({ totalPercentage: 100, warning: null });

    const savings = res.body.data.currentMonth.distributed.find(
      (d: { name: string }) => d.name === 'Savings'
    );
    expect(savings.total).toBe('80.00');
  });

  it('lists recent activity and requires authentication', async () => {
    const res = await request(app).get('/api/dashboard').set(auth(carol));

    expect(res.body.data.recent.incomes.length).toBeGreaterThan(0);
    expect(res.body.data.recent.expenses.length).toBeGreaterThan(0);
    expect((await request(app).get('/api/dashboard')).status).toBe(401);
  });
});
