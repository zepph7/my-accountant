import type { PoolClient } from 'pg';
import { pool } from '../config/db';

type Executor = Pick<PoolClient, 'query'> | typeof pool;

/**
 * Reporting reads.
 *
 * Everything here is read-only aggregation, and every statement is scoped by
 * user_id in its own WHERE clause — a report is the easiest place to leak
 * another tenant's totals, because a single missing predicate produces a number
 * that still looks plausible.
 *
 * Two conventions run through this file:
 *
 * 1. Time is bucketed in the USER'S timezone. expenses.occurred_at is a
 *    TIMESTAMPTZ, so `AT TIME ZONE $tz` converts the stored instant to local
 *    wall-clock before truncation; without it a 01:00 Nairobi purchase would
 *    land in the previous UTC day and the daily report would be off by one for
 *    everyone east of Greenwich.
 *
 * 2. incomes.date is a plain DATE — already a local calendar day, and carrying
 *    no time of day — so it is truncated directly and never shifted.
 */

export type Granularity = 'hour' | 'day' | 'week' | 'month' | 'year';

interface BucketSpec {
  /** date_trunc unit and generate_series step. */
  interval: string;
  /** to_char pattern for the label the client receives. */
  format: string;
  /** How many buckets back the default window reaches when `from` is omitted. */
  defaultSpan: number;
}

export const BUCKETS: Record<Granularity, BucketSpec> = {
  hour: { interval: '1 hour', format: 'YYYY-MM-DD HH24:00', defaultSpan: 23 },
  day: { interval: '1 day', format: 'YYYY-MM-DD', defaultSpan: 29 },
  // ISO week-numbering year, so the last days of December belong to week 1 of
  // the next year rather than week 53 of a year they are not in.
  week: { interval: '1 week', format: 'IYYY-"W"IW', defaultSpan: 11 },
  month: { interval: '1 month', format: 'YYYY-MM', defaultSpan: 11 },
  year: { interval: '1 year', format: 'YYYY', defaultSpan: 4 },
};

export interface RangeParams {
  userId: string;
  from?: string;
  to?: string;
  granularity: Granularity;
  timezone: string;
  /**
   * Overrides how many buckets back the default window reaches. A summary asked
   * for with no range means "this month" (span 0), while a monthly cashflow
   * chart asked for with no range means "the last twelve months" — same
   * granularity, different sensible default.
   */
  defaultSpan?: number;
}

/**
 * Resolves the reporting window. Shared by every query below so that a summary
 * and the cashflow series covering "the same period" cannot disagree.
 *
 * `to` is EXCLUSIVE internally. A client-supplied bare date is widened to the
 * end of that day first — `to=2026-07-31` means "through the 31st", not
 * "up to midnight on the 31st", which would silently discard a whole day.
 *
 * Params: $2 from, $3 to, $4 unit, $5 interval, $6 timezone, $7 default span.
 */
const BOUNDS_CTE = `
  bounds AS (
    SELECT
      COALESCE(
        $2::timestamp,
        date_trunc($4::text, now() AT TIME ZONE $6::text) - ($5::interval * $7::int)
      ) AS from_ts,
      COALESCE(
        CASE WHEN $3::text ~ '^\\d{4}-\\d{2}-\\d{2}$'
             THEN $3::timestamp + INTERVAL '1 day'
             ELSE $3::timestamp END,
        date_trunc($4::text, now() AT TIME ZONE $6::text) + $5::interval
      ) AS to_ts
  )`;

/**
 * Every bucket in the window, including the empty ones.
 *
 * A series with holes in it is not a series — a chart drawn from it connects
 * March straight to May and hides the month with no activity, which is usually
 * the month the user most wants to see. The trailing `g < b.to_ts` drops the
 * bucket generate_series adds when to_ts falls exactly on a boundary.
 */
const BUCKETS_CTE = `
  buckets AS (
    SELECT g AS bucket
      FROM bounds b,
           generate_series(date_trunc($4::text, b.from_ts),
                           date_trunc($4::text, b.to_ts),
                           $5::interval) g
     WHERE g < b.to_ts
  )`;

const rangeArgs = (p: RangeParams) => {
  const spec = BUCKETS[p.granularity];
  return [
    p.userId,
    p.from ?? null,
    p.to ?? null,
    p.granularity,
    spec.interval,
    p.timezone,
    p.defaultSpan ?? spec.defaultSpan,
  ];
};

/**
 * Money aggregates are cast back to a fixed scale so an empty period returns
 * "0.00" rather than "0". A client that renders whatever string it is given
 * should not have to special-case the month nothing happened in.
 *
 * The width is deliberately wider than the NUMERIC(12,2) columns being summed —
 * a lifetime total legitimately exceeds what a single row can hold.
 */
