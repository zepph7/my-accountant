import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import { env } from './config/env';
import { logger } from './config/logger';
import routes from './routes';
import { errorMiddleware, notFoundHandler } from './middlewares/error.middleware';
import { generalLimiter } from './middlewares/rateLimiter.middleware';

const app = express();

// Behind Supabase/Vercel/nginx the client IP is in X-Forwarded-For. Without
// this, express-rate-limit sees the proxy's IP and rate-limits every user as
// one. `1` (not `true`) trusts only the immediate proxy, so a client cannot
// spoof the header to dodge limits.
app.set('trust proxy', 1);

/**
 * Helmet everywhere, minus the Content-Security-Policy on the docs route.
 *
 * Swagger UI serves its own inline styles and bootstrap script, which the
 * default CSP blocks outright — the page renders blank. The exception is
 * scoped to that one path rather than weakening the policy for the whole API,
 * and /api/docs serves a static contract document with no user data on it.
 */
const docsCsp = helmet({ contentSecurityPolicy: false });
const strictCsp = helmet();

app.use((req, res, next) =>
  req.path.startsWith('/api/docs') ? docsCsp(req, res, next) : strictCsp(req, res, next)
);

/**
 * CORS is an explicit allowlist, with two rules that are easy to get wrong.
 *
 * 1. A SAME-ORIGIN request is never cross-origin and must never be blocked.
 *    Browsers still attach an `Origin` header to same-origin POST/PATCH/DELETE,
 *    so a naive allowlist check rejects the app's own pages — which is exactly
 *    what broke Swagger UI's "Try it out" at /api/docs. CORS exists to police
 *    OTHER origins; the server's own is not one of them.
 *
 * 2. A disallowed origin is answered WITHOUT the Access-Control-Allow-Origin
 *    header, not with an error. CORS is enforced by the browser: omitting the
 *    header is the actual mechanism. Throwing here turns a browser-side policy
 *    into a server-side 500, which hides real failures behind a misleading
 *    status and breaks any non-browser client that happens to send an Origin.
 *
 * A missing Origin (native apps, curl, server-to-server) is allowed — the
 * header is a browser mechanism and its absence signals nothing.
 */
const corsDelegate: Parameters<typeof cors>[0] = (req, callback) => {
  const origin = req.headers.origin;
  const host = req.headers.host;

  const isSameOrigin =
    Boolean(origin) && Boolean(host) && (origin === `http://${host}` || origin === `https://${host}`);

  const allowed = !origin || isSameOrigin || env.corsOrigins.includes(origin);

  if (!allowed) {
    logger.debug({ origin }, 'CORS: origin not in allowlist, response will omit CORS headers');
  }

  // `origin: true` reflects the caller's origin, which is required alongside
  // `credentials` — the spec forbids pairing a wildcard with credentials.
  callback(null, { origin: allowed, credentials: true });
};

app.use(cors(corsDelegate));

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(cookieParser());

app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const id = (req.headers['x-request-id'] as string) || randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },
    // 4xx is the client's fault, not an application error — logging it at
    // error level makes real failures impossible to find.
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  })
);

app.use(generalLimiter);

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorMiddleware);

export default app;
