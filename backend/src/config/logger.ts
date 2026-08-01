import pino from 'pino';
import { env } from './env';

/**
 * Structured JSON logging.
 *
 * The redact list is the important part: these paths are the ones that
 * routinely carry credentials, and Pino strips them before serialisation, so a
 * secret cannot reach the log sink even if some future handler logs a whole
 * request or user row by accident. Redaction at the logger is the only place
 * this can be enforced globally — per-call-site discipline always eventually
 * fails.
 */
export const logger = pino({
  level: env.log.level,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.password_hash',
      '*.passwordHash',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      '*.token_hash',
      'DATABASE_URL',
      '*.clientSecret',
    ],
    censor: '[redacted]',
  },
  ...(env.log.pretty
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
});

export type Logger = typeof logger;
