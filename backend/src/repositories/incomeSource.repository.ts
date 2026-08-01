import type { PoolClient } from 'pg';
import { pool } from '../config/db';

type Executor = Pick<PoolClient, 'query'> | typeof pool;

export interface IncomeSourceRow {
  id: string;
  user_id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = 'id, user_id, name, created_at, updated_at';

/**
 * Every function here takes userId and includes it in the WHERE clause.
 *
 * This is the tenancy boundary. A "find by id" that omits user_id would let
 * anyone who guesses a UUID read someone else's finances, and no amount of
 * controller-level checking reliably prevents that once the pattern exists. So
 * the repository never exposes an unscoped lookup at all.
 *
 * `deleted_at IS NULL` is likewise applied here rather than by callers — soft
 * deleted rows are invisible unless a function explicitly opts in.
 */
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
    `SELECT COUNT(*)::text AS count FROM income_sources WHERE ${where}`,
    params
  );
  const total = Number(totalResult.rows[0]?.count ?? 0);

  // opts.sort and opts.order come from a Zod enum allowlist, never raw input.
  const offset = (opts.page - 1) * opts.limit;
  const { rows } = await db.query<IncomeSourceRow>(
    `SELECT ${COLUMNS} FROM income_sources WHERE ${where}
      ORDER BY ${opts.sort} ${opts.order.toUpperCase()}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, opts.limit, offset]
  );

  return { rows, total };
};

export const findById = async (userId: string, id: string, db: Executor = pool) => {
  const { rows } = await db.query<IncomeSourceRow>(
    `SELECT ${COLUMNS} FROM income_sources
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [id, userId]
  );
  return rows[0] ?? null;
};

export const create = async (userId: string, name: string, db: Executor = pool) => {
  const { rows } = await db.query<IncomeSourceRow>(
    `INSERT INTO income_sources (user_id, name) VALUES ($1, $2) RETURNING ${COLUMNS}`,
    [userId, name]
  );
  return rows[0]!;
};

export const update = async (userId: string, id: string, name: string, db: Executor = pool) => {
  const { rows } = await db.query<IncomeSourceRow>(
    `UPDATE income_sources SET name = $3
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
      RETURNING ${COLUMNS}`,
    [id, userId, name]
  );
  return rows[0] ?? null;
};

/** Soft delete. Financial history referencing this source stays intact. */
export const softDelete = async (userId: string, id: string, db: Executor = pool) => {
  const { rowCount } = await db.query(
    `UPDATE income_sources SET deleted_at = now()
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId]
  );
  return (rowCount ?? 0) > 0;
};
