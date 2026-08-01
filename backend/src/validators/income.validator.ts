import { z } from 'zod';
import { dateFilter, money, paginationSchema, walletEnum } from './common.validator';

// Allowlist for ORDER BY — see common.validator for why this cannot be free text.
export const INCOME_SORTABLE = ['date', 'amount', 'created_at'] as const;

export const listIncomesSchema = paginationSchema(INCOME_SORTABLE, 'date').extend({
  from: dateFilter.optional(),
  to: dateFilter.optional(),
  sourceId: z.uuid().optional(),
  wallet: walletEnum.optional(),
});

export const createIncomeSchema = z
  .object({
    sourceId: z.uuid().nullish(),
    date: z.iso.date('Date must be YYYY-MM-DD'),
    amount: money,
    notes: z.string().trim().max(1000).nullish(),
    wallet: walletEnum.default('account'),
  })
  .strict();

export const updateIncomeSchema = createIncomeSchema
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'At least one field must be provided');

export const INCOME_SOURCE_SORTABLE = ['name', 'created_at'] as const;

export const listSourcesSchema = paginationSchema(INCOME_SOURCE_SORTABLE, 'created_at').extend({
  search: z.string().trim().min(1).max(100).optional(),
});

export const createSourceSchema = z
  .object({ name: z.string().trim().min(1, 'Name is required').max(255) })
  .strict();
