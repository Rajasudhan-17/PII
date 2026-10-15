import { Job } from 'bullmq';
import { registerWorker } from './queue';
import { OCR_QUEUE_NAME, OCRJobData } from './ocr.queue';
import { ocrService } from '../services/ocr/ocr.service';
import { logger } from '../utils/logger';

export const registerOCRWorker = () => {
  return registerWorker<OCRJobData, void>(
    OCR_QUEUE_NAME,
    async (job: Job<OCRJobData>) => {
      const { documentId, organizationId, isHandwriting, language, jobId } = job.data;
      logger.info(
        { event: 'ocr_worker_started', jobId: job.id || jobId, documentId, organizationId },
        `Worker processing OCR for document ${documentId}`
      );

      await ocrService.processDocumentOCR(documentId, organizationId, {
        isHandwriting,
        language,
      });
    },
    { concurrency: 2 }
  );
};