const MONEY = '::numeric(18,2)';

/** The concrete window a report ran over, echoed back so clients can label it. */
export interface ResolvedRange {
  from: string;
  to: string;
}

export interface SummaryTotals extends ResolvedRange {
  income_total: string;
  income_count: string;
  expense_total: string;
  expense_count: string;
  distributed_total: string;
}

export const summaryTotals = async (p: RangeParams, db: Executor = pool) => {
  const { rows } = await db.query<SummaryTotals>(
    `WITH ${BOUNDS_CTE}
     SELECT
       to_char(b.from_ts, 'YYYY-MM-DD"T"HH24:MI:SS')                    AS "from",
       to_char(b.to_ts,   'YYYY-MM-DD"T"HH24:MI:SS')                    AS "to",
       (SELECT COALESCE(SUM(i.amount), 0)${MONEY} FROM incomes i
         WHERE i.user_id = $1 AND i.deleted_at IS NULL
           AND i.date >= b.from_ts::date AND i.date < b.to_ts::date)    AS income_total,
       (SELECT COUNT(*) FROM incomes i
         WHERE i.user_id = $1 AND i.deleted_at IS NULL
           AND i.date >= b.from_ts::date AND i.date < b.to_ts::date)    AS income_count,
       (SELECT COALESCE(SUM(e.amount), 0)${MONEY} FROM expenses e
         WHERE e.user_id = $1 AND e.deleted_at IS NULL
           AND (e.occurred_at AT TIME ZONE $6::text) >= b.from_ts
           AND (e.occurred_at AT TIME ZONE $6::text) <  b.to_ts)        AS expense_total,
       (SELECT COUNT(*) FROM expenses e
         WHERE e.user_id = $1 AND e.deleted_at IS NULL
           AND (e.occurred_at AT TIME ZONE $6::text) >= b.from_ts
           AND (e.occurred_at AT TIME ZONE $6::text) <  b.to_ts)        AS expense_count,
       (SELECT COALESCE(SUM(d.amount), 0)${MONEY}
          FROM distributed_incomes d
          JOIN incomes i ON i.id = d.income_id AND i.deleted_at IS NULL
         WHERE d.user_id = $1 AND d.deleted_at IS NULL
           AND i.date >= b.from_ts::date AND i.date < b.to_ts::date)    AS distributed_total
     FROM bounds b`,
    rangeArgs(p)
  );
  return rows[0]!;
};

export interface CategoryTotal {
  category_id: string;
  category_name: string;
  percentage: string;
  total: string;
  count: string;
}

/**
 * Distributed totals per category, LEFT JOINed from the category side so a
 * category that received nothing this period still reports 0.00 rather than
 * vanishing from the breakdown.
 */
export const distributionTotals = async (p: RangeParams, db: Executor = pool) => {
  const { rows } = await db.query<CategoryTotal>(
    `WITH ${BOUNDS_CTE}
     SELECT c.id                    AS category_id,
            c.name                  AS category_name,
            c.percentage            AS percentage,
            COALESCE(t.total, 0)${MONEY}    AS total,
            COALESCE(t.count, 0)    AS count
       FROM distribution_categories c
       LEFT JOIN (
         SELECT d.distribution_category_id AS cid,
                SUM(d.amount)              AS total,
                COUNT(*)                   AS count
           FROM distributed_incomes d
           JOIN incomes i ON i.id = d.income_id AND i.deleted_at IS NULL
           CROSS JOIN bounds b
          WHERE d.user_id = $1 AND d.deleted_at IS NULL
            AND i.date >= b.from_ts::date AND i.date < b.to_ts::date
          GROUP BY 1
       ) t ON t.cid = c.id
      WHERE c.user_id = $1 AND c.deleted_at IS NULL
      ORDER BY c.percentage DESC, c.name`,
    rangeArgs(p)
  );
  return rows;
};

export interface ExpenseCategoryTotal {
  category_id: string | null;
  category_name: string | null;
  total: string;
  count: string;
}

export interface ExpenseRangeParams extends RangeParams {
  categoryId?: string;
  wallet?: string;
}

/**
 * Appends the optional expense filters, continuing the caller's parameter
 * numbering. The breakdown has to honour the same filters as the series it sits
 * next to, or a report filtered to one wallet would show category shares drawn
 * from every wallet.
 */
const expenseFilters = (p: ExpenseRangeParams, params: unknown[]) => {
  let sql = '';
  if (p.categoryId) {
    params.push(p.categoryId);
    sql += ` AND e.category_id = $${params.length}`;
  }
  if (p.wallet) {
    params.push(p.wallet);
    sql += ` AND e.wallet = $${params.length}`;
  }
  return sql;
};

