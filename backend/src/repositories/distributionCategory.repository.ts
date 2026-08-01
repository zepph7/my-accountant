import type { PoolClient } from 'pg';
import { pool } from '../config/db';

type Executor = Pick<PoolClient, 'query'> | typeof pool;

/**
 * CRUD for the categories income is split across.
 *
 * income.repository keeps its own `findActiveDistributionCategories` — that one
 * runs inside the income transaction and returns only what the split calculation
 * needs. This file is the management surface: paginated, soft-delete aware, and
 * never called from inside the distribution path.
 */

export interface DistributionCategoryRow {
  id: string;
  user_id: string;
  name: string;
  percentage: string;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = 'id, user_id, name, percentage, created_at, updated_at';

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
    `SELECT COUNT(*)::text AS count FROM distribution_categories WHERE ${where}`,
    params
  );

  const offset = (opts.page - 1) * opts.limit;
  const { rows } = await db.query<DistributionCategoryRow>(
    `SELECT ${COLUMNS} FROM distribution_categories WHERE ${where}
      ORDER BY ${opts.sort} ${opts.order.toUpperCase()}, id
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, opts.limit, offset]
  );

  return { rows, total: Number(totalResult.rows[0]?.count ?? 0) };
};

export const findById = async (userId: string, id: string, db: Executor = pool) => {
  const { rows } = await db.query<DistributionCategoryRow>(
    `SELECT ${COLUMNS} FROM distribution_categories
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [id, userId]
  );
  return rows[0] ?? null;
};

export const create = async (
  userId: string,
  input: { name: string; percentage: string },
  db: Executor = pool
) => {
  const { rows } = await db.query<DistributionCategoryRow>(
    `INSERT INTO distribution_categories (user_id, name, percentage)
     VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
    [userId, input.name, input.percentage]
  );
  return rows[0]!;
};

export const update = async (
  userId: string,
  id: string,
  input: { name?: string; percentage?: string },
  db: Executor = pool
) => {
  const { rows } = await db.query<DistributionCategoryRow>(
    `UPDATE distribution_categories
        SET name       = COALESCE($3, name),
            percentage = COALESCE($4::numeric, percentage)
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
      RETURNING ${COLUMNS}`,
    [id, userId, input.name ?? null, input.percentage ?? null]
  );
  return rows[0] ?? null;
};

/**
 * Soft-delete only.
 *
 * distributed_incomes references this table with ON DELETE RESTRICT, so a hard
 * delete would either fail or destroy the record of how past income was split.
 * Retiring a category must never rewrite history — future income simply stops
 * being allocated to it.
 */
export const softDelete = async (userId: string, id: string, db: Executor = pool) => {
  const { rowCount } = await db.query(
    `UPDATE distribution_categories SET deleted_at = now()
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId]
  );
  return (rowCount ?? 0) > 0;
};

/** Sum of the user's live percentages, for the 100% warning. */
export const totalPercentage = async (userId: string, db: Executor = pool) => {
  const { rows } = await db.query<{ total: string }>(
    `SELECT COALESCE(SUM(percentage), 0)::numeric(6,2) AS total
       FROM distribution_categories
      WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  return rows[0]?.total ?? '0.00';
};
