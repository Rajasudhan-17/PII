import { Router } from 'express';
import { riskController } from '../controllers/risk.controller';
import { authenticate } from '../middleware/authenticate';
import { tenantContextMiddleware } from '../middleware/tenantContext';
import { requireTenantRole } from '../middleware/authorizeTenant';
import { requirePermission } from '../middleware/authorize';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(tenantContextMiddleware);

/**
 * POST /api/v1/organizations/:organizationId/documents/:documentId/risk-analysis
 * Triggers re-identification risk evaluation on document.
 */
router.post(
  '/',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('RISK_EXECUTE'),
  riskController.executeRiskAnalysis
);

/**
 * GET /api/v1/organizations/:organizationId/documents/:documentId/risk-analysis/runs
 * Lists risk evaluation run history for document.
 */
router.get(
  '/runs',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('RISK_READ'),
  riskController.getRiskRuns
);

/**
 * GET /api/v1/organizations/:organizationId/documents/:documentId/risk-analysis/results
 * Queries active risk evaluation run and detailed risk result signals.
 */
router.get(
  '/results',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('RISK_READ'),
  riskController.getRiskResults
);

export default router;
