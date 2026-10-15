import { getOrCreateQueue, BaseJobData } from './queue';
import { logger } from '../utils/logger';

export interface DecisionJobData extends BaseJobData {
  documentId: string;
  organizationId: string;
  checksum: string;
  policyId?: string;
  policyVersion?: number;
  force?: boolean;
  userId?: string;
  requestId?: string;
}

export const DECISION_QUEUE_NAME = 'documentDecisionEvaluationQueue';

export const getDecisionQueue = () => {
  return getOrCreateQueue<DecisionJobData>(DECISION_QUEUE_NAME);
};

export const enqueueDecisionJob = async (
  data: Omit<DecisionJobData, 'createdAt'> & { createdAt?: string }
): Promise<string> => {
  try {
    const queue = getDecisionQueue();
    const jobData: DecisionJobData = {
      ...data,
      createdAt: data.createdAt || new Date().toISOString(),
    };
    const jobId = data.force
      ? `dec_${data.documentId}_force_${Date.now()}`
      : `dec_${data.documentId}_${data.checksum}`;

    const job = await queue.add('evaluateDecisions', jobData, { jobId });
    logger.info(
      { event: 'decision_job_enqueued', jobId: job.id, documentId: data.documentId, organizationId: data.organizationId },
      `Enqueued decision evaluation job ${job.id}`
    );
    return job.id || `dec_${data.documentId}`;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { event: 'decision_job_queue_fallback', documentId: data.documentId, error: errMsg },
      `Redis queue unavailable, falling back for document decision evaluation ${data.documentId}: ${errMsg}`
    );
    return `dec_fallback_${data.documentId}`;
  }
};
