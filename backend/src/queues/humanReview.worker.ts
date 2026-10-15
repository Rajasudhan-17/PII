import { Worker, Job } from 'bullmq';
import { HUMAN_REVIEW_QUEUE_NAME, HumanReviewJobData } from './humanReview.queue';
import { getRedisConnectionOptions } from '../config/redis';
import { humanReviewService } from '../services/humanReview/humanReview.service';
import { ReviewCaseType, ReviewCasePriority } from '../models/humanReviewCase.model';
import { logger } from '../utils/logger';

export const createHumanReviewWorker = (): Worker<HumanReviewJobData> | null => {
  const connection = getRedisConnectionOptions();

  try {
    const worker = new Worker<HumanReviewJobData>(
      HUMAN_REVIEW_QUEUE_NAME,
      async (job: Job<HumanReviewJobData>) => {
        logger.info(
          { event: 'human_review_worker_started', jobId: job.id, documentId: job.data.documentId },
          `Worker processing human review job ${job.id}`
        );

        const reviewCase = await humanReviewService.createReviewCase({
          organizationIdStr: job.data.organizationId,
          documentIdStr: job.data.documentId,
          verificationRunId: job.data.verificationRunId,
          caseType: (job.data.caseType as ReviewCaseType) || 'PARTIAL_VERIFICATION',
          priority: (job.data.priority as ReviewCasePriority) || 'MEDIUM',
          reasonCodes: job.data.reasonCodes || ['ASYNC_REVIEW_TRIGGER'],
        });

        logger.info(
          { event: 'human_review_worker_completed', jobId: job.id, reviewCaseId: reviewCase.reviewCaseId },
          `Worker completed human review job ${job.id}`
        );

        return { reviewCaseId: reviewCase.reviewCaseId, status: reviewCase.status };
      },
      {
        connection,
        concurrency: 5,
      }
    );

    worker.on('failed', (job, err) => {
      logger.error(
        { event: 'human_review_worker_job_failed', jobId: job?.id, error: err.message },
        `Human review worker job failed: ${err.message}`
      );
    });

    return worker;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn({ event: 'human_review_worker_creation_failed', error: errMsg }, 'Redis worker setup bypassed');
    return null;
  }
};
