import type { PoolClient } from 'pg';
import { pool } from '../config/db';

type Executor = Pick<PoolClient, 'query'> | typeof pool;

export interface ExpenseCategoryRow {
  id: string;
  user_id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = 'id, user_id, name, created_at, updated_at';

// Same tenancy rule as every other repository: user_id is in every WHERE
// clause, and soft-deleted rows are invisible unless explicitly requested.
export const findAll = async (
  userId: string,
  opts: { page: number; limit: number; sort: string; order: 'asc' | 'desc'; search?: string },
  db: Executor = pool
) => {
  const params: unknown[] = [userId];
  let where = 'user_id = $1 AND deleted_at IS NULL';

  if (opts.search) {
    params.push(`%${opts.search}%`);
    where += ` AND name ILIKE $${params.length}`;
  }

  const totalResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM expense_categories WHERE ${where}`,
    params
  );

  const offset = (opts.page - 1) * opts.limit;
  const { rows } = await db.query<ExpenseCategoryRow>(
    `SELECT ${COLUMNS} FROM expense_categories WHERE ${where}
      ORDER BY ${opts.sort} ${opts.order.toUpperCase()}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, opts.limit, offset]
  );

  return { rows, total: Number(totalResult.rows[0]?.count ?? 0) };
};

export const findById = async (userId: string, id: string, db: Executor = pool) => {
  const { rows } = await db.query<ExpenseCategoryRow>(
    `SELECT ${COLUMNS} FROM expense_categories
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [id, userId]
  );
  return rows[0] ?? null;
};

export const create = async (userId: string, name: string, db: Executor = pool) => {
  const { rows } = await db.query<ExpenseCategoryRow>(
    `INSERT INTO expense_categories (user_id, name) VALUES ($1, $2) RETURNING ${COLUMNS}`,
    [userId, name]
  );
  return rows[0]!;
};

export const update = async (userId: string, id: string, name: string, db: Executor = pool) => {
  const { rows } = await db.query<ExpenseCategoryRow>(
    `UPDATE expense_categories SET name = $3
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING ${COLUMNS}`,
    [id, userId, name]
  );
  return rows[0] ?? null;
};

export const softDelete = async (userId: string, id: string, db: Executor = pool) => {
  const { rowCount } = await db.query(
    `UPDATE expense_categories SET deleted_at = now()
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId]
  );
  return (rowCount ?? 0) > 0;
};
