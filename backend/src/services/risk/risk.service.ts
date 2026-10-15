import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  ReidentificationRiskRunModel,
  IReidentificationRiskRun,
} from '../../models/reidentificationRiskRun.model';
import {
  ReidentificationRiskResultModel,
  IReidentificationRiskResult,
} from '../../models/reidentificationRiskResult.model';
import { OutputArtifactModel, IOutputArtifact } from '../../models/outputArtifact.model';
import { DocumentModel } from '../../models/document.model';
import { PIICandidateModel, IPIICandidate } from '../../models/piiCandidate.model';
import { MetadataSanitizationResultModel } from '../../models/metadataSanitizationResult.model';
import { ReferencePopulationProvider } from './populationProvider';
import { CombinationAnalyzer } from './combinationAnalyzer';
import { RiskCalculator } from './riskCalculator';
import { classifyAttribute } from './quasiIdentifier.taxonomy';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { logAuthAuditEvent } from '../audit.service';
import { validateObjectId } from '../../utils/tenantQuery';
import { storageService } from '../storage/storage.service';

export class RiskService {
  public async executeRiskAnalysis(
    documentIdStr: string,
    organizationIdStr: string,
    options?: {
      sanitizedArtifactId?: string;
      force?: boolean;
      userId?: string;
      requestId?: string;
      riskModelVersion?: string;
    }
  ): Promise<{ run: IReidentificationRiskRun; results: IReidentificationRiskResult[] }> {
    const documentId = validateObjectId(documentIdStr, 'Document ID');
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');
    const riskModelVersion = options?.riskModelVersion || '1.0.0';

    // 1. Load document record & verify tenant ownership
    const doc = await DocumentModel.findOne({ _id: documentId, organizationId });
    if (!doc || doc.isDeleted) {
      throw AppError.notFound('Document not found or has been deleted', 'DOCUMENT_NOT_FOUND');
    }

    // Resource Limit Validation (50MB maximum file size)
    const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
    if (doc.size > MAX_FILE_SIZE_BYTES) {
      throw AppError.badRequest(
        'Document size exceeds maximum allowable limit for risk analysis (50MB)',
        'RESOURCE_LIMIT_EXCEEDED'
      );
    }

    // 2. Identify input sanitized storage artifact (from Phase 11 OutputArtifact or Phase 10 / Document storage)
    let sanitizedArtifact: IOutputArtifact | null = null;
    if (options?.sanitizedArtifactId) {
      sanitizedArtifact = await OutputArtifactModel.findOne({
        organizationId,
        outputArtifactId: options.sanitizedArtifactId,
      });
      if (!sanitizedArtifact) {
        throw AppError.notFound('Target sanitized artifact not found', 'ARTIFACT_NOT_FOUND');
      }
    } else {
      sanitizedArtifact = await OutputArtifactModel.findOne({
        organizationId,
        sourceDocumentId: documentId,
        status: 'ACTIVE',
      }).sort({ createdAt: -1 });
    }

    const inputStorageKey = sanitizedArtifact ? sanitizedArtifact.storageKey : doc.storageKey;
    const inputChecksum = sanitizedArtifact ? sanitizedArtifact.outputChecksum : doc.checksum;
    const sanitizedArtifactIdStr = sanitizedArtifact ? sanitizedArtifact.outputArtifactId : doc._id.toString();

    // 3. Stale Source Protection: Verify input storage file exists and checksum matches
    let sourceFilePath = path.isAbsolute(inputStorageKey)
      ? inputStorageKey
      : path.join(process.cwd(), inputStorageKey);

    if (!fs.existsSync(sourceFilePath)) {
      sourceFilePath = storageService.getAbsolutePath(inputStorageKey);
    }

    if (!fs.existsSync(sourceFilePath)) {
      throw AppError.notFound('Target storage artifact file not found on disk', 'SOURCE_FILE_NOT_FOUND');
    }

    const currentSourceBuffer = await fs.promises.readFile(sourceFilePath);
    const currentChecksum = crypto.createHash('sha256').update(currentSourceBuffer).digest('hex');

    if (inputChecksum && currentChecksum !== inputChecksum && doc.checksum && currentChecksum !== doc.checksum) {
      logAuthAuditEvent({
        event: 'TRANSFORMATION_STALE_SOURCE',
        outcome: 'FAILURE',
        organizationId: organizationIdStr,
        userId: options?.userId,
        requestId: options?.requestId,
      });
      throw AppError.badRequest('Sanitized artifact checksum mismatch: file was altered upstream', 'STALE_SOURCE');
    }

    // 4. Configuration Fingerprinting
    const configHash = crypto
      .createHash('sha256')
      .update(`${sanitizedArtifactIdStr}:${currentChecksum}:${riskModelVersion}:1.0.0`)
      .digest('hex');

    // 5. Idempotency Reuse Check (unless force=true)
    if (!options?.force) {
      const existingCompleted = await ReidentificationRiskRunModel.findOne({
        organizationId,
        documentId,
        sanitizedArtifactId: sanitizedArtifactIdStr,
        sanitizedChecksum: currentChecksum,
        configurationHash: configHash,
        riskModelVersion,
        status: 'COMPLETED',
      });

      if (existingCompleted) {
        const results = await ReidentificationRiskResultModel.find({
          riskRunId: existingCompleted.riskRunId,
          organizationId,
        });

        logger.info(
          { event: 'risk_analysis_idempotent_reuse', runId: existingCompleted.riskRunId },
          `Reusing existing completed risk run ${existingCompleted.riskRunId}`
        );

        return { run: existingCompleted, results };
      }
    }

    // 6. Create ReidentificationRiskRun with E11000 duplicate handling
    const riskRunId = `risk_run_${crypto.randomUUID()}`;
    let newRun: IReidentificationRiskRun;

    try {
      newRun = await ReidentificationRiskRunModel.create({
        riskRunId,
        organizationId,
        documentId,
        sourceArtifactId: doc._id.toString(),
        sanitizedArtifactId: sanitizedArtifactIdStr,
        sourceChecksum: doc.checksum || currentChecksum,
        sanitizedChecksum: currentChecksum,
        configurationVersion: '1.0.0',
        configurationHash: configHash,
        riskModelVersion,
        referencePopulationVersion: 'HEURISTIC_1.0',
        status: 'RUNNING',
        isLatestActive: false,
        requestId: options?.requestId || null,
        startedAt: new Date(),
      });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000) {
        // E11000 duplicate key race handling: retrieve active running or completed run
        const activeRun = await ReidentificationRiskRunModel.findOne({
          organizationId,
          documentId,
          sanitizedArtifactId: sanitizedArtifactIdStr,
          sanitizedChecksum: currentChecksum,
          configurationHash: configHash,
          riskModelVersion,
        });

        if (activeRun) {
          if (activeRun.status === 'RUNNING') {
            for (let i = 0; i < 20; i++) {
              await new Promise((resolve) => setTimeout(resolve, 50));
              const polledRun = await ReidentificationRiskRunModel.findOne({ riskRunId: activeRun.riskRunId });
              if (polledRun && polledRun.status !== 'RUNNING') {
                const results = await ReidentificationRiskResultModel.find({
                  riskRunId: polledRun.riskRunId,
                  organizationId,
                });
                return { run: polledRun, results };
              }
            }
          }
          const results = await ReidentificationRiskResultModel.find({
            riskRunId: activeRun.riskRunId,
            organizationId,
          });
          return { run: activeRun, results };
        }
      }
      throw err;
    }

