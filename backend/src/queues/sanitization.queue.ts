import { getOrCreateQueue, BaseJobData } from './queue';
import { logger } from '../utils/logger';
import { SanitizationOperation } from '../models/metadataSanitizationRun.model';
import { SanitizationPolicyOptions } from '../services/sanitization/engines/base.engine';

export const SANITIZATION_QUEUE_NAME = 'documentSanitizationQueue';

export interface SanitizationJobPayload extends BaseJobData {
  documentId: string;
  organizationId: string;
  sourceArtifactId?: string;
  operation?: SanitizationOperation;
  policyOptions?: SanitizationPolicyOptions;
  force?: boolean;
  userId?: string;
  requestId?: string;
}

export const getSanitizationQueue = () => {
  return getOrCreateQueue<SanitizationJobPayload>(SANITIZATION_QUEUE_NAME);
};

export const enqueueSanitizationJob = async (
  data: Omit<SanitizationJobPayload, 'createdAt'> & { createdAt?: string }
): Promise<string> => {
  try {
    const queue = getSanitizationQueue();
    const jobData: SanitizationJobPayload = {
      ...data,
      createdAt: data.createdAt || new Date().toISOString(),
    };
    const jobId = `sanit_${data.organizationId}_${data.documentId}_${data.operation || 'FULL_CLEAN'}`;
    const job = await queue.add('process-sanitization', jobData, { jobId });
    logger.info(
      { jobId: job.id, documentId: data.documentId, organizationId: data.organizationId },
      'Enqueued metadata sanitization job'
    );
    return job.id || jobId;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { event: 'sanitization_job_queue_fallback', documentId: data.documentId, error: errMsg },
      `Redis queue unavailable, falling back for document sanitization ${data.documentId}: ${errMsg}`
    );
    return `sanit_fallback_${data.documentId}`;
  }
};
