import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

const handler = () => {
  throw ApiError.tooManyRequests();
};

export const generalLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  limit: env.rateLimit.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
});

/**
 * Much tighter budget for credential endpoints — this is the brute-force
 * surface. Keyed by IP + email so one attacker cannot lock out every user from
 * a shared NAT, and `skipSuccessfulRequests` means a legitimate user typing a
 * password correctly never burns budget.
 */
export const authLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  limit: env.rateLimit.authMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  // ipKeyGenerator, not raw req.ip. A single IPv6 customer is routinely handed
  // a /64 — billions of addresses — so keying on the full address would let an
  // attacker rotate source addresses and never hit the limit. The helper masks
  // IPv6 to its subnet while leaving IPv4 untouched.
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
    return `${ipKeyGenerator(req.ip ?? '')}:${email}`;
  },
  handler,
});
