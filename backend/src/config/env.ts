import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

/**
 * Environment is validated once, at boot, and the process refuses to start if
 * anything required is missing or malformed. A misconfigured server that dies
 * immediately is far cheaper to diagnose than one that boots and then fails on
 * the first request that happens to touch the bad value.
 */
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    DATABASE_SSL: z.stringbool().default(true),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().max(100).default(10),
    // Path to the Supabase CA certificate. When set, the chain is verified
    // against it — this is the correct way to secure the connection.
    DATABASE_CA_CERT: z.string().optional(),
    // Escape hatch for local development only. Disabling verification permits
    // an active MITM to read and rewrite every query, so production refuses it
    // (see the refine below).
    DATABASE_SSL_REJECT_UNAUTHORIZED: z.stringbool().default(true),

    // 32 chars is the floor for a credible HS256 secret. Short secrets are
    // brute-forceable offline, and a leaked signing key means forged identities.
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be >= 32 chars'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be >= 32 chars'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('30d'),

    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CALLBACK_URL: z.url().optional(),
    OAUTH_SUCCESS_REDIRECT: z.url().optional(),

    QUEUE_ENABLED: z.stringbool().default(false),
    REDIS_URL: z.string().optional(),

    CORS_ORIGINS: z.string().default(''),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    LOG_PRETTY: z.stringbool().default(false),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

    SENTRY_DSN: z.string().optional(),
  })
  // The two JWT secrets must differ. If they match, a refresh token is a valid
  // access token and the whole short-lived-access-token design collapses.
  .refine((e) => e.JWT_ACCESS_SECRET !== e.JWT_REFRESH_SECRET, {
    message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different',
    path: ['JWT_REFRESH_SECRET'],
  })
  // Fail loudly rather than silently disabling Google sign-in at runtime.
  .refine((e) => !e.GOOGLE_CLIENT_ID || (e.GOOGLE_CLIENT_SECRET && e.GOOGLE_CALLBACK_URL), {
    message: 'GOOGLE_CLIENT_SECRET and GOOGLE_CALLBACK_URL are required when GOOGLE_CLIENT_ID is set',
    path: ['GOOGLE_CLIENT_SECRET'],
  })
  .refine((e) => !e.QUEUE_ENABLED || !!e.REDIS_URL, {
    message: 'REDIS_URL is required when QUEUE_ENABLED=true',
    path: ['REDIS_URL'],
  })
  // Refuse to boot a production server that trusts any certificate presented to
  // it. In production, either pin the CA or use a publicly-trusted endpoint.
  .refine(
    (e) =>
      e.NODE_ENV !== 'production' ||
      !e.DATABASE_SSL ||
      e.DATABASE_SSL_REJECT_UNAUTHORIZED ||
      !!e.DATABASE_CA_CERT,
    {
      message:
        'DATABASE_SSL_REJECT_UNAUTHORIZED=false is not permitted in production; set DATABASE_CA_CERT instead',
      path: ['DATABASE_SSL_REJECT_UNAUTHORIZED'],
    }
  );

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  // Deliberately console.error + exit rather than throwing: this runs before
  // the logger exists, and a Zod stack trace here would bury the actual cause.
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

const e = parsed.data;

export const env = {
  nodeEnv: e.NODE_ENV,
  isProduction: e.NODE_ENV === 'production',
  isTest: e.NODE_ENV === 'test',
  port: e.PORT,

  databaseUrl: e.DATABASE_URL,
  databaseSsl: e.DATABASE_SSL,
  databaseCaCert: e.DATABASE_CA_CERT,
  databaseRejectUnauthorized: e.DATABASE_SSL_REJECT_UNAUTHORIZED,
  databasePoolMax: e.DATABASE_POOL_MAX,

  jwt: {
    accessSecret: e.JWT_ACCESS_SECRET,
    refreshSecret: e.JWT_REFRESH_SECRET,
    accessTtl: e.JWT_ACCESS_TTL,
    refreshTtl: e.JWT_REFRESH_TTL,
  },

  google: {
    enabled: Boolean(e.GOOGLE_CLIENT_ID),
    clientId: e.GOOGLE_CLIENT_ID,
    clientSecret: e.GOOGLE_CLIENT_SECRET,
    callbackUrl: e.GOOGLE_CALLBACK_URL,
    successRedirect: e.OAUTH_SUCCESS_REDIRECT,
  },

  queue: { enabled: e.QUEUE_ENABLED, redisUrl: e.REDIS_URL },

  // Empty allowlist means "no cross-origin browser access", not "allow all".
  corsOrigins: e.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  log: { level: e.LOG_LEVEL, pretty: e.LOG_PRETTY },

  rateLimit: {
    windowMs: e.RATE_LIMIT_WINDOW_MS,
    max: e.RATE_LIMIT_MAX,
    authMax: e.AUTH_RATE_LIMIT_MAX,
  },

  sentryDsn: e.SENTRY_DSN,
} as const;

export type Env = typeof env;
