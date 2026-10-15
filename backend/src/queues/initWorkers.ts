import { registerExtractionWorker } from './extraction.worker';
import { registerOCRWorker } from './ocr.worker';
import { registerPIIWorker } from './pii.worker';
import { createContextWorker } from './context.worker';
import { createDecisionWorker } from './decision.worker';
import { createHumanReviewWorker } from './humanReview.worker';
import { startSanitizationWorker } from './sanitization.worker';
import { startTransformationWorker } from './transformation.worker';
import { startRiskWorker } from './risk.worker';
import { startVerificationWorker } from './verification.worker';
import { logger } from '../utils/logger';

export const initializeWorkers = (): void => {
  try {
    registerExtractionWorker();
    registerOCRWorker();
    registerPIIWorker();
    createContextWorker();
    createDecisionWorker();
    createHumanReviewWorker();
    startSanitizationWorker();
    startTransformationWorker();
    startRiskWorker();
    startVerificationWorker();
    logger.info({ event: 'workers_initialized' }, 'All BullMQ background workers registered and listening for jobs.');
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ event: 'workers_init_error', error: errorMsg }, 'Failed to initialize background workers');
  }
};
