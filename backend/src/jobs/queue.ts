import type { Job, Queue, Worker } from 'bullmq';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Background jobs, optional by configuration.
 *
 * The spec requires the app to run with no Redis at all, so bullmq and ioredis
 * are loaded with a DYNAMIC import inside the enabled branch. A static import
 * would pull the Redis client into every process — including tests and any
 * deployment that never wanted queueing — and a connection error at module load
 * is not something a caller can catch.
 *
 * When queueing is off, `enqueue` runs nothing and says so once at boot. It
 * deliberately does NOT fall back to running the job inline: these jobs exist
 * because they are too slow for the request path, and quietly doing them there
 * anyway would turn a disabled feature into a latency bug.
 */

export const QUEUE_NAME = 'my-accountant';

export type JobName = 'monthly-summary' | 'cleanup-expired-tokens';

export interface JobPayloads {
  'monthly-summary': { userId: string; month: string };
  'cleanup-expired-tokens': Record<string, never>;
}

let queue: Queue | null = null;
let worker: Worker | null = null;

type Handlers = { [K in JobName]: (data: JobPayloads[K]) => Promise<unknown> };

/** Resolved lazily so a Redis-less deployment never loads the client at all. */
const connection = () => ({
  url: env.queue.redisUrl,
  // BullMQ requires this to be null: its blocking commands must not be aborted
  // by ioredis' own retry ceiling.
  maxRetriesPerRequest: null,
});

export const startQueue = async (handlers: Handlers): Promise<void> => {
  if (!env.queue.enabled) {
    logger.info('Queue disabled (QUEUE_ENABLED=false) — background jobs will be skipped');
    return;
  }

  const { Queue: BullQueue, Worker: BullWorker } = await import('bullmq');

  queue = new BullQueue(QUEUE_NAME, {
    connection: connection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      // Keep a short tail for debugging without letting Redis grow unbounded.
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });

  worker = new BullWorker(
    QUEUE_NAME,
    async (job: Job) => {
      const handler = handlers[job.name as JobName];
      if (!handler) throw new Error(`No handler registered for job "${job.name}"`);
      return handler(job.data);
    },
    { connection: connection(), concurrency: 5 }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, name: job?.name, err: err.message }, 'job failed');
  });
  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id, name: job.name }, 'job completed');
  });

  logger.info('Queue ready');
};

export const enqueue = async <K extends JobName>(
  name: K,
  data: JobPayloads[K]
): Promise<string | null> => {
  if (!queue) return null;
  const job = await queue.add(name, data);
  return job.id ?? null;
};

export const stopQueue = async (): Promise<void> => {
  await worker?.close();
  await queue?.close();
  worker = null;
  queue = null;
};
