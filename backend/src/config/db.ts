import { readFileSync } from 'node:fs';
import { Pool, types } from 'pg';
import type { PoolClient, QueryResultRow } from 'pg';
import { env } from './env';
import { logger } from './logger';

/**
 * Money must never round-trip through a JS float.
 *
 * node-pg parses NUMERIC (OID 1700) into a JS number by default, which silently
 * destroys precision: 0.1 + 0.2 !== 0.3, and a cent lost per row becomes a
 * reconciliation bug nobody can trace. We override the parser to hand back the
 * raw string, and every money value is handled as a string or scaled integer in
 * the service layer.
 */
types.setTypeParser(types.builtins.NUMERIC, (value: string) => value);

// BIGINT (OID 20) likewise exceeds Number.MAX_SAFE_INTEGER; audit ids are BIGSERIAL.
types.setTypeParser(types.builtins.INT8, (value: string) => value);

/**
 * DATE must stay a plain calendar string.
 *
 * By default node-pg turns DATE into a JS Date at LOCAL midnight. Serialising
 * that to JSON converts it to UTC, so in any timezone east of Greenwich the
 * date travels backwards: an income recorded on 2026-07-27 is delivered to the
 * client as "2026-07-26T21:00:00.000Z". For a user in Nairobi (UTC+3) every
 * date is silently off by one, which corrupts every monthly boundary and every
 * date-range filter.
 *
 * A calendar date has no time and no timezone. Keeping it as "2026-07-27"
 * is both correct and what the API contract promises.
 *
 * TIMESTAMPTZ (expenses.occurred_at) is deliberately NOT overridden — that one
 * genuinely is an instant, and a Date object is the right representation.
 */
types.setTypeParser(types.builtins.DATE, (value: string) => value);

/**
 * TLS configuration.
 *
 * Certificate verification is ON by default. Disabling it encrypts the traffic
 * but authenticates nothing, so anyone able to intercept the connection can
 * present their own certificate and silently read or rewrite every query —
 * including password hashes and balances. env.ts refuses to boot production
 * with verification off.
 *
 * The right fix for Supabase is DATABASE_CA_CERT: download the project CA from
 * Settings -> Database -> SSL Configuration and point this at the .crt file.
 */
const buildSslConfig = () => {
  if (!env.databaseSsl) return undefined;

  if (env.databaseCaCert) {
    return {
      ca: readFileSync(env.databaseCaCert, 'utf8'),
      rejectUnauthorized: true,
    };
  }

  if (!env.databaseRejectUnauthorized) {
    logger.warn(
      'TLS certificate verification is DISABLED for the database connection. ' +
        'This is vulnerable to man-in-the-middle attacks. Set DATABASE_CA_CERT to fix.'
    );
    return { rejectUnauthorized: false };
  }

  return { rejectUnauthorized: true };
};

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.databasePoolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: buildSslConfig(),
});

pool.on('error', (err) => {
  // Fires for idle clients dropped by the server. Logging rather than throwing
  // keeps one dead socket from taking down the process.
  logger.error({ err }, 'unexpected postgres pool error');
});

export const query = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => pool.query<T>(text, params as never[]);

/**
 * Runs `fn` inside a transaction, rolling back on any throw.
 *
 * `SET LOCAL app.current_user_id` is what makes the audit triggers able to
 * attribute a change to a person: the trigger reads that GUC. SET LOCAL scopes
 * it to this transaction, so it cannot leak to the next caller that borrows
 * this pooled connection.
 */
export const withTransaction = async <T>(
  fn: (client: PoolClient) => Promise<T>,
  actorUserId?: string
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (actorUserId) {
      await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', actorUserId]);
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
};

export const checkDatabase = async (): Promise<boolean> => {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    logger.error({ err }, 'database health check failed');
    return false;
  }
};