export const expenseTotalsByCategory = async (p: ExpenseRangeParams, db: Executor = pool) => {
  const params = rangeArgs(p);
  const filters = expenseFilters(p, params);

  const { rows } = await db.query<ExpenseCategoryTotal>(
    `WITH ${BOUNDS_CTE}
     SELECT e.category_id,
            c.name                     AS category_name,
            COALESCE(SUM(e.amount), 0)${MONEY} AS total,
            COUNT(*)                   AS count
       FROM expenses e
       CROSS JOIN bounds b
       LEFT JOIN expense_categories c ON c.id = e.category_id
      WHERE e.user_id = $1 AND e.deleted_at IS NULL
        AND (e.occurred_at AT TIME ZONE $6::text) >= b.from_ts
        AND (e.occurred_at AT TIME ZONE $6::text) <  b.to_ts
        ${filters}
      GROUP BY e.category_id, c.name
      ORDER BY SUM(e.amount) DESC`,
    params
  );
  return rows;
};

export interface CashflowBucket {
  bucket: string;
  income: string;
  expenses: string;
  net: string;
  income_count: string;
  expense_count: string;
}

/** Income vs expenses per bucket — the monthly/yearly view from the spec. */
export const cashflowSeries = async (p: RangeParams, db: Executor = pool) => {
  const { rows } = await db.query<CashflowBucket>(
    `WITH ${BOUNDS_CTE},
     ${BUCKETS_CTE},
     inc AS (
       SELECT date_trunc($4::text, i.date::timestamp) AS bucket,
              SUM(i.amount) AS total, COUNT(*) AS n
         FROM incomes i CROSS JOIN bounds b
        WHERE i.user_id = $1 AND i.deleted_at IS NULL
          AND i.date >= b.from_ts::date AND i.date < b.to_ts::date
        GROUP BY 1
     ),
     exp AS (
       SELECT date_trunc($4::text, e.occurred_at AT TIME ZONE $6::text) AS bucket,
              SUM(e.amount) AS total, COUNT(*) AS n
         FROM expenses e CROSS JOIN bounds b
        WHERE e.user_id = $1 AND e.deleted_at IS NULL
          AND (e.occurred_at AT TIME ZONE $6::text) >= b.from_ts
          AND (e.occurred_at AT TIME ZONE $6::text) <  b.to_ts
        GROUP BY 1
     )
     SELECT to_char(bk.bucket, $8::text)                                AS bucket,
            COALESCE(inc.total, 0)${MONEY}                              AS income,
            COALESCE(exp.total, 0)${MONEY}                              AS expenses,
            (COALESCE(inc.total, 0) - COALESCE(exp.total, 0))${MONEY}   AS net,
            COALESCE(inc.n, 0)                                          AS income_count,
            COALESCE(exp.n, 0)                                          AS expense_count
       FROM buckets bk
       LEFT JOIN inc ON inc.bucket = bk.bucket
       LEFT JOIN exp ON exp.bucket = bk.bucket
      ORDER BY bk.bucket`,
    [...rangeArgs(p), BUCKETS[p.granularity].format]
  );
  return rows;
};

export interface DistributionBucket {
  bucket: string;
  category_id: string;
  category_name: string;
  total: string;
}

/**
 * Distributed amounts per bucket per category — the "saving" line of the
 * monthly/yearly view. Not gap-filled: the service stitches these onto the
 * cashflow buckets, which already carry every period in the window.
 */
export const distributionSeries = async (p: RangeParams, db: Executor = pool) => {
  const { rows } = await db.query<DistributionBucket>(
    `WITH ${BOUNDS_CTE}
     SELECT to_char(date_trunc($4::text, i.date::timestamp), $8::text) AS bucket,
            c.id                 AS category_id,
            c.name               AS category_name,
            SUM(d.amount)${MONEY}        AS total
       FROM distributed_incomes d
       JOIN incomes i               ON i.id = d.income_id AND i.deleted_at IS NULL
       JOIN distribution_categories c ON c.id = d.distribution_category_id
       CROSS JOIN bounds b
      WHERE d.user_id = $1 AND d.deleted_at IS NULL
        AND i.date >= b.from_ts::date AND i.date < b.to_ts::date
      GROUP BY 1, c.id, c.name
      ORDER BY 1, c.name`,
    [...rangeArgs(p), BUCKETS[p.granularity].format]
  );
  return rows;
};

export interface ExpenseBucket {
  bucket: string;
  total: string;
  count: string;
}

/**
 * Expense-only series, the one granularity chain that reaches down to `hour`.
 * occurred_at is a TIMESTAMPTZ precisely so this report can exist.
 */
