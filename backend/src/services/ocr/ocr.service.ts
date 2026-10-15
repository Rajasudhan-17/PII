import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DocumentModel } from '../../models/document.model';
import {
  NormalizedDocumentModel,
  INormalizedDocument,
  INormalizedBlock,
  INormalizedPage,
  ExtractionWarning,
} from '../../models/normalizedDocument.model';
import { storageService } from '../storage/storage.service';
import {
  TesseractOCRProvider,
  TrOCRHandwritingRecognizer,
  IOCRProvider,
  IHandwritingRecognizer,
  OCRResult,
  HTRResult,
} from './ocr.provider';
import { CoordinateMapper, RotationAngle } from './coordinateMapper';
import { enqueueOCRJob } from '../../queues/ocr.queue';
import { enqueuePIIJob } from '../../queues/pii.queue';
import { tenantScope, validateObjectId } from '../../utils/tenantQuery';
import { AppError } from '../../utils/AppError';
import { logAuthAuditEvent } from '../audit.service';
import { logger } from '../../utils/logger';
import { getConfig } from '../../config/env';

export interface ProcessOCROptions {
  isHandwriting?: boolean;
  language?: string;
  rotation?: RotationAngle;
  force?: boolean;
  userId?: string;
  requestId?: string;
  ip?: string;
}

export class OCRService {
  private ocrProvider: IOCRProvider;
  private htrRecognizer: IHandwritingRecognizer;

  constructor(ocrProvider?: IOCRProvider, htrRecognizer?: IHandwritingRecognizer) {
    this.ocrProvider = ocrProvider || new TesseractOCRProvider();
    this.htrRecognizer = htrRecognizer || new TrOCRHandwritingRecognizer(this.ocrProvider);
  }

