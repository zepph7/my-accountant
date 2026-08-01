import { z } from 'zod';
import { dateFilter, money, paginationSchema, walletEnum } from './common.validator';

export const EXPENSE_SORTABLE = ['occurred_at', 'amount', 'created_at'] as const;

export const listExpensesSchema = paginationSchema(EXPENSE_SORTABLE, 'occurred_at').extend({
  from: dateFilter.optional(),
  to: dateFilter.optional(),
  categoryId: z.uuid().optional(),
  wallet: walletEnum.optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

export const createExpenseSchema = z
  .object({
    categoryId: z.uuid().nullish(),
    // Accepts a full timestamp for hourly precision, or a bare date which the
    // client may send when the exact time is unknown.
    occurredAt: z.iso.datetime({ offset: true }).or(z.iso.date()),
    amount: money,
    description: z.string().trim().max(1000).nullish(),
    payee: z.string().trim().max(255).nullish(),
    wallet: walletEnum.default('account'),
  })
  .strict();

export const updateExpenseSchema = createExpenseSchema
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'At least one field must be provided');

export const EXPENSE_CATEGORY_SORTABLE = ['name', 'created_at'] as const;

export const listExpenseCategoriesSchema = paginationSchema(
  EXPENSE_CATEGORY_SORTABLE,
  'created_at'
).extend({
  search: z.string().trim().min(1).max(100).optional(),
});

export const createExpenseCategorySchema = z
  .object({ name: z.string().trim().min(1, 'Name is required').max(255) })
  .strict();
