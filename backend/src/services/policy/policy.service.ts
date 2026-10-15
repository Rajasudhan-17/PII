import crypto from 'crypto';
import mongoose from 'mongoose';
import { PolicyModel, IPolicy } from '../../models/policy.model';
import { DecisionRunModel, IDecisionRun } from '../../models/decisionRun.model';
import { DecisionResultModel, IDecisionResult } from '../../models/decisionResult.model';
import { DetectionRunModel } from '../../models/detectionRun.model';
import { ContextAnalysisRunModel } from '../../models/contextAnalysisRun.model';
import { ContextResultModel } from '../../models/contextResult.model';
import { PIICandidateModel } from '../../models/piiCandidate.model';
import { DocumentModel } from '../../models/document.model';
import { contextAnalysisService } from '../context/contextAnalysis.service';
import { piiDetectionService } from '../pii/piiDetection.service';
import { PolicyValidator } from './policyValidator';
import { PolicyEvaluator } from './policyEvaluator';
import {
  DecisionType,
  IPolicyRule,
  generatePolicyConfigurationHash,
} from '../../config/policyTaxonomy';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { logAuthAuditEvent } from '../audit.service';
import { validateObjectId } from '../../utils/tenantQuery';

export class PolicyService {
  public async createPolicy(
    organizationIdStr: string,
    userIdStr: string,
    data: {
      name: string;
      description?: string;
      defaultDecision?: DecisionType;
      rules?: IPolicyRule[];
    }
  ): Promise<IPolicy> {
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');
    const createdBy = validateObjectId(userIdStr, 'User ID');

    const defaultDecision = data.defaultDecision || 'REVIEW';
    const rules = data.rules || [];

    PolicyValidator.validatePolicy({
      name: data.name,
      defaultDecision,
      rules,
    });

    const policyId = `pol_${crypto.randomUUID()}`;
    const hash = generatePolicyConfigurationHash({ version: 1, defaultDecision, rules });

    const policy = await PolicyModel.create({
      policyId,
      organizationId,
      name: data.name,
      description: data.description || '',
      version: 1,
      status: 'PUBLISHED',
      rules,
      defaultDecision,
      configurationHash: hash,
      createdBy,
    });

    logAuthAuditEvent({
      event: 'POLICY_CREATED',
      outcome: 'SUCCESS',
      organizationId: organizationIdStr,
      userId: userIdStr,
      details: { policyId: policy.policyId, version: policy.version },
    });

    return policy;
  }

  public async getPolicies(organizationIdStr: string): Promise<IPolicy[]> {
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');
    return PolicyModel.find({ organizationId }).sort({ createdAt: -1 });
  }

  public async getPolicyById(organizationIdStr: string, policyId: string): Promise<IPolicy[]> {
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');
    const versions = await PolicyModel.find({ organizationId, policyId }).sort({ version: -1 });

    if (versions.length === 0) {
      throw AppError.notFound('Policy not found or access denied', 'POLICY_NOT_FOUND');
    }

    return versions;
  }

  public async createPolicyVersion(
    organizationIdStr: string,
    userIdStr: string,
    policyId: string,
    data: {
      name?: string;
      description?: string;
      defaultDecision?: DecisionType;
      rules: IPolicyRule[];
    }
  ): Promise<IPolicy> {
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');
    const createdBy = validateObjectId(userIdStr, 'User ID');

    const existingVersions = await PolicyModel.find({ organizationId, policyId }).sort({ version: -1 });
    if (existingVersions.length === 0) {
      throw AppError.notFound('Base policy not found', 'POLICY_NOT_FOUND');
    }

    const latest = existingVersions[0];
    const newVersionNum = latest.version + 1;
    const name = data.name || latest.name;
    const defaultDecision = data.defaultDecision || latest.defaultDecision;
    const rules = data.rules;

    PolicyValidator.validatePolicy({ name, defaultDecision, rules });

    const hash = generatePolicyConfigurationHash({ version: newVersionNum, defaultDecision, rules });

    const newPolicyVersion = await PolicyModel.create({
      policyId,
      organizationId,
      name,
      description: data.description || latest.description,
      version: newVersionNum,
      status: 'PUBLISHED',
      rules,
      defaultDecision,
      configurationHash: hash,
      createdBy,
    });

    logAuthAuditEvent({
      event: 'POLICY_VERSION_CREATED',
      outcome: 'SUCCESS',
      organizationId: organizationIdStr,
      userId: userIdStr,
      details: { policyId, version: newVersionNum },
    });

    return newPolicyVersion;
  }

