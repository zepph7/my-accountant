import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError';
import { verifyAccessToken } from '../services/token.service';
import type { UserRole } from '../types/models';

/**
 * Verifies the bearer token and attaches req.user.
 *
 * Note what this deliberately does NOT do: hit the database. The JWT carries
 * everything needed to scope queries, and a lookup per request would add a
 * round trip to every call. The trade-off is that a role change or deletion
 * only takes effect when the short-lived access token expires — which is what
 * the 15-minute TTL is for.
 */
export const authenticate = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return next(ApiError.unauthorized('Missing or malformed Authorization header'));
  }

  try {
    const payload = verifyAccessToken(header.slice(7).trim());
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      timezone: payload.timezone,
    };
    return next();
  } catch (err) {
    return next(err);
  }
};

/** Route guard for privileged endpoints. Must run after `authenticate`. */
export const authorize =
  (...roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden());
    }
    return next();
  };
