import crypto from 'crypto';
import mongoose from 'mongoose';
import { DocumentModel } from '../../models/document.model';
import { NormalizedDocumentModel } from '../../models/normalizedDocument.model';
import { PIICandidateModel, IPIICandidate } from '../../models/piiCandidate.model';
import { DetectionRunModel, IDetectionRun, DetectionRunStatus } from '../../models/detectionRun.model';
import { initializeDefaultDetectors, RawDetectedCandidate } from './detectors';
import { mergeCandidates, suppressContainedPhoneCandidates } from './utils/candidateMerger.utils';
import { AppError } from '../../utils/AppError';
import { logAuthAuditEvent } from '../audit.service';
import { logger } from '../../utils/logger';

export class PIIDetectionService {
  private registry = initializeDefaultDetectors();
  private inFlightDetections = new Map<string, Promise<{ run: IDetectionRun; candidates: IPIICandidate[] }>>();

  public async detectPIIForDocument(
    documentId: string,
    organizationId: string,
    options: { force?: boolean } = {}
  ): Promise<{ run: IDetectionRun; candidates: IPIICandidate[] }> {
    const lockKey = `${organizationId}:${documentId}:${options.force ? `force_${Date.now()}_${Math.random()}` : 'default'}`;

    if (!options.force && this.inFlightDetections.has(lockKey)) {
      logger.info({ documentId, organizationId }, 'Joining existing in-flight detection request promise');
      return this.inFlightDetections.get(lockKey)!;
    }

    const detectionPromise = this.executeDetection(documentId, organizationId, options);

    if (!options.force) {
      this.inFlightDetections.set(lockKey, detectionPromise);
    }

    try {
      return await detectionPromise;
    } finally {
      if (!options.force) {
        this.inFlightDetections.delete(lockKey);
      }
    }
  }

