import { Job } from 'bullmq';
import { registerWorker } from './queue';
import { logger } from '../utils/logger';
import { TRANSFORMATION_QUEUE_NAME, TransformationJobPayload } from './transformation.queue';
import { transformationService } from '../services/transformation/transformation.service';

export const startTransformationWorker = () => {
  return registerWorker<TransformationJobPayload>(
    TRANSFORMATION_QUEUE_NAME,
    async (job: Job<TransformationJobPayload>) => {
      const { documentId, organizationId, decisionRunId, operation, force, userId, requestId } = job.data;
      logger.info(
        { jobId: job.id, documentId, organizationId, operation },
        'Processing document transformation job'
      );

      const result = await transformationService.executeTransformation(documentId, organizationId, {
        decisionRunId,
        operation,
        force,
        userId,
        requestId,
      });

      return {
        transformationRunId: result.run.transformationRunId,
        outputArtifactId: result.artifact.outputArtifactId,
        status: result.run.status,
        transformedCount: result.run.transformedCount,
        skippedCount: result.run.skippedCount,
      };
    },
    { concurrency: 5 }
  );
};
