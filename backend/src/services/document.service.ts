import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { DocumentModel, IDocument } from '../models/document.model';
import { storageService } from './storage/storage.service';
import { tenantScope } from '../utils/tenantQuery';
import { AppError } from '../utils/AppError';
import { logAuthAuditEvent } from './audit.service';
import { DocumentResponseDTO, toDocumentResponseDTO } from '../dto/document.dto';
import {
  sanitizeFilename,
  ALLOWED_EXTENSIONS_MAP,
  ALLOWED_MIME_TYPES,
  detectMimeTypeFromMagicBytes,
  calculateFileChecksum,
} from '../utils/fileValidation';

export class DocumentService {
  /**
   * Securely ingests an uploaded file from quarantine to safe tenant storage.
   */
  public async uploadDocument(params: {
    organizationId: string;
    userId: string;
    file: Express.Multer.File;
    requestId?: string;
    ip?: string;
  }): Promise<DocumentResponseDTO> {
    const { organizationId, userId, file, requestId, ip } = params;

    logAuthAuditEvent({
      event: 'DOCUMENT_UPLOAD_STARTED',
      userId,
      organizationId,
      requestId,
      ip,
      outcome: 'SUCCESS',
      details: { size: file.size, declaredMimeType: file.mimetype },
    });

    const cleanFilename = sanitizeFilename(file.originalname);
    const rawExt = path.extname(cleanFilename).replace(/^\./, '').toLowerCase();

    // Check extension allowlist
    if (!rawExt || !ALLOWED_EXTENSIONS_MAP[rawExt]) {
      await this.cleanupFileSilently(file.path);
      logAuthAuditEvent({
        event: 'DOCUMENT_UPLOAD_REJECTED',
        userId,
        organizationId,
        requestId,
        ip,
        outcome: 'DENIED',
        reason: 'UNSUPPORTED_FILE_EXTENSION',
      });
      throw new AppError('File extension not permitted in allowlist.', 400, 'UNSUPPORTED_EXTENSION');
    }

    let detectedMimeType: string;
    try {
      detectedMimeType = await detectMimeTypeFromMagicBytes(file.path, rawExt);
    } catch (err) {
      await this.cleanupFileSilently(file.path);
      logAuthAuditEvent({
        event: 'DOCUMENT_UPLOAD_REJECTED',
        userId,
        organizationId,
        requestId,
        ip,
        outcome: 'DENIED',
        reason: 'MAGIC_BYTES_VALIDATION_FAILED',
      });
      throw err;
    }

    // Verify detected MIME type in allowlist
    if (!ALLOWED_MIME_TYPES.has(detectedMimeType)) {
      await this.cleanupFileSilently(file.path);
      logAuthAuditEvent({
        event: 'DOCUMENT_UPLOAD_REJECTED',
        userId,
        organizationId,
        requestId,
        ip,
        outcome: 'DENIED',
        reason: 'UNSUPPORTED_MIME_TYPE',
      });
      throw new AppError('File binary magic bytes do not match an allowlisted format.', 400, 'UNSUPPORTED_MIME_TYPE');
    }

    // Calculate streaming SHA-256 checksum
    const checksum = await calculateFileChecksum(file.path);

    // Generate unguessable storage key path: orgs/<orgId>/docs/<uuid>.<ext>
    const fileId = crypto.randomUUID();
    const storageKey = `orgs/${organizationId}/docs/${fileId}.${rawExt}`;

    try {
      // Move file from quarantine to permanent storage abstraction
      await storageService.put(storageKey, file.path);
      await this.cleanupFileSilently(file.path);

      // Create Document database record
      const doc = await DocumentModel.create({
        organizationId,
        uploadedBy: userId,
        originalFilename: cleanFilename,
        size: file.size,
        declaredMimeType: file.mimetype.toLowerCase(),
        detectedMimeType,
        extension: rawExt,
        storageKey,
        status: 'READY',
        checksum,
        isDeleted: false,
      });

      logAuthAuditEvent({
        event: 'DOCUMENT_UPLOAD_ACCEPTED',
        userId,
        organizationId,
        requestId,
        ip,
        outcome: 'SUCCESS',
        details: { documentId: doc._id.toString(), checksum, size: doc.size },
      });

      return toDocumentResponseDTO(doc);
    } catch (err) {
      // Rollback temporary & storage files on failure
      await this.cleanupFileSilently(file.path);
      await storageService.delete(storageKey).catch(() => {});

      logAuthAuditEvent({
        event: 'DOCUMENT_UPLOAD_REJECTED',
        userId,
        organizationId,
        requestId,
        ip,
        outcome: 'FAILURE',
        reason: (err as Error).message,
      });
      throw err;
    }
  }

