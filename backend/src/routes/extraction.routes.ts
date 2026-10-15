import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { tenantContextMiddleware } from '../middleware/tenantContext';
import { requireTenantRole } from '../middleware/authorizeTenant';
import { requirePermission } from '../middleware/authorize';
import { extractionController } from '../controllers/extraction.controller';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(tenantContextMiddleware);

// POST /api/v1/organizations/:organizationId/documents/:documentId/extract
router.post(
  '/extract',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('DOCUMENT_READ'),
  extractionController.triggerExtraction
);

// GET /api/v1/organizations/:organizationId/documents/:documentId/extraction
router.get(
  '/extraction',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('DOCUMENT_READ'),
  extractionController.getExtractionStatus
);

// GET /api/v1/organizations/:organizationId/documents/:documentId/extraction/content
router.get(
  '/extraction/content',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('DOCUMENT_READ'),
  extractionController.getNormalizedContent
);

export const extractionRouter = router;
