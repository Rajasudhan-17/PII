import crypto from 'crypto';
import { ContextAnalysisRunModel, IContextAnalysisRun } from '../../models/contextAnalysisRun.model';
import { ContextResultModel, IContextResult } from '../../models/contextResult.model';
import { DetectionRunModel } from '../../models/detectionRun.model';
import { PIICandidateModel } from '../../models/piiCandidate.model';
import { NormalizedDocumentModel } from '../../models/normalizedDocument.model';
import { DocumentModel } from '../../models/document.model';
import { LocalContextAnalyzer } from './contextAnalyzerProvider';
import {
  generateContextConfigurationHash,
  CONTEXT_CONFIGURATION_VERSION,
} from '../../config/contextTaxonomy';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { logAuthAuditEvent } from '../audit.service';
import { validateObjectId } from '../../utils/tenantQuery';

export class ContextAnalysisService {
  private analyzer = new LocalContextAnalyzer();

  public async runContextAnalysis(
    documentIdStr: string,
    organizationIdStr: string,
    options?: { force?: boolean; userId?: string; requestId?: string }
  ): Promise<{ run: IContextAnalysisRun; results: IContextResult[] }> {
    const documentId = validateObjectId(documentIdStr, 'Document ID');
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');

    // 1. Verify document exists & belongs to tenant
    const doc = await DocumentModel.findOne({ _id: documentId, organizationId });
    if (!doc || doc.isDeleted) {
      throw AppError.notFound('Document not found or has been deleted', 'DOCUMENT_NOT_FOUND');
    }

    // 2. Fetch latest active DetectionRun from Phase 07
    const detectionRun = await DetectionRunModel.findOne({
      organizationId,
      documentId,
      isLatestActive: true,
      status: 'COMPLETED',
    });

    if (!detectionRun) {
      throw AppError.badRequest(
        'No completed PII detection run found for document. Run PII detection first.',
        'DETECTION_RUN_NOT_FOUND'
      );
    }

    // 3. Check for existing completed context run unless force=true
    const configHash = generateContextConfigurationHash();
    if (!options?.force) {
      const existingCompleted = await ContextAnalysisRunModel.findOne({
        organizationId,
        documentId,
        detectionRunId: detectionRun.detectionRunId,
        contextConfigurationHash: configHash,
        status: 'COMPLETED',
      });

      if (existingCompleted) {
        logger.info(
          { event: 'context_analysis_idempotent_reuse', runId: existingCompleted.contextAnalysisRunId },
          `Reusing existing completed context analysis run ${existingCompleted.contextAnalysisRunId}`
        );
        const existingResults = await ContextResultModel.find({
          organizationId,
          documentId,
          contextAnalysisRunId: existingCompleted.contextAnalysisRunId,
        });
        return { run: existingCompleted, results: existingResults };
      }
    }

    // 4. Create new ContextAnalysisRun with E11000 duplicate handling
    const contextRunId = `cx_run_${crypto.randomUUID()}`;
    let newRun: IContextAnalysisRun;

    try {
      newRun = await ContextAnalysisRunModel.create({
        contextAnalysisRunId: contextRunId,
        organizationId,
        documentId,
        detectionRunId: detectionRun.detectionRunId,
        documentChecksum: doc.checksum,
        normalizedDocumentVersion: '1.0.0',
        contextConfigurationVersion: CONTEXT_CONFIGURATION_VERSION,
        contextConfigurationHash: configHash,
        status: 'RUNNING',
        isLatestActive: false,
        candidateCount: 0,
        processedCount: 0,
        startedAt: new Date(),
      });
    } catch (err: unknown) {
      const isDuplicateKey =
        err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000;
      if (isDuplicateKey) {
        const inFlight = await ContextAnalysisRunModel.findOne({
          organizationId,
          documentId,
          detectionRunId: detectionRun.detectionRunId,
          contextConfigurationHash: configHash,
          status: { $in: ['QUEUED', 'RUNNING'] },
        });
        if (inFlight) {
          logger.info(
            { event: 'context_analysis_inflight_reuse', runId: inFlight.contextAnalysisRunId },
            `Reusing in-flight context analysis run ${inFlight.contextAnalysisRunId}`
          );
          const results = await ContextResultModel.find({
            organizationId,
            documentId,
            contextAnalysisRunId: inFlight.contextAnalysisRunId,
          });
          return { run: inFlight, results };
        }
      }
      throw err;
    }

    logAuthAuditEvent({
      event: 'CONTEXT_ANALYSIS_STARTED',
      outcome: 'SUCCESS',
      organizationId: organizationIdStr,
      userId: options?.userId,
      requestId: options?.requestId,
      details: { contextAnalysisRunId: newRun.contextAnalysisRunId, detectionRunId: detectionRun.detectionRunId },
    });

    // 5. Load normalized document & candidates
    const previousActiveRun = await ContextAnalysisRunModel.findOne({
      organizationId,
      documentId,
      isLatestActive: true,
    });

    try {
      const normalizedDoc = await NormalizedDocumentModel.findOne({ organizationId, documentId });
      if (!normalizedDoc) {
        throw AppError.notFound('Normalized document content not found', 'NORMALIZED_DOC_NOT_FOUND');
      }

      const candidates = await PIICandidateModel.find({
        organizationId,
        documentId,
        detectionRunId: detectionRun.detectionRunId,
      });

      // 6. Execute context analysis for each candidate
      const results: IContextResult[] = [];
      for (const candidate of candidates) {
        const res = this.analyzer.analyzeCandidateContext(
          candidate,
          normalizedDoc,
          candidates,
          newRun.contextAnalysisRunId
        );
        results.push(res);
      }

      // 7. Bulk save results
      if (results.length > 0) {
        await ContextResultModel.insertMany(results);
      }

      // 8. Finalize run status
      newRun.status = 'COMPLETED';
      newRun.completedAt = new Date();
      newRun.candidateCount = candidates.length;
      newRun.processedCount = results.length;
      await newRun.save();

      // 9. Atomic publication of active run with failure recovery
      if (previousActiveRun && previousActiveRun._id.toString() !== newRun._id.toString()) {
        previousActiveRun.isLatestActive = false;
        await previousActiveRun.save();
      }

      newRun.isLatestActive = true;
      await newRun.save();

      logAuthAuditEvent({
        event: 'CONTEXT_ANALYSIS_COMPLETED',
        outcome: 'SUCCESS',
        organizationId: organizationIdStr,
        userId: options?.userId,
        requestId: options?.requestId,
        details: {
          contextAnalysisRunId: newRun.contextAnalysisRunId,
          processedCount: results.length,
        },
      });

      return { run: newRun, results };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      newRun.status = 'FAILED';
      newRun.failedAt = new Date();
      newRun.failureReason = errorMsg;
      await newRun.save();

      // Non-transactional fallback recovery: restore previous active run if publication failed
      if (previousActiveRun) {
        previousActiveRun.isLatestActive = true;
        await previousActiveRun.save();
      }

      logAuthAuditEvent({
        event: 'CONTEXT_ANALYSIS_FAILED',
        outcome: 'FAILURE',
        reason: errorMsg,
        organizationId: organizationIdStr,
        userId: options?.userId,
        requestId: options?.requestId,
        details: { contextAnalysisRunId: newRun.contextAnalysisRunId, error: errorMsg },
      });

      throw err;
    }
  }

