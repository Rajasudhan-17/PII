import { Job } from 'bullmq';
import { registerWorker } from './queue';
import { logger } from '../utils/logger';
import { SANITIZATION_QUEUE_NAME, SanitizationJobPayload } from './sanitization.queue';
import { sanitizationService } from '../services/sanitization/sanitization.service';

export const startSanitizationWorker = () => {
  return registerWorker<SanitizationJobPayload>(
    SANITIZATION_QUEUE_NAME,
    async (job: Job<SanitizationJobPayload>) => {
      const { documentId, organizationId, sourceArtifactId, operation, policyOptions, force, userId, requestId } = job.data;
      logger.info(
        { jobId: job.id, documentId, organizationId, operation },
        'Processing document metadata sanitization job'
      );

      const result = await sanitizationService.executeSanitization(documentId, organizationId, {
        sourceArtifactId,
        operation,
        policyOptions,
        force,
        userId,
        requestId,
      });

      return {
        sanitizationRunId: result.run.sanitizationRunId,
        outputArtifactId: result.artifact.outputArtifactId,
        status: result.run.status,
        metadataRemovedCount: result.run.metadataRemovedCount,
      };
    },
    { concurrency: 5 }
  );
};