export const expenseSeries = async (p: ExpenseRangeParams, db: Executor = pool) => {
  const params: unknown[] = [...rangeArgs(p), BUCKETS[p.granularity].format];
  const filters = expenseFilters(p, params);

  const { rows } = await db.query<ExpenseBucket>(
    `WITH ${BOUNDS_CTE},
     ${BUCKETS_CTE},
     matched AS (
       SELECT date_trunc($4::text, e.occurred_at AT TIME ZONE $6::text) AS bucket,
              e.amount
         FROM expenses e CROSS JOIN bounds b
        WHERE e.user_id = $1 AND e.deleted_at IS NULL
          AND (e.occurred_at AT TIME ZONE $6::text) >= b.from_ts
          AND (e.occurred_at AT TIME ZONE $6::text) <  b.to_ts
          ${filters}
     )
     SELECT to_char(bk.bucket, $8::text)   AS bucket,
            COALESCE(SUM(r.amount), 0)${MONEY}     AS total,
            COUNT(r.amount)                AS count
       FROM buckets bk
       LEFT JOIN matched r ON r.bucket = bk.bucket
      GROUP BY bk.bucket
      ORDER BY bk.bucket`,
    params
  );
  return rows;
};

export interface WalletBalances {
  snapshot_at: Date | null;
  opening_cash: string;
  opening_account: string;
  opening_mpesa: string;
  delta_cash: string;
  delta_account: string;
  delta_mpesa: string;
}

/**
 * Derived balances: the newest overview snapshot plus everything recorded
 * since, per wallet.
 *
 * The cut-off is created_at, not the business date. `overview` is a
 * reconciliation snapshot — "this is what was actually in my pocket when I
 * counted" — so anything ENTERED after that moment adds on top of it, even if
 * it is backdated. Using incomes.date instead would double-count a receipt the
 * user typed in after already counting the cash.
 *
 * With no snapshot at all the floor is -infinity, so balances are simply the
 * full recorded history.
 */
export const walletBalances = async (userId: string, db: Executor = pool) => {
  const { rows } = await db.query<WalletBalances>(
    `WITH snapshot AS (
       SELECT cash_wallet, account_balance, mpesa_balance, created_at
         FROM overview
        WHERE user_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 1
     ),
     since AS (
       SELECT COALESCE((SELECT created_at FROM snapshot), '-infinity'::timestamptz) AS at
     ),
     movements AS (
       SELECT wallet, amount FROM incomes
        WHERE user_id = $1 AND deleted_at IS NULL
          AND created_at > (SELECT at FROM since)
       UNION ALL
       SELECT wallet, -amount FROM expenses
        WHERE user_id = $1 AND deleted_at IS NULL
          AND created_at > (SELECT at FROM since)
     )
     SELECT (SELECT created_at     FROM snapshot)                        AS snapshot_at,
            COALESCE((SELECT cash_wallet     FROM snapshot), 0)${MONEY}  AS opening_cash,
            COALESCE((SELECT account_balance FROM snapshot), 0)${MONEY}  AS opening_account,
            COALESCE((SELECT mpesa_balance   FROM snapshot), 0)${MONEY}  AS opening_mpesa,
            COALESCE(SUM(amount) FILTER (WHERE wallet = 'cash'), 0)${MONEY}    AS delta_cash,
            COALESCE(SUM(amount) FILTER (WHERE wallet = 'account'), 0)${MONEY} AS delta_account,
            COALESCE(SUM(amount) FILTER (WHERE wallet = 'mpesa'), 0)${MONEY}   AS delta_mpesa
       FROM movements`,
    [userId]
  );
  return rows[0]!;
};

/** Latest activity for the dashboard feed. */
export const recentIncomes = async (userId: string, limit: number, db: Executor = pool) => {
  const { rows } = await db.query(
    `SELECT i.id, i.date, i.amount, i.notes, i.wallet, s.name AS source_name
       FROM incomes i
       LEFT JOIN income_sources s ON s.id = i.source_id
      WHERE i.user_id = $1 AND i.deleted_at IS NULL
      ORDER BY i.date DESC, i.created_at DESC
      LIMIT $2`,
    [userId, limit]
  );
  return rows;
};

export const recentExpenses = async (userId: string, limit: number, db: Executor = pool) => {
  const { rows } = await db.query(
    `SELECT e.id, e.occurred_at, e.amount, e.description, e.payee, e.wallet,
            c.name AS category_name
       FROM expenses e
       LEFT JOIN expense_categories c ON c.id = e.category_id
      WHERE e.user_id = $1 AND e.deleted_at IS NULL
      ORDER BY e.occurred_at DESC, e.created_at DESC
      LIMIT $2`,
    [userId, limit]
  );
  return rows;
};
