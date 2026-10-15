import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { tenantContextMiddleware } from '../middleware/tenantContext';
import { requireTenantRole } from '../middleware/authorizeTenant';
import { requirePermission } from '../middleware/authorize';
import { contextController } from '../controllers/context.controller';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(tenantContextMiddleware);

// POST /api/v1/organizations/:organizationId/documents/:documentId/context-analysis
router.post(
  '/context-analysis',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('DOCUMENT_READ'),
  contextController.triggerContextAnalysis
);

// GET /api/v1/organizations/:organizationId/documents/:documentId/context-analysis/runs
router.get(
  '/context-analysis/runs',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('DOCUMENT_READ'),
  contextController.getContextRuns
);

// GET /api/v1/organizations/:organizationId/documents/:documentId/context-analysis/runs/:runId
router.get(
  '/context-analysis/runs/:runId',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('DOCUMENT_READ'),
  contextController.getContextRunById
);

// GET /api/v1/organizations/:organizationId/documents/:documentId/context-analysis/results
router.get(
  '/context-analysis/results',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('DOCUMENT_READ'),
  contextController.getContextResults
);

// GET /api/v1/organizations/:organizationId/documents/:documentId/context-analysis/summary
router.get(
  '/context-analysis/summary',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('DOCUMENT_READ'),
  contextController.getContextSummary
);

export const contextRouter = router;
