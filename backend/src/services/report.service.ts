import * as reports from '../repositories/report.repository';
import * as incomes from '../repositories/income.repository';
import { fromCents, toCents } from '../utils/money';
import { isKnownTimezone } from '../validators/common.validator';
import type { Granularity } from '../repositories/report.repository';
import type {
  CashflowReportQuery,
  ExpenseReportQuery,
  SummaryReportQuery,
} from '../validators/report.validator';

/**
 * Report composition.
 *
 * All arithmetic here runs on integer cents (utils/money) and converts back to
 * decimal strings at the edge. Totals that come straight from SQL are already
 * exact NUMERIC; the ones this layer computes — net, percentage shares — would
 * be the only place a float could creep in, so they do not get the chance.
 */

/**
 * The JWT carries the timezone the user held when the token was minted, and a
 * token can outlive a change. Falling back to UTC on anything Postgres would
 * not recognise keeps a stale or hand-edited claim from turning into a 500 in
 * `AT TIME ZONE`.
 */
const safeZone = (timezone: string | undefined) =>
  timezone && isKnownTimezone(timezone) ? timezone : 'UTC';

export interface Actor {
  id: string;
  timezone: string;
}

const num = (value: string | number | null | undefined) => Number(value ?? 0);

/** Share of `part` in `whole`, to one decimal place, guarding division by zero. */
const share = (partCents: number, wholeCents: number) =>
  wholeCents === 0 ? 0 : Math.round((partCents / wholeCents) * 1000) / 10;

/**
 * The window a report falls back to when the caller names no range: the current
 * calendar month in the user's own timezone. `defaultSpan: 0` reaches back zero
 * months, so from is the 1st and to is the 1st of next month — unlike the
 * cashflow chart, where the same monthly granularity sensibly means "the last
 * twelve".
 */
const currentMonth = (actor: Actor) => ({
  userId: actor.id,
  granularity: 'month' as Granularity,
  timezone: safeZone(actor.timezone),
  defaultSpan: 0,
});

/* ------------------------------------------------------------------ summary */

export const summary = async (actor: Actor, q: SummaryReportQuery) => {
  const params = { ...currentMonth(actor), from: q.from, to: q.to };

  const [totals, distribution, byCategory] = await Promise.all([
    reports.summaryTotals(params),
    reports.distributionTotals(params),
    reports.expenseTotalsByCategory(params),
  ]);

  const incomeCents = toCents(totals.income_total);
  const expenseCents = toCents(totals.expense_total);
  const distributedCents = toCents(totals.distributed_total);

  return {
    range: { from: totals.from, to: totals.to, timezone: params.timezone },
    income: { total: totals.income_total, count: num(totals.income_count) },
    expenses: { total: totals.expense_total, count: num(totals.expense_count) },
    /**
     * `net` is income minus what was actually spent. It is NOT income minus
     * what was distributed — distribution is an allocation plan, and counting
     * both would subtract the same money twice.
     */
    net: fromCents(incomeCents - expenseCents),
    savingsRate: share(incomeCents - expenseCents, incomeCents),
    distributed: {
      total: totals.distributed_total,
      byCategory: distribution.map((c) => ({
        categoryId: c.category_id,
        name: c.category_name,
        percentage: c.percentage,
        total: c.total,
        count: num(c.count),
        shareOfDistributed: share(toCents(c.total), distributedCents),
      })),
    },
    expensesByCategory: byCategory.map((c) => ({
      categoryId: c.category_id,
      name: c.category_name ?? 'Uncategorised',
      total: c.total,
      count: num(c.count),
      shareOfExpenses: share(toCents(c.total), expenseCents),
    })),
  };
};

/* ------------------------------------------------------------- distribution */

/**
 * How income was actually split, next to how it was configured to be split.
 *
 * The two can legitimately differ: `percentage_applied` is snapshotted onto
 * each row at the time of the income, so a category whose percentage changed
 * mid-period will show an effective share that matches neither the old nor the
 * new setting. Reporting both is the point — it is the only way to see that a
 * change took effect.
 */
export const distribution = async (actor: Actor, q: SummaryReportQuery) => {
  const params = { ...currentMonth(actor), from: q.from, to: q.to };

  const [totals, rows, configured] = await Promise.all([
    reports.summaryTotals(params),
    reports.distributionTotals(params),
    incomes.findActiveDistributionCategories(actor.id),
  ]);

  const distributedCents = toCents(totals.distributed_total);
  const incomeCents = toCents(totals.income_total);
  const configuredTotal = configured.reduce((sum, c) => sum + Number(c.percentage), 0);

  return {
    range: { from: totals.from, to: totals.to, timezone: params.timezone },
    income: totals.income_total,
    distributed: totals.distributed_total,
    /**
     * Income recorded before any categories existed is never distributed, so
     * this is not always zero — surfacing it beats leaving the user to wonder
     * why the splits do not add up to their income.
     */
    undistributed: fromCents(incomeCents - distributedCents),
    configuredTotalPercentage: configuredTotal,
    percentageWarning:
      configuredTotal === 100
        ? null
        : `Distribution percentages total ${configuredTotal}%, not 100%`,
    categories: rows.map((c) => ({
      categoryId: c.category_id,
      name: c.category_name,
      configuredPercentage: c.percentage,
      total: c.total,
      count: num(c.count),
      effectivePercentage: share(toCents(c.total), incomeCents),
    })),
  };
};

/* ------------------------------------------------------------------ cashflow */

/**
 * The monthly/yearly income–expense–saving view.
 *
 * Each bucket carries income, expenses, net, and the per-category distribution
 * for that period — so "how much did I save in June" is a lookup, not a second
 * request the client has to correlate by date.
 */
