import { getOrCreateQueue, BaseJobData } from './queue';
import { logger } from '../utils/logger';

export interface ExtractionJobData extends BaseJobData {
  documentId: string;
  organizationId: string;
  checksum: string;
  requestId?: string;
}

export const EXTRACTION_QUEUE_NAME = 'documentExtractionQueue';

export const getExtractionQueue = () => {
  return getOrCreateQueue<ExtractionJobData>(EXTRACTION_QUEUE_NAME);
};

export const enqueueExtractionJob = async (data: ExtractionJobData): Promise<string> => {
  try {
    const queue = getExtractionQueue();
    const job = await queue.add('extractDocument', data, {
      jobId: `extract_${data.documentId}_${data.checksum}`,
    });
    logger.info(
      { event: 'extraction_job_enqueued', jobId: job.id, documentId: data.documentId, organizationId: data.organizationId },
      `Enqueued document extraction job ${job.id}`
    );
    return job.id || `extract_${data.documentId}`;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { event: 'extraction_job_queue_fallback', documentId: data.documentId, error: errMsg },
      `Redis queue unavailable, falling back for document ${data.documentId}: ${errMsg}`
    );
    return `extract_fallback_${data.documentId}`;
  }
};
