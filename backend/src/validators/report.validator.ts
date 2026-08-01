import { z } from 'zod';
import { dateFilter, walletEnum } from './common.validator';

/**
 * Reporting query contracts.
 *
 * `from`/`to` are LOCAL wall-clock bounds in the caller's timezone, not UTC
 * instants — asking for "July" should mean July where the user lives. `to` is
 * inclusive of a bare date (2026-07-31 covers all of the 31st), matching the
 * expense list filter so the two never disagree about what a month contains.
 */
const range = {
  from: dateFilter.optional(),
  to: dateFilter.optional(),
};

/**
 * Cashflow deliberately stops at `day`.
 *
 * incomes.date is a DATE — there is no time of day on record — so an hourly
 * cashflow series would stack every paycheque at 00:00 and draw a chart that
 * looks like income arrives at midnight. Hourly resolution is offered where it
 * is real: GET /api/reports/expenses.
 */
export const CASHFLOW_GRANULARITIES = ['day', 'week', 'month', 'year'] as const;
export const EXPENSE_GRANULARITIES = ['hour', 'day', 'week', 'month', 'year'] as const;

export const summaryReportSchema = z.object(range).strict();

export const distributionReportSchema = z.object(range).strict();

export const cashflowReportSchema = z
  .object({
    ...range,
    groupBy: z.enum(CASHFLOW_GRANULARITIES).default('month'),
  })
  .strict();

export const expenseReportSchema = z
  .object({
    ...range,
    groupBy: z.enum(EXPENSE_GRANULARITIES).default('day'),
    categoryId: z.uuid().optional(),
    wallet: walletEnum.optional(),
  })
  .strict();

export const dashboardSchema = z.object({}).strict();

export type SummaryReportQuery = z.infer<typeof summaryReportSchema>;
export type DistributionReportQuery = z.infer<typeof distributionReportSchema>;
export type CashflowReportQuery = z.infer<typeof cashflowReportSchema>;
export type ExpenseReportQuery = z.infer<typeof expenseReportSchema>;
