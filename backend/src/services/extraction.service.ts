import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DocumentModel } from '../models/document.model';
import { NormalizedDocumentModel, INormalizedDocument } from '../models/normalizedDocument.model';
import { storageService } from './storage/storage.service';
import { extractorFactory } from './extractors/extractor.factory';
import { enqueueExtractionJob } from '../queues/extraction.queue';
import { enqueueOCRJob } from '../queues/ocr.queue';
import { enqueuePIIJob } from '../queues/pii.queue';
import { tenantScope, validateObjectId } from '../utils/tenantQuery';
import { AppError } from '../utils/AppError';
import { logAuthAuditEvent } from './audit.service';
import { logger } from '../utils/logger';
import { getConfig } from '../config/env';

export class ExtractionService {
  /**
   * Enqueues an extraction job for a tenant's document after verifying tenant authorization.
   */
  public async queueExtraction(params: {
    organizationId: string;
    documentId: string;
    userId: string;
    requestId?: string;
    ip?: string;
  }): Promise<{ jobEnqueued: boolean; status: string }> {
    const { organizationId, documentId, userId, requestId, ip } = params;

    const docObjId = validateObjectId(documentId, 'Document ID');
    const query = tenantScope(organizationId, { _id: docObjId, isDeleted: false });
    const doc = await DocumentModel.findOne(query);

    if (!doc) {
      logAuthAuditEvent({
        event: 'DOCUMENT_ACCESS_DENIED',
        userId,
        organizationId,
        requestId,
        ip,
        outcome: 'DENIED',
        reason: 'EXTRACTION_QUEUE_DOC_NOT_FOUND',
      });
      throw new AppError('Document not found or access denied.', 404, 'DOCUMENT_NOT_FOUND');
    }

    if (doc.isDeleted || doc.status === 'DELETED') {
      throw new AppError('Cannot extract a deleted document.', 400, 'DOCUMENT_DELETED');
    }

    doc.status = 'EXTRACTION_QUEUED';
    await doc.save();

    await enqueueExtractionJob({
      documentId: doc._id.toString(),
      organizationId: doc.organizationId.toString(),
      checksum: doc.checksum,
      createdAt: new Date().toISOString(),
      requestId,
    });

    logAuthAuditEvent({
      event: 'DOCUMENT_EXTRACTION_QUEUED',
      userId,
      organizationId,
      requestId,
      ip,
      outcome: 'SUCCESS',
      details: { documentId: doc._id.toString(), checksum: doc.checksum },
    });

    return { jobEnqueued: true, status: doc.status };
  }