export const cashflow = async (actor: Actor, q: CashflowReportQuery) => {
  const params = {
    userId: actor.id,
    from: q.from,
    to: q.to,
    granularity: q.groupBy as Granularity,
    timezone: safeZone(actor.timezone),
  };

  const [series, splits, totals] = await Promise.all([
    reports.cashflowSeries(params),
    reports.distributionSeries(params),
    reports.summaryTotals(params),
  ]);

  const byBucket = new Map<string, { categoryId: string; name: string; total: string }[]>();
  for (const s of splits) {
    const list = byBucket.get(s.bucket) ?? [];
    list.push({ categoryId: s.category_id, name: s.category_name, total: s.total });
    byBucket.set(s.bucket, list);
  }

  return {
    range: { from: totals.from, to: totals.to, timezone: params.timezone },
    groupBy: q.groupBy,
    totals: {
      income: totals.income_total,
      expenses: totals.expense_total,
      net: fromCents(toCents(totals.income_total) - toCents(totals.expense_total)),
      distributed: totals.distributed_total,
    },
    series: series.map((b) => ({
      bucket: b.bucket,
      income: b.income,
      expenses: b.expenses,
      net: b.net,
      incomeCount: num(b.income_count),
      expenseCount: num(b.expense_count),
      distributed: byBucket.get(b.bucket) ?? [],
    })),
  };
};

/* ------------------------------------------------------------ expense report */

/**
 * Expense-only breakdown, the report that reaches hourly resolution.
 *
 * `busiest` is included because at hour or day granularity the series is long
 * enough that the interesting bucket is hard to spot by eye.
 */
export const expenses = async (actor: Actor, q: ExpenseReportQuery) => {
  const range = {
    userId: actor.id,
    from: q.from,
    to: q.to,
    granularity: q.groupBy as Granularity,
    timezone: safeZone(actor.timezone),
  };
  const params = { ...range, categoryId: q.categoryId, wallet: q.wallet };

  const [series, totals, byCategory] = await Promise.all([
    reports.expenseSeries(params),
    // Only the resolved window is taken from this — the totals below are
    // summed from the filtered series so they agree with what is charted.
    reports.summaryTotals(range),
    reports.expenseTotalsByCategory(params),
  ]);

  const totalCents = series.reduce((sum, b) => sum + toCents(b.total), 0);
  const count = series.reduce((sum, b) => sum + num(b.count), 0);
  const busiest = series.reduce<(typeof series)[number] | null>(
    (best, b) => (best === null || toCents(b.total) > toCents(best.total) ? b : best),
    null
  );

  return {
    range: { from: totals.from, to: totals.to, timezone: params.timezone },
    groupBy: q.groupBy,
    total: fromCents(totalCents),
    count,
    // Mean across every bucket in the window, empty ones included — an average
    // that skipped the quiet buckets would overstate the spending rate.
    average: series.length > 0 ? fromCents(Math.round(totalCents / series.length)) : '0.00',
    busiest: busiest ? { bucket: busiest.bucket, total: busiest.total } : null,
    byCategory: byCategory.map((c) => ({
      categoryId: c.category_id,
      name: c.category_name ?? 'Uncategorised',
      total: c.total,
      count: num(c.count),
      shareOfExpenses: share(toCents(c.total), totalCents),
    })),
    series: series.map((b) => ({ bucket: b.bucket, total: b.total, count: num(b.count) })),
  };
};

/* ----------------------------------------------------------------- dashboard */

const RECENT_LIMIT = 5;

/** Opening snapshot plus everything recorded since, for one wallet. */
const walletBalance = (opening: string, movement: string) => ({
  opening,
  movement,
  balance: fromCents(toCents(opening) + toCents(movement)),
});

export const dashboard = async (actor: Actor) => {
  const zone = safeZone(actor.timezone);
  const thisMonth = currentMonth(actor);

  const [balances, totals, splits, recentIn, recentOut, configured] = await Promise.all([
    reports.walletBalances(actor.id),
    reports.summaryTotals(thisMonth),
    reports.distributionTotals(thisMonth),
    reports.recentIncomes(actor.id, RECENT_LIMIT),
    reports.recentExpenses(actor.id, RECENT_LIMIT),
    incomes.findActiveDistributionCategories(actor.id),
  ]);

  const cash = walletBalance(balances.opening_cash, balances.delta_cash);
  const account = walletBalance(balances.opening_account, balances.delta_account);
  const mpesa = walletBalance(balances.opening_mpesa, balances.delta_mpesa);
  const configuredTotal = configured.reduce((sum, c) => sum + Number(c.percentage), 0);

  return {
    balances: {
      /**
       * Derived, not stored. `overview` holds the last counted snapshot and
       * everything recorded since is applied on top — so a balance can never
       * drift out of agreement with the transactions behind it.
       */
      asOf: balances.snapshot_at,
      cash,
      account,
      mpesa,
      total: fromCents(
        toCents(cash.balance) + toCents(account.balance) + toCents(mpesa.balance)
      ),
    },
    currentMonth: {
      range: { from: totals.from, to: totals.to, timezone: zone },
      income: totals.income_total,
      expenses: totals.expense_total,
      net: fromCents(toCents(totals.income_total) - toCents(totals.expense_total)),
      distributed: splits.map((c) => ({
        categoryId: c.category_id,
        name: c.category_name,
        percentage: c.percentage,
        total: c.total,
      })),
    },
    distributionSetup: {
      totalPercentage: configuredTotal,
      warning:
        configuredTotal === 100
          ? null
          : `Distribution percentages total ${configuredTotal}%, not 100%`,
    },
    recent: { incomes: recentIn, expenses: recentOut },
  };
};
