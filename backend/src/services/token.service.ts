import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import type { UserRole } from '../types/models';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  timezone: string;
}

/**
 * Access tokens are short-lived JWTs verified statelessly on every request.
 *
 * Refresh tokens are deliberately NOT JWTs: they are opaque random strings
 * whose SHA-256 hash is stored in refresh_tokens. A JWT refresh token cannot be
 * revoked before expiry without a server-side list anyway, so making it opaque
 * removes the temptation to trust it statelessly and makes rotation and
 * revocation the only path.
 */
export const signAccessToken = (payload: AccessTokenPayload): string =>
  jwt.sign(payload, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessTtl,
    issuer: 'my-accountant',
  } as SignOptions);

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  try {
    return jwt.verify(token, env.jwt.accessSecret, {
      issuer: 'my-accountant',
    }) as AccessTokenPayload;
  } catch (err) {
    // Distinguish expiry from tampering: clients retry on the former by
    // refreshing, but must re-authenticate on the latter.
    if (err instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Access token expired');
    }
    throw ApiError.unauthorized('Invalid access token');
  }
};

/** Cryptographically random, URL-safe, 256 bits of entropy. */
export const generateRefreshToken = (): string => randomBytes(32).toString('base64url');

/**
 * Plain SHA-256 rather than bcrypt.
 *
 * Refresh tokens are already 256 bits of uniform randomness, so there is no
 * low-entropy secret for an attacker to guess and nothing for a slow KDF to
 * protect. bcrypt here would only add latency to every refresh, and its 72-byte
 * input cap is an additional trap. Password hashing is a different problem and
 * uses bcrypt (see password.service).
 */
export const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/** Parses "30d" / "15m" / "3600" into a future Date. */
export const refreshTokenExpiry = (): Date => {
  const ttl = env.jwt.refreshTtl;
  const match = /^(\d+)([smhd])?$/.exec(ttl);

  if (!match) {
    throw new Error(`Invalid JWT_REFRESH_TTL: ${ttl}`);
  }

  const value = Number(match[1]);
  const unitMs: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return new Date(Date.now() + value * (unitMs[match[2] ?? 's'] ?? 1000));
};