  /**
   * Enqueues an OCR recognition job after validating document existence and tenant ownership.
   */
  public async queueOCR(params: {
    organizationId: string;
    documentId: string;
    userId: string;
    isHandwriting?: boolean;
    language?: string;
    rotation?: RotationAngle;
    requestId?: string;
    ip?: string;
  }): Promise<{ jobEnqueued: boolean; status: string }> {
    const { organizationId, documentId, userId, isHandwriting, language, requestId, ip } = params;

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
        reason: 'OCR_QUEUE_DOC_NOT_FOUND',
      });
      throw new AppError('Document not found or access denied.', 404, 'DOCUMENT_NOT_FOUND');
    }

    if (doc.isDeleted || doc.status === 'DELETED') {
      throw new AppError('Cannot run OCR on a deleted document.', 400, 'DOCUMENT_DELETED');
    }

    doc.status = 'OCR_QUEUED';
    await doc.save();

    await enqueueOCRJob({
      documentId: doc._id.toString(),
      organizationId: doc.organizationId.toString(),
      checksum: doc.checksum,
      isHandwriting,
      language,
      createdAt: new Date().toISOString(),
      requestId,
    });

    logAuthAuditEvent({
      event: isHandwriting ? 'DOCUMENT_HTR_QUEUED' : 'DOCUMENT_OCR_QUEUED',
      userId,
      organizationId,
      requestId,
      ip,
      outcome: 'SUCCESS',
      details: { documentId: doc._id.toString(), checksum: doc.checksum, isHandwriting },
    });

    return { jobEnqueued: true, status: doc.status };
  }

  /**
   * Main processor executing optical text recognition (OCR / HTR) on document asset.
   */
  public async processDocumentOCR(
    documentId: string,
    organizationId: string,
    options: ProcessOCROptions = {}
  ): Promise<INormalizedDocument> {
    const docObjId = validateObjectId(documentId, 'Document ID');
    const query = tenantScope(organizationId, { _id: docObjId, isDeleted: false });
    const doc = await DocumentModel.findOne(query);

    if (!doc || doc.isDeleted || doc.status === 'DELETED') {
      logger.warn({ documentId, organizationId }, 'Document deleted or missing prior to OCR processing');
      throw new AppError('Document not found or deleted during OCR processing.', 404, 'DOCUMENT_NOT_FOUND');
    }

    const isHandwriting = !!options.isHandwriting;
    const modelId = isHandwriting ? 'microsoft/trocr-base-handwritten' : 'tesseract.js-5.1.1';

    // Idempotency check: Reuse existing OCR result if checksum, engine, and model match unless force=true
    const existingNorm = await NormalizedDocumentModel.findOne({
      organizationId: doc.organizationId,
      documentId: doc._id,
      checksum: doc.checksum,
    });

    if (
      !options.force &&
      existingNorm &&
      (existingNorm.status === 'OCR_COMPLETED' || existingNorm.status === 'COMPLETE') &&
      existingNorm.blocks.some((b) => b.recognitionMethod === 'PRINT_OCR' || b.recognitionMethod === 'HANDWRITING_HTR' || b.recognitionMethod === 'GENERIC_OCR_FALLBACK') &&
      existingNorm.metadata?.modelId === modelId
    ) {
      logger.info({ documentId, checksum: doc.checksum, modelId }, 'Idempotent OCR hit: reusing existing normalized result');
      doc.status = 'OCR_COMPLETED';
      await doc.save();
      return existingNorm;
    }

    doc.status = 'OCR_PROCESSING';
    await doc.save();

    logAuthAuditEvent({
      event: isHandwriting ? 'DOCUMENT_HTR_STARTED' : 'DOCUMENT_OCR_STARTED',
      organizationId,
      outcome: 'SUCCESS',
      details: { documentId: doc._id.toString(), isHandwriting },
    });

    const tempDir = path.resolve(process.cwd(), getConfig().STORAGE_PATH, 'temp_ocr');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true, mode: 0o755 });
    }

    const tempFilePath = path.join(tempDir, `ocr_${doc._id.toString()}_${crypto.randomUUID()}.${doc.extension}`);

    try {
      // Download file stream from storage to local temporary disk location
      const stream = await storageService.getStream(doc.storageKey);
      const writeStream = fs.createWriteStream(tempFilePath);
      await new Promise<void>((resolve, reject) => {
        stream.pipe(writeStream);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      const imageBuffer = fs.readFileSync(tempFilePath);

      const isValidImageBuffer = (buf: Buffer): boolean => {
        if (!buf || buf.length < 4) return false;
        if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true; // PNG
        if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true; // JPEG
        if ((buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2A && buf[3] === 0x00) ||
            (buf[0] === 0x4D && buf[1] === 0x4D && buf[2] === 0x00 && buf[3] === 0x2A)) return true; // TIFF
        if (buf[0] === 0x42 && buf[1] === 0x4D) return true; // BMP
        return false;
      };

      const fallback1x1RasterPng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64'
      );

      let effectiveBuffer = imageBuffer;
      const docExt = (doc.extension || '').toLowerCase().replace(/^\./, '');
      if (docExt === 'pdf') {
        const jpegStart = imageBuffer.indexOf(Buffer.from([0xFF, 0xD8, 0xFF]));
        const pngStart = imageBuffer.indexOf(Buffer.from([0x89, 0x50, 0x4E, 0x47]));

        if (jpegStart !== -1) {
          const jpegEnd = imageBuffer.indexOf(Buffer.from([0xFF, 0xD9]), jpegStart);
          effectiveBuffer = jpegEnd !== -1
            ? imageBuffer.subarray(jpegStart, jpegEnd + 2)
            : imageBuffer.subarray(jpegStart);
        } else if (pngStart !== -1) {
          const pngEnd = imageBuffer.indexOf(Buffer.from('IEND'), pngStart);
          effectiveBuffer = pngEnd !== -1
            ? imageBuffer.subarray(pngStart, pngEnd + 8)
            : imageBuffer.subarray(pngStart);
        } else {
          const streamMatch = /stream\r?\n([\s\S]*?)\r?\nendstream/.exec(imageBuffer.toString('binary'));
          if (streamMatch && streamMatch[1].length > 10) {
            const candidate = Buffer.from(streamMatch[1], 'binary');
            effectiveBuffer = isValidImageBuffer(candidate) ? candidate : fallback1x1RasterPng;
          } else {
            effectiveBuffer = fallback1x1RasterPng;
          }
        }
      } else {
        effectiveBuffer = isValidImageBuffer(imageBuffer) ? imageBuffer : fallback1x1RasterPng;
      }

      let ocrResult: OCRResult | HTRResult;

      if (isHandwriting) {
        ocrResult = await this.htrRecognizer.recognizeHandwriting(effectiveBuffer, {
          language: options.language,
        });
      } else {
        ocrResult = await this.ocrProvider.recognize(effectiveBuffer, {
          language: options.language,
        });
      }

      const recognitionMethod = ocrResult.recognitionMethod || (isHandwriting ? 'HANDWRITING_HTR' : 'PRINT_OCR');
      const rotation = options.rotation || 0;

      // Convert OCR blocks to INormalizedBlock format with coordinates mapped to source units
      const ocrBlocks: INormalizedBlock[] = [];
      let globalOffset = 0;

      const warnings: ExtractionWarning[] = [];
      if ('warning' in ocrResult && ocrResult.warning) {
        warnings.push(ocrResult.warning);
      }

      let blockCounter = 1;

      for (const b of ocrResult.blocks) {
        for (const line of b.lines) {
          if (!line.text.trim()) continue;

          const startOffset = globalOffset;
          const endOffset = globalOffset + line.text.length;
          globalOffset = endOffset + 1; // count newline / space

          const blockBbox = line.bbox
            ? CoordinateMapper.mapToSourcePageUnits(line.bbox, undefined, undefined, rotation)
            : undefined;

          const words = line.words.map((w) => ({
            text: w.text,
            confidence: w.confidence !== null ? Math.round(w.confidence * 10) / 10 : null,
            boundingBox: CoordinateMapper.mapToSourcePageUnits(w.bbox, undefined, undefined, rotation),
          }));

          const blockId = `ocr_p1_b${blockCounter++}`;
          const blockConfidence = line.confidence !== null ? Math.round(line.confidence * 10) / 10 : null;

          ocrBlocks.push({
            blockId,
            type: 'PARAGRAPH',
            text: line.text,
            pageNumber: 1,
            readingOrderIndex: blockCounter - 1,
            startOffset,
            endOffset,
            boundingBox: blockBbox,
            confidence: blockConfidence,
            recognitionMethod,
            words,
            provenance: {
              documentId: doc._id.toString(),
              organizationId: doc.organizationId.toString(),
              pageNumber: 1,
              blockId,
            },
          });
        }
      }

      // Determine extraction status based on block output
      const finalStatus =
        ocrBlocks.length > 0
          ? 'OCR_COMPLETED'
          : ocrResult.text.trim().length > 0
          ? 'OCR_PARTIAL'
          : 'OCR_FAILED';

      const page: INormalizedPage = {
        pageNumber: 1,
        blockCount: ocrBlocks.length,
      };

      // Upsert into NormalizedDocumentModel
      const existingDoc = await NormalizedDocumentModel.findOne({
        organizationId: doc.organizationId,
        documentId: doc._id,
      });

      const mergedBlocks = existingDoc && existingDoc.blocks.length > 0
        ? [...existingDoc.blocks.filter((b) => b.recognitionMethod !== recognitionMethod), ...ocrBlocks]
        : ocrBlocks;

      const mergedWarnings = existingDoc
        ? [...existingDoc.warnings, ...warnings]
        : warnings;

      const normDoc = await NormalizedDocumentModel.findOneAndUpdate(
        { organizationId: doc.organizationId, documentId: doc._id },
        {
          organizationId: doc.organizationId,
          documentId: doc._id,
          checksum: doc.checksum,
          format: doc.detectedMimeType || doc.extension,
          schemaVersion: '1.0.0',
          extractorVersion: ocrResult.engineVersion,
          status: finalStatus,
          pages: [page],
          blocks: mergedBlocks,
          tables: existingDoc ? existingDoc.tables : [],
          metadata: {
            ...(existingDoc ? existingDoc.metadata : {}),
            ocrEngineVersion: ocrResult.engineVersion,
            ocrBlockCount: ocrBlocks.length,
            isHandwritten: isHandwriting,
            modelId: ocrResult.modelMetadata?.modelId || modelId,
            modelRevision: ocrResult.modelMetadata?.modelRevision || '1.0.0',
            processorId: ocrResult.modelMetadata?.processorId || 'TrOCRProcessor',
            runtimeVersion: ocrResult.modelMetadata?.runtimeVersion || 'transformers-4.x',
          },
          warnings: mergedWarnings,
          extractedAt: new Date(),
        },
        { upsert: true, new: true, runValidators: true }
      );

      // Verify soft-delete guard before final document status update
      const recheckDoc = await DocumentModel.findOne(query);
      if (!recheckDoc || recheckDoc.isDeleted || recheckDoc.status === 'DELETED') {
        throw new AppError('Document was soft-deleted during OCR processing.', 400, 'DOCUMENT_DELETED');
      }

      recheckDoc.status = finalStatus === 'OCR_COMPLETED' ? 'OCR_COMPLETED' : 'OCR_FAILED';
      await recheckDoc.save();

      logAuthAuditEvent({
        event: isHandwriting ? 'DOCUMENT_HTR_COMPLETED' : 'DOCUMENT_OCR_COMPLETED',
        organizationId,
        outcome: 'SUCCESS',
        details: {
          documentId: doc._id.toString(),
          status: finalStatus,
          blockCount: ocrBlocks.length,
          recognitionMethod,
        },
      });

      // ── Auto-pipeline: chain PII detection next if OCR completed successfully ──
      if (finalStatus === 'OCR_COMPLETED') {
        const docIdStr = doc._id.toString();
        const orgIdStr = doc.organizationId.toString();
        try {
          await enqueuePIIJob({
            documentId: docIdStr,
            organizationId: orgIdStr,
            checksum: doc.checksum,
            createdAt: new Date().toISOString(),
          });
          logger.info(
            { event: 'auto_pipeline_pii_queued_after_ocr', documentId: docIdStr, organizationId: orgIdStr },
            'Auto-pipeline: PII detection job enqueued after OCR completion'
          );
        } catch (qErr) {
          logger.warn(
            { event: 'auto_pipeline_pii_queue_after_ocr_failed', documentId: docIdStr, error: (qErr as Error).message },
            'Auto-pipeline: failed to enqueue PII job after OCR'
          );
        }
      }

      return normDoc;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errStack = err instanceof Error ? err.stack : undefined;

      const recheckDoc = await DocumentModel.findOne(query);
      if (recheckDoc && !recheckDoc.isDeleted) {
        recheckDoc.status = 'OCR_FAILED';
        await recheckDoc.save();
      }

      logAuthAuditEvent({
        event: isHandwriting ? 'DOCUMENT_HTR_FAILED' : 'DOCUMENT_OCR_FAILED',
        organizationId,
        outcome: 'FAILURE',
        reason: errMsg,
        details: { documentId: doc._id.toString() },
      });

      logger.error(
        { error: errMsg, stack: errStack, documentId: doc._id.toString() },
        'Document OCR processing failed'
      );

      throw new AppError(`OCR processing failed: ${errMsg}`, 500, 'OCR_PROCESSING_FAILED');
    } finally {
      // Guaranteed temporary disk file cleanup in finally block
      if (fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch (cleanupErr) {
          logger.warn({ path: tempFilePath, error: cleanupErr }, 'Failed to delete temporary OCR file');
        }
      }
    }
  }

  /**
   * Retrieves summary of OCR/HTR results and confidence metrics for a tenant's document.
   */
  public async getOCRStatus(documentId: string, organizationId: string): Promise<Record<string, unknown>> {
    const docObjId = validateObjectId(documentId, 'Document ID');
    const docQuery = tenantScope(organizationId, { _id: docObjId, isDeleted: false });
    const doc = await DocumentModel.findOne(docQuery);

    if (!doc) {
      throw new AppError('Document not found or access denied.', 404, 'DOCUMENT_NOT_FOUND');
    }

    const normDoc = await NormalizedDocumentModel.findOne({
      organizationId: doc.organizationId,
      documentId: doc._id,
    });

    const ocrBlocks = normDoc
      ? normDoc.blocks.filter(
          (b) =>
            b.recognitionMethod === 'PRINT_OCR' ||
            b.recognitionMethod === 'HANDWRITING_HTR' ||
            b.recognitionMethod === 'GENERIC_OCR_FALLBACK'
        )
      : [];

    const nonNullConfidences = ocrBlocks
      .map((b) => b.confidence)
      .filter((c): c is number => c !== null && c !== undefined);

    const avgConfidence =
      nonNullConfidences.length > 0
        ? Math.round((nonNullConfidences.reduce((a, b) => a + b, 0) / nonNullConfidences.length) * 10) / 10
        : null;

    return {
      documentId: doc._id.toString(),
      organizationId: doc.organizationId.toString(),
      documentStatus: doc.status,
      ocrStatus: normDoc ? normDoc.status : 'NOT_STARTED',
      checksum: doc.checksum,
      ocrBlockCount: ocrBlocks.length,
      averageConfidence: avgConfidence,
      recognitionMethods: Array.from(new Set(ocrBlocks.map((b) => b.recognitionMethod))),
      extractedAt: normDoc ? normDoc.extractedAt : null,
      warnings: normDoc ? normDoc.warnings : [],
      metadata: normDoc ? normDoc.metadata : {},
    };
  }
}

export const ocrService = new OCRService();
