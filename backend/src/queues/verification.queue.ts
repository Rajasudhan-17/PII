import { getOrCreateQueue, BaseJobData } from './queue';
import { logger } from '../utils/logger';

export const VERIFICATION_QUEUE_NAME = 'documentVerificationQueue';

export interface VerificationJobPayload extends BaseJobData {
  documentId: string;
  organizationId: string;
  outputArtifactId?: string;
  force?: boolean;
  userId?: string;
  requestId?: string;
  verificationModelVersion?: string;
}

export const getVerificationQueue = () => {
  return getOrCreateQueue<VerificationJobPayload>(VERIFICATION_QUEUE_NAME);
};

export const enqueueVerificationJob = async (
  data: Omit<VerificationJobPayload, 'createdAt'> & { createdAt?: string }
): Promise<string> => {
  try {
    const queue = getVerificationQueue();
    const jobData: VerificationJobPayload = {
      ...data,
      createdAt: data.createdAt || new Date().toISOString(),
    };
    const jobId = `ver_${data.organizationId}_${data.documentId}_${data.outputArtifactId || 'latest'}`;
    const job = await queue.add('process-verification', jobData, { jobId });
    logger.info(
      { jobId: job.id, documentId: data.documentId, organizationId: data.organizationId },
      'Enqueued document verification & quality assurance job'
    );
    return job.id || jobId;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { event: 'verification_job_queue_fallback', documentId: data.documentId, error: errMsg },
      `Redis queue unavailable, falling back for document verification ${data.documentId}: ${errMsg}`
    );
    return `ver_fallback_${data.documentId}`;
  }
};