  /**
   * Retrieves list of active documents for an organization.
   */
  public async listOrganizationDocuments(organizationId: string): Promise<DocumentResponseDTO[]> {
    const query = tenantScope(organizationId, { isDeleted: false });
    const docs = await DocumentModel.find(query).sort({ createdAt: -1 });
    return docs.map(toDocumentResponseDTO);
  }

  /**
   * Retrieves metadata for a specific document.
   */
  public async getDocumentMetadata(organizationId: string, documentId: string): Promise<DocumentResponseDTO> {
    const query = tenantScope(organizationId, { _id: documentId, isDeleted: false });
    const doc = await DocumentModel.findOne(query);
    if (!doc) {
      throw new AppError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
    }
    return toDocumentResponseDTO(doc);
  }

  /**
   * Stream download an authorized document.
   */
  public async downloadDocument(
    organizationId: string,
    documentId: string,
    userId?: string,
    requestId?: string,
    ip?: string
  ): Promise<{ doc: IDocument; stream: Readable }> {
    const query = tenantScope(organizationId, { _id: documentId, isDeleted: false });
    const doc = await DocumentModel.findOne(query);
    const DISALLOWED_DOWNLOAD_STATUSES = new Set(['DELETED', 'QUARANTINED', 'REJECTED']);
    if (!doc || DISALLOWED_DOWNLOAD_STATUSES.has(doc.status)) {
      logAuthAuditEvent({
        event: 'DOCUMENT_ACCESS_DENIED',
        userId,
        organizationId,
        requestId,
        ip,
        outcome: 'DENIED',
        reason: 'DOCUMENT_NOT_FOUND_OR_NOT_READY',
      });
      throw new AppError('Document not found or access denied.', 404, 'DOCUMENT_NOT_FOUND');
    }

    const stream = await storageService.getStream(doc.storageKey);

    logAuthAuditEvent({
      event: 'DOCUMENT_DOWNLOAD',
      userId,
      organizationId,
      requestId,
      ip,
      outcome: 'SUCCESS',
      details: { documentId: doc._id.toString() },
    });

    return { doc, stream };
  }

  /**
   * Deletes a document and its storage object.
   */
  public async deleteDocument(
    organizationId: string,
    documentId: string,
    userId?: string,
    requestId?: string,
    ip?: string
  ): Promise<void> {
    const query = tenantScope(organizationId, { _id: documentId, isDeleted: false });
    const doc = await DocumentModel.findOne(query);
    if (!doc) {
      logAuthAuditEvent({
        event: 'DOCUMENT_ACCESS_DENIED',
        userId,
        organizationId,
        requestId,
        ip,
        outcome: 'DENIED',
        reason: 'DOCUMENT_NOT_FOUND_FOR_DELETION',
      });
      throw new AppError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
    }

    // Soft delete DB record
    doc.isDeleted = true;
    doc.status = 'DELETED';
    doc.deletedAt = new Date();
    await doc.save();

    // Delete physical file from storage provider
    await storageService.delete(doc.storageKey);

    logAuthAuditEvent({
      event: 'DOCUMENT_DELETED',
      userId,
      organizationId,
      requestId,
      ip,
      outcome: 'SUCCESS',
      details: { documentId: doc._id.toString() },
    });
  }

  private async cleanupFileSilently(filePath: string): Promise<void> {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch {
      // Ignore silence cleanup errors
    }
  }
}

export const documentService = new DocumentService();