  public async getContextRuns(
    documentIdStr: string,
    organizationIdStr: string
  ): Promise<IContextAnalysisRun[]> {
    const documentId = validateObjectId(documentIdStr, 'Document ID');
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');
    return ContextAnalysisRunModel.find({ organizationId, documentId }).sort({ createdAt: -1 });
  }

  public async getContextResults(
    documentIdStr: string,
    organizationIdStr: string,
    runIdStr?: string
  ): Promise<{ run: IContextAnalysisRun | null; results: IContextResult[] }> {
    const documentId = validateObjectId(documentIdStr, 'Document ID');
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');

    let run: IContextAnalysisRun | null = null;
    if (runIdStr) {
      run = await ContextAnalysisRunModel.findOne({
        organizationId,
        documentId,
        contextAnalysisRunId: runIdStr,
      });
    } else {
      run = await ContextAnalysisRunModel.findOne({
        organizationId,
        documentId,
        isLatestActive: true,
      });
    }

    if (!run) {
      return { run: null, results: [] };
    }

    const results = await ContextResultModel.find({
      organizationId,
      documentId,
      contextAnalysisRunId: run.contextAnalysisRunId,
    });

    return { run, results };
  }

  public async getContextSummary(
    documentIdStr: string,
    organizationIdStr: string
  ): Promise<Record<string, unknown>> {
    const { run, results } = await this.getContextResults(documentIdStr, organizationIdStr);
    if (!run) {
      return { totalResults: 0, bySemanticRole: {}, byAmbiguity: {} };
    }

    const bySemanticRole: Record<string, number> = {};
    const byAmbiguity: Record<string, number> = {};

    for (const res of results) {
      bySemanticRole[res.semanticRole] = (bySemanticRole[res.semanticRole] || 0) + 1;
      for (const amb of res.ambiguityIndicators) {
        byAmbiguity[amb] = (byAmbiguity[amb] || 0) + 1;
      }
    }

    return {
      contextAnalysisRunId: run.contextAnalysisRunId,
      status: run.status,
      totalResults: results.length,
      bySemanticRole,
      byAmbiguity,
    };
  }
}

export const contextAnalysisService = new ContextAnalysisService();
