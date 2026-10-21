import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import mongoose from 'mongoose';
import { TransformationRunModel, ITransformationRun, TransformationOperation } from '../../models/transformationRun.model';
import { OutputArtifactModel, IOutputArtifact } from '../../models/outputArtifact.model';
import { VerificationRunModel } from '../../models/verificationRun.model';
import { TransformationRecordModel, ITransformationRecord } from '../../models/transformationRecord.model';
import { DecisionRunModel } from '../../models/decisionRun.model';
import { DecisionResultModel, IDecisionResult } from '../../models/decisionResult.model';
import { PIICandidateModel } from '../../models/piiCandidate.model';
import { DocumentModel } from '../../models/document.model';
import { MutationGenerator } from './mutationGenerator';
import { TransformationEngineFactory } from './engines/engine.factory';
import { policyService } from '../policy/policy.service';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { logAuthAuditEvent } from '../audit.service';
import { validateObjectId } from '../../utils/tenantQuery';
import { storageService } from '../storage/storage.service';

export class TransformationService {
  public async executeTransformation(
    documentIdStr: string,
    organizationIdStr: string,
    options?: {
      decisionRunId?: string;
      operation?: TransformationOperation;
      force?: boolean;
      userId?: string;
      requestId?: string;
    }
  ): Promise<{ run: ITransformationRun; artifact: IOutputArtifact; records: ITransformationRecord[] }> {
    const documentId = validateObjectId(documentIdStr, 'Document ID');
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');
    const operation: TransformationOperation = options?.operation || 'REDACTION';

    // 1. Verify document exists & load document record
    const doc = await DocumentModel.findOne({ _id: documentId, organizationId });
    if (!doc || doc.isDeleted) {
      throw AppError.notFound('Document not found or has been deleted', 'DOCUMENT_NOT_FOUND');
    }

    // Resource Limits Safety: Document size limit (50MB)
    const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
    if (doc.size > MAX_FILE_SIZE_BYTES) {
      throw AppError.badRequest(
        'Document size exceeds maximum allowable limit for synchronous transformation (50MB)',
        'RESOURCE_LIMIT_EXCEEDED'
      );
    }

    // 2. Load authoritative Phase 09 DecisionRun
    let decisionRun: mongoose.Document<unknown, Record<string, unknown>, typeof DecisionRunModel.prototype> & typeof DecisionRunModel.prototype | null = null;
    if (options?.decisionRunId) {
      decisionRun = await DecisionRunModel.findOne({
        organizationId,
        documentId,
        decisionRunId: options.decisionRunId,
      });
    } else {
      decisionRun = await DecisionRunModel.findOne({
        organizationId,
        documentId,
        isLatestActive: true,
        status: 'COMPLETED',
      });
    }

    if (!decisionRun) {
      const decResult = await policyService.evaluateDocumentDecisions(documentIdStr, organizationIdStr, {
        force: options?.force,
        userId: options?.userId,
        requestId: options?.requestId,
      });
      decisionRun = decResult.run as unknown as typeof decisionRun;
    }

    if (!decisionRun) {
      throw AppError.badRequest('No completed Phase 09 decision run found for document', 'DECISION_RUN_NOT_FOUND');
    }

    // Generate transformation configuration hash fingerprint
    const configHash = crypto
      .createHash('sha256')
      .update(`${decisionRun.decisionRunId}:${operation}:${doc.checksum}`)
      .digest('hex');

    // 4. Idempotency Check: reuse existing completed transformation run unless force=true
    if (!options?.force) {
      const existingCompleted = await TransformationRunModel.findOne({
        organizationId,
        documentId,
        decisionRunId: decisionRun.decisionRunId,
        operation,
        transformationConfigurationHash: configHash,
        sourceChecksum: doc.checksum,
        status: 'COMPLETED',
      });

      if (existingCompleted && existingCompleted.outputArtifactId) {
        const artifact = await OutputArtifactModel.findOne({
          outputArtifactId: existingCompleted.outputArtifactId,
          organizationId,
        });

        if (artifact) {
          const records = await TransformationRecordModel.find({
            transformationRunId: existingCompleted.transformationRunId,
            organizationId,
          });

          logger.info(
            { event: 'transformation_idempotent_reuse', runId: existingCompleted.transformationRunId },
            `Reusing existing completed transformation run ${existingCompleted.transformationRunId}`
          );

          return { run: existingCompleted, artifact, records };
        }
      }
    }

    // 5. Create new TransformationRun with E11000 duplicate handling
    const transformationRunId = `trans_run_${crypto.randomUUID()}`;
    let newRun: ITransformationRun;

    try {
      newRun = await TransformationRunModel.create({
        transformationRunId,
        organizationId,
        documentId,
        decisionRunId: decisionRun.decisionRunId,
        sourceChecksum: doc.checksum,
        sourceDocumentVersion: '1.0.0',
        transformationVersion: '1.0.0',
        transformationConfigurationHash: configHash,
        operation,
        status: 'RUNNING',
        isLatestActive: false,
        requestId: options?.requestId || null,
        startedAt: new Date(),
      });
    } catch (err: unknown) {
      const isDuplicateKey =
        err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000;
      if (isDuplicateKey) {
        const inFlight = await TransformationRunModel.findOne({
          organizationId,
          documentId,
          decisionRunId: decisionRun.decisionRunId,
          operation,
          transformationConfigurationHash: configHash,
          sourceChecksum: doc.checksum,
          status: { $in: ['QUEUED', 'RUNNING'] },
        });

        if (inFlight) {
          logger.info(
            { event: 'transformation_inflight_reuse', runId: inFlight.transformationRunId },
            `Reusing in-flight transformation run ${inFlight.transformationRunId}`
          );
          // Wait briefly for in-flight completion or return current in-flight state
          const records = await TransformationRecordModel.find({
            transformationRunId: inFlight.transformationRunId,
            organizationId,
          });
          const artifact = inFlight.outputArtifactId
            ? await OutputArtifactModel.findOne({ outputArtifactId: inFlight.outputArtifactId, organizationId })
            : null;

          return { run: inFlight, artifact: artifact as IOutputArtifact, records };
        }
      }
      throw err;
    }

    logAuthAuditEvent({
      event: 'TRANSFORMATION_STARTED',
      outcome: 'SUCCESS',
      organizationId: organizationIdStr,
      userId: options?.userId,
      requestId: options?.requestId,
      details: { transformationRunId: newRun.transformationRunId, operation },
    });

    const tempOutputDir = path.join(process.cwd(), 'scratch', 'transformations');
    await fs.promises.mkdir(tempOutputDir, { recursive: true });
    const tempOutputPath = path.join(tempOutputDir, `temp_${newRun.transformationRunId}_${doc.originalFilename}`);

    try {
      // 6. Load candidates and decision results
      const candidates = await PIICandidateModel.find({
        organizationId,
        documentId,
        detectionRunId: decisionRun.detectionRunId,
      });

      const decisionResults = await DecisionResultModel.find({
        organizationId,
        documentId,
        decisionRunId: decisionRun.decisionRunId,
      });

      const decisionMap = new Map<string, IDecisionResult>();
      for (const dr of decisionResults) {
        decisionMap.set(dr.candidateId, dr);
      }

      // 7. Instantiate MutationGenerator & Format Engine
      const mutationGenerator = new MutationGenerator({
        transformationRunId: newRun.transformationRunId,
        seed: configHash,
      });

      const engine = TransformationEngineFactory.getEngine(doc.extension, doc.declaredMimeType);

      // Execute format-specific transformation
      let sourceFilePath = path.isAbsolute(doc.storageKey)
        ? doc.storageKey
        : path.join(process.cwd(), doc.storageKey);
      if (!fs.existsSync(sourceFilePath)) {
        sourceFilePath = storageService.getAbsolutePath(doc.storageKey);
      }

      const engineResult = await engine.transform({
        operation,
        candidates,
        decisions: decisionMap,
        mutationGenerator,
        sourceFilePath,
        outputFilePath: tempOutputPath,
      });

      // 8. Output Validation & Checksum Calculation
      const outputBuffer = await fs.promises.readFile(tempOutputPath);
      const outputChecksum = crypto.createHash('sha256').update(outputBuffer).digest('hex');
      const fileSize = outputBuffer.length;

      // 9. Save Transformed Output Storage Artifact
      const outputStorageKey = `transformed/org_${organizationId.toString()}/${newRun.transformationRunId}_${doc.originalFilename}`;
      const cwdDestPath = path.isAbsolute(outputStorageKey)
        ? outputStorageKey
        : path.join(process.cwd(), outputStorageKey);

      await fs.promises.mkdir(path.dirname(cwdDestPath), { recursive: true });
      await fs.promises.copyFile(tempOutputPath, cwdDestPath);

      try {
        const storageDestPath = storageService.getAbsolutePath(outputStorageKey);
        if (storageDestPath !== cwdDestPath) {
          await fs.promises.mkdir(path.dirname(storageDestPath), { recursive: true });
          await fs.promises.copyFile(tempOutputPath, storageDestPath);
        }
      } catch {
        // ignore
      }

      // Create OutputArtifactModel record
      const outputArtifactId = `art_${crypto.randomUUID()}`;
      const artifact = await OutputArtifactModel.create({
        outputArtifactId,
        organizationId,
        sourceDocumentId: documentId,
        transformationRunId: newRun.transformationRunId,
        sourceChecksum: doc.checksum,
        outputChecksum,
        storageKey: outputStorageKey,
        originalFilename: `transformed_${doc.originalFilename}`,
        mimeType: doc.declaredMimeType,
        fileSize,
        status:
          Array.from(decisionMap.values()).some((d) => d.decision === 'REVIEW')
            ? 'PENDING_REVIEW'
            : 'ACTIVE',
      });

      // 10. Save TransformationRecord items
      const records: ITransformationRecord[] = [];
      for (const rec of engineResult.appliedRecords) {
        const recordId = `rec_${crypto.randomUUID()}`;
        const recordDoc = await TransformationRecordModel.create({
          transformationRecordId: recordId,
          transformationRunId: newRun.transformationRunId,
          candidateId: rec.candidateId,
          occurrenceId: rec.occurrenceId,
          organizationId,
          documentId,
          decision: rec.decision,
          operation: rec.operation,
          status: rec.status,
          location: rec.location,
          syntheticValue: rec.syntheticValue || null,
          failureReason: rec.failureReason || null,
          appliedAt: new Date(),
        });
        records.push(recordDoc);
      }

      newRun.status = 'COMPLETED';
      newRun.completedAt = new Date();
      newRun.candidateCount = candidates.length;
      newRun.totalCandidatesEvaluated = candidates.length;
      newRun.transformedCount = engineResult.transformedCount;
      newRun.redactedCount = operation === 'REDACTION' ? engineResult.transformedCount : 0;
      newRun.maskedCount = operation === 'MUTATION' ? engineResult.transformedCount : 0;
      newRun.skippedCount = engineResult.skippedCount;
      newRun.failedCount = engineResult.failedCount;
      newRun.outputArtifactId = artifact.outputArtifactId;
      newRun.warnings = engineResult.warnings;
      await newRun.save();

      // 12. Authoritative Active Output Publication with Fallback Recovery
      await this.publishActiveOutput(newRun, organizationId, documentId);

      logAuthAuditEvent({
        event: 'TRANSFORMATION_COMPLETED',
        outcome: 'SUCCESS',
        organizationId: organizationIdStr,
        userId: options?.userId,
        requestId: options?.requestId,
        details: {
          transformationRunId: newRun.transformationRunId,
          outputArtifactId: artifact.outputArtifactId,
          transformedCount: engineResult.transformedCount,
          skippedCount: engineResult.skippedCount,
        },
      });

      return { run: newRun, artifact, records };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      newRun.status = 'FAILED';
      newRun.failedAt = new Date();
      newRun.failureReason = errorMsg;
      await newRun.save();

      logAuthAuditEvent({
        event: 'TRANSFORMATION_FAILED',
        outcome: 'FAILURE',
        reason: errorMsg,
        organizationId: organizationIdStr,
        userId: options?.userId,
        requestId: options?.requestId,
        details: { transformationRunId: newRun.transformationRunId, error: errorMsg },
      });

      throw err;
    } finally {
      // Secure Temporary Cleanup in finally block
      if (fs.existsSync(tempOutputPath)) {
        await fs.promises.unlink(tempOutputPath).catch(() => {});
      }
    }
  }