  private async executeDetection(
    documentId: string,
    organizationId: string,
    options: { force?: boolean } = {}
  ): Promise<{ run: IDetectionRun; candidates: IPIICandidate[] }> {
    const docObjId = new mongoose.Types.ObjectId(documentId);
    const orgObjId = new mongoose.Types.ObjectId(organizationId);

    // 1. Validate Document & Tenant Scope
    const document = await DocumentModel.findOne({
      _id: docObjId,
      organizationId: orgObjId,
      isDeleted: false,
      deletedAt: null,
    });

    if (!document) {
      throw AppError.notFound('Document not found or has been deleted', 'DOCUMENT_NOT_FOUND');
    }

    // 2. Fetch Normalized Document
    const normalizedDoc = await NormalizedDocumentModel.findOne({
      documentId: docObjId,
      organizationId: orgObjId,
    });

    if (!normalizedDoc) {
      throw AppError.notFound(
        'Normalized document content not found. Document extraction or OCR must be run first.',
        'NORMALIZED_DOCUMENT_NOT_FOUND'
      );
    }

    const configHash = this.registry.getDetectorConfigurationHash();

    // 3. Check for existing active or in-flight DetectionRun (Idempotency & Concurrency Lock)
    if (!options.force) {
      const existingInFlightRun = await DetectionRunModel.findOne({
        documentId: docObjId,
        organizationId: orgObjId,
        documentChecksum: document.checksum,
        detectorConfigurationHash: configHash,
        status: { $in: ['QUEUED', 'RUNNING'] },
      });

      if (existingInFlightRun) {
        logger.info(
          { documentId, organizationId, runId: existingInFlightRun.detectionRunId },
          'In-flight detection run already active for document. Reusing in-flight run.'
        );
        const candidates = await PIICandidateModel.find({
          documentId: docObjId,
          organizationId: orgObjId,
          detectionRunId: existingInFlightRun.detectionRunId,
        });
        return { run: existingInFlightRun, candidates };
      }

      const existingActiveRun = await DetectionRunModel.findOne({
        documentId: docObjId,
        organizationId: orgObjId,
        documentChecksum: document.checksum,
        detectorConfigurationHash: configHash,
        isLatestActive: true,
        status: { $in: ['COMPLETED', 'PARTIAL'] },
      });

      if (existingActiveRun) {
        logger.info(
          { documentId, organizationId, runId: existingActiveRun.detectionRunId },
          'Reusing existing active completed detection run.'
        );
        const candidates = await PIICandidateModel.find({
          documentId: docObjId,
          organizationId: orgObjId,
          detectionRunId: existingActiveRun.detectionRunId,
        }).sort({ 'location.startOffset': 1 });

        return { run: existingActiveRun, candidates };
      }
    }

    // 4. Record existing active run before creating new run (for fallback failure recovery)
    const previousActiveRun = await DetectionRunModel.findOne({
      documentId: docObjId,
      organizationId: orgObjId,
      isLatestActive: true,
    });

    // Create New Versioned DetectionRun (Status: RUNNING) with database-level idempotency control
    let newRun: IDetectionRun;
    const runId = crypto.randomUUID();
    try {
      newRun = await DetectionRunModel.create({
        detectionRunId: runId,
        organizationId: orgObjId,
        documentId: docObjId,
        documentChecksum: document.checksum,
        normalizedDocumentVersion: normalizedDoc.extractorVersion || '1.0.0',
        detectorConfigurationVersion: '1.0.0',
        detectorConfigurationHash: configHash,
        status: 'RUNNING' as DetectionRunStatus,
        isLatestActive: false, // Inactive until successful publication
        candidateCount: 0,
        warnings: [],
        startedAt: new Date(),
      });
    } catch (createErr: unknown) {
      const msg = createErr instanceof Error ? createErr.message : String(createErr);
      if (!options.force && (msg.includes('E11000') || msg.includes('duplicate key'))) {
        logger.info(
          { documentId, organizationId },
          'Database partial unique index caught concurrent in-flight run creation. Reusing database in-flight/active run.'
        );
        const existingRun = await DetectionRunModel.findOne({
          documentId: docObjId,
          organizationId: orgObjId,
          documentChecksum: document.checksum,
          detectorConfigurationHash: configHash,
          status: { $in: ['QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL'] },
        }).sort({ createdAt: -1 });

        if (existingRun) {
          const candidates = await PIICandidateModel.find({
            documentId: docObjId,
            organizationId: orgObjId,
            detectionRunId: existingRun.detectionRunId,
          }).sort({ 'location.startOffset': 1 });
          return { run: existingRun, candidates };
        }
      }
      throw createErr;
    }

    logAuthAuditEvent({
      event: 'PII_DETECTION_STARTED',
      organizationId,
      outcome: 'SUCCESS',
      details: { documentId, runId },
    });

    try {
      // 5. Run detectors across all blocks
      const rawCandidates: RawDetectedCandidate[] = [];
      const runWarnings: Array<{ code: string; message: string }> = [];
      const blocks = normalizedDoc.blocks || [];

      for (const block of blocks) {
        const { candidates, warnings } = await this.registry.runAll(block.text, {
          documentId,
          organizationId,
          block,
        });
        rawCandidates.push(...candidates);
        if (warnings.length > 0) {
          runWarnings.push(...warnings);
        }
      }

      // 6. Merge & Deduplicate Candidates and suppress overlapping phone candidates
      const filteredCandidates = suppressContainedPhoneCandidates(rawCandidates);
      const mergedRawCandidates = mergeCandidates(filteredCandidates);

      // 7. Map to Candidate Models (enforcing zero policy decisions: decision: null)
      const candidateDocs = mergedRawCandidates.map((cand) => ({
        candidateId: crypto.randomUUID(),
        detectionRunId: runId,
        documentId: docObjId,
        organizationId: orgObjId,
        type: cand.type,
        category: cand.category,
        text: cand.text,
        normalizedValue: cand.normalizedValue,
        confidence: cand.detectionScore,
        recognitionConfidence: cand.recognitionConfidence,
        detectionScore: cand.detectionScore,
        severity: cand.severity,
        sensitivityScore: cand.sensitivityScore,
        evidence: cand.evidence || ['PATTERN_MATCH'],
        detectorName: cand.detectorName,
        detectorType: cand.detectorType,
        decision: null, // STRICT RULE: decision MUST be null in Phase 07
        isMasked: false,
        isRedacted: false,
        location: {
          startOffset: cand.startOffset,
          endOffset: cand.endOffset,
          pageNumber: cand.pageNumber,
          blockId: cand.blockId,
          boundingBox: cand.boundingBox || null,
        },
        provenance: {
          sourceType: cand.sourceType,
          blockId: cand.blockId || 'FULL_TEXT',
          extractorVersion: normalizedDoc.extractorVersion || '1.0.0',
        },
        detectionStatus: 'DETECTED' as const,
      }));

      let savedCandidates: IPIICandidate[] = [];
      if (candidateDocs.length > 0) {
        savedCandidates = (await PIICandidateModel.insertMany(candidateDocs)) as unknown as IPIICandidate[];
      }

      const finalStatus: DetectionRunStatus = runWarnings.length > 0 ? 'PARTIAL' : 'COMPLETED';

      // 8. Truly Atomic Active-Result Publication using MongoDB Transaction (with fallback)
      const session = await mongoose.startSession();
      try {
        session.startTransaction();
        await DetectionRunModel.updateMany(
          { documentId: docObjId, organizationId: orgObjId, isLatestActive: true },
          { $set: { isLatestActive: false } },
          { session }
        );
        await DetectionRunModel.updateOne(
          { _id: newRun._id },
          {
            $set: {
              status: finalStatus,
              isLatestActive: true,
              candidateCount: savedCandidates.length,
              warnings: runWarnings,
              completedAt: new Date(),
            },
          },
          { session }
        );
        await session.commitTransaction();
        newRun.status = finalStatus;
        newRun.isLatestActive = true;
        newRun.candidateCount = savedCandidates.length;
        newRun.warnings = runWarnings;
        newRun.completedAt = new Date();
      } catch (transErr: unknown) {
        await session.abortTransaction();
        const msg = transErr instanceof Error ? transErr.message : String(transErr);
        if (msg.includes('Transaction numbers are only allowed') || msg.includes('standalone')) {
          let published = false;
          let retries = 5;
          while (!published && retries > 0) {
            retries--;
            try {
              await DetectionRunModel.updateMany(
                { documentId: docObjId, organizationId: orgObjId, isLatestActive: true },
                { $set: { isLatestActive: false } }
              );
              await DetectionRunModel.updateOne(
                { _id: newRun._id },
                {
                  $set: {
                    status: finalStatus,
                    isLatestActive: true,
                    candidateCount: savedCandidates.length,
                    warnings: runWarnings,
                    completedAt: new Date(),
                  },
                }
              );
              newRun.status = finalStatus;
              newRun.isLatestActive = true;
              newRun.candidateCount = savedCandidates.length;
              newRun.warnings = runWarnings;
              newRun.completedAt = new Date();
              published = true;
            } catch (dupErr: unknown) {
              const dupMsg = dupErr instanceof Error ? dupErr.message : String(dupErr);
              if (dupMsg.includes('E11000') || dupMsg.includes('duplicate key')) {
                if (retries === 0) throw dupErr;
                await new Promise((resolve) => setTimeout(resolve, 50));
              } else {
                throw dupErr;
              }
            }
          }
        } else {
          throw transErr;
        }
      } finally {
        session.endSession();
      }

      logAuthAuditEvent({
        event: 'PII_DETECTION_COMPLETED',
        organizationId,
        outcome: 'SUCCESS',
        details: {
          documentId,
          runId,
          status: finalStatus,
          totalCandidatesDetected: savedCandidates.length,
          candidateBreakdown: this.computeCategoryCounts(savedCandidates),
        },
      });

      logger.info(
        { documentId, organizationId, runId, count: savedCandidates.length, status: finalStatus },
        `Completed versioned PII detection run for document`
      );

      return { run: newRun, candidates: savedCandidates };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      newRun.status = 'FAILED';
      newRun.isLatestActive = false;
      newRun.failedAt = new Date();
      newRun.failureReason = errorMsg;
      await newRun.save().catch(() => {});

      if (previousActiveRun) {
        const currentActive = await DetectionRunModel.findOne({
          documentId: docObjId,
          organizationId: orgObjId,
          isLatestActive: true,
        });
        if (!currentActive) {
          await DetectionRunModel.updateOne(
            { _id: previousActiveRun._id },
            { $set: { isLatestActive: true } }
          ).catch(() => {});
        }
      }

      logAuthAuditEvent({
        event: 'PII_DETECTION_FAILED',
        organizationId,
        outcome: 'FAILURE',
        reason: errorMsg,
        details: { documentId, runId },
      });

      throw err;
    }
  }