  /**
   * Core worker processor executing asynchronous document content extraction.
   */
  public async processDocumentExtraction(documentId: string, organizationId: string): Promise<INormalizedDocument> {
    const docObjId = validateObjectId(documentId, 'Document ID');
    const query = tenantScope(organizationId, { _id: docObjId, isDeleted: false });
    const doc = await DocumentModel.findOne(query);

    if (!doc || doc.isDeleted || doc.status === 'DELETED') {
      logger.warn({ documentId, organizationId }, 'Document deleted or missing prior to extraction processing');
      throw new AppError('Document not found or deleted during extraction processing.', 404, 'DOCUMENT_NOT_FOUND');
    }

    // Idempotency check: Check if normalized result already exists for exact documentId + checksum
    const existingNorm = await NormalizedDocumentModel.findOne({
      organizationId: doc.organizationId,
      documentId: doc._id,
      checksum: doc.checksum,
    });

    if (existingNorm && (existingNorm.status === 'COMPLETE' || existingNorm.status === 'OCR_REQUIRED')) {
      logger.info({ documentId, checksum: doc.checksum }, 'Idempotent extraction hit: reusing existing normalized result');
      doc.status = existingNorm.status === 'OCR_REQUIRED' ? 'OCR_REQUIRED' : 'EXTRACTED';
      await doc.save();
      return existingNorm;
    }

    doc.status = 'EXTRACTING';
    await doc.save();

    logAuthAuditEvent({
      event: 'DOCUMENT_EXTRACTION_STARTED',
      organizationId,
      outcome: 'SUCCESS',
      details: { documentId: doc._id.toString() },
    });

    // Create temporary directory for worker file processing
    const tempDir = path.resolve(process.cwd(), getConfig().STORAGE_PATH, 'temp_extraction');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true, mode: 0o755 });
    }

    const tempFilePath = path.join(tempDir, `extract_${doc._id.toString()}_${crypto.randomUUID()}.${doc.extension}`);

    try {
      // Download stream from storage provider into temp file
      const stream = await storageService.getStream(doc.storageKey);
      const writeStream = fs.createWriteStream(tempFilePath);
      await new Promise<void>((resolve, reject) => {
        stream.pipe(writeStream);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      // Select format extractor and extract content
      const extractor = extractorFactory.getExtractor(doc);
      const result = await extractor.extract(doc, tempFilePath);

      // Save or update NormalizedDocument record
      const normDoc = await NormalizedDocumentModel.findOneAndUpdate(
        { organizationId: doc.organizationId, documentId: doc._id },
        {
          organizationId: doc.organizationId,
          documentId: doc._id,
          checksum: doc.checksum,
          format: result.format,
          schemaVersion: result.schemaVersion,
          extractorVersion: result.extractorVersion,
          status: result.status,
          pages: result.pages,
          blocks: result.blocks,
          tables: result.tables,
          metadata: result.metadata,
          warnings: result.warnings,
          extractedAt: new Date(),
        },
        { upsert: true, new: true, runValidators: true }
      );

      // Re-check document deletion state before updating final status
      const recheckDoc = await DocumentModel.findOne(query);
      if (recheckDoc && !recheckDoc.isDeleted) {
        if (result.status === 'COMPLETE') {
          recheckDoc.status = 'EXTRACTED';
        } else if (result.status === 'PARTIAL') {
          recheckDoc.status = 'EXTRACTION_PARTIAL';
        } else if (result.status === 'OCR_REQUIRED') {
          recheckDoc.status = 'OCR_REQUIRED';
        } else if (result.status === 'ENCRYPTED') {
          recheckDoc.status = 'ENCRYPTED';
        } else {
          recheckDoc.status = 'EXTRACTION_FAILED';
        }
        await recheckDoc.save();
      }

      logAuthAuditEvent({
        event: result.status === 'FAILED' ? 'DOCUMENT_EXTRACTION_FAILED' : 'DOCUMENT_EXTRACTION_COMPLETED',
        organizationId,
        outcome: result.status === 'FAILED' ? 'FAILURE' : 'SUCCESS',
        details: {
          documentId: doc._id.toString(),
          status: result.status,
          blockCount: result.blocks.length,
          warningCount: result.warnings.length,
        },
      });

      // ── Auto-pipeline: chain next stage after extraction ──
      const docIdStr = doc._id.toString();
      const orgIdStr = doc.organizationId.toString();

      if (result.status === 'OCR_REQUIRED') {
        // Image/scanned doc: trigger OCR next
        try {
          await enqueueOCRJob({
            documentId: docIdStr,
            organizationId: orgIdStr,
            checksum: doc.checksum,
            createdAt: new Date().toISOString(),
          });
          logger.info(
            { event: 'auto_pipeline_ocr_queued', documentId: docIdStr, organizationId: orgIdStr },
            'Auto-pipeline: OCR job enqueued after extraction (OCR_REQUIRED)'
          );
        } catch (qErr) {
          logger.warn(
            { event: 'auto_pipeline_ocr_queue_failed', documentId: docIdStr, error: (qErr as Error).message },
            'Auto-pipeline: failed to enqueue OCR job after extraction'
          );
        }
      } else if (result.status === 'COMPLETE') {
        // Text doc fully extracted: trigger PII detection next
        try {
          await enqueuePIIJob({
            documentId: docIdStr,
            organizationId: orgIdStr,
            checksum: doc.checksum,
            createdAt: new Date().toISOString(),
          });
          logger.info(
            { event: 'auto_pipeline_pii_queued', documentId: docIdStr, organizationId: orgIdStr },
            'Auto-pipeline: PII detection job enqueued after extraction'
          );
        } catch (qErr) {
          logger.warn(
            { event: 'auto_pipeline_pii_queue_failed', documentId: docIdStr, error: (qErr as Error).message },
            'Auto-pipeline: failed to enqueue PII job after extraction'
          );
        }
      }

      return normDoc;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ documentId: doc._id.toString(), error: errMsg }, 'Document extraction failed');

      doc.status = 'EXTRACTION_FAILED';
      await doc.save().catch(() => {});

      logAuthAuditEvent({
        event: 'DOCUMENT_EXTRACTION_FAILED',
        organizationId,
        outcome: 'FAILURE',
        reason: errMsg,
        details: { documentId: doc._id.toString() },
      });

      throw err;
    } finally {
      // Clean up temporary processing file
      if (fs.existsSync(tempFilePath)) {
        await fs.promises.unlink(tempFilePath).catch(() => {});
      }
    }
  }

  /**
   * Retrieves extraction status summary for a document.
   */
  public async getExtractionStatus(organizationId: string, documentId: string) {
    const docObjId = validateObjectId(documentId, 'Document ID');
    const query = tenantScope(organizationId, { _id: docObjId, isDeleted: false });
    const doc = await DocumentModel.findOne(query);

    if (!doc) {
      throw new AppError('Document not found or access denied.', 404, 'DOCUMENT_NOT_FOUND');
    }

    const norm = await NormalizedDocumentModel.findOne({
      organizationId: doc.organizationId,
      documentId: doc._id,
    });

    return {
      documentId: doc._id.toString(),
      organizationId: doc.organizationId.toString(),
      documentStatus: doc.status,
      extractionStatus: norm ? norm.status : 'NOT_EXTRACTED',
      format: norm ? norm.format : doc.extension.toUpperCase(),
      schemaVersion: norm ? norm.schemaVersion : '1.0.0',
      extractorVersion: norm ? norm.extractorVersion : '1.0.0',
      pageCount: norm ? norm.pages.length : 0,
      blockCount: norm ? norm.blocks.length : 0,
      tableCount: norm ? norm.tables.length : 0,
      warnings: norm ? norm.warnings : [],
      extractedAt: norm ? norm.extractedAt : null,
    };
  }

  /**
   * Retrieves the full canonical normalized document representation.
   */
  public async getNormalizedDocumentContent(organizationId: string, documentId: string): Promise<INormalizedDocument> {
    const docObjId = validateObjectId(documentId, 'Document ID');
    const query = tenantScope(organizationId, { _id: docObjId, isDeleted: false });
    const doc = await DocumentModel.findOne(query);

    if (!doc) {
      throw new AppError('Document not found or access denied.', 404, 'DOCUMENT_NOT_FOUND');
    }

    const norm = await NormalizedDocumentModel.findOne({
      organizationId: doc.organizationId,
      documentId: doc._id,
    });

    if (!norm) {
      throw new AppError('Extraction result not found for this document. Run extraction first.', 404, 'EXTRACTION_NOT_FOUND');
    }

    return norm;
  }
}

export const extractionService = new ExtractionService();
