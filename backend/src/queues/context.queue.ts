import { getOrCreateQueue, BaseJobData } from './queue';
import { logger } from '../utils/logger';

export interface ContextJobData extends BaseJobData {
  documentId: string;
  organizationId: string;
  checksum: string;
  force?: boolean;
  userId?: string;
  requestId?: string;
}

export const CONTEXT_QUEUE_NAME = 'documentContextAnalysisQueue';

export const getContextQueue = () => {
  return getOrCreateQueue<ContextJobData>(CONTEXT_QUEUE_NAME);
};

export const enqueueContextJob = async (
  data: Omit<ContextJobData, 'createdAt'> & { createdAt?: string }
): Promise<string> => {
  try {
    const queue = getContextQueue();
    const jobData: ContextJobData = {
      ...data,
      createdAt: data.createdAt || new Date().toISOString(),
    };
    const jobId = data.force
      ? `cx_${data.documentId}_force_${Date.now()}`
      : `cx_${data.documentId}_${data.checksum}`;

    const job = await queue.add('analyzeContext', jobData, { jobId });
    logger.info(
      { event: 'context_job_enqueued', jobId: job.id, documentId: data.documentId, organizationId: data.organizationId },
      `Enqueued context analysis job ${job.id}`
    );
    return job.id || `cx_${data.documentId}`;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { event: 'context_job_queue_fallback', documentId: data.documentId, error: errMsg },
      `Redis queue unavailable, falling back for document context analysis ${data.documentId}: ${errMsg}`
    );
    return `cx_fallback_${data.documentId}`;
  }
};
