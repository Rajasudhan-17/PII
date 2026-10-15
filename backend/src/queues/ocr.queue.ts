import { getOrCreateQueue, BaseJobData } from './queue';
import { logger } from '../utils/logger';

export interface OCRJobData extends BaseJobData {
  documentId: string;
  organizationId: string;
  checksum: string;
  isHandwriting?: boolean;
  language?: string;
  requestId?: string;
}

export const OCR_QUEUE_NAME = 'documentOCRQueue';

export const getOCRQueue = () => {
  return getOrCreateQueue<OCRJobData>(OCR_QUEUE_NAME);
};

export const enqueueOCRJob = async (data: OCRJobData): Promise<string> => {
  try {
    const queue = getOCRQueue();
    const job = await queue.add('ocrDocument', data, {
      jobId: `ocr_${data.documentId}_${data.checksum}`,
    });
    logger.info(
      { event: 'ocr_job_enqueued', jobId: job.id, documentId: data.documentId, organizationId: data.organizationId },
      `Enqueued document OCR job ${job.id}`
    );
    return job.id || `ocr_${data.documentId}`;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { event: 'ocr_job_queue_fallback', documentId: data.documentId, error: errMsg },
      `Redis queue unavailable, falling back for document OCR ${data.documentId}: ${errMsg}`
    );
    return `ocr_fallback_${data.documentId}`;
  }
};
