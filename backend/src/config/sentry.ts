import * as Sentry from '@sentry/node';
import { env } from './env';
import { logger } from './logger';

/**
 * Error reporting, active only when SENTRY_DSN is set.
 *
 * Without a DSN every function here is a no-op, so nothing about running the
 * app locally depends on having a Sentry account. This module must be imported
 * before the Express app so the SDK's instrumentation is in place first.
 */

let enabled = false;

/**
 * Runs on first import rather than being called from server.ts.
 *
 * Relying on a call placed above the other imports is fragile — a formatter or
 * an `import/first` lint rule would reorder it and silently disable reporting.
 * Tying initialisation to module load means importing this file is the only
 * ordering guarantee anyone has to maintain. It is idempotent, so the error
 * middleware importing `captureError` cannot re-initialise the SDK.
 */
export const initSentry = (): void => {
  if (enabled || !env.sentryDsn) return;

  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.nodeEnv,
    // Sample rather than trace everything — full tracing on a financial API is
    // mostly cost, and 10% is enough to spot a regression.
    tracesSampleRate: env.isProduction ? 0.1 : 1,
    /**
     * Financial payloads must not leave the system. Request bodies carry
     * amounts, notes and payees; headers carry bearer tokens and the refresh
     * cookie. None of it belongs in a third-party error report.
     */
    sendDefaultPii: false,
    beforeSend: (event) => {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.headers;
      }
      return event;
    },
  });

  enabled = true;
  logger.info('Sentry initialised');
};

export const captureError = (err: unknown, context?: Record<string, unknown>): void => {
  if (!enabled) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
};

export const closeSentry = async (): Promise<void> => {
  if (!enabled) return;
  await Sentry.close(2000);
};

initSentry();