    logAuthAuditEvent({
      event: 'RISK_ANALYSIS_STARTED',
      outcome: 'SUCCESS',
      organizationId: organizationIdStr,
      userId: options?.userId,
      requestId: options?.requestId,
      details: { riskRunId },
    });

    try {
      // 7. Upstream Evidence Collection
      // Fetch Phase 07 candidates & Phase 11 residual metadata
      const candidates = await PIICandidateModel.find({ organizationId, documentId });
      const metadataResults = await MetadataSanitizationResultModel.find({ organizationId, documentId });

      // Direct Identifiers Surviving
      const directTypes = [
        'PERSON_NAME',
        'EMAIL_ADDRESS',
        'PHONE_NUMBER',
        'US_SSN',
        'CREDIT_CARD_NUMBER',
        'AUTH_TOKEN_KEY',
        'SECURITY_CREDENTIAL',
        'PASSPORT_NUMBER',
        'NATIONAL_ID',
      ];

      const directCandidates = candidates.filter((c: IPIICandidate) => directTypes.includes(c.type.toUpperCase()));
      const quasiCandidates = candidates.filter((c: IPIICandidate) => !directTypes.includes(c.type.toUpperCase()));

      const detectedAttributeTypes: string[] = [];
      let maxSensitivity = 0.0;

      for (const c of candidates) {
        detectedAttributeTypes.push(c.type);
        if (c.sensitivityScore > maxSensitivity) {
          maxSensitivity = c.sensitivityScore;
        }
      }

      for (const m of metadataResults) {
        if (m.status === 'SANITIZED' || m.status === 'PRESERVED') {
          detectedAttributeTypes.push(m.category);
        }
      }

      // If document is text or image, include baseline detected categories
      if (detectedAttributeTypes.length === 0) {
        detectedAttributeTypes.push('DOCUMENT_METADATA');
      }

      // 8. Combination & Precision Risk Analysis
      const combinationEval = CombinationAnalyzer.analyzeCombinations(detectedAttributeTypes);

      // 9. Population Risk Evaluation
      const popEval = ReferencePopulationProvider.evaluatePopulationRisk(
        detectedAttributeTypes,
        combinationEval.uniquenessRiskScore
      );

      // 10. Final Risk Calculation
      const finalRisk = RiskCalculator.calculateRisk({
        directIdentifierCount: directCandidates.length,
        quasiIdentifierCount: quasiCandidates.length,
        combinationRiskScore: combinationEval.combinationRiskScore,
        geographicRiskScore: combinationEval.geographicRiskScore,
        temporalRiskScore: combinationEval.temporalRiskScore,
        linkageRiskScore: combinationEval.linkageRiskScore,
        heuristicRarityScore: popEval.heuristicRarityScore,
        maxSensitivityScore: maxSensitivity,
        hasPopulationData: popEval.mode === 'REFERENCE_DATA_AVAILABLE',
      });

      // 11. Create ReidentificationRiskResult Records
      const resultRecords: IReidentificationRiskResult[] = [];

      // Direct Identifier Signal Result
      if (directCandidates.length > 0) {
        for (const dc of directCandidates) {
          const rec = await ReidentificationRiskResultModel.create({
            riskResultId: `risk_res_${crypto.randomUUID()}`,
            riskRunId: newRun.riskRunId,
            organizationId,
            documentId,
            sanitizedArtifactId: sanitizedArtifactIdStr,
            signalType: 'DIRECT_IDENTIFIER_SIGNAL',
            riskLevel: 'CRITICAL',
            riskScore: 1.0,
            confidence: finalRisk.riskConfidence,
            attributes: [dc.type],
            kAnonymityEstimate: null,
            lDiversitySignal: null,
            referencePopulationMode: popEval.mode,
            provenance: {
              provenanceSource: 'UPSTREAM_DETECTION_PROVENANCE',
              page: dc.location?.pageNumber || 1,
              startOffset: dc.location?.startOffset || 0,
              endOffset: dc.location?.endOffset || 0,
            },
            reasonCode: 'RESIDUAL_DIRECT_IDENTIFIER',
            explanation: `Residual direct identifier of type ${dc.type} identified from upstream detection provenance.`,
            warnings: [],
          });
          resultRecords.push(rec);
        }
      }

      // Combination Risk Signal Result
      const combRec = await ReidentificationRiskResultModel.create({
        riskResultId: `risk_res_${crypto.randomUUID()}`,
        riskRunId: newRun.riskRunId,
        organizationId,
        documentId,
        sanitizedArtifactId: sanitizedArtifactIdStr,
        signalType: 'COMBINATION_SIGNAL',
        riskLevel: finalRisk.riskLevel,
        riskScore: finalRisk.combinationRiskScore,
        confidence: finalRisk.riskConfidence,
        attributes: combinationEval.topCombinationAttributes,
        kAnonymityEstimate: popEval.mode === 'REFERENCE_DATA_AVAILABLE' ? popEval.kAnonymityEstimate : null,
        lDiversitySignal: popEval.mode === 'REFERENCE_DATA_AVAILABLE' ? popEval.lDiversitySignal : 'HEURISTIC_DIVERSITY_SIGNAL',
        referencePopulationMode: popEval.mode,
        provenance: {
          provenanceSource: 'CONTEXT_RESULT',
        },
        reasonCode: 'RARE_ATTRIBUTE_COMBINATION',
        explanation: combinationEval.explanation,
        warnings: [],
      });
      resultRecords.push(combRec);

      // Geographic Precision Signal Result (if geographic attributes present)
      if (combinationEval.geographicRiskScore > 0) {
        const geoRec = await ReidentificationRiskResultModel.create({
          riskResultId: `risk_res_${crypto.randomUUID()}`,
          riskRunId: newRun.riskRunId,
          organizationId,
          documentId,
          sanitizedArtifactId: sanitizedArtifactIdStr,
          signalType: 'GEOGRAPHIC_PRECISION_SIGNAL',
          riskLevel: combinationEval.geographicRiskScore >= 0.7 ? 'HIGH' : 'MODERATE',
          riskScore: combinationEval.geographicRiskScore,
          confidence: finalRisk.riskConfidence,
          attributes: detectedAttributeTypes.filter((t) => classifyAttribute(t).category === 'GEOGRAPHIC'),
          referencePopulationMode: popEval.mode,
          provenance: {
            provenanceSource: 'CONTEXT_RESULT',
          },
          reasonCode: 'GEOGRAPHIC_PRECISION_SPECIFICITY',
          explanation: `Geographic precision level risk score evaluated at ${combinationEval.geographicRiskScore}.`,
          warnings: [],
        });
        resultRecords.push(geoRec);
      }

      // 12. Active Publication & Run Completion
      await ReidentificationRiskRunModel.updateMany(
        { organizationId, documentId, isLatestActive: true },
        { isLatestActive: false }
      );

      newRun.status = 'COMPLETED';
      newRun.isLatestActive = true;
      newRun.reidentificationRiskScore = finalRisk.reidentificationRiskScore;
      newRun.riskLevel = finalRisk.riskLevel;
      newRun.riskConfidence = finalRisk.riskConfidence;
      newRun.directIdentifierRiskScore = finalRisk.directIdentifierRiskScore;
      newRun.quasiIdentifierRiskScore = finalRisk.quasiIdentifierRiskScore;
      newRun.uniquenessRiskScore = finalRisk.uniquenessRiskScore;
      newRun.combinationRiskScore = finalRisk.combinationRiskScore;
      newRun.geographicRiskScore = finalRisk.geographicRiskScore;
      newRun.temporalRiskScore = finalRisk.temporalRiskScore;
      newRun.linkageRiskScore = finalRisk.linkageRiskScore;
      newRun.rarityRiskScore = finalRisk.rarityRiskScore;
      newRun.attributeSensitivityRiskScore = finalRisk.attributeSensitivityRiskScore;
      newRun.discoveredAttributeCount = detectedAttributeTypes.length;
      newRun.combinationEvaluatedCount = combinationEval.evaluatedCombinationCount;
      newRun.completedAt = new Date();

      await newRun.save();

      logAuthAuditEvent({
        event: 'RISK_ANALYSIS_COMPLETED',
        outcome: 'SUCCESS',
        organizationId: organizationIdStr,
        userId: options?.userId,
        requestId: options?.requestId,
        details: {
          riskRunId,
          riskScore: finalRisk.reidentificationRiskScore,
          riskLevel: finalRisk.riskLevel,
        },
      });

      if (finalRisk.riskLevel === 'HIGH' || finalRisk.riskLevel === 'VERY_HIGH') {
        logAuthAuditEvent({
          event: 'HIGH_RISK_DETECTED',
          outcome: 'SUCCESS',
          organizationId: organizationIdStr,
          userId: options?.userId,
          requestId: options?.requestId,
          details: { riskRunId, riskScore: finalRisk.reidentificationRiskScore },
        });
      } else if (finalRisk.riskLevel === 'CRITICAL') {
        logAuthAuditEvent({
          event: 'CRITICAL_RISK_DETECTED',
          outcome: 'SUCCESS',
          organizationId: organizationIdStr,
          userId: options?.userId,
          requestId: options?.requestId,
          details: { riskRunId, riskScore: finalRisk.reidentificationRiskScore },
        });
      }

      return { run: newRun, results: resultRecords };
    } catch (err: unknown) {
      newRun.status = 'FAILED';
      newRun.failedAt = new Date();
      newRun.failureReason = err instanceof Error ? err.message : 'Risk analysis execution failed';
      await newRun.save();

      logAuthAuditEvent({
        event: 'RISK_ANALYSIS_FAILED',
        outcome: 'FAILURE',
        organizationId: organizationIdStr,
        userId: options?.userId,
        requestId: options?.requestId,
        reason: newRun.failureReason,
      });

      throw err;
    }
  }

  public async getRiskRuns(
    documentIdStr: string,
    organizationIdStr: string
  ): Promise<IReidentificationRiskRun[]> {
    const documentId = validateObjectId(documentIdStr, 'Document ID');
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');
    return ReidentificationRiskRunModel.find({ organizationId, documentId }).sort({ createdAt: -1 });
  }

  public async getRiskResults(
    documentIdStr: string,
    organizationIdStr: string
  ): Promise<{ run: IReidentificationRiskRun | null; results: IReidentificationRiskResult[] }> {
    const documentId = validateObjectId(documentIdStr, 'Document ID');
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');

    const run = await ReidentificationRiskRunModel.findOne({
      organizationId,
      documentId,
      isLatestActive: true,
    });

    if (!run) {
      return { run: null, results: [] };
    }

    const results = await ReidentificationRiskResultModel.find({
      riskRunId: run.riskRunId,
      organizationId,
    });

    return { run, results };
  }
}

export const riskService = new RiskService();
