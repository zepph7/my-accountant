import type { PoolClient } from 'pg';
import { pool } from '../config/db';

type Executor = Pick<PoolClient, 'query'> | typeof pool;

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  replaced_by: string | null;
}

export const create = async (
  input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string | null;
    ipAddress?: string | null;
  },
  db: Executor = pool
) => {
  const { rows } = await db.query<RefreshTokenRow>(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, token_hash, expires_at, revoked_at, replaced_by`,
    [
      input.userId,
      input.tokenHash,
      input.expiresAt,
      input.userAgent ?? null,
      input.ipAddress ?? null,
    ]
  );
  return rows[0]!;
};

export const findByHash = async (tokenHash: string, db: Executor = pool) => {
  const { rows } = await db.query<RefreshTokenRow>(
    `SELECT id, user_id, token_hash, expires_at, revoked_at, replaced_by
       FROM refresh_tokens WHERE token_hash = $1 LIMIT 1`,
    [tokenHash]
  );
  return rows[0] ?? null;
};

export const revoke = async (id: string, replacedBy: string | null, db: Executor = pool) => {
  await db.query(
    `UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2
      WHERE id = $1 AND revoked_at IS NULL`,
    [id, replacedBy]
  );
};

/**
 * Nuclear option, used on refresh-token reuse detection.
 *
 * Presenting an already-rotated token means either the legitimate client
 * replayed an old token, or someone stole one. We cannot tell which, and the
 * safe reading is theft — so every live session for that user is killed and
 * they must log in again.
 */
export const revokeAllForUser = async (userId: string, db: Executor = pool) => {
  const { rowCount } = await db.query(
    `UPDATE refresh_tokens SET revoked_at = now()
      WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
  return rowCount ?? 0;
};
