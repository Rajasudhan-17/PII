import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  VerificationRunModel,
  IVerificationRun,
  OverallVerificationStatus,
} from '../../models/verificationRun.model';
import {
  VerificationResultModel,
  IVerificationResult,
} from '../../models/verificationResult.model';
import { OutputArtifactModel, IOutputArtifact } from '../../models/outputArtifact.model';
import { DocumentModel } from '../../models/document.model';
import { PIICandidateModel, IPIICandidate } from '../../models/piiCandidate.model';
import { DecisionRunModel } from '../../models/decisionRun.model';
import { TransformationRunModel } from '../../models/transformationRun.model';
import { MetadataSanitizationRunModel } from '../../models/metadataSanitizationRun.model';
import { ReidentificationRiskRunModel } from '../../models/reidentificationRiskRun.model';

import { ChecksumVerifier } from './verifiers/checksumVerifier';
import { ArtifactIntegrityVerifier } from './verifiers/artifactIntegrityVerifier';
import { StructuralIntegrityVerifier } from './verifiers/structuralIntegrityVerifier';
import { TransformationVerifier } from './verifiers/transformationVerifier';
import { MetadataVerifier } from './verifiers/metadataVerifier';
import { PiiResidualVerifier } from './verifiers/piiResidualVerifier';
import { PolicyVerifier } from './verifiers/policyVerifier';
import { ProvenanceVerifier } from './verifiers/provenanceVerifier';
import { RiskConsistencyVerifier } from './verifiers/riskConsistencyVerifier';

import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { logAuthAuditEvent } from '../audit.service';
import { validateObjectId } from '../../utils/tenantQuery';
import { storageService } from '../storage/storage.service';

