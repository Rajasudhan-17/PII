import { Job } from 'bullmq';
import { registerWorker } from './queue';
import { EXTRACTION_QUEUE_NAME, ExtractionJobData } from './extraction.queue';
import { extractionService } from '../services/extraction.service';
import { logger } from '../utils/logger';

export const registerExtractionWorker = () => {
  return registerWorker<ExtractionJobData, void>(
    EXTRACTION_QUEUE_NAME,
    async (job: Job<ExtractionJobData>) => {
      const { documentId, organizationId, jobId } = job.data;
      logger.info(
        { event: 'extraction_worker_started', jobId: job.id || jobId, documentId, organizationId },
        `Worker processing extraction for document ${documentId}`
      );

      await extractionService.processDocumentExtraction(documentId, organizationId);
    },
    { concurrency: 3 }
  );
};
