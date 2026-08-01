import { withTransaction } from '../config/db';
import { ApiError } from '../utils/ApiError';
import * as incomes from '../repositories/income.repository';
import * as sources from '../repositories/incomeSource.repository';
import { calculateDistribution } from './distribution.service';
import { emitToUser } from '../sockets';
import type { IncomeFilters } from '../repositories/income.repository';

export interface CreateIncomeInput {
  sourceId?: string | null;
  date: string;
  amount: string;
  notes?: string | null;
  wallet: string;
}

/**
 * Ensures a referenced source belongs to the caller.
 *
 * Without this a user could attach their income to another user's source id.
 * The FK would accept it — Postgres only checks the row exists, not who owns
 * it — and the source name would then leak through every list response.
 */
const assertSourceOwned = async (userId: string, sourceId: string | null | undefined) => {
  if (!sourceId) return;
  const source = await sources.findById(userId, sourceId);
  if (!source) {
    throw ApiError.badRequest('Income source not found');
  }
};

export const list = async (userId: string, filters: IncomeFilters) => {
  const { rows, total } = await incomes.findAll(userId, filters);
  return { rows, total };
};

export const getById = async (userId: string, id: string) => {
  const income = await incomes.findById(userId, id);
  if (!income) {
    throw ApiError.notFound('Income not found');
  }

  const distribution = await incomes.findDistribution(id);
  return { ...income, distribution };
};

/**
 * Creates an income and its distribution atomically.
 *
 * Both happen in one transaction because a persisted income with no splits is
 * corrupt data: every report that sums distributed_incomes would silently
 * under-count, and there is no way to tell later whether the split was missing
 * or genuinely zero.
 */
export const create = async (userId: string, input: CreateIncomeInput) => {
  await assertSourceOwned(userId, input.sourceId);

  return withTransaction(async (client) => {
    const categories = await incomes.findActiveDistributionCategories(userId, client);
    const { splits, percentageWarning, totalPercentage } = calculateDistribution(
      input.amount,
      categories
    );

    const income = await incomes.create(userId, input, client);
    await incomes.replaceDistribution(userId, income.id, splits, client);

    // Emitted after the transaction body succeeds. A no-op when no socket
    // server is attached, so this never affects the HTTP path.
    emitToUser(userId, 'income:created', { id: income.id, amount: income.amount, date: income.date });

    return {
      ...income,
      distribution: splits,
      // Surfaced, not enforced — the spec is explicit that a total other than
      // 100% warns rather than blocks.
      ...(percentageWarning
        ? {
            warning: `Your distribution categories total ${totalPercentage}%, not 100%. ${
              Number(totalPercentage) < 100
                ? 'Some income was left undistributed.'
                : 'Distributed amounts exceed the income.'
            }`,
          }
        : {}),
    };
  }, userId);
};

/**
 * Updates an income, recomputing the distribution when the amount changes.
 *
 * Recomputation uses the user's CURRENT percentages, not the ones originally
 * applied. That is deliberate: editing an income is a correction, and the
 * correction should reflect how the user budgets now.
 */
export const update = async (userId: string, id: string, input: Partial<CreateIncomeInput>) => {
  await assertSourceOwned(userId, input.sourceId);

  return withTransaction(async (client) => {
    const existing = await incomes.findById(userId, id, client);
    if (!existing) {
      throw ApiError.notFound('Income not found');
    }

    const income = await incomes.update(userId, id, input, client);
    if (!income) {
      throw ApiError.notFound('Income not found');
    }

    const amountChanged = input.amount !== undefined && input.amount !== existing.amount;
    let distribution = await incomes.findDistribution(id, client);

    if (amountChanged) {
      const categories = await incomes.findActiveDistributionCategories(userId, client);
      const { splits } = calculateDistribution(income.amount, categories);
      await incomes.replaceDistribution(userId, id, splits, client);
      distribution = await incomes.findDistribution(id, client);
    }

    emitToUser(userId, 'income:updated', { id: income.id, amount: income.amount, date: income.date });

    return { ...income, distribution };
  }, userId);
};

/** Soft-deletes the income and its splits together, so reports stay consistent. */
export const remove = async (userId: string, id: string) =>
  withTransaction(async (client) => {
    const deleted = await incomes.softDelete(userId, id, client);
    if (!deleted) {
      throw ApiError.notFound('Income not found');
    }
    await incomes.replaceDistribution(userId, id, [], client);
    emitToUser(userId, 'income:deleted', { id });
  }, userId);
