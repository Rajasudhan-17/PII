import { Job } from 'bullmq';
import { registerWorker } from './queue';
import { logger } from '../utils/logger';
import { RISK_QUEUE_NAME, RiskJobPayload } from './risk.queue';
import { riskService } from '../services/risk/risk.service';

export const startRiskWorker = () => {
  return registerWorker<RiskJobPayload>(
    RISK_QUEUE_NAME,
    async (job: Job<RiskJobPayload>) => {
      const { documentId, organizationId, sanitizedArtifactId, force, userId, requestId, riskModelVersion } = job.data;
      logger.info(
        { jobId: job.id, documentId, organizationId },
        'Processing document re-identification risk analysis job'
      );

      const result = await riskService.executeRiskAnalysis(documentId, organizationId, {
        sanitizedArtifactId,
        force,
        userId,
        requestId,
        riskModelVersion,
      });

      return {
        riskRunId: result.run.riskRunId,
        reidentificationRiskScore: result.run.reidentificationRiskScore,
        riskLevel: result.run.riskLevel,
        status: result.run.status,
        resultCount: result.results.length,
      };
    },
    { concurrency: 5 }
  );
};
