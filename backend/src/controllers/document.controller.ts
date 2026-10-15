import { Request, Response, NextFunction } from 'express';
import { documentService } from '../services/document.service';
import { AppError } from '../utils/AppError';
import { enqueueExtractionJob } from '../queues/extraction.queue';
import { logger } from '../utils/logger';
import { OutputArtifactModel } from '../models/outputArtifact.model';
import { storageService } from '../services/storage/storage.service';

export const uploadDocumentHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantContext) {
      throw new AppError('Tenant context missing.', 500, 'TENANT_CONTEXT_MISSING');
    }
    if (!req.user) {
      throw new AppError('Authentication context missing.', 401, 'AUTHENTICATION_REQUIRED');
    }
    if (!req.file) {
      throw new AppError('No upload file provided.', 400, 'MISSING_UPLOAD_FILE');
    }

    const document = await documentService.uploadDocument({
      organizationId: req.tenantContext.organizationId,
      userId: req.user.id,
      file: req.file,
      requestId: req.id,
      ip: req.ip,
    });

    // ── Auto-pipeline: trigger extraction immediately after upload ──
    try {
      await enqueueExtractionJob({
        documentId: document.id,
        organizationId: req.tenantContext.organizationId,
        checksum: document.checksum,
        createdAt: new Date().toISOString(),
        requestId: req.id,
      });
      logger.info(
        { event: 'auto_pipeline_extraction_queued', documentId: document.id, organizationId: req.tenantContext.organizationId },
        `Auto-pipeline: extraction job enqueued for document ${document.id}`
      );
    } catch (queueErr) {
      // Non-fatal: document is saved, extraction can be triggered manually
      logger.warn(
        { event: 'auto_pipeline_extraction_queue_failed', documentId: document.id, error: (queueErr as Error).message },
        'Auto-pipeline: failed to enqueue extraction job; document uploaded but extraction must be triggered manually'
      );
    }

    res.status(201).json({
      message: 'Document uploaded and queued for extraction.',
      document,
    });
  } catch (err) {
    next(err);
  }
};

export const listDocumentsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantContext) {
      throw new AppError('Tenant context missing.', 500, 'TENANT_CONTEXT_MISSING');
    }

    const documents = await documentService.listOrganizationDocuments(req.tenantContext.organizationId);

    res.status(200).json({
      count: documents.length,
      documents,
    });
  } catch (err) {
    next(err);
  }
};

export const getDocumentMetadataHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantContext) {
      throw new AppError('Tenant context missing.', 500, 'TENANT_CONTEXT_MISSING');
    }
    const { documentId } = req.params;

    const document = await documentService.getDocumentMetadata(req.tenantContext.organizationId, documentId);

    res.status(200).json({
      document,
    });
  } catch (err) {
    next(err);
  }
};

export const downloadDocumentHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantContext) {
      throw new AppError('Tenant context missing.', 500, 'TENANT_CONTEXT_MISSING');
    }
    const { documentId } = req.params;

    if (req.query.transformed === 'true' || req.query.version === 'redacted') {
      const artifact = await OutputArtifactModel.findOne({
        organizationId: req.tenantContext.organizationId,
        sourceDocumentId: documentId,
        status: { $in: ['ACTIVE', 'PENDING_REVIEW'] },
      }).sort({ createdAt: -1 });

      if (artifact) {
        const stream = await storageService.getStream(artifact.storageKey);
        res.setHeader('Content-Type', artifact.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(artifact.originalFilename)}"`);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Length', artifact.fileSize.toString());
        stream.pipe(res);
        return;
      }
    }

    const { doc, stream } = await documentService.downloadDocument(
      req.tenantContext.organizationId,
      documentId,
      req.user?.id,
      req.id,
      req.ip
    );

    // Set secure download headers
    res.setHeader('Content-Type', doc.detectedMimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.originalFilename)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', doc.size.toString());

    stream.pipe(res);
  } catch (err) {
    next(err);
  }
};

export const deleteDocumentHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantContext) {
      throw new AppError('Tenant context missing.', 500, 'TENANT_CONTEXT_MISSING');
    }
    const { documentId } = req.params;

    await documentService.deleteDocument(
      req.tenantContext.organizationId,
      documentId,
      req.user?.id,
      req.id,
      req.ip
    );

    res.status(200).json({
      message: 'Document deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
};
