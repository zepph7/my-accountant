// First import on purpose: config/sentry initialises the SDK on load, so it
// must be evaluated before anything it instruments.
import { closeSentry } from './config/sentry';
import { createServer } from 'node:http';
import app from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { pool, checkDatabase } from './config/db';
import { initSockets, closeSockets } from './sockets';
import { startJobs, stopQueue } from './jobs';

const httpServer = createServer(app);

const start = async () => {
  // Fail fast on a database that is not reachable. A server that accepts
  // traffic and then 500s on every request is harder to diagnose than one that
  // never came up.
  if (!(await checkDatabase())) {
    logger.fatal('Database is unreachable — refusing to start');
    process.exit(1);
  }

  initSockets(httpServer);
  await startJobs();

  httpServer.listen(env.port, () => {
    logger.info(
      { port: env.port, env: env.nodeEnv, docs: `http://localhost:${env.port}/api/docs` },
      'Server listening'
    );
  });
};

/**
 * Graceful shutdown.
 *
 * Order matters: stop accepting new work, let in-flight requests finish, then
 * release the pool. Tearing down the pool first would fail the very requests
 * this sequence exists to protect. The 10s timer is the backstop for a
 * connection that never drains.
 */
let shuttingDown = false;

const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');

  const force = setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000);
  force.unref();

  try {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await closeSockets();
    await stopQueue();
    await pool.end();
    await closeSentry();
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

/**
 * An unhandled rejection leaves the process in an unknown state — some promise
 * chain gave up halfway. Logging and restarting is safer than continuing to
 * serve financial writes from a process whose invariants may no longer hold.
 */
process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled promise rejection');
  void shutdown('unhandledRejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  void shutdown('uncaughtException');
});

void start();
