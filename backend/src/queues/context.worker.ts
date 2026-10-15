import { Worker, Job } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis';
import { logger } from '../utils/logger';
import { CONTEXT_QUEUE_NAME, ContextJobData } from './context.queue';
import { contextAnalysisService } from '../services/context/contextAnalysis.service';

export const createContextWorker = (): Worker<ContextJobData> | null => {
  const connection = getRedisConnectionOptions();
  if (!connection) {
    logger.warn(
      { event: 'context_worker_disabled' },
      'Redis connection configuration unavailable. Context analysis worker will not start.'
    );
    return null;
  }

  const worker = new Worker<ContextJobData>(
    CONTEXT_QUEUE_NAME,
    async (job: Job<ContextJobData>) => {
      logger.info(
        {
          event: 'context_worker_job_start',
          jobId: job.id,
          documentId: job.data.documentId,
          organizationId: job.data.organizationId,
        },
        `Starting background context analysis for job ${job.id}`
      );

      const { run, results } = await contextAnalysisService.runContextAnalysis(
        job.data.documentId,
        job.data.organizationId,
        {
          force: job.data.force,
          userId: job.data.userId,
          requestId: job.data.requestId,
        }
      );

      return {
        contextAnalysisRunId: run.contextAnalysisRunId,
        processedCount: results.length,
        status: run.status,
      };
    },
    {
      connection,
      concurrency: 2,
    }
  );

  worker.on('completed', (job: Job<ContextJobData>) => {
    logger.info(
      { event: 'context_worker_job_completed', jobId: job.id, documentId: job.data.documentId },
      `Completed background context analysis job ${job.id}`
    );
  });

  worker.on('failed', (job: Job<ContextJobData> | undefined, err: Error) => {
    logger.error(
      { event: 'context_worker_job_failed', jobId: job?.id, error: err.message },
      `Context analysis job ${job?.id} failed: ${err.message}`
    );
  });

  return worker;
};
