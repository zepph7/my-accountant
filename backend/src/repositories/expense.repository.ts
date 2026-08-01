import type { PoolClient } from 'pg';
import { pool } from '../config/db';
import type { ExpenseRow } from '../types/models';

type Executor = Pick<PoolClient, 'query'> | typeof pool;

const COLUMNS = `id, user_id, category_id, occurred_at, amount, description, payee, wallet,
                 created_at, updated_at, deleted_at`;

export interface ExpenseFilters {
  page: number;
  limit: number;
  sort: string;
  order: 'asc' | 'desc';
  from?: string;
  to?: string;
  categoryId?: string;
  wallet?: string;
  search?: string;
}

/**
 * Shared predicate for list and count.
 *
 * `from`/`to` compare against occurred_at, a TIMESTAMPTZ. A bare date like
 * "2026-07-31" casts to midnight UTC, so `to` is widened to the END of that day
 * — otherwise a filter of from=1st&to=31st silently drops everything that
 * happened during the 31st, which is exactly the kind of off-by-one that makes
 * a monthly total quietly wrong.
 */
const buildWhere = (userId: string, f: ExpenseFilters) => {
  const params: unknown[] = [userId];
  let where = 'e.user_id = $1 AND e.deleted_at IS NULL';

  if (f.from) {
    params.push(f.from);
    where += ` AND e.occurred_at >= $${params.length}::timestamptz`;
  }
  if (f.to) {
    params.push(f.to);
    // A date-only bound becomes the inclusive end of that day.
    where += ` AND e.occurred_at < (CASE
                 WHEN $${params.length} ~ '^\\d{4}-\\d{2}-\\d{2}$'
                 THEN ($${params.length}::date + INTERVAL '1 day')
                 ELSE $${params.length}::timestamptz END)`;
  }
  if (f.categoryId) {
    params.push(f.categoryId);
    where += ` AND e.category_id = $${params.length}`;
  }
  if (f.wallet) {
    params.push(f.wallet);
    where += ` AND e.wallet = $${params.length}`;
  }
  if (f.search) {
    params.push(`%${f.search}%`);
    where += ` AND (e.description ILIKE $${params.length} OR e.payee ILIKE $${params.length})`;
  }

  return { where, params };
};

export const findAll = async (userId: string, f: ExpenseFilters, db: Executor = pool) => {
  const { where, params } = buildWhere(userId, f);

  const totalResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM expenses e WHERE ${where}`,
    params
  );

  const offset = (f.page - 1) * f.limit;
  const { rows } = await db.query(
    `SELECT e.id, e.user_id, e.category_id, e.occurred_at, e.amount, e.description,
            e.payee, e.wallet, e.created_at, e.updated_at, c.name AS category_name
       FROM expenses e
       LEFT JOIN expense_categories c ON c.id = e.category_id
      WHERE ${where}
      ORDER BY e.${f.sort} ${f.order.toUpperCase()}, e.id
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, f.limit, offset]
  );

  return { rows, total: Number(totalResult.rows[0]?.count ?? 0) };
};

export const findById = async (userId: string, id: string, db: Executor = pool) => {
  const { rows } = await db.query<ExpenseRow & { category_name: string | null }>(
    `SELECT e.id, e.user_id, e.category_id, e.occurred_at, e.amount, e.description,
            e.payee, e.wallet, e.created_at, e.updated_at, e.deleted_at,
            c.name AS category_name
       FROM expenses e
       LEFT JOIN expense_categories c ON c.id = e.category_id
      WHERE e.id = $1 AND e.user_id = $2 AND e.deleted_at IS NULL LIMIT 1`,
    [id, userId]
  );
  return rows[0] ?? null;
};

export const create = async (
  userId: string,
  input: {
    categoryId?: string | null;
    occurredAt: string;
    amount: string;
    description?: string | null;
    payee?: string | null;
    wallet: string;
  },
  db: Executor = pool
) => {
  const { rows } = await db.query<ExpenseRow>(
    `INSERT INTO expenses (user_id, category_id, occurred_at, amount, description, payee, wallet)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUMNS}`,
    [
      userId,
      input.categoryId ?? null,
      input.occurredAt,
      input.amount,
      input.description ?? null,
      input.payee ?? null,
      input.wallet,
    ]
  );
  return rows[0]!;
};

export const update = async (
  userId: string,
  id: string,
  input: {
    categoryId?: string | null;
    occurredAt?: string;
    amount?: string;
    description?: string | null;
    payee?: string | null;
    wallet?: string;
  },
  db: Executor = pool
) => {
  const { rows } = await db.query<ExpenseRow>(
    `UPDATE expenses
        SET category_id = COALESCE($3, category_id),
            occurred_at = COALESCE($4::timestamptz, occurred_at),
            amount      = COALESCE($5::numeric, amount),
            description = COALESCE($6, description),
            payee       = COALESCE($7, payee),
            wallet      = COALESCE($8::wallet, wallet)
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
      RETURNING ${COLUMNS}`,
    [
      id,
      userId,
      input.categoryId ?? null,
      input.occurredAt ?? null,
      input.amount ?? null,
      input.description ?? null,
      input.payee ?? null,
      input.wallet ?? null,
    ]
  );
  return rows[0] ?? null;
};

export const softDelete = async (userId: string, id: string, db: Executor = pool) => {
  const { rowCount } = await db.query(
    `UPDATE expenses SET deleted_at = now()
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId]
  );
  return (rowCount ?? 0) > 0;
};
