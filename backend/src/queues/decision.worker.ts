import { Worker, Job } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis';
import { logger } from '../utils/logger';
import { DECISION_QUEUE_NAME, DecisionJobData } from './decision.queue';
import { policyService } from '../services/policy/policy.service';

export const createDecisionWorker = (): Worker<DecisionJobData> | null => {
  const connection = getRedisConnectionOptions();
  if (!connection) {
    logger.warn(
      { event: 'decision_worker_disabled' },
      'Redis connection configuration unavailable. Decision evaluation worker will not start.'
    );
    return null;
  }

  const worker = new Worker<DecisionJobData>(
    DECISION_QUEUE_NAME,
    async (job: Job<DecisionJobData>) => {
      logger.info(
        {
          event: 'decision_worker_job_start',
          jobId: job.id,
          documentId: job.data.documentId,
          organizationId: job.data.organizationId,
        },
        `Starting background decision evaluation for job ${job.id}`
      );

      const { run, results } = await policyService.evaluateDocumentDecisions(
        job.data.documentId,
        job.data.organizationId,
        {
          policyId: job.data.policyId,
          policyVersion: job.data.policyVersion,
          force: job.data.force,
          userId: job.data.userId,
          requestId: job.data.requestId,
        }
      );

      return {
        decisionRunId: run.decisionRunId,
        totalCandidates: results.length,
        status: run.status,
      };
    },
    {
      connection,
      concurrency: 2,
    }
  );

  worker.on('completed', (job: Job<DecisionJobData>) => {
    logger.info(
      { event: 'decision_worker_job_completed', jobId: job.id, documentId: job.data.documentId },
      `Completed background decision evaluation job ${job.id}`
    );
  });

  worker.on('failed', (job: Job<DecisionJobData> | undefined, err: Error) => {
    logger.error(
      { event: 'decision_worker_job_failed', jobId: job?.id, error: err.message },
      `Decision evaluation job ${job?.id} failed: ${err.message}`
    );
  });

  return worker;
};
