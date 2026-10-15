import { Job } from 'bullmq';
import { registerWorker } from './queue';
import { logger } from '../utils/logger';
import { VERIFICATION_QUEUE_NAME, VerificationJobPayload } from './verification.queue';
import { verificationService } from '../services/verification/verification.service';

export const startVerificationWorker = () => {
  return registerWorker<VerificationJobPayload>(
    VERIFICATION_QUEUE_NAME,
    async (job: Job<VerificationJobPayload>) => {
      const { documentId, organizationId, outputArtifactId, force, userId, requestId, verificationModelVersion } = job.data;
      logger.info(
        { jobId: job.id, documentId, organizationId },
        'Processing document verification & quality assurance job'
      );

      const result = await verificationService.executeVerification(documentId, organizationId, {
        outputArtifactId,
        force,
        userId,
        requestId,
        verificationModelVersion,
      });

      return {
        verificationRunId: result.run.verificationRunId,
        overallStatus: result.run.overallStatus,
        overallVerificationScore: result.run.overallVerificationScore,
        status: result.run.status,
        passedCount: result.run.passedVerifierCount,
        failedCount: result.run.failedVerifierCount,
      };
    },
    { concurrency: 5 }
  );
};
