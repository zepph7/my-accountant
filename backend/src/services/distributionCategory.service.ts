import { ApiError } from '../utils/ApiError';
import * as categories from '../repositories/distributionCategory.repository';

export interface DistributionCategoryInput {
  name: string;
  percentage: string;
}

/**
 * The 100% rule is a WARNING, never a block.
 *
 * Editing a set of percentages is inherently transient: moving Savings from 20
 * to 25 has to pass through a moment where the total is 105 before Essentials
 * comes down to compensate. Refusing that intermediate state would make the
 * settings screen impossible to use, so the total is reported on every mutating
 * response and the user decides when they are done.
 */
const withTotal = async (userId: string, data: unknown) => {
  const total = await categories.totalPercentage(userId);
  const numeric = Number(total);

  return {
    data,
    totalPercentage: total,
    warning:
      numeric === 100
        ? null
        : `Your distribution categories total ${total}%, not 100%. ${
            numeric < 100
              ? 'Income will be left partly undistributed.'
              : 'Distributed amounts will exceed each income.'
          }`,
  };
};

export const list = (
  userId: string,
  opts: { page: number; limit: number; sort: string; order: 'asc' | 'desc'; search?: string }
) => categories.findAll(userId, opts);

export const summary = (userId: string) => categories.totalPercentage(userId);

export const getById = async (userId: string, id: string) => {
  const category = await categories.findById(userId, id);
  if (!category) throw ApiError.notFound('Distribution category not found');
  return category;
};

export const create = async (userId: string, input: DistributionCategoryInput) =>
  withTotal(userId, await categories.create(userId, input));

export const update = async (
  userId: string,
  id: string,
  input: Partial<DistributionCategoryInput>
) => {
  const category = await categories.update(userId, id, input);
  if (!category) throw ApiError.notFound('Distribution category not found');
  return withTotal(userId, category);
};

/**
 * Retiring a category leaves every past split untouched — those rows are the
 * record of how income was actually divided, and rewriting them would make old
 * reports disagree with the receipts behind them.
 */
export const remove = async (userId: string, id: string) => {
  const deleted = await categories.softDelete(userId, id);
  if (!deleted) throw ApiError.notFound('Distribution category not found');
  return withTotal(userId, null);
};