  public async evaluateDocumentDecisions(
    documentIdStr: string,
    organizationIdStr: string,
    options?: { policyId?: string; policyVersion?: number; force?: boolean; userId?: string; requestId?: string }
  ): Promise<{ run: IDecisionRun; results: IDecisionResult[] }> {
    const documentId = validateObjectId(documentIdStr, 'Document ID');
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');

    // 1. Verify document exists
    const doc = await DocumentModel.findOne({ _id: documentId, organizationId });
    if (!doc || doc.isDeleted) {
      throw AppError.notFound('Document not found or has been deleted', 'DOCUMENT_NOT_FOUND');
    }

    // 2. Load active Phase 07 DetectionRun & Phase 08 ContextAnalysisRun
    let detectionRun = await DetectionRunModel.findOne({
      organizationId,
      documentId,
      isLatestActive: true,
      status: 'COMPLETED',
    });

    if (!detectionRun) {
      await piiDetectionService.detectPIIForDocument(documentIdStr, organizationIdStr, {
        force: options?.force,
      });
      detectionRun = await DetectionRunModel.findOne({
        organizationId,
        documentId,
        isLatestActive: true,
        status: 'COMPLETED',
      });
      if (!detectionRun) {
        throw AppError.badRequest('No active completed PII detection run found for document', 'DETECTION_RUN_NOT_FOUND');
      }
    }

    let contextRun = await ContextAnalysisRunModel.findOne({
      organizationId,
      documentId,
      isLatestActive: true,
      status: 'COMPLETED',
    });

    if (!contextRun) {
      const ctxResult = await contextAnalysisService.runContextAnalysis(documentIdStr, organizationIdStr, {
        force: options?.force,
        userId: options?.userId,
        requestId: options?.requestId,
      });
      contextRun = ctxResult.run as unknown as typeof contextRun;
    }

    if (!contextRun) {
      throw AppError.badRequest('Failed to complete context analysis run for document', 'CONTEXT_RUN_FAILED');
    }

    // 3. Load policy to evaluate
    let policy: IPolicy | null = null;
    if (options?.policyId) {
      if (options.policyVersion) {
        policy = await PolicyModel.findOne({
          organizationId,
          policyId: options.policyId,
          version: options.policyVersion,
        });
      } else {
        const versions = await PolicyModel.find({
          organizationId,
          policyId: options.policyId,
          status: 'PUBLISHED',
        }).sort({ version: -1 });
        policy = versions.length > 0 ? versions[0] : null;
      }
    } else {
      const published = await PolicyModel.find({
        organizationId,
        status: 'PUBLISHED',
      }).sort({ updatedAt: -1 });
      policy = published.length > 0 ? published[0] : null;
    }

    if (!policy) {
      // Fallback: create default tenant policy if none exists
      policy = await this.createPolicy(organizationIdStr, options?.userId || doc.uploadedBy.toString(), {
        name: 'Default System Policy',
        description: 'Automatic default tenant policy for PII evaluation',
        defaultDecision: 'REVIEW',
        rules: [],
      });
    }

    // 4. Check for existing completed DecisionRun unless force=true
    // 4. Check for existing completed DecisionRun unless force=true
    if (!options?.force) {
      if (options?.requestId) {
        const existingRequestRun = await DecisionRunModel.findOne({
          organizationId,
          documentId,
          requestId: options.requestId,
        });
        if (existingRequestRun) {
          logger.info(
            { event: 'decision_run_request_idempotent_reuse', runId: existingRequestRun.decisionRunId, requestId: options.requestId },
            `Reusing existing decision run ${existingRequestRun.decisionRunId} for request ${options.requestId}`
          );
          const results = await DecisionResultModel.find({
            organizationId,
            documentId,
            decisionRunId: existingRequestRun.decisionRunId,
          });
          return { run: existingRequestRun, results };
        }
      }

      const existingCompleted = await DecisionRunModel.findOne({
        organizationId,
        documentId,
        detectionRunId: detectionRun.detectionRunId,
        contextAnalysisRunId: contextRun.contextAnalysisRunId,
        policyConfigurationHash: policy.configurationHash,
        status: 'COMPLETED',
      });

      if (existingCompleted) {
        logger.info(
          { event: 'decision_run_idempotent_reuse', runId: existingCompleted.decisionRunId },
          `Reusing existing completed decision run ${existingCompleted.decisionRunId}`
        );
        const existingResults = await DecisionResultModel.find({
          organizationId,
          documentId,
          decisionRunId: existingCompleted.decisionRunId,
        });
        return { run: existingCompleted, results: existingResults };
      }
    }

    // 5. Create new DecisionRun with E11000 duplicate handling
    const decisionRunId = `dec_run_${crypto.randomUUID()}`;
    let newRun: IDecisionRun;

    try {
      newRun = await DecisionRunModel.create({
        decisionRunId,
        organizationId,
        documentId,
        detectionRunId: detectionRun.detectionRunId,
        contextAnalysisRunId: contextRun.contextAnalysisRunId,
        policyId: policy.policyId,
        policyVersion: policy.version,
        policyConfigurationHash: policy.configurationHash,
        status: 'RUNNING',
        isLatestActive: false,
        totalCandidates: 0,
        decisionsSummary: { KEEP: 0, REVIEW: 0, REDACT: 0 },
        startedAt: new Date(),
        requestId: options?.requestId || null,
      });
    } catch (err: unknown) {
      const isDuplicateKey =
        err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000;
      if (isDuplicateKey) {
        let inFlight = options?.requestId
          ? await DecisionRunModel.findOne({ organizationId, documentId, requestId: options.requestId })
          : null;
        if (!inFlight) {
          inFlight = await DecisionRunModel.findOne({
            organizationId,
            documentId,
            status: { $in: ['QUEUED', 'RUNNING'] },
          });
        }
        if (!inFlight) {
          inFlight = await DecisionRunModel.findOne({
            organizationId,
            documentId,
            detectionRunId: detectionRun.detectionRunId,
            contextAnalysisRunId: contextRun.contextAnalysisRunId,
            policyConfigurationHash: policy.configurationHash,
          }).sort({ createdAt: -1 });
        }
        if (inFlight) {
          logger.info(
            { event: 'decision_run_inflight_reuse', runId: inFlight.decisionRunId },
            `Reusing decision run ${inFlight.decisionRunId}`
          );
          const results = await DecisionResultModel.find({
            organizationId,
            documentId,
            decisionRunId: inFlight.decisionRunId,
          });
          return { run: inFlight, results };
        }
      }
      throw err;
    }

    logAuthAuditEvent({
      event: 'DECISION_EVALUATION_STARTED',
      outcome: 'SUCCESS',
      organizationId: organizationIdStr,
      userId: options?.userId,
      requestId: options?.requestId,
      details: { decisionRunId: newRun.decisionRunId, policyId: policy.policyId, version: policy.version },
    });

    try {
      // 6. Load candidates and context results
      const candidates = await PIICandidateModel.find({
        organizationId,
        documentId,
        detectionRunId: detectionRun.detectionRunId,
      });

      const contextResults = await ContextResultModel.find({
        organizationId,
        documentId,
        contextAnalysisRunId: contextRun.contextAnalysisRunId,
      });

      const contextMap = new Map<string, typeof contextResults[0]>();
      for (const cr of contextResults) {
        contextMap.set(cr.candidateId, cr);
      }

      // 7. Evaluate decisions per candidate
      const results: IDecisionResult[] = [];
      const summary = { KEEP: 0, REVIEW: 0, REDACT: 0 };

      for (const candidate of candidates) {
        const contextRes = contextMap.get(candidate.candidateId) || null;
        const outcome = PolicyEvaluator.evaluateCandidate(candidate, contextRes, policy);

        summary[outcome.decision]++;

        const resObj: Partial<IDecisionResult> = {
          decisionResultId: `dec_res_${crypto.randomUUID()}`,
          decisionRunId: newRun.decisionRunId,
          candidateId: candidate.candidateId,
          documentId,
          organizationId,
          detectionRunId: detectionRun.detectionRunId,
          contextAnalysisRunId: contextRun.contextAnalysisRunId,
          policyId: policy.policyId,
          policyVersion: policy.version,
          decision: outcome.decision,
          decisionScore: outcome.decisionScore,
          matchedRuleIds: outcome.matchedRuleIds,
          rationaleCodes: outcome.rationaleCodes,
          evaluationWarnings: outcome.evaluationWarnings,
          evaluatorVersion: PolicyEvaluator.EVALUATOR_VERSION,
          policyConfigurationHash: policy.configurationHash,
        };

        results.push(resObj as IDecisionResult);
      }

      // 8. Bulk save results
      if (results.length > 0) {
        await DecisionResultModel.insertMany(results);
      }

      // 9. Finalize decision run status
      newRun.status = 'COMPLETED';
      newRun.completedAt = new Date();
      newRun.totalCandidates = candidates.length;
      newRun.decisionsSummary = summary;
      await newRun.save();

      // 10. Atomic publication of active decision run with fallback recovery
      await this.publishActiveRun(newRun, organizationId, documentId);

      logAuthAuditEvent({
        event: 'DECISION_EVALUATION_COMPLETED',
        outcome: 'SUCCESS',
        organizationId: organizationIdStr,
        userId: options?.userId,
        requestId: options?.requestId,
        details: {
          decisionRunId: newRun.decisionRunId,
          totalCandidates: candidates.length,
          decisionsSummary: summary,
        },
      });

      return { run: newRun, results };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      newRun.status = 'FAILED';
      newRun.failedAt = new Date();
      newRun.failureReason = errorMsg;
      await newRun.save();

      logAuthAuditEvent({
        event: 'DECISION_EVALUATION_FAILED',
        outcome: 'FAILURE',
        reason: errorMsg,
        organizationId: organizationIdStr,
        userId: options?.userId,
        requestId: options?.requestId,
        details: { decisionRunId: newRun.decisionRunId, error: errorMsg },
      });

      throw err;
    }
  }

