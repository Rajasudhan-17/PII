import { Queue, Worker, WorkerOptions, QueueOptions, Job } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis';
import { logger } from '../utils/logger';

const activeQueues = new Map<string, Queue>();
const activeWorkers = new Map<string, Worker>();

export interface BaseJobData {
  jobId?: string;
  createdAt: string;
  organizationId?: string;
  userId?: string;
  requestId?: string;
}

export const DEAD_LETTER_QUEUE_NAME = 'deadLetterQueue';

export interface DeadLetterRecord {
  originalQueue: string;
  jobId?: string;
  jobName: string;
  data: unknown;
  failedReason: string;
  attemptsMade: number;
  failedAt: string;
}

export const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: {
    age: 3600, // 1 hour
    count: 1000,
  },
  removeOnFail: {
    age: 86400, // 24 hours
    count: 5000,
  },
};

/**
 * Standard resilient worker defaults with stuck-job recovery and bounded concurrency.
 */
export const defaultWorkerOptions: Partial<WorkerOptions> = {
  concurrency: 5,
  lockDuration: 30000, // 30 seconds
  maxStalledCount: 2,   // Detect and recover stalled jobs up to 2 times
  stalledInterval: 30000, // Inspect stalled jobs every 30 seconds
};

/**
 * Creates or retrieves a BullMQ Queue instance with standard resilience defaults.
 */
export const getOrCreateQueue = <T = BaseJobData>(
  queueName: string,
  customOptions?: Partial<QueueOptions>
): Queue<T> => {
  if (activeQueues.has(queueName)) {
    return activeQueues.get(queueName) as Queue<T>;
  }

  const connection = getRedisConnectionOptions();

  const queue = new Queue<T>(queueName, {
    connection,
    defaultJobOptions,
    ...customOptions,
  });

  queue.on('error', (err) => {
    logger.error({ event: 'queue_error', queueName, error: err.message }, `BullMQ queue error on ${queueName}`);
  });

  activeQueues.set(queueName, queue as unknown as Queue);
  logger.info({ event: 'queue_created', queueName }, `Initialized BullMQ queue: ${queueName}`);

  return queue;
};

export const getDeadLetterQueue = (): Queue<DeadLetterRecord> => {
  return getOrCreateQueue<DeadLetterRecord>(DEAD_LETTER_QUEUE_NAME);
};

/**
 * Registers a worker on a named queue with error logging and clean event tracking.
 */
export const registerWorker = <T = BaseJobData, R = unknown>(
  queueName: string,
  processor: (job: Job<T, R>) => Promise<R>,
  customOptions?: Partial<WorkerOptions>
): Worker<T, R> => {
  if (activeWorkers.has(queueName)) {
    throw new Error(`Worker for queue [${queueName}] is already registered.`);
  }

  const connection = getRedisConnectionOptions();

  const worker = new Worker<T, R>(queueName, processor, {
    connection,
    ...defaultWorkerOptions,
    ...customOptions,
  });

  worker.on('completed', (job) => {
    logger.info(
      { event: 'job_completed', queueName, jobId: job.id, jobName: job.name },
      `Job ${job.id} completed successfully on ${queueName}.`
    );
  });

  worker.on('failed', async (job, err) => {
    logger.error(
      { event: 'job_failed', queueName, jobId: job?.id, jobName: job?.name, error: err.message, attemptsMade: job?.attemptsMade },
      `Job ${job?.id} failed on ${queueName}: ${err.message}`
    );

    // Dead-letter capture when job exhausts all attempts
    if (job && queueName !== DEAD_LETTER_QUEUE_NAME) {
      const maxAttempts = job.opts?.attempts || defaultJobOptions.attempts;
      if (job.attemptsMade >= maxAttempts) {
        try {
          const dlq = getDeadLetterQueue();
          await dlq.add('deadLetterJob', {
            originalQueue: queueName,
            jobId: job.id,
            jobName: job.name,
            data: job.data,
            failedReason: err.message,
            attemptsMade: job.attemptsMade,
            failedAt: new Date().toISOString(),
          }, {
            jobId: `dlq_${queueName}_${job.id}_${Date.now()}`,
          });
          logger.warn(
            { event: 'job_dead_lettered', originalQueue: queueName, jobId: job.id },
            `Permanently failed job ${job.id} moved to dead-letter queue (${DEAD_LETTER_QUEUE_NAME}).`
          );
        } catch (dlqErr: unknown) {
          const dlqMsg = dlqErr instanceof Error ? dlqErr.message : String(dlqErr);
          logger.error({ event: 'dlq_enqueue_failed', error: dlqMsg, jobId: job.id }, 'Failed to record job in DLQ.');
        }
      }
    }
  });

  worker.on('error', (err) => {
    logger.error({ event: 'worker_error', queueName, error: err.message }, `Worker error on ${queueName}`);
  });

  activeWorkers.set(queueName, worker as unknown as Worker);
  logger.info({ event: 'worker_registered', queueName }, `Registered BullMQ worker for: ${queueName}`);

  return worker;
};

/**
 * Foundation Document Processing Queue infrastructure preparation for future phases.
 */
export const getDocumentProcessingQueue = () => {
  return getOrCreateQueue('documentProcessingQueue');
};

/**
 * Gracefully shuts down all active queues and workers.
 */
export const closeQueuesAndWorkers = async (): Promise<void> => {
  logger.info({ event: 'queues_shutting_down' }, 'Closing BullMQ workers and queues...');

  for (const [name, worker] of activeWorkers.entries()) {
    try {
      await worker.close();
      logger.info({ event: 'worker_closed', queueName: name }, `Closed worker: ${name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ event: 'worker_close_error', queueName: name, error: msg }, `Error closing worker ${name}`);
    }
  }
  activeWorkers.clear();

  for (const [name, queue] of activeQueues.entries()) {
    try {
      await queue.close();
      logger.info({ event: 'queue_closed', queueName: name }, `Closed queue: ${name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ event: 'queue_close_error', queueName: name, error: msg }, `Error closing queue ${name}`);
    }
  }
  activeQueues.clear();

  logger.info({ event: 'queues_shutdown_complete' }, 'All queues and workers closed cleanly.');
};