  public async publishActiveOutput(
    newRun: ITransformationRun,
    organizationId: mongoose.Types.ObjectId,
    documentId: mongoose.Types.ObjectId
  ): Promise<void> {
    const isReplicaSet = Boolean(
      mongoose.connection.readyState === 1 &&
      (mongoose.connection.getClient() as unknown as { topology?: { description?: { type?: string } } })?.topology?.description?.type?.includes('ReplicaSet')
    );

    if (isReplicaSet) {
      try {
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            await TransformationRunModel.updateMany(
              { organizationId, documentId, _id: { $ne: newRun._id } },
              { $set: { isLatestActive: false } },
              { session }
            );
            await TransformationRunModel.updateOne(
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
          { event: 'transformation_run_transaction_failed', error: String(txnErr) },
          'Transaction publication failed, falling back to atomic sequential publication'
        );
      }
    }

    // Atomic sequential publication enforcing unique active run invariant
    await TransformationRunModel.updateMany(
      { organizationId, documentId, _id: { $ne: newRun._id } },
      { $set: { isLatestActive: false } }
    );

    await TransformationRunModel.updateOne(
      { _id: newRun._id, organizationId, documentId },
      { $set: { isLatestActive: true } }
    );
    newRun.isLatestActive = true;
  }

  public async getTransformationRuns(
    documentIdStr: string,
    organizationIdStr: string
  ): Promise<ITransformationRun[]> {
    const documentId = validateObjectId(documentIdStr, 'Document ID');
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');
    return TransformationRunModel.find({ organizationId, documentId }).sort({ createdAt: -1 });
  }

