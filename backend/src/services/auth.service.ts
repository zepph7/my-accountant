import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';
import { withTransaction } from '../config/db';
import { ApiError } from '../utils/ApiError';
import * as users from '../repositories/user.repository';
import * as refreshTokens from '../repositories/refreshToken.repository';
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
} from './token.service';
import type { PublicUser, UserRow } from '../types/models';

const BCRYPT_ROUNDS = 12;

/**
 * Seeded for every new user inside the registration transaction.
 *
 * Per the spec these are per-user rows, not a global table: each user must be
 * able to edit their own percentages without touching anyone else's. Seeding
 * inside the transaction means a user can never exist without a distribution
 * set — otherwise their first income would silently distribute to nothing.
 */
const DEFAULT_DISTRIBUTION = [
  { name: 'Essentials', percentage: '60.00' },
  { name: 'Savings', percentage: '20.00' },
  { name: 'Investments', percentage: '10.00' },
  { name: 'Emergency', percentage: '10.00' },
];

export const toPublicUser = (row: UserRow): PublicUser => ({
  id: row.id,
  email: row.email,
  phone: row.phone,
  firstName: row.first_name,
  lastName: row.last_name,
  avatarUrl: row.avatar_url,
  role: row.role,
  timezone: row.timezone,
  isVerified: row.is_verified,
  createdAt: row.created_at,
});

const seedDistributionCategories = async (userId: string, client: PoolClient) => {
  const values = DEFAULT_DISTRIBUTION.map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(', ');
  const params = DEFAULT_DISTRIBUTION.flatMap((c) => [c.name, c.percentage]);

  await client.query(
    `INSERT INTO distribution_categories (user_id, name, percentage) VALUES ${values}`,
    [userId, ...params]
  );
};

interface IssueContext {
  userAgent?: string | null;
  ipAddress?: string | null;
}

const issueTokens = async (
  user: UserRow,
  ctx: IssueContext,
  db: Pick<PoolClient, 'query'> | undefined = undefined
) => {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    timezone: user.timezone,
  });

  const refreshToken = generateRefreshToken();

  await refreshTokens.create(
    {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshTokenExpiry(),
      userAgent: ctx.userAgent,
      ipAddress: ctx.ipAddress,
    },
    db as never
  );

  return { accessToken, refreshToken, user: toPublicUser(user) };
};

export const register = async (
  input: {
    email: string;
    phone: string;
    password: string;
    firstName: string;
    lastName: string;
    timezone?: string;
  },
  ctx: IssueContext
) => {
  /**
   * Both identifiers are checked up front so the caller gets a message naming
   * the field, rather than the generic 409 a UNIQUE violation produces. The
   * database constraints remain the authority — these checks race, and losing
   * that race is correctly still a 409.
   */
  if (await users.findByEmail(input.email)) {
    throw ApiError.conflict('An account with that email already exists');
  }

  if (await users.findByPhone(input.phone)) {
    throw ApiError.conflict('An account with that phone number already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  return withTransaction(async (client) => {
    const user = await users.create(
      {
        email: input.email,
        phone: input.phone,
        firstName: input.firstName,
        lastName: input.lastName,
        passwordHash,
        authProvider: 'local',
        timezone: input.timezone ?? 'UTC',
      },
      client
    );

    await seedDistributionCategories(user.id, client);

    return issueTokens(user, ctx, client);
  });
};

/**
 * Signs in with either an email or a phone number.
 *
 * The validator guarantees exactly one is present. Both paths converge on the
 * same comparison so that neither identifier leaks more than the other: the
 * error text and the work done are identical whether the account is unknown,
 * has no password (Google-only), or the password is simply wrong.
 */
