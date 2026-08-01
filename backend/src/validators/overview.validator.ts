import { z } from 'zod';
import { balance, paginationSchema } from './common.validator';

/**
 * Snapshots are ordered by when they were taken and nothing else, so the sort
 * allowlist has a single member — there is no other meaningful ordering for a
 * ledger of reconciliation points.
 */
export const listOverviewSchema = paginationSchema(['created_at'], 'created_at');

export const createOverviewSchema = z
  .object({
    cashWallet: balance.default('0.00'),
    accountBalance: balance.default('0.00'),
    mpesaBalance: balance.default('0.00'),
  })
  .strict();

export const currentOverviewSchema = z.object({}).strict();