export class VerificationService {
  public async executeVerification(
    documentIdStr: string,
    organizationIdStr: string,
    options?: {
      outputArtifactId?: string;
      force?: boolean;
      userId?: string;
      requestId?: string;
      verificationModelVersion?: string;
    }
  ): Promise<{ run: IVerificationRun; results: IVerificationResult[] }> {
    const documentId = validateObjectId(documentIdStr, 'Document ID');
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');
    const verificationModelVersion = options?.verificationModelVersion || '1.0.0';

    // 1. Load document record & verify tenant ownership
    const doc = await DocumentModel.findOne({ _id: documentId, organizationId });
    if (!doc || doc.isDeleted) {
      throw AppError.notFound('Document not found or has been deleted', 'DOCUMENT_NOT_FOUND');
    }

    // Resource Limit Validation (50MB maximum file size)
    const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
    if (doc.size > MAX_FILE_SIZE_BYTES) {
      throw AppError.badRequest(
        'Document size exceeds maximum allowable limit for verification (50MB)',
        'RESOURCE_LIMIT_EXCEEDED'
      );
    }

    // 2. Identify target output storage artifact (from Phase 11 / Phase 10 OutputArtifact or Document storage)
    let outputArtifact: IOutputArtifact | null = null;
    if (options?.outputArtifactId) {
      outputArtifact = await OutputArtifactModel.findOne({
        organizationId,
        outputArtifactId: options.outputArtifactId,
      });
      if (!outputArtifact) {
        throw AppError.notFound('Target output artifact not found', 'ARTIFACT_NOT_FOUND');
      }
    } else {
      outputArtifact = await OutputArtifactModel.findOne({
        organizationId,
        sourceDocumentId: documentId,
      }).sort({ createdAt: -1 });
    }

    let sourceFilePath = path.isAbsolute(doc.storageKey)
      ? doc.storageKey
      : path.join(process.cwd(), doc.storageKey);
    if (!fs.existsSync(sourceFilePath)) {
      sourceFilePath = storageService.getAbsolutePath(doc.storageKey);
    }

    const outputStorageKey = outputArtifact ? outputArtifact.storageKey : doc.storageKey;
    let outputFilePath = path.isAbsolute(outputStorageKey)
      ? outputStorageKey
      : path.join(process.cwd(), outputStorageKey);
    if (!fs.existsSync(outputFilePath)) {
      outputFilePath = storageService.getAbsolutePath(outputStorageKey);
    }

    const sourceArtifactIdStr = doc._id.toString();
    const outputArtifactIdStr = outputArtifact ? outputArtifact.outputArtifactId : doc._id.toString();

    // 3. Stale Source Protection: Verify files exist and checksums match
    if (!fs.existsSync(sourceFilePath)) {
      throw AppError.notFound('Source storage artifact file not found on disk', 'SOURCE_FILE_NOT_FOUND');
    }
    if (!fs.existsSync(outputFilePath)) {
      throw AppError.notFound('Output storage artifact file not found on disk', 'OUTPUT_FILE_NOT_FOUND');
    }

    const currentSourceBuffer = await fs.promises.readFile(sourceFilePath);
    const currentSourceChecksum = crypto.createHash('sha256').update(currentSourceBuffer).digest('hex');

    const currentOutputBuffer = await fs.promises.readFile(outputFilePath);
    const currentOutputChecksum = crypto.createHash('sha256').update(currentOutputBuffer).digest('hex');

    if (doc.checksum && currentSourceChecksum !== doc.checksum) {
      logAuthAuditEvent({
        event: 'VERIFICATION_INTEGRITY_FAILURE',
        outcome: 'FAILURE',
        organizationId: organizationIdStr,
        userId: options?.userId,
        requestId: options?.requestId,
      });
      throw AppError.badRequest('Source artifact checksum mismatch: file was altered upstream', 'STALE_SOURCE');
    }

    // 4. Configuration Fingerprinting
    const configHash = crypto
      .createHash('sha256')
      .update(`${sourceArtifactIdStr}:${outputArtifactIdStr}:${outputArtifact?.status || 'NONE'}:${currentSourceChecksum}:${currentOutputChecksum}:${verificationModelVersion}:1.0.0`)
      .digest('hex');

    // 5. Idempotency Reuse Check (unless force=true)
    if (!options?.force) {
      const existingCompleted = await VerificationRunModel.findOne({
        organizationId,
        documentId,
        sourceArtifactId: sourceArtifactIdStr,
        outputArtifactId: outputArtifactIdStr,
        sourceChecksum: currentSourceChecksum,
        outputChecksum: currentOutputChecksum,
        configurationHash: configHash,
        verificationModelVersion,
        status: 'COMPLETED',
      });

      if (existingCompleted) {
        const results = await VerificationResultModel.find({
          verificationRunId: existingCompleted.verificationRunId,
          organizationId,
        });

        logger.info(
          { event: 'verification_idempotent_reuse', runId: existingCompleted.verificationRunId },
          `Reusing existing completed verification run ${existingCompleted.verificationRunId}`
        );

        return { run: existingCompleted, results };
      }
    }

    // 6. Create VerificationRun with E11000 duplicate handling
    const verificationRunId = `ver_run_${crypto.randomUUID()}`;
    let newRun: IVerificationRun;

    try {
      newRun = await VerificationRunModel.create({
        verificationRunId,
        organizationId,
        documentId,
        sourceArtifactId: sourceArtifactIdStr,
        outputArtifactId: outputArtifactIdStr,
        sourceChecksum: currentSourceChecksum,
        outputChecksum: currentOutputChecksum,
        configurationVersion: '1.0.0',
        configurationHash: configHash,
        verificationModelVersion,
        status: 'RUNNING',
        isLatestActive: false,
        requestId: options?.requestId || null,
        startedAt: new Date(),
      });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000) {
        // E11000 duplicate key race handling: retrieve active running or completed run
        const activeRun = await VerificationRunModel.findOne({
          organizationId,
          documentId,
          sourceArtifactId: sourceArtifactIdStr,
          outputArtifactId: outputArtifactIdStr,
          sourceChecksum: currentSourceChecksum,
          outputChecksum: currentOutputChecksum,
          configurationHash: configHash,
          verificationModelVersion,
        });

        if (activeRun) {
          if (activeRun.status === 'RUNNING') {
            for (let i = 0; i < 20; i++) {
              await new Promise((resolve) => setTimeout(resolve, 50));
              const polledRun = await VerificationRunModel.findOne({ verificationRunId: activeRun.verificationRunId });
              if (polledRun && polledRun.status !== 'RUNNING') {
                const results = await VerificationResultModel.find({
                  verificationRunId: polledRun.verificationRunId,
                  organizationId,
                });
                return { run: polledRun, results };
              }
            }
          }
          const results = await VerificationResultModel.find({
            verificationRunId: activeRun.verificationRunId,
            organizationId,
          });
          return { run: activeRun, results };
        }
      }
      throw err;
    }

    logAuthAuditEvent({
      event: 'VERIFICATION_STARTED',
      outcome: 'SUCCESS',
      organizationId: organizationIdStr,
      userId: options?.userId,
      requestId: options?.requestId,
      details: { verificationRunId },
    });

