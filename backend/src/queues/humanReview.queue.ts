import { getOrCreateQueue, BaseJobData } from './queue';
import { logger } from '../utils/logger';

export interface HumanReviewJobData extends BaseJobData {
  organizationId: string;
  documentId: string;
  verificationRunId?: string;
  caseType?: string;
  priority?: string;
  reasonCodes?: string[];
  requestId?: string;
}

export const HUMAN_REVIEW_QUEUE_NAME = 'humanReviewQueue';

export const getHumanReviewQueue = () => {
  return getOrCreateQueue<HumanReviewJobData>(HUMAN_REVIEW_QUEUE_NAME);
};

export const enqueueHumanReviewJob = async (data: HumanReviewJobData): Promise<string> => {
  try {
    const queue = getHumanReviewQueue();
    const jobId = `rev_job_${data.documentId}_${data.verificationRunId || Date.now()}`;
    const job = await queue.add('createReviewCaseJob', data, { jobId });
    logger.info(
      { event: 'human_review_job_enqueued', jobId: job.id, documentId: data.documentId, organizationId: data.organizationId },
      `Enqueued human review job ${job.id}`
    );
    return job.id || jobId;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { event: 'human_review_job_queue_fallback', documentId: data.documentId, error: errMsg },
      `Redis queue unavailable, falling back for human review job: ${errMsg}`
    );
    return `rev_fallback_${data.documentId}`;
  }
};
