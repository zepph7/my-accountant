import type { PoolClient } from 'pg';
import { pool } from '../config/db';
import type { AuthProvider, UserRow } from '../types/models';

type Executor = Pick<PoolClient, 'query'> | typeof pool;

const COLUMNS = `id, email, phone, first_name, last_name, password_hash, auth_provider,
                 google_id, avatar_url, is_verified, role, timezone, created_at, updated_at`;

export interface CreateUserInput {
  email: string;
  phone?: string | null;
  firstName: string;
  lastName: string;
  passwordHash?: string | null;
  authProvider?: AuthProvider;
  googleId?: string | null;
  avatarUrl?: string | null;
  isVerified?: boolean;
  timezone?: string;
}

export const findByEmail = async (email: string, db: Executor = pool) => {
  // citext column, so this comparison is already case-insensitive.
  const { rows } = await db.query<UserRow>(
    `SELECT ${COLUMNS} FROM users WHERE email = $1 LIMIT 1`,
    [email]
  );
  return rows[0] ?? null;
};

/**
 * Phone is stored in E.164 only (see migration 0010), so this is an exact
 * match — no normalisation happens here. The validator canonicalises input
 * before it ever reaches the repository, which is what keeps the UNIQUE
 * constraint meaningful.
 */
export const findByPhone = async (phone: string, db: Executor = pool) => {
  const { rows } = await db.query<UserRow>(
    `SELECT ${COLUMNS} FROM users WHERE phone = $1 LIMIT 1`,
    [phone]
  );
  return rows[0] ?? null;
};

export const findById = async (id: string, db: Executor = pool) => {
  const { rows } = await db.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE id = $1 LIMIT 1`, [
    id,
  ]);
  return rows[0] ?? null;
};

export const findByGoogleId = async (googleId: string, db: Executor = pool) => {
  const { rows } = await db.query<UserRow>(
    `SELECT ${COLUMNS} FROM users WHERE google_id = $1 LIMIT 1`,
    [googleId]
  );
  return rows[0] ?? null;
};

export const create = async (input: CreateUserInput, db: Executor = pool) => {
  const { rows } = await db.query<UserRow>(
    `INSERT INTO users (email, phone, first_name, last_name, password_hash, auth_provider,
                        google_id, avatar_url, is_verified, timezone)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${COLUMNS}`,
    [
      input.email,
      input.phone ?? null,
      input.firstName,
      input.lastName,
      input.passwordHash ?? null,
      input.authProvider ?? 'local',
      input.googleId ?? null,
      input.avatarUrl ?? null,
      input.isVerified ?? false,
      input.timezone ?? 'UTC',
    ]
  );
  return rows[0]!;
};

export interface UpdateProfileInput {
  phone?: string;
  firstName?: string;
  lastName?: string;
  timezone?: string;
}

/**
 * Partial profile update.
 *
 * Email is deliberately absent. It is the key Google sign-in matches on and a
 * login identifier in its own right, so changing it silently would let someone
 * take over an address they have not proven they control — that needs a
 * verification round trip, not a PATCH.
 */
export const updateProfile = async (
  userId: string,
  input: UpdateProfileInput,
  db: Executor = pool
) => {
  const { rows } = await db.query<UserRow>(
    `UPDATE users
        SET phone      = COALESCE($2, phone),
            first_name = COALESCE($3, first_name),
            last_name  = COALESCE($4, last_name),
            timezone   = COALESCE($5, timezone)
      WHERE id = $1
      RETURNING ${COLUMNS}`,
    [userId, input.phone ?? null, input.firstName ?? null, input.lastName ?? null, input.timezone ?? null]
  );
  return rows[0] ?? null;
};

/**
 * Attaches Google credentials to an existing local account.
 *
 * This is the account-linking path: someone registered with a password, then
 * later clicked "Sign in with Google" using the same verified email. Creating a
 * second user would orphan all of their financial history behind a login they
 * no longer use, so we link instead. The password is left intact so both
 * methods keep working.
 */
export const linkGoogleAccount = async (
  userId: string,
  googleId: string,
  avatarUrl: string | null,
  db: Executor = pool
) => {
  const { rows } = await db.query<UserRow>(
    `UPDATE users
        SET google_id   = $2,
            avatar_url  = COALESCE(avatar_url, $3),
            is_verified = true
      WHERE id = $1
      RETURNING ${COLUMNS}`,
    [userId, googleId, avatarUrl]
  );
  return rows[0]!;
};
