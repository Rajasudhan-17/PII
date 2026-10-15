import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { tenantContextMiddleware } from '../middleware/tenantContext';
import { requireTenantRole } from '../middleware/authorizeTenant';
import { requirePermission } from '../middleware/authorize';
import { piiController } from '../controllers/pii.controller';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(tenantContextMiddleware);

// POST /api/v1/organizations/:organizationId/documents/:documentId/pii-detection
router.post(
  '/pii-detection',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('DOCUMENT_READ'),
  piiController.triggerPIIDetection
);

// GET /api/v1/organizations/:organizationId/documents/:documentId/pii-detection/runs
router.get(
  '/pii-detection/runs',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('DOCUMENT_READ'),
  piiController.getDetectionRuns
);

// GET /api/v1/organizations/:organizationId/documents/:documentId/pii-detection/runs/:runId
router.get(
  '/pii-detection/runs/:runId',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('DOCUMENT_READ'),
  piiController.getDetectionRunById
);

// GET /api/v1/organizations/:organizationId/documents/:documentId/pii-detection/summary
router.get(
  '/pii-detection/summary',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('DOCUMENT_READ'),
  piiController.getDetectionSummary
);

// GET /api/v1/organizations/:organizationId/documents/:documentId/pii-detection
router.get(
  '/pii-detection',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('DOCUMENT_READ'),
  piiController.getCandidates
);

export const piiRouter = router;
