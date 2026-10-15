import { Router } from 'express';
import {
  createOrgController,
  listOrgsController,
  getOrgByIdController,
  addMemberController,
  listMembersController,
  updateMemberController,
  removeMemberController,
} from '../controllers/organization.controller';
import { authenticate } from '../middleware/authenticate';
import { tenantContextMiddleware } from '../middleware/tenantContext';
import { requireTenantRole } from '../middleware/authorizeTenant';

const router = Router();

// Platform Organization Management
router.post('/', authenticate, createOrgController);
router.get('/', authenticate, listOrgsController);

// Tenant-Scoped Organization Management
router.get('/:organizationId', authenticate, tenantContextMiddleware, getOrgByIdController);

// Tenant Membership Management
router.post(
  '/:organizationId/members',
  authenticate,
  tenantContextMiddleware,
  requireTenantRole('ORG_ADMIN'),
  addMemberController
);

router.get(
  '/:organizationId/members',
  authenticate,
  tenantContextMiddleware,
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST'),
  listMembersController
);

router.patch(
  '/:organizationId/members/:targetUserId',
  authenticate,
  tenantContextMiddleware,
  requireTenantRole('ORG_ADMIN'),
  updateMemberController
);

router.delete(
  '/:organizationId/members/:targetUserId',
  authenticate,
  tenantContextMiddleware,
  requireTenantRole('ORG_ADMIN'),
  removeMemberController
);

export default router;