export const login = async (
  input: { email?: string; phone?: string; password: string },
  ctx: IssueContext
) => {
  const user = input.phone
    ? await users.findByPhone(input.phone)
    : input.email
      ? await users.findByEmail(input.email)
      : null;

  // Identical error and comparable timing whether the identifier is unknown or
  // the password is wrong — otherwise the endpoint becomes an account enumerator.
  if (!user || !user.password_hash) {
    await bcrypt.compare(input.password, '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    throw ApiError.unauthorized('Invalid credentials');
  }

  const valid = await bcrypt.compare(input.password, user.password_hash);
  if (!valid) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  return issueTokens(user, ctx);
};

/** The signed-in user's own profile, read fresh rather than off the token. */
export const getProfile = async (userId: string) => {
  const user = await users.findById(userId);
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  return toPublicUser(user);
};

/**
 * Updates the signed-in user's profile.
 *
 * The phone uniqueness check excludes the caller's own row — otherwise
 * re-submitting an unchanged number would collide with itself and report the
 * user's own phone as already taken.
 *
 * Changing `timezone` does NOT take effect for reports until the access token
 * is refreshed: the zone is a JWT claim, and `authenticate` deliberately does
 * not hit the database on every request. The caller is told so in the response
 * rather than left to wonder why yesterday's buckets did not move.
 */
export const updateProfile = async (userId: string, input: users.UpdateProfileInput) => {
  if (input.phone) {
    const existing = await users.findByPhone(input.phone);
    if (existing && existing.id !== userId) {
      throw ApiError.conflict('An account with that phone number already exists');
    }
  }

  const user = await users.updateProfile(userId, input);
  if (!user) throw ApiError.unauthorized('Account no longer exists');

  return {
    user: toPublicUser(user),
    timezoneChanged: Boolean(input.timezone),
  };
};

/**
 * Rotates a refresh token, detecting reuse.
 *
 * Every refresh mints a new token and revokes the old one. If a token that was
 * already revoked is presented, it was replayed — we cannot distinguish a
 * stolen token from a buggy client, so all of that user's sessions are revoked.
 */
export const refresh = async (token: string, ctx: IssueContext) => {
  const tokenHash = hashRefreshToken(token);
  const stored = await refreshTokens.findByHash(tokenHash);

  if (!stored) {
    throw ApiError.unauthorized('Invalid refresh token');
  }

  if (stored.revoked_at) {
    await refreshTokens.revokeAllForUser(stored.user_id);
    throw ApiError.unauthorized('Refresh token reuse detected. Please sign in again.');
  }

  if (stored.expires_at.getTime() < Date.now()) {
    throw ApiError.unauthorized('Refresh token expired');
  }

  const user = await users.findById(stored.user_id);
  if (!user) {
    throw ApiError.unauthorized('Account no longer exists');
  }

  return withTransaction(async (client) => {
    const issued = await issueTokens(user, ctx, client);
    const newHash = hashRefreshToken(issued.refreshToken);
    const created = await refreshTokens.findByHash(newHash, client);

    await refreshTokens.revoke(stored.id, created?.id ?? null, client);

    return issued;
  }, user.id);
};

export const logout = async (token: string) => {
  const stored = await refreshTokens.findByHash(hashRefreshToken(token));

  // Idempotent: logging out an already-dead session is a success, not a 404.
  if (stored && !stored.revoked_at) {
    await refreshTokens.revoke(stored.id, null);
  }
};

/**
 * Google sign-in. Three cases, in order:
 *   1. Known google_id           -> sign in.
 *   2. Known email, no google_id -> LINK, preserving the existing account.
 *   3. Unknown                   -> create, pre-verified (Google vouched).
 */
export const googleSignIn = async (
  profile: { googleId: string; email: string; firstName: string; lastName: string; avatarUrl: string | null },
  ctx: IssueContext
) => {
  const byGoogle = await users.findByGoogleId(profile.googleId);
  if (byGoogle) {
    return issueTokens(byGoogle, ctx);
  }

  const byEmail = await users.findByEmail(profile.email);
  if (byEmail) {
    const linked = await users.linkGoogleAccount(byEmail.id, profile.googleId, profile.avatarUrl);
    return issueTokens(linked, ctx);
  }

  return withTransaction(async (client) => {
    const user = await users.create(
      {
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        passwordHash: null,
        authProvider: 'google',
        googleId: profile.googleId,
        avatarUrl: profile.avatarUrl,
        isVerified: true,
      },
      client
    );

    await seedDistributionCategories(user.id, client);

    return issueTokens(user, ctx, client);
  });
};
