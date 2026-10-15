import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { tenantContextMiddleware } from '../middleware/tenantContext';
import { requireTenantRole } from '../middleware/authorizeTenant';
import { requirePermission } from '../middleware/authorize';
import { policyController } from '../controllers/policy.controller';

const orgPolicyRouter = Router({ mergeParams: true });

orgPolicyRouter.use(authenticate);
orgPolicyRouter.use(tenantContextMiddleware);

// POST /api/v1/organizations/:organizationId/policies
orgPolicyRouter.post(
  '/',
  requireTenantRole('ORG_ADMIN'),
  requirePermission('POLICY_MANAGE'),
  policyController.createPolicy
);

// GET /api/v1/organizations/:organizationId/policies
orgPolicyRouter.get(
  '/',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('POLICY_READ'),
  policyController.getPolicies
);

// GET /api/v1/organizations/:organizationId/policies/:policyId
orgPolicyRouter.get(
  '/:policyId',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('POLICY_READ'),
  policyController.getPolicyById
);

// POST /api/v1/organizations/:organizationId/policies/:policyId/versions
orgPolicyRouter.post(
  '/:policyId/versions',
  requireTenantRole('ORG_ADMIN'),
  requirePermission('POLICY_MANAGE'),
  policyController.createPolicyVersion
);

const docDecisionRouter = Router({ mergeParams: true });

docDecisionRouter.use(authenticate);
docDecisionRouter.use(tenantContextMiddleware);

// POST /api/v1/organizations/:organizationId/documents/:documentId/decision-evaluation
docDecisionRouter.post(
  '/decision-evaluation',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('DECISION_EXECUTE'),
  policyController.triggerDecisionEvaluation
);

// GET /api/v1/organizations/:organizationId/documents/:documentId/decision-runs
docDecisionRouter.get(
  '/decision-runs',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('DECISION_READ'),
  policyController.getDecisionRuns
);

// GET /api/v1/organizations/:organizationId/documents/:documentId/decisions
docDecisionRouter.get(
  '/decisions',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('DECISION_READ'),
  policyController.getDecisionResults
);

export { orgPolicyRouter, docDecisionRouter };
