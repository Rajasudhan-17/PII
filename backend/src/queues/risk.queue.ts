import { getOrCreateQueue, BaseJobData } from './queue';
import { logger } from '../utils/logger';

export const RISK_QUEUE_NAME = 'documentRiskAnalysisQueue';

export interface RiskJobPayload extends BaseJobData {
  documentId: string;
  organizationId: string;
  sanitizedArtifactId?: string;
  force?: boolean;
  userId?: string;
  requestId?: string;
  riskModelVersion?: string;
}

export const getRiskQueue = () => {
  return getOrCreateQueue<RiskJobPayload>(RISK_QUEUE_NAME);
};

export const enqueueRiskJob = async (
  data: Omit<RiskJobPayload, 'createdAt'> & { createdAt?: string }
): Promise<string> => {
  try {
    const queue = getRiskQueue();
    const jobData: RiskJobPayload = {
      ...data,
      createdAt: data.createdAt || new Date().toISOString(),
    };
    const jobId = `risk_${data.organizationId}_${data.documentId}_${data.sanitizedArtifactId || 'latest'}`;
    const job = await queue.add('process-risk-analysis', jobData, { jobId });
    logger.info(
      { jobId: job.id, documentId: data.documentId, organizationId: data.organizationId },
      'Enqueued document re-identification risk analysis job'
    );
    return job.id || jobId;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { event: 'risk_job_queue_fallback', documentId: data.documentId, error: errMsg },
      `Redis queue unavailable, falling back for document risk analysis ${data.documentId}: ${errMsg}`
    );
    return `risk_fallback_${data.documentId}`;
  }
};
