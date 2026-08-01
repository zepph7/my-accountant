import { pool } from '../config/db';
import { logger } from '../config/logger';
import * as reportService from '../services/report.service';
import { emitToUser } from '../sockets';
import { startQueue, stopQueue, enqueue } from './queue';

/**
 * Job handlers.
 *
 * Both are deliberately small and idempotent: BullMQ retries on failure, and a
 * handler that is not safe to run twice turns a transient Redis blip into
 * duplicated work.
 */

/**
 * Builds a month's summary and pushes it to the user over the socket.
 *
 * This is the sample async job the spec asks for, and it is a genuine fit for
 * one — it fans out across every report query, so running it on the request
 * path would make the caller wait for work they did not ask for.
 */
const monthlySummary = async ({ userId, month }: { userId: string; month: string }) => {
  const { rows } = await pool.query<{ timezone: string }>(
    'SELECT timezone FROM users WHERE id = $1 LIMIT 1',
    [userId]
  );
  const timezone = rows[0]?.timezone ?? 'UTC';

  // `month` is YYYY-MM; the report layer widens a bare `to` to end of day, so
  // the last day of the month is included.
  const from = `${month}-01`;
  const end = new Date(`${from}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  const to = end.toISOString().slice(0, 10);

  const summary = await reportService.summary({ id: userId, timezone }, { from, to });
  emitToUser(userId, 'budget:alert', { kind: 'monthly-summary', month, summary });

  logger.info({ userId, month }, 'monthly summary generated');
  return summary;
};

/**
 * Drops refresh tokens that are past expiry or long revoked.
 *
 * Expired tokens are already rejected at verification time, so this is pure
 * housekeeping — the table would otherwise grow forever with rows nothing can
 * ever use.
 */
const cleanupExpiredTokens = async () => {
  const { rowCount } = await pool.query(
    `DELETE FROM refresh_tokens
      WHERE expires_at < now() - INTERVAL '30 days'
         OR (revoked_at IS NOT NULL AND revoked_at < now() - INTERVAL '30 days')`
  );
  logger.info({ removed: rowCount ?? 0 }, 'expired refresh tokens purged');
  return { removed: rowCount ?? 0 };
};

export const startJobs = () =>
  startQueue({
    'monthly-summary': monthlySummary,
    'cleanup-expired-tokens': cleanupExpiredTokens,
  });

export { stopQueue, enqueue };
