import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mongoose from 'mongoose';
import {
  MetadataSanitizationRunModel,
  IMetadataSanitizationRun,
  SanitizationOperation,
} from '../../models/metadataSanitizationRun.model';
import {
  MetadataSanitizationResultModel,
  IMetadataSanitizationResult,
} from '../../models/metadataSanitizationResult.model';
import { OutputArtifactModel, IOutputArtifact } from '../../models/outputArtifact.model';
import { DocumentModel } from '../../models/document.model';
import { SanitizerEngineFactory } from './engines/engine.factory';
import { FilenameSanitizer } from './engines/filename.sanitizer';
import { IndependentMetadataVerifier } from './verification/verifier.factory';
import { SanitizationPolicyOptions } from './engines/base.engine';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { logAuthAuditEvent } from '../audit.service';
import { validateObjectId } from '../../utils/tenantQuery';
import { storageService } from '../storage/storage.service';

export class SanitizationService {
  public async executeSanitization(
    documentIdStr: string,
    organizationIdStr: string,
    options?: {
      sourceArtifactId?: string;
      operation?: SanitizationOperation;
      policyOptions?: SanitizationPolicyOptions;
      force?: boolean;
      userId?: string;
      requestId?: string;
    }
  ): Promise<{ run: IMetadataSanitizationRun; artifact: IOutputArtifact; records: IMetadataSanitizationResult[] }> {
    const documentId = validateObjectId(documentIdStr, 'Document ID');
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');
    const operation: SanitizationOperation = options?.operation || 'FULL_CLEAN';

    // 1. Load document record & verify tenant ownership
    const doc = await DocumentModel.findOne({ _id: documentId, organizationId });
    if (!doc || doc.isDeleted) {
      throw AppError.notFound('Document not found or has been deleted', 'DOCUMENT_NOT_FOUND');
    }

    // Resource Limit Validation (50MB maximum document file size)
    const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
    if (doc.size > MAX_FILE_SIZE_BYTES) {
      throw AppError.badRequest(
        'Document size exceeds maximum allowable limit for metadata sanitization (50MB)',
        'RESOURCE_LIMIT_EXCEEDED'
      );
    }

    // 2. Identify input storage artifact (from Phase 10 OutputArtifact or Document storage)
    let sourceArtifact: IOutputArtifact | null = null;
    if (options?.sourceArtifactId) {
      sourceArtifact = await OutputArtifactModel.findOne({
        organizationId,
        outputArtifactId: options.sourceArtifactId,
      });
      if (!sourceArtifact) {
        throw AppError.notFound('Source output artifact not found', 'SOURCE_ARTIFACT_NOT_FOUND');
      }
    } else {
      sourceArtifact = await OutputArtifactModel.findOne({
        organizationId,
        sourceDocumentId: documentId,
        outputArtifactId: { $not: /^art_san_/ },
      }).sort({ createdAt: -1 });
    }

    const inputStorageKey = sourceArtifact ? sourceArtifact.storageKey : doc.storageKey;
    const inputChecksum = sourceArtifact ? sourceArtifact.outputChecksum : doc.checksum;
    const sourceArtifactIdStr = sourceArtifact ? sourceArtifact.outputArtifactId : doc._id.toString();

    // 3. Stale Source Protection: Verify input storage file exists and checksum matches
    let sourceFilePath = path.isAbsolute(inputStorageKey)
      ? inputStorageKey
      : path.join(process.cwd(), inputStorageKey);

    if (!fs.existsSync(sourceFilePath)) {
      sourceFilePath = storageService.getAbsolutePath(inputStorageKey);
    }

    if (!fs.existsSync(sourceFilePath)) {
      throw AppError.notFound('Source storage artifact file not found on disk', 'SOURCE_FILE_NOT_FOUND');
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
      throw AppError.badRequest('Source artifact checksum mismatch: file was altered upstream', 'STALE_SOURCE');
    }

    const sourceChecksum = currentChecksum;

    // 4. Configuration Fingerprinting
    const policyOptionsJson = JSON.stringify(options?.policyOptions || {});
    const configHash = crypto
      .createHash('sha256')
      .update(`${sourceArtifactIdStr}:${sourceChecksum}:${operation}:${policyOptionsJson}:1.0.0`)
      .digest('hex');

    // 5. Idempotency Reuse Check (unless force=true)
    if (!options?.force) {
      const existingCompleted = await MetadataSanitizationRunModel.findOne({
        organizationId,
        documentId,
        sourceArtifactId: sourceArtifactIdStr,
        sourceChecksum,
        configurationHash: configHash,
        operation,
        status: 'COMPLETED',
      });

      if (existingCompleted && existingCompleted.outputArtifactId) {
        const artifact = await OutputArtifactModel.findOne({
          outputArtifactId: existingCompleted.outputArtifactId,
          organizationId,
        });

        if (artifact) {
          const records = await MetadataSanitizationResultModel.find({
            sanitizationRunId: existingCompleted.sanitizationRunId,
            organizationId,
          });

          logger.info(
            { event: 'sanitization_idempotent_reuse', runId: existingCompleted.sanitizationRunId },
            `Reusing existing completed sanitization run ${existingCompleted.sanitizationRunId}`
          );

          return { run: existingCompleted, artifact, records };
        }
      }
    }

    // 6. Create MetadataSanitizationRun with E11000 duplicate handling
    const sanitizationRunId = `san_run_${crypto.randomUUID()}`;
    let newRun: IMetadataSanitizationRun;

    try {
      newRun = await MetadataSanitizationRunModel.create({
        sanitizationRunId,
        organizationId,
        documentId,
        sourceArtifactId: sourceArtifactIdStr,
        sourceChecksum: inputChecksum,
        transformationRunId: sourceArtifact?.transformationRunId || null,
        configurationVersion: '1.0.0',
        configurationHash: configHash,
        sanitizerVersion: '1.0.0',
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
        const inFlight = await MetadataSanitizationRunModel.findOne({
          organizationId,
          documentId,
          sourceChecksum: inputChecksum,
          configurationHash: configHash,
          status: { $in: ['QUEUED', 'RUNNING'] },
        });

        if (inFlight) {
          logger.info(
            { event: 'sanitization_inflight_reuse', runId: inFlight.sanitizationRunId },
            `Reusing in-flight sanitization run ${inFlight.sanitizationRunId}`
          );
          const records = await MetadataSanitizationResultModel.find({
            sanitizationRunId: inFlight.sanitizationRunId,
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
      event: 'SANITIZATION_STARTED',
      outcome: 'SUCCESS',
      organizationId: organizationIdStr,
      userId: options?.userId,
      requestId: options?.requestId,
      details: { sanitizationRunId: newRun.sanitizationRunId, operation },
    });

    const { cleanFilename, hasPiiPattern } = FilenameSanitizer.sanitizeFilename(
      doc.originalFilename,
      newRun.sanitizationRunId
    );

    const tempOutputDir = path.join(process.cwd(), 'scratch', 'sanitization');
    await fs.promises.mkdir(tempOutputDir, { recursive: true });
    const tempOutputPath = path.join(tempOutputDir, `temp_${newRun.sanitizationRunId}_${cleanFilename}`);

    try {
      // 7. Instantiate Sanitizer Engine
      const engine = SanitizerEngineFactory.getEngine(doc.extension, doc.declaredMimeType);

      const engineResult = await engine.sanitize({
        sourceFilePath,
        outputFilePath: tempOutputPath,
        filename: doc.originalFilename,
        mimeType: doc.declaredMimeType,
        extension: doc.extension,
        policyOptions: options?.policyOptions || {},
      });

      // Filename Metadata Classification Record
      if (hasPiiPattern) {
        engineResult.discoveredCount++;
        engineResult.removedCount++;
        engineResult.records.push({
          category: 'FILENAME_METADATA',
          targetPath: `originalFilename:${doc.originalFilename}`,
          classification: 'POLICY_CONTROLLED',
          action: 'REMOVE',
          status: 'SANITIZED',
          reason: 'Sanitized sensitive PII pattern from output artifact filename',
        });
      }

      // 8. Output Validation & Checksum Calculation
      const outputBuffer = await fs.promises.readFile(tempOutputPath);
      const outputChecksum = crypto.createHash('sha256').update(outputBuffer).digest('hex');
      const fileSize = outputBuffer.length;

      // 9. Independent Post-Sanitization Verification Pass
      const verification = await IndependentMetadataVerifier.verifyOutputArtifact({
        outputPath: tempOutputPath,
        mimeType: doc.declaredMimeType,
        extension: doc.extension,
        publishedFilename: cleanFilename,
        originalFilename: doc.originalFilename,
        policyOptions: options?.policyOptions,
      });

      if (!verification.isVerified) {
        logAuthAuditEvent({
          event: 'SANITIZATION_VERIFICATION_FAILED',
          outcome: 'FAILURE',
          organizationId: organizationIdStr,
          userId: options?.userId,
          requestId: options?.requestId,
          details: { residualMetadataCount: verification.residualMetadataCount, items: verification.items },
        });

        throw AppError.badRequest(
          'Post-sanitization verification failed: residual metadata detected in output artifact',
          'SANITIZATION_VERIFICATION_FAILED'
        );
      }

      logAuthAuditEvent({
        event: 'SANITIZATION_VERIFICATION_PASSED',
        outcome: 'SUCCESS',
        organizationId: organizationIdStr,
        userId: options?.userId,
        requestId: options?.requestId,
      });

      // 10. Save Output Storage Artifact
      const outputStorageKey = `sanitized/org_${organizationId.toString()}/${newRun.sanitizationRunId}_${cleanFilename}`;
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

      const outputArtifactId = `art_san_${crypto.randomUUID()}`;
      const artifact = await OutputArtifactModel.create({
        outputArtifactId,
        organizationId,
        sourceDocumentId: documentId,
        transformationRunId: newRun.transformationRunId || newRun.sanitizationRunId,
        sourceChecksum: inputChecksum,
        outputChecksum,
        storageKey: outputStorageKey,
        originalFilename: cleanFilename,
        mimeType: doc.declaredMimeType,
        fileSize,
        status: sourceArtifact?.status === 'PENDING_REVIEW' ? 'PENDING_REVIEW' : 'ACTIVE',
      });

      // 11. Save MetadataSanitizationResult records
      const records: IMetadataSanitizationResult[] = [];
      for (const rec of engineResult.records) {
        const recordId = `san_rec_${crypto.randomUUID()}`;
        const recordDoc = await MetadataSanitizationResultModel.create({
          sanitizationRecordId: recordId,
          sanitizationRunId: newRun.sanitizationRunId,
          organizationId,
          documentId,
          category: rec.category,
          targetPath: rec.targetPath,
          classification: rec.classification,
          action: rec.action,
          status: rec.status,
          reason: rec.reason || null,
          sanitizerVersion: '1.0.0',
          appliedAt: new Date(),
        });
        records.push(recordDoc);
      }

      // 12. Finalize MetadataSanitizationRun
      newRun.status = engineResult.unsupportedCount > 0 ? 'PARTIAL' : 'COMPLETED';
      newRun.completedAt = new Date();
      newRun.metadataDiscoveredCount = engineResult.discoveredCount;
      newRun.metadataRemovedCount = engineResult.removedCount;
      newRun.metadataPreservedCount = engineResult.preservedCount;
      newRun.unsupportedCount = engineResult.unsupportedCount;
      newRun.outputArtifactId = artifact.outputArtifactId;
      newRun.warnings = engineResult.warnings;
      await newRun.save();

      // 13. Publish Active Output Artifact
      await this.publishActiveOutput(newRun, organizationId, documentId);

      logAuthAuditEvent({
        event: 'SANITIZATION_COMPLETED',
        outcome: 'SUCCESS',
        organizationId: organizationIdStr,
        userId: options?.userId,
        requestId: options?.requestId,
        details: {
          sanitizationRunId: newRun.sanitizationRunId,
          outputArtifactId: artifact.outputArtifactId,
          removedCount: engineResult.removedCount,
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
        event: 'SANITIZATION_FAILED',
        outcome: 'FAILURE',
        reason: errorMsg,
        organizationId: organizationIdStr,
        userId: options?.userId,
        requestId: options?.requestId,
      });

      throw err;
    } finally {
      if (fs.existsSync(tempOutputPath)) {
        await fs.promises.unlink(tempOutputPath).catch(() => {});
      }
    }
  }

  public async publishActiveOutput(
    newRun: IMetadataSanitizationRun,
    organizationId: mongoose.Types.ObjectId,
    documentId: mongoose.Types.ObjectId
  ): Promise<void> {
    const previousActiveRun = await MetadataSanitizationRunModel.findOne({
      organizationId,
      documentId,
      isLatestActive: true,
      _id: { $ne: newRun._id },
    });

    let useTransaction = false;
    let session: mongoose.ClientSession | null = null;

    try {
      if (
        mongoose.connection.readyState === 1 &&
        typeof mongoose.connection.getClient()?.startSession === 'function'
      ) {
        session = await mongoose.startSession();
        if (typeof session.withTransaction === 'function') {
          useTransaction = true;
        }
      }
    } catch {
      session = null;
      useTransaction = false;
    }

    if (useTransaction && session) {
      try {
        await session.withTransaction(async () => {
          if (previousActiveRun) {
            await MetadataSanitizationRunModel.updateOne(
              { _id: previousActiveRun._id, organizationId, documentId },
              { $set: { isLatestActive: false } },
              { session }
            );
          }
          await MetadataSanitizationRunModel.updateOne(
            { _id: newRun._id, organizationId, documentId },
            { $set: { isLatestActive: true } },
            { session }
          );
        });
        newRun.isLatestActive = true;
        return;
      } catch (txnErr) {
        logger.warn(
          { event: 'sanitization_publication_transaction_failed', error: String(txnErr) },
          'Transaction publication failed, falling back to atomic sequential publication'
        );
      } finally {
        await session.endSession();
      }
    }

    if (previousActiveRun) {
      await MetadataSanitizationRunModel.updateOne(
        { _id: previousActiveRun._id, organizationId, documentId },
        { $set: { isLatestActive: false } }
      );
    }

    try {
      await MetadataSanitizationRunModel.updateOne(
        { _id: newRun._id, organizationId, documentId },
        { $set: { isLatestActive: true } }
      );
      newRun.isLatestActive = true;
    } catch (pubErr) {
      if (previousActiveRun) {
        await MetadataSanitizationRunModel.updateOne(
          { _id: previousActiveRun._id, organizationId, documentId },
          { $set: { isLatestActive: true } }
        );
      }
      throw pubErr;
    }
  }

  public async getSanitizationRuns(
    documentIdStr: string,
    organizationIdStr: string
  ): Promise<IMetadataSanitizationRun[]> {
    const documentId = validateObjectId(documentIdStr, 'Document ID');
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');
    return MetadataSanitizationRunModel.find({ organizationId, documentId }).sort({ createdAt: -1 });
  }

  public async getSanitizationResults(
    documentIdStr: string,
    organizationIdStr: string,
    runIdStr?: string
  ): Promise<{ run: IMetadataSanitizationRun | null; artifact: IOutputArtifact | null; records: IMetadataSanitizationResult[] }> {
    const documentId = validateObjectId(documentIdStr, 'Document ID');
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');

    let run: IMetadataSanitizationRun | null = null;
    if (runIdStr) {
      run = await MetadataSanitizationRunModel.findOne({ organizationId, documentId, sanitizationRunId: runIdStr });
    } else {
      run = await MetadataSanitizationRunModel.findOne({ organizationId, documentId, isLatestActive: true });
    }

    if (!run) {
      return { run: null, artifact: null, records: [] };
    }

    const artifact = run.outputArtifactId
      ? await OutputArtifactModel.findOne({ organizationId, outputArtifactId: run.outputArtifactId })
      : null;

    const records = await MetadataSanitizationResultModel.find({
      organizationId,
      documentId,
      sanitizationRunId: run.sanitizationRunId,
    });

    return { run, artifact, records };
  }
}

export const sanitizationService = new SanitizationService();
