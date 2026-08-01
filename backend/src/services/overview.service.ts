import * as overview from '../repositories/overview.repository';
import * as reports from '../repositories/report.repository';
import { fromCents, toCents } from '../utils/money';

export interface CreateOverviewInput {
  cashWallet: string;
  accountBalance: string;
  mpesaBalance: string;
}

export const list = (userId: string, opts: { page: number; limit: number; order: 'asc' | 'desc' }) =>
  overview.findAll(userId, opts);

export const create = (userId: string, input: CreateOverviewInput) =>
  overview.create(userId, input);

const walletView = (opening: string, movement: string) => ({
  opening,
  movement,
  balance: fromCents(toCents(opening) + toCents(movement)),
});

/**
 * The live balance per wallet: the last snapshot plus every transaction
 * recorded since it was taken.
 *
 * The user confirmed balances are DERIVED rather than stored, so nothing here
 * reads a running total off a column — there is no column to drift. `movement`
 * is exposed alongside `balance` so the number is auditable: a user who
 * disagrees with the total can see exactly how far it has moved since they last
 * counted, and record a fresh snapshot to reset the baseline.
 */
export const current = async (userId: string) => {
  const [snapshot, balances] = await Promise.all([
    overview.findLatest(userId),
    reports.walletBalances(userId),
  ]);

  const cash = walletView(balances.opening_cash, balances.delta_cash);
  const account = walletView(balances.opening_account, balances.delta_account);
  const mpesa = walletView(balances.opening_mpesa, balances.delta_mpesa);

  return {
    snapshot,
    asOf: balances.snapshot_at,
    cash,
    account,
    mpesa,
    total: fromCents(toCents(cash.balance) + toCents(account.balance) + toCents(mpesa.balance)),
  };
};
