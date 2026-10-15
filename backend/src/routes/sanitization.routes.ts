import { Router } from 'express';
import { sanitizationController } from '../controllers/sanitization.controller';
import { authenticate } from '../middleware/authenticate';
import { tenantContextMiddleware } from '../middleware/tenantContext';
import { requireTenantRole } from '../middleware/authorizeTenant';
import { requirePermission } from '../middleware/authorize';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(tenantContextMiddleware);

/**
 * POST /api/v1/organizations/:organizationId/documents/:documentId/sanitization
 * Triggers document metadata & hidden-data sanitization.
 */
router.post(
  '/',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('SANITY_EXECUTE'),
  sanitizationController.executeSanitization
);

/**
 * GET /api/v1/organizations/:organizationId/documents/:documentId/sanitization/runs
 * Lists metadata sanitization run history for document.
 */
router.get(
  '/runs',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('SANITY_READ'),
  sanitizationController.getSanitizationRuns
);

/**
 * GET /api/v1/organizations/:organizationId/documents/:documentId/sanitization/results
 * Queries active sanitized output artifact and detailed sanitization records.
 */
router.get(
  '/results',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('SANITY_READ'),
  sanitizationController.getSanitizationResults
);

export default router;
