import { getOrCreateQueue, BaseJobData } from './queue';
import { logger } from '../utils/logger';

export interface PIIJobData extends BaseJobData {
  documentId: string;
  organizationId: string;
  checksum: string;
  force?: boolean;
  userId?: string;
  requestId?: string;
}

export const PII_QUEUE_NAME = 'documentPIIDetectionQueue';

export const getPIIQueue = () => {
  return getOrCreateQueue<PIIJobData>(PII_QUEUE_NAME);
};

export const enqueuePIIJob = async (data: Omit<PIIJobData, 'createdAt'> & { createdAt?: string }): Promise<string> => {
  try {
    const queue = getPIIQueue();
    const jobData: PIIJobData = {
      ...data,
      createdAt: data.createdAt || new Date().toISOString(),
    };
    const jobId = data.force
      ? `pii_${data.documentId}_force_${Date.now()}`
      : `pii_${data.documentId}_${data.checksum}`;

    const job = await queue.add('detectPII', jobData, { jobId });
    logger.info(
      { event: 'pii_job_enqueued', jobId: job.id, documentId: data.documentId, organizationId: data.organizationId },
      `Enqueued PII detection job ${job.id}`
    );
    return job.id || `pii_${data.documentId}`;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { event: 'pii_job_queue_fallback', documentId: data.documentId, error: errMsg },
      `Redis queue unavailable, falling back for document PII detection ${data.documentId}: ${errMsg}`
    );
    return `pii_fallback_${data.documentId}`;
  }
};
