import type { PoolClient } from 'pg';
import { pool } from '../config/db';
import type { IncomeRow } from '../types/models';

type Executor = Pick<PoolClient, 'query'> | typeof pool;

const COLUMNS = `id, user_id, source_id, date, amount, notes, wallet,
                 created_at, updated_at, deleted_at`;

export interface IncomeFilters {
  page: number;
  limit: number;
  sort: string;
  order: 'asc' | 'desc';
  from?: string;
  to?: string;
  sourceId?: string;
  wallet?: string;
}

export interface DistributionLine {
  id: string;
  distribution_category_id: string;
  category_name: string;
  amount: string;
  percentage_applied: string;
}

/** Builds the shared WHERE clause so list and count can never diverge. */
const buildWhere = (userId: string, f: IncomeFilters) => {
  const params: unknown[] = [userId];
  let where = 'i.user_id = $1 AND i.deleted_at IS NULL';

  if (f.from) {
    params.push(f.from);
    where += ` AND i.date >= $${params.length}`;
  }
  if (f.to) {
    params.push(f.to);
    where += ` AND i.date <= $${params.length}`;
  }
  if (f.sourceId) {
    params.push(f.sourceId);
    where += ` AND i.source_id = $${params.length}`;
  }
  if (f.wallet) {
    params.push(f.wallet);
    where += ` AND i.wallet = $${params.length}`;
  }

  return { where, params };
};

export const findAll = async (userId: string, f: IncomeFilters, db: Executor = pool) => {
  const { where, params } = buildWhere(userId, f);

  const totalResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM incomes i WHERE ${where}`,
    params
  );
  const total = Number(totalResult.rows[0]?.count ?? 0);

  const offset = (f.page - 1) * f.limit;
  const { rows } = await db.query(
    `SELECT i.id, i.user_id, i.source_id, i.date, i.amount, i.notes, i.wallet,
            i.created_at, i.updated_at, s.name AS source_name
       FROM incomes i
       LEFT JOIN income_sources s ON s.id = i.source_id
      WHERE ${where}
      ORDER BY i.${f.sort} ${f.order.toUpperCase()}, i.id
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, f.limit, offset]
  );

  return { rows, total };
};

export const findById = async (userId: string, id: string, db: Executor = pool) => {
  const { rows } = await db.query<IncomeRow & { source_name: string | null }>(
    `SELECT i.id, i.user_id, i.source_id, i.date, i.amount, i.notes, i.wallet,
            i.created_at, i.updated_at, i.deleted_at, s.name AS source_name
       FROM incomes i
       LEFT JOIN income_sources s ON s.id = i.source_id
      WHERE i.id = $1 AND i.user_id = $2 AND i.deleted_at IS NULL LIMIT 1`,
    [id, userId]
  );
  return rows[0] ?? null;
};

/** The distribution breakdown returned alongside an income on GET. */
export const findDistribution = async (incomeId: string, db: Executor = pool) => {
  const { rows } = await db.query<DistributionLine>(
    `SELECT d.id, d.distribution_category_id, c.name AS category_name,
            d.amount, d.percentage_applied
       FROM distributed_incomes d
       JOIN distribution_categories c ON c.id = d.distribution_category_id
      WHERE d.income_id = $1 AND d.deleted_at IS NULL
      ORDER BY d.amount DESC`,
    [incomeId]
  );
  return rows;
};

export const create = async (
  userId: string,
  input: { sourceId?: string | null; date: string; amount: string; notes?: string | null; wallet: string },
  db: Executor = pool
) => {
  const { rows } = await db.query<IncomeRow>(
    `INSERT INTO incomes (user_id, source_id, date, amount, notes, wallet)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLUMNS}`,
    [userId, input.sourceId ?? null, input.date, input.amount, input.notes ?? null, input.wallet]
  );
  return rows[0]!;
};

export const update = async (
  userId: string,
  id: string,
  input: { sourceId?: string | null; date?: string; amount?: string; notes?: string | null; wallet?: string },
  db: Executor = pool
) => {
  // COALESCE lets a single statement handle partial updates without building
  // SQL by concatenation.
  const { rows } = await db.query<IncomeRow>(
    `UPDATE incomes
        SET source_id = COALESCE($3, source_id),
            date      = COALESCE($4::date, date),
            amount    = COALESCE($5::numeric, amount),
            notes     = COALESCE($6, notes),
            wallet    = COALESCE($7::wallet, wallet)
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
      RETURNING ${COLUMNS}`,
    [
      id,
      userId,
      input.sourceId ?? null,
      input.date ?? null,
      input.amount ?? null,
      input.notes ?? null,
      input.wallet ?? null,
    ]
  );
  return rows[0] ?? null;
};

export const softDelete = async (userId: string, id: string, db: Executor = pool) => {
  const { rowCount } = await db.query(
    `UPDATE incomes SET deleted_at = now()
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId]
  );
  return (rowCount ?? 0) > 0;
};

export const replaceDistribution = async (
  userId: string,
  incomeId: string,
  splits: { distributionCategoryId: string; amount: string; percentageApplied: string }[],
  db: Executor
) => {
  // Soft-delete the previous split set rather than UPDATE-in-place: the old
  // rows are financial history, and the audit trail should show what the
  // income used to be divided into.
  await db.query(
    `UPDATE distributed_incomes SET deleted_at = now()
      WHERE income_id = $1 AND deleted_at IS NULL`,
    [incomeId]
  );

  if (splits.length === 0) return;

  const values = splits
    .map((_, i) => `($1, $2, $${i * 3 + 3}, $${i * 3 + 4}, $${i * 3 + 5})`)
    .join(', ');
  const params = splits.flatMap((s) => [s.distributionCategoryId, s.amount, s.percentageApplied]);

  await db.query(
    `INSERT INTO distributed_incomes
       (user_id, income_id, distribution_category_id, amount, percentage_applied)
     VALUES ${values}`,
    [userId, incomeId, ...params]
  );
};

export const findActiveDistributionCategories = async (userId: string, db: Executor = pool) => {
  const { rows } = await db.query<{ id: string; name: string; percentage: string }>(
    `SELECT id, name, percentage FROM distribution_categories
      WHERE user_id = $1 AND deleted_at IS NULL ORDER BY percentage DESC, id`,
    [userId]
  );
  return rows;
};