  public async getCandidatesForDocument(
    documentId: string,
    organizationId: string,
    runId?: string
  ): Promise<IPIICandidate[]> {
    const docObjId = new mongoose.Types.ObjectId(documentId);
    const orgObjId = new mongoose.Types.ObjectId(organizationId);

    const document = await DocumentModel.findOne({
      _id: docObjId,
      organizationId: orgObjId,
      isDeleted: false,
      deletedAt: null,
    });

    if (!document) {
      throw AppError.notFound('Document not found or has been deleted', 'DOCUMENT_NOT_FOUND');
    }

    let targetRunId = runId;
    if (!targetRunId) {
      const activeRun = await DetectionRunModel.findOne({
        documentId: docObjId,
        organizationId: orgObjId,
        isLatestActive: true,
      });
      if (!activeRun) {
        return [];
      }
      targetRunId = activeRun.detectionRunId;
    }

    return PIICandidateModel.find({
      documentId: docObjId,
      organizationId: orgObjId,
      detectionRunId: targetRunId,
    }).sort({ 'location.startOffset': 1 });
  }

  public async getDetectionSummary(
    documentId: string,
    organizationId: string,
    runId?: string
  ) {
    const candidates = await this.getCandidatesForDocument(documentId, organizationId, runId);

    const activeRun = runId
      ? await DetectionRunModel.findOne({ detectionRunId: runId, organizationId, documentId })
      : await DetectionRunModel.findOne({ documentId, organizationId, isLatestActive: true });

    const summary = {
      documentId,
      organizationId,
      detectionRunId: activeRun ? activeRun.detectionRunId : null,
      status: activeRun ? activeRun.status : 'NO_RUNS',
      totalCandidates: candidates.length,
      maxSensitivityScore: candidates.reduce((max, c) => Math.max(max, c.sensitivityScore || 0), 0),
      byType: {} as Record<string, number>,
      byCategory: {} as Record<string, number>,
      bySeverity: {} as Record<string, number>,
      byPage: {} as Record<string, number>,
    };

    for (const cand of candidates) {
      summary.byType[cand.type] = (summary.byType[cand.type] || 0) + 1;
      summary.byCategory[cand.category] = (summary.byCategory[cand.category] || 0) + 1;
      summary.bySeverity[cand.severity] = (summary.bySeverity[cand.severity] || 0) + 1;

      const pageKey = cand.location.pageNumber ? `page_${cand.location.pageNumber}` : 'unknown_page';
      summary.byPage[pageKey] = (summary.byPage[pageKey] || 0) + 1;
    }

    return summary;
  }

