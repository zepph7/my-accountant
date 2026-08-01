import type { PoolClient } from 'pg';
import { pool } from '../config/db';

type Executor = Pick<PoolClient, 'query'> | typeof pool;

/**
 * Balance snapshots.
 *
 * This table is APPEND-ONLY by design (see migration 0007): recording a balance
 * inserts a row, and "current" means the newest row. There is deliberately no
 * update and no delete here — a reconciliation you can edit after the fact is
 * not a reconciliation, and the whole point of the table is to be the fixed
 * point that derived balances are measured from.
 */

export interface OverviewRow {
  id: string;
  user_id: string;
  cash_wallet: string;
  account_balance: string;
  mpesa_balance: string;
  created_at: Date;
}

const COLUMNS = 'id, user_id, cash_wallet, account_balance, mpesa_balance, created_at';

export const findAll = async (
  userId: string,
  opts: { page: number; limit: number; order: 'asc' | 'desc' },
  db: Executor = pool
) => {
  const totalResult = await db.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM overview WHERE user_id = $1',
    [userId]
  );

  const offset = (opts.page - 1) * opts.limit;
  const { rows } = await db.query<OverviewRow>(
    `SELECT ${COLUMNS} FROM overview
      WHERE user_id = $1
      ORDER BY created_at ${opts.order.toUpperCase()}, id
      LIMIT $2 OFFSET $3`,
    [userId, opts.limit, offset]
  );

  return { rows, total: Number(totalResult.rows[0]?.count ?? 0) };
};

export const findLatest = async (userId: string, db: Executor = pool) => {
  const { rows } = await db.query<OverviewRow>(
    `SELECT ${COLUMNS} FROM overview
      WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    [userId]
  );
  return rows[0] ?? null;
};

export const create = async (
  userId: string,
  input: { cashWallet: string; accountBalance: string; mpesaBalance: string },
  db: Executor = pool
) => {
  const { rows } = await db.query<OverviewRow>(
    `INSERT INTO overview (user_id, cash_wallet, account_balance, mpesa_balance)
     VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
    [userId, input.cashWallet, input.accountBalance, input.mpesaBalance]
  );
  return rows[0]!;
};
