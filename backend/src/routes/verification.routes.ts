import { Router } from 'express';
import { verificationController } from '../controllers/verification.controller';
import { authenticate } from '../middleware/authenticate';
import { tenantContextMiddleware } from '../middleware/tenantContext';
import { requireTenantRole } from '../middleware/authorizeTenant';
import { requirePermission } from '../middleware/authorize';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(tenantContextMiddleware);

/**
 * POST /api/v1/organizations/:organizationId/documents/:documentId/verification
 * Triggers independent verification & quality assurance evaluation.
 */
router.post(
  '/',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('VERIFICATION_EXECUTE'),
  verificationController.executeVerification
);

/**
 * GET /api/v1/organizations/:organizationId/documents/:documentId/verification/runs
 * Lists verification run history for document.
 */
router.get(
  '/runs',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('VERIFICATION_READ'),
  verificationController.getVerificationRuns
);

/**
 * GET /api/v1/organizations/:organizationId/documents/:documentId/verification/results
 * Queries active verification run and detailed result findings.
 */
router.get(
  '/results',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('VERIFICATION_READ'),
  verificationController.getVerificationResults
);

export default router;
