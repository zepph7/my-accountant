import { z } from 'zod';
import { paginationSchema, percentage } from './common.validator';

export const DISTRIBUTION_CATEGORY_SORTABLE = ['name', 'percentage', 'created_at'] as const;

export const listDistributionCategoriesSchema = paginationSchema(
  DISTRIBUTION_CATEGORY_SORTABLE,
  'percentage'
).extend({
  search: z.string().trim().min(1).max(100).optional(),
});

export const createDistributionCategorySchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(255),
    percentage,
  })
  .strict();

export const updateDistributionCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    percentage: percentage.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'At least one field must be provided');
