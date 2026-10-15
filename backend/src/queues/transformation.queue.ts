import { getOrCreateQueue, BaseJobData } from './queue';
import { logger } from '../utils/logger';
import { TransformationOperation } from '../models/transformationRun.model';

export const TRANSFORMATION_QUEUE_NAME = 'documentTransformationQueue';

export interface TransformationJobPayload extends BaseJobData {
  documentId: string;
  organizationId: string;
  decisionRunId?: string;
  operation?: TransformationOperation;
  force?: boolean;
  userId?: string;
  requestId?: string;
}

export const getTransformationQueue = () => {
  return getOrCreateQueue<TransformationJobPayload>(TRANSFORMATION_QUEUE_NAME);
};

export const enqueueTransformationJob = async (
  data: Omit<TransformationJobPayload, 'createdAt'> & { createdAt?: string }
): Promise<string> => {
  try {
    const queue = getTransformationQueue();
    const jobData: TransformationJobPayload = {
      ...data,
      createdAt: data.createdAt || new Date().toISOString(),
    };
    const jobId = `trans_${data.organizationId}_${data.documentId}_${data.operation || 'REDACTION'}`;
    const job = await queue.add('process-transformation', jobData, { jobId });
    logger.info(
      { jobId: job.id, documentId: data.documentId, organizationId: data.organizationId },
      'Enqueued transformation job'
    );
    return job.id || jobId;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { event: 'transformation_job_queue_fallback', documentId: data.documentId, error: errMsg },
      `Redis queue unavailable, falling back for document transformation ${data.documentId}: ${errMsg}`
    );
    return `trans_fallback_${data.documentId}`;
  }
};
