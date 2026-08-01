import { ApiError } from '../utils/ApiError';
import * as expenses from '../repositories/expense.repository';
import * as categories from '../repositories/expenseCategory.repository';
import * as reports from '../repositories/report.repository';
import { logger } from '../config/logger';
import { toCents } from '../utils/money';
import { emitToUser } from '../sockets';
import type { ExpenseFilters } from '../repositories/expense.repository';

export interface CreateExpenseInput {
  categoryId?: string | null;
  occurredAt: string;
  amount: string;
  description?: string | null;
  payee?: string | null;
  wallet: string;
}

/**
 * Same ownership check as incomes: the FK guarantees the category exists, not
 * that it belongs to this user, so a crafted request could otherwise attach an
 * expense to someone else's category and leak its name through list responses.
 */
const assertCategoryOwned = async (userId: string, categoryId: string | null | undefined) => {
  if (!categoryId) return;
  const category = await categories.findById(userId, categoryId);
  if (!category) {
    throw ApiError.badRequest('Expense category not found');
  }
};

export const list = (userId: string, filters: ExpenseFilters) => expenses.findAll(userId, filters);

export const getById = async (userId: string, id: string) => {
  const expense = await expenses.findById(userId, id);
  if (!expense) throw ApiError.notFound('Expense not found');
  return expense;
};

/**
 * Expenses have NO distribution logic — the spec is explicit that they are
 * recorded freely against a category. That is why this service is a thin
 * ownership-checking wrapper while income.service carries a transaction.
 */
export const create = async (
  userId: string,
  input: CreateExpenseInput,
  timezone = 'UTC'
) => {
  await assertCategoryOwned(userId, input.categoryId);
  const expense = await expenses.create(userId, input);

  emitToUser(userId, 'expense:created', {
    id: expense.id,
    amount: expense.amount,
    occurredAt: expense.occurred_at,
  });
  void checkOverspend(userId, timezone);

  return expense;
};

export const update = async (userId: string, id: string, input: Partial<CreateExpenseInput>) => {
  await assertCategoryOwned(userId, input.categoryId);
  const expense = await expenses.update(userId, id, input);
  if (!expense) throw ApiError.notFound('Expense not found');

  emitToUser(userId, 'expense:updated', { id: expense.id, amount: expense.amount });
  return expense;
};

export const remove = async (userId: string, id: string) => {
  const deleted = await expenses.softDelete(userId, id);
  if (!deleted) throw ApiError.notFound('Expense not found');
  emitToUser(userId, 'expense:deleted', { id });
};

/**
 * Budget alert: warn when the month's spending has passed the month's income.
 *
 * Fire-and-forget on purpose. It is a notification, not part of recording the
 * expense — the write has already committed, and making the user wait on an
 * advisory query (or fail because it errored) would be the wrong trade. Errors
 * are logged and swallowed for the same reason.
 */
const checkOverspend = async (userId: string, tz: string) => {
  try {
    const totals = await reports.summaryTotals({
      userId,
      granularity: 'month',
      timezone: tz,
      defaultSpan: 0,
    });

    const spent = toCents(totals.expense_total);
    const earned = toCents(totals.income_total);
    if (spent <= earned) return;

    emitToUser(userId, 'budget:alert', {
      kind: 'overspend',
      period: totals.from.slice(0, 7),
      income: totals.income_total,
      expenses: totals.expense_total,
      message: `You have spent ${totals.expense_total} against ${totals.income_total} of income this month.`,
    });
  } catch (err) {
    logger.warn({ err, userId }, 'budget alert check failed');
  }
};
