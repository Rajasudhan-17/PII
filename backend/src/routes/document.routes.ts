import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { tenantContextMiddleware } from '../middleware/tenantContext';
import { requireTenantRole } from '../middleware/authorizeTenant';
import { requirePermission } from '../middleware/authorize';
import { singleFileUploadMiddleware } from '../middleware/upload.middleware';
import { uploadLimiter } from '../middleware/rateLimiter';
import {
  uploadDocumentHandler,
  listDocumentsHandler,
  getDocumentMetadataHandler,
  downloadDocumentHandler,
  deleteDocumentHandler,
} from '../controllers/document.controller';

const router = Router({ mergeParams: true });

// Apply global authentication and tenant context resolution to all document routes
router.use(authenticate);
router.use(tenantContextMiddleware);

// Upload a document
router.post(
  '/',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'MEMBER'),
  requirePermission('DOCUMENT_UPLOAD'),
  uploadLimiter,
  singleFileUploadMiddleware,
  uploadDocumentHandler
);

// List organization documents
router.get(
  '/',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('DOCUMENT_READ'),
  listDocumentsHandler
);

// Get document metadata
router.get(
  '/:documentId',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('DOCUMENT_READ'),
  getDocumentMetadataHandler
);

// Stream download document
router.get(
  '/:documentId/download',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('DOCUMENT_DOWNLOAD'),
  downloadDocumentHandler
);

// Delete document
router.delete(
  '/:documentId',
  requireTenantRole('ORG_ADMIN'),
  requirePermission('DOCUMENT_DELETE'),
  deleteDocumentHandler
);

export default router;