  public async publishActiveRun(
    newRun: IDecisionRun,
    organizationId: mongoose.Types.ObjectId,
    documentId: mongoose.Types.ObjectId
  ): Promise<void> {
    const isReplicaSet = Boolean(
      mongoose.connection.readyState === 1 &&
      (mongoose.connection.getClient() as any)?.topology?.description?.type?.includes('ReplicaSet')
    );

    if (isReplicaSet) {
      try {
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            await DecisionRunModel.updateMany(
              { organizationId, documentId, _id: { $ne: newRun._id } },
              { $set: { isLatestActive: false } },
              { session }
            );
            await DecisionRunModel.updateOne(
              { _id: newRun._id, organizationId, documentId },
              { $set: { isLatestActive: true } },
              { session }
            );
          });
          newRun.isLatestActive = true;
          return;
        } finally {
          await session.endSession();
        }
      } catch (txnErr) {
        logger.warn(
          { event: 'decision_run_transaction_failed', error: String(txnErr) },
          'Transaction publication failed, falling back to atomic sequential publication'
        );
      }
    }

    // Atomic sequential publication enforcing unique active run invariant
    await DecisionRunModel.updateMany(
      { organizationId, documentId, _id: { $ne: newRun._id } },
      { $set: { isLatestActive: false } }
    );

    await DecisionRunModel.updateOne(
      { _id: newRun._id, organizationId, documentId },
      { $set: { isLatestActive: true } }
    );
    newRun.isLatestActive = true;
  }

  public async getDecisionRuns(
    documentIdStr: string,
    organizationIdStr: string
  ): Promise<IDecisionRun[]> {
    const documentId = validateObjectId(documentIdStr, 'Document ID');
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');
    return DecisionRunModel.find({ organizationId, documentId }).sort({ createdAt: -1 });
  }

  public async getDecisionResults(
    documentIdStr: string,
    organizationIdStr: string,
    runIdStr?: string
  ): Promise<{ run: IDecisionRun | null; results: IDecisionResult[] }> {
    const documentId = validateObjectId(documentIdStr, 'Document ID');
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');

    let run: IDecisionRun | null = null;
    if (runIdStr) {
      run = await DecisionRunModel.findOne({ organizationId, documentId, decisionRunId: runIdStr });
    } else {
      run = await DecisionRunModel.findOne({ organizationId, documentId, isLatestActive: true });
    }

    if (!run) {
      return { run: null, results: [] };
    }

    const results = await DecisionResultModel.find({
      organizationId,
      documentId,
      decisionRunId: run.decisionRunId,
    });

    return { run, results };
  }
}

export const policyService = new PolicyService();