  public async getTransformationArtifacts(
    documentIdStr: string,
    organizationIdStr: string,
    runIdStr?: string
  ): Promise<{ run: ITransformationRun | null; artifact: IOutputArtifact | null; records: ITransformationRecord[] }> {
    const documentId = validateObjectId(documentIdStr, 'Document ID');
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');

    let run: ITransformationRun | null = null;
    if (runIdStr) {
      run = await TransformationRunModel.findOne({ organizationId, documentId, transformationRunId: runIdStr });
    } else {
      run = await TransformationRunModel.findOne({ organizationId, documentId, isLatestActive: true });
    }

    if (!run) {
      return { run: null, artifact: null, records: [] };
    }

    const artifact = run.outputArtifactId
      ? await OutputArtifactModel.findOne({ organizationId, outputArtifactId: run.outputArtifactId })
      : null;

    const records = await TransformationRecordModel.find({
      organizationId,
      documentId,
      transformationRunId: run.transformationRunId,
    });

    return { run, artifact, records };
  }

  /**
   * Downloads a verified redacted output artifact.
   *
   * SECURITY INVARIANT:
   * Explicit requests for redacted/transformed derivatives MUST FAIL CLOSED if
   * an active, verified, valid output artifact is not available.
   * This method NEVER falls back to returning the unredacted original upload.
   */
  public async downloadVerifiedRedactedArtifact(
    documentIdStr: string,
    organizationIdStr: string,
    options?: {
      runId?: string;
      outputArtifactId?: string;
      userId?: string;
      requestId?: string;
      ip?: string;
    }
  ): Promise<{ artifact: IOutputArtifact; stream: Readable }> {
    const documentId = validateObjectId(documentIdStr, 'Document ID');
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');

    // 1. Verify source document exists and belongs to the authenticated tenant
    const doc = await DocumentModel.findOne({ _id: documentId, organizationId, isDeleted: false });
    if (!doc) {
      logAuthAuditEvent({
        event: 'DOCUMENT_ACCESS_DENIED',
        userId: options?.userId,
        organizationId: organizationIdStr,
        requestId: options?.requestId,
        ip: options?.ip,
        outcome: 'DENIED',
        reason: 'DOCUMENT_NOT_FOUND',
      });
      throw AppError.notFound('Document not found or access denied.', 'DOCUMENT_NOT_FOUND');
    }

    // 2. Resolve target OutputArtifact based on explicit outputArtifactId, runId, or latest active
    let artifact: IOutputArtifact | null = null;
    let run: ITransformationRun | null = null;

    if (options?.outputArtifactId) {
      artifact = await OutputArtifactModel.findOne({
        organizationId,
        sourceDocumentId: documentId,
        outputArtifactId: options.outputArtifactId,
      });

      if (!artifact) {
        logAuthAuditEvent({
          event: 'DOCUMENT_ACCESS_DENIED',
          userId: options?.userId,
          organizationId: organizationIdStr,
          requestId: options?.requestId,
          ip: options?.ip,
          outcome: 'DENIED',
          reason: 'REDACTED_ARTIFACT_NOT_FOUND',
        });
        throw new AppError(
          'A verified redacted output artifact is not available for download.',
          404,
          'REDACTED_ARTIFACT_NOT_AVAILABLE'
        );
      }

      if (options?.runId && artifact.transformationRunId !== options.runId) {
        logAuthAuditEvent({
          event: 'DOCUMENT_ACCESS_DENIED',
          userId: options?.userId,
          organizationId: organizationIdStr,
          requestId: options?.requestId,
          ip: options?.ip,
          outcome: 'DENIED',
          reason: 'ARTIFACT_RUN_MISMATCH',
        });
        throw new AppError(
          'The requested output artifact does not match the specified transformation run.',
          409,
          'REDACTED_ARTIFACT_NOT_AVAILABLE'
        );
      }
    } else if (options?.runId) {
      run = await TransformationRunModel.findOne({
        organizationId,
        documentId,
        transformationRunId: options.runId,
      });

      if (!run || !run.outputArtifactId) {
        logAuthAuditEvent({
          event: 'DOCUMENT_ACCESS_DENIED',
          userId: options?.userId,
          organizationId: organizationIdStr,
          requestId: options?.requestId,
          ip: options?.ip,
          outcome: 'DENIED',
          reason: 'TRANSFORMATION_RUN_NOT_FOUND',
        });
        throw new AppError(
          'A verified redacted output artifact is not available for this transformation run.',
          404,
          'REDACTED_ARTIFACT_NOT_AVAILABLE'
        );
      }

      artifact = await OutputArtifactModel.findOne({
        organizationId,
        sourceDocumentId: documentId,
        outputArtifactId: run.outputArtifactId,
      });
    } else {
      // Find latest active transformation run
      const activeRun = await TransformationRunModel.findOne({
        organizationId,
        documentId,
        isLatestActive: true,
      });

      if (activeRun?.outputArtifactId) {
        artifact = await OutputArtifactModel.findOne({
          organizationId,
          sourceDocumentId: documentId,
          outputArtifactId: activeRun.outputArtifactId,
        });
      }

      if (!artifact) {
        // Fall back to latest active artifact
        artifact = await OutputArtifactModel.findOne({
          organizationId,
          sourceDocumentId: documentId,
          status: 'ACTIVE',
        }).sort({ createdAt: -1 });
      }
    }

    // Fail closed if no artifact was found
    if (!artifact) {
      logAuthAuditEvent({
        event: 'DOCUMENT_ACCESS_DENIED',
        userId: options?.userId,
        organizationId: organizationIdStr,
        requestId: options?.requestId,
        ip: options?.ip,
        outcome: 'DENIED',
        reason: 'REDACTED_ARTIFACT_NOT_FOUND',
      });
      throw new AppError(
        'A verified redacted output artifact is not available for download.',
        404,
        'REDACTED_ARTIFACT_NOT_AVAILABLE'
      );
    }

    // 3. Status Gate: Check artifact status (only ACTIVE is downloadable as completed redaction)
    if (artifact.status === 'PENDING_REVIEW') {
      logAuthAuditEvent({
        event: 'DOCUMENT_ACCESS_DENIED',
        userId: options?.userId,
        organizationId: organizationIdStr,
        requestId: options?.requestId,
        ip: options?.ip,
        outcome: 'DENIED',
        reason: 'REDACTED_ARTIFACT_PENDING_REVIEW',
      });
      throw new AppError(
        'The redacted output artifact is pending human review and cannot be downloaded.',
        409,
        'REDACTED_ARTIFACT_PENDING_REVIEW'
      );
    }

    if (artifact.status !== 'ACTIVE') {
      logAuthAuditEvent({
        event: 'DOCUMENT_ACCESS_DENIED',
        userId: options?.userId,
        organizationId: organizationIdStr,
        requestId: options?.requestId,
        ip: options?.ip,
        outcome: 'DENIED',
        reason: 'REDACTED_ARTIFACT_INACTIVE',
      });
      throw new AppError(
        'The redacted output artifact is not in an active downloadable state.',
        409,
        'REDACTED_ARTIFACT_NOT_AVAILABLE'
      );
    }

    // 4. Verification Gate: Check independent verification status if a run exists
    const verificationRun = await VerificationRunModel.findOne({
      organizationId,
      documentId,
      outputArtifactId: artifact.outputArtifactId,
    }).sort({ createdAt: -1 });

    if (verificationRun) {
      if (verificationRun.status === 'FAILED' || verificationRun.overallStatus === 'FAILED') {
        logAuthAuditEvent({
          event: 'DOCUMENT_ACCESS_DENIED',
          userId: options?.userId,
          organizationId: organizationIdStr,
          requestId: options?.requestId,
          ip: options?.ip,
          outcome: 'DENIED',
          reason: 'REDACTED_ARTIFACT_VERIFICATION_FAILED',
        });
        throw new AppError(
          'The redacted output artifact failed independent verification and cannot be downloaded.',
          409,
          'REDACTED_ARTIFACT_VERIFICATION_FAILED'
        );
      }

      if (verificationRun.status === 'RUNNING' || verificationRun.status === 'QUEUED') {
        logAuthAuditEvent({
          event: 'DOCUMENT_ACCESS_DENIED',
          userId: options?.userId,
          organizationId: organizationIdStr,
          requestId: options?.requestId,
          ip: options?.ip,
          outcome: 'DENIED',
          reason: 'REDACTED_ARTIFACT_VERIFICATION_PENDING',
        });
        throw new AppError(
          'The redacted output artifact is currently undergoing verification.',
          409,
          'REDACTED_ARTIFACT_VERIFICATION_PENDING'
        );
      }
    }

    // 5. Storage Integrity & Cryptographic Checksum Verification
    let targetPath = '';
    try {
      targetPath = storageService.getAbsolutePath(artifact.storageKey);
    } catch {
      targetPath = path.isAbsolute(artifact.storageKey)
        ? artifact.storageKey
        : path.join(process.cwd(), artifact.storageKey);
    }

    if (!fs.existsSync(targetPath)) {
      // Check cwd fallback
      const cwdFallback = path.join(process.cwd(), artifact.storageKey);
      if (fs.existsSync(cwdFallback)) {
        targetPath = cwdFallback;
      } else {
        logAuthAuditEvent({
          event: 'DOCUMENT_ACCESS_DENIED',
          userId: options?.userId,
          organizationId: organizationIdStr,
          requestId: options?.requestId,
          ip: options?.ip,
          outcome: 'DENIED',
          reason: 'REDACTED_ARTIFACT_STORAGE_MISSING',
        });
        throw new AppError(
          'The redacted output artifact file is missing from storage.',
          404,
          'STORAGE_OBJECT_NOT_FOUND'
        );
      }
    }

    const fileBuffer = await fs.promises.readFile(targetPath);
    const computedChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    if (computedChecksum !== artifact.outputChecksum) {
      logger.error(
        {
          artifactId: artifact.outputArtifactId,
          computedChecksum,
          recordedChecksum: artifact.outputChecksum,
        },
        'Output artifact checksum integrity failure during download'
      );
      throw new AppError(
        'Artifact checksum verification failed. The sanitized artifact may be corrupted.',
        409,
        'ARTIFACT_CHECKSUM_MISMATCH'
      );
    }

    // 6. Audit Success Event
    logAuthAuditEvent({
      event: 'DOCUMENT_DOWNLOAD',
      userId: options?.userId,
      organizationId: organizationIdStr,
      requestId: options?.requestId,
      ip: options?.ip,
      outcome: 'SUCCESS',
      details: {
        documentId: documentId.toString(),
        outputArtifactId: artifact.outputArtifactId,
        transformationRunId: artifact.transformationRunId,
        outputChecksum: artifact.outputChecksum,
        isRedactedDerivative: true,
      },
    });

    const stream = fs.createReadStream(targetPath);
    return { artifact, stream };
  }
}

export const transformationService = new TransformationService();