  public async getDetectionRuns(documentId: string, organizationId: string): Promise<IDetectionRun[]> {
    const docObjId = new mongoose.Types.ObjectId(documentId);
    const orgObjId = new mongoose.Types.ObjectId(organizationId);

    const document = await DocumentModel.findOne({
      _id: docObjId,
      organizationId: orgObjId,
      isDeleted: false,
      deletedAt: null,
    });

    if (!document) {
      throw AppError.notFound('Document not found or has been deleted', 'DOCUMENT_NOT_FOUND');
    }

    return DetectionRunModel.find({
      documentId: docObjId,
      organizationId: orgObjId,
    }).sort({ startedAt: -1 });
  }

  public async getDetectionRunById(
    documentId: string,
    organizationId: string,
    runId: string
  ): Promise<IDetectionRun> {
    const docObjId = new mongoose.Types.ObjectId(documentId);
    const orgObjId = new mongoose.Types.ObjectId(organizationId);

    const run = await DetectionRunModel.findOne({
      detectionRunId: runId,
      documentId: docObjId,
      organizationId: orgObjId,
    });

    if (!run) {
      throw AppError.notFound('Detection run not found', 'DETECTION_RUN_NOT_FOUND');
    }

    return run;
  }

  private computeCategoryCounts(candidates: Array<{ category: string }>): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const c of candidates) {
      counts[c.category] = (counts[c.category] || 0) + 1;
    }
    return counts;
  }
}

export const piiDetectionService = new PIIDetectionService();
