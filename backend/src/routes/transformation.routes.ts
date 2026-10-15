import { Router } from 'express';
import { transformationController } from '../controllers/transformation.controller';
import { authenticate } from '../middleware/authenticate';
import { tenantContextMiddleware } from '../middleware/tenantContext';
import { requireTenantRole } from '../middleware/authorizeTenant';
import { requirePermission } from '../middleware/authorize';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(tenantContextMiddleware);

/**
 * POST /api/v1/organizations/:organizationId/documents/:documentId/transformations
 * Triggers physical document redaction or intelligent mutation.
 */
router.post(
  '/',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('TRANSFORMATION_EXECUTE'),
  transformationController.executeTransformation
);

/**
 * GET /api/v1/organizations/:organizationId/documents/:documentId/transformations
 * Lists transformation run history for document.
 */
router.get(
  '/',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('TRANSFORMATION_READ'),
  transformationController.getTransformationRuns
);

/**
 * GET /api/v1/organizations/:organizationId/documents/:documentId/transformations/artifacts
 * Queries active transformed output artifact and records.
 */
router.get(
  '/artifacts',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('TRANSFORMATION_READ'),
  transformationController.getTransformationArtifacts
);

/**
 * GET /api/v1/organizations/:organizationId/documents/:documentId/transformations/download
 * Downloads the active physically transformed/redacted output artifact.
 */
router.get(
  '/download',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('DOCUMENT_DOWNLOAD'),
  transformationController.downloadTransformedArtifact
);

router.get(
  '/artifacts/download',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('DOCUMENT_DOWNLOAD'),
  transformationController.downloadTransformedArtifact
);

export default router;
