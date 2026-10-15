import { Job } from 'bullmq';
import { registerWorker } from './queue';
import { PII_QUEUE_NAME, PIIJobData } from './pii.queue';
import { piiDetectionService } from '../services/pii/piiDetection.service';
import { contextAnalysisService } from '../services/context/contextAnalysis.service';
import { policyService } from '../services/policy/policy.service';
import { transformationService } from '../services/transformation/transformation.service';
import { RiskService } from '../services/risk/risk.service';
import { VerificationService } from '../services/verification/verification.service';
import { logger } from '../utils/logger';

const riskService = new RiskService();
const verificationService = new VerificationService();

export const registerPIIWorker = () => {
  return registerWorker<PIIJobData, void>(
    PII_QUEUE_NAME,
    async (job: Job<PIIJobData>) => {
      const { documentId, organizationId, force, jobId } = job.data;
      logger.info(
        { event: 'pii_worker_started', jobId: job.id || jobId, documentId, organizationId, force },
        `Worker processing PII detection for document ${documentId}`
      );

      await piiDetectionService.detectPIIForDocument(documentId, organizationId, { force });

      // ── Auto-pipeline downstream chaining: Context -> Decisions -> Redaction -> Risk -> Verification ──
      try {
        await contextAnalysisService.runContextAnalysis(documentId, organizationId, { force });
        logger.info({ documentId, organizationId }, 'Auto-pipeline: context analysis completed');

        await policyService.evaluateDocumentDecisions(documentId, organizationId, { force });
        logger.info({ documentId, organizationId }, 'Auto-pipeline: policy evaluation completed');

        await transformationService.executeTransformation(documentId, organizationId, { force });
        logger.info({ documentId, organizationId }, 'Auto-pipeline: transformation/redaction completed');

        await riskService.executeRiskAnalysis(documentId, organizationId, { force });
        logger.info({ documentId, organizationId }, 'Auto-pipeline: risk analysis completed');

        await verificationService.executeVerification(documentId, organizationId, { force });
        logger.info({ documentId, organizationId }, 'Auto-pipeline: verification QA completed');
      } catch (chainErr: unknown) {
        logger.warn(
          { documentId, organizationId, error: (chainErr as Error).message },
          'Auto-pipeline: non-fatal warning during downstream pipeline chaining'
        );
      }
    },
    { concurrency: 2 }
  );
};
