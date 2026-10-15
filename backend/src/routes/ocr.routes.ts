import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { tenantContextMiddleware } from '../middleware/tenantContext';
import { requireTenantRole } from '../middleware/authorizeTenant';
import { requirePermission } from '../middleware/authorize';
import { ocrController } from '../controllers/ocr.controller';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(tenantContextMiddleware);

// POST /api/v1/organizations/:organizationId/documents/:documentId/ocr
router.post(
  '/ocr',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('DOCUMENT_READ'),
  ocrController.triggerOCR
);

// GET /api/v1/organizations/:organizationId/documents/:documentId/ocr
router.get(
  '/ocr',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('DOCUMENT_READ'),
  ocrController.getOCRStatus
);

export const ocrRouter = router;