    try {
      // 7. Load Upstream Chain Evidence
      const candidates = await PIICandidateModel.find({ organizationId, documentId });
      const decisionRun = await DecisionRunModel.findOne({ organizationId, documentId, isLatestActive: true });
      const transRun = await TransformationRunModel.findOne({ organizationId, documentId, isLatestActive: true });
      const sanitRun = await MetadataSanitizationRunModel.findOne({ organizationId, documentId, isLatestActive: true });
      const riskRun = await ReidentificationRiskRunModel.findOne({ organizationId, documentId, isLatestActive: true });

      const overallDecision = decisionRun
        ? decisionRun.decisionsSummary.REDACT > 0
          ? 'REDACT'
          : decisionRun.decisionsSummary.REVIEW > 0
          ? 'REVIEW'
          : 'KEEP'
        : null;

      const directCandidates = candidates.filter((c: IPIICandidate) =>
        ['PERSON_NAME', 'EMAIL_ADDRESS', 'PHONE_NUMBER', 'US_SSN', 'CREDIT_CARD_NUMBER', 'AUTH_TOKEN_KEY'].includes(c.type.toUpperCase())
      );
      const sensitiveTexts = candidates.map((c: IPIICandidate) => c.text).filter((t: string) => Boolean(t));

      // 8. Run 9 Independent Verifier Modules
      const verifierOutcomes = [];

      // V1. Checksum Verifier
      const v1 = await ChecksumVerifier.verify(
        sourceFilePath,
        outputFilePath,
        doc.checksum || currentSourceChecksum,
        outputArtifact ? outputArtifact.outputChecksum : currentOutputChecksum
      );
      verifierOutcomes.push(v1);

      // V2. Artifact Integrity Verifier
      const v2 = ArtifactIntegrityVerifier.verify({
        docOrgId: doc.organizationId.toString(),
        targetOrgId: organizationIdStr,
        docIsDeleted: doc.isDeleted,
        sourceArtifactId: sourceArtifactIdStr,
        outputArtifactId: outputArtifactIdStr,
      });
      verifierOutcomes.push(v2);

      // V3. Structural Integrity Verifier
      const v3 = await StructuralIntegrityVerifier.verify(outputFilePath, doc.extension);
      verifierOutcomes.push(v3);

      // V5. Metadata Verifier
      const v5 = await MetadataVerifier.verify(outputFilePath, doc.extension, Boolean(sanitRun));

      // V6. PII Residual Verifier
      const v6 = await PiiResidualVerifier.verify(
        outputFilePath,
        overallDecision,
        sensitiveTexts,
        doc.extension
      );

      // V4. Transformation Verifier (Decision-Aware)
      const residualProhibitedContentObserved = v6.status === 'FAILED';
      const unauthorizedMutationObserved = overallDecision === 'KEEP' && currentSourceChecksum !== currentOutputChecksum;
      const isPublishedAsSanitized = overallDecision === 'REVIEW' && outputArtifact?.status === 'ACTIVE';

      const v4 = TransformationVerifier.verify({
        transformationRunExists: Boolean(transRun),
        operationType: transRun ? transRun.operation : overallDecision,
        sourceChecksum: currentSourceChecksum,
        outputChecksum: currentOutputChecksum,
        residualProhibitedContentObserved,
        isPublishedAsSanitized,
      });

      // V7. Policy Verifier (Semantic Policy Contract Verification)
      const v7 = PolicyVerifier.verify(
        overallDecision,
        currentSourceChecksum,
        currentOutputChecksum,
        residualProhibitedContentObserved,
        unauthorizedMutationObserved,
        isPublishedAsSanitized
      );

      verifierOutcomes.push(v4);
      verifierOutcomes.push(v5);
      verifierOutcomes.push(v6);
      verifierOutcomes.push(v7);

      // V8. Provenance Verifier
      const v8 = ProvenanceVerifier.verify({
        hasCandidateChain: candidates.length > 0,
        hasDecisionChain: Boolean(decisionRun),
        hasRiskChain: Boolean(riskRun),
        documentId: documentIdStr,
        organizationId: organizationIdStr,
      });
      verifierOutcomes.push(v8);

      // V9. Risk Consistency Verifier
      const hasResidualDirect = directCandidates.length > 0 && v6.status === 'FAILED';
      const v9 = RiskConsistencyVerifier.verify(
        riskRun ? riskRun.riskLevel : null,
        hasResidualDirect
      );
      verifierOutcomes.push(v9);

      // 9. Persist Result Records
      const resultRecords: IVerificationResult[] = [];
      let passedCount = 0;
      let failedCount = 0;
      let unverifiableCount = 0;
      let partialCount = 0;

      for (const outcome of verifierOutcomes) {
        if (outcome.status === 'VERIFIED') passedCount++;
        else if (outcome.status === 'FAILED') failedCount++;
        else if (outcome.status === 'PARTIAL') partialCount++;
        else if (outcome.status === 'NOT_VERIFIABLE') unverifiableCount++;

        const resultRecord = await VerificationResultModel.create({
          verificationResultId: `ver_res_${crypto.randomUUID()}`,
          verificationRunId: newRun.verificationRunId,
          organizationId,
          documentId,
          sourceArtifactId: sourceArtifactIdStr,
          outputArtifactId: outputArtifactIdStr,
          verifierType: outcome.verifierType,
          status: outcome.status,
          severity: outcome.severity,
          passed: outcome.passed,
          reasonCode: outcome.reasonCode,
          explanation: outcome.explanation,
          expected: outcome.expected,
          observed: outcome.observed,
          findingsCount: outcome.findingsCount,
          provenance: {
            provenanceSource: 'UPSTREAM_DETECTION_PROVENANCE',
          },
          warnings: outcome.warnings,
          verifierVersion: '1.0.0',
        });
        resultRecords.push(resultRecord);
      }

      // 10. Aggregate Overall Verification Status & Score
      let overallStatus: OverallVerificationStatus = 'VERIFIED';
      if (failedCount > 0) {
        overallStatus = 'FAILED';
      } else if (partialCount > 0) {
        overallStatus = 'PARTIAL';
      } else if (unverifiableCount > 0) {
        overallStatus = 'NOT_VERIFIABLE';
      } else if (passedCount < verifierOutcomes.length) {
        overallStatus = 'PARTIAL';
      }

      const totalVerifiers = verifierOutcomes.length;
      const overallVerificationScore = Number((passedCount / totalVerifiers).toFixed(4));

      // 11. Active Publication & Run Completion
      await VerificationRunModel.updateMany(
        { organizationId, documentId, isLatestActive: true },
        { isLatestActive: false }
      );

      newRun.status = 'COMPLETED';
      newRun.overallStatus = overallStatus;
      newRun.overallVerificationScore = overallVerificationScore;
      newRun.totalVerifierCount = totalVerifiers;
      newRun.passedVerifierCount = passedCount;
      newRun.failedVerifierCount = failedCount;
      newRun.unverifiableCount = unverifiableCount;
      newRun.isLatestActive = true;
      newRun.completedAt = new Date();

      await newRun.save();

      logAuthAuditEvent({
        event: 'VERIFICATION_COMPLETED',
        outcome: 'SUCCESS',
        organizationId: organizationIdStr,
        userId: options?.userId,
        requestId: options?.requestId,
        details: {
          verificationRunId,
          overallStatus,
          overallVerificationScore,
        },
      });

      logAuthAuditEvent({
        event: 'VERIFICATION_PUBLISHED',
        outcome: 'SUCCESS',
        organizationId: organizationIdStr,
        userId: options?.userId,
        requestId: options?.requestId,
        details: { verificationRunId, overallStatus },
      });

      return { run: newRun, results: resultRecords };
    } catch (err: unknown) {
      newRun.status = 'FAILED';
      newRun.failedAt = new Date();
      newRun.failureReason = err instanceof Error ? err.message : 'Verification execution failed';
      await newRun.save();

      logAuthAuditEvent({
        event: 'VERIFICATION_FAILED',
        outcome: 'FAILURE',
        organizationId: organizationIdStr,
        userId: options?.userId,
        requestId: options?.requestId,
        reason: newRun.failureReason,
      });

      throw err;
    }
  }

  public async getVerificationRuns(
    documentIdStr: string,
    organizationIdStr: string
  ): Promise<IVerificationRun[]> {
    const documentId = validateObjectId(documentIdStr, 'Document ID');
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');
    return VerificationRunModel.find({ organizationId, documentId }).sort({ createdAt: -1 });
  }

  public async getVerificationResults(
    documentIdStr: string,
    organizationIdStr: string
  ): Promise<{ run: IVerificationRun | null; results: IVerificationResult[] }> {
    const documentId = validateObjectId(documentIdStr, 'Document ID');
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');

    const run = await VerificationRunModel.findOne({
      organizationId,
      documentId,
      isLatestActive: true,
    });

    if (!run) {
      return { run: null, results: [] };
    }

    const results = await VerificationResultModel.find({
      verificationRunId: run.verificationRunId,
      organizationId,
    });

    return { run, results };
  }
}

export const verificationService = new VerificationService();
