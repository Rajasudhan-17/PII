import { Request, Response, NextFunction } from 'express';
import {
  createOrganization,
  listUserOrganizations,
  getOrganizationById,
} from '../services/organization.service';
import {
  addOrganizationMember,
  listOrganizationMembers,
  updateMemberRoleOrStatus,
  removeOrganizationMember,
} from '../services/membership.service';
import { AppError } from '../utils/AppError';

export const createOrgController = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required.', 401, 'AUTHENTICATION_REQUIRED');
    }

    const { name } = req.body;
    const org = await createOrganization(name, req.user.id, req.id, req.ip);
    res.status(201).json({ organization: org });
  } catch (err) {
    next(err);
  }
};

export const listOrgsController = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required.', 401, 'AUTHENTICATION_REQUIRED');
    }

    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    const orgs = await listUserOrganizations(req.user.id, isSuperAdmin);
    res.status(200).json({ organizations: orgs });
  } catch (err) {
    next(err);
  }
};

export const getOrgByIdController = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantContext) {
      throw new AppError('Tenant context required.', 400, 'TENANT_CONTEXT_REQUIRED');
    }

    const org = await getOrganizationById(req.tenantContext.organizationId);
    res.status(200).json({ organization: org });
  } catch (err) {
    next(err);
  }
};

export const addMemberController = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantContext || !req.user) {
      throw new AppError('Tenant context required.', 400, 'TENANT_CONTEXT_REQUIRED');
    }

    const { email, role = 'MEMBER' } = req.body;
    const membership = await addOrganizationMember(
      req.tenantContext.organizationId,
      email,
      role,
      req.user.id,
      req.id,
      req.ip
    );

    res.status(201).json({ membership });
  } catch (err) {
    next(err);
  }
};

export const listMembersController = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantContext) {
      throw new AppError('Tenant context required.', 400, 'TENANT_CONTEXT_REQUIRED');
    }

    const members = await listOrganizationMembers(req.tenantContext.organizationId);
    res.status(200).json({ members });
  } catch (err) {
    next(err);
  }
};

export const updateMemberController = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantContext || !req.user) {
      throw new AppError('Tenant context required.', 400, 'TENANT_CONTEXT_REQUIRED');
    }

    const { targetUserId } = req.params;
    const { role, status } = req.body;

    const membership = await updateMemberRoleOrStatus(
      req.tenantContext.organizationId,
      targetUserId,
      role,
      status,
      req.user.id,
      req.id,
      req.ip
    );

    res.status(200).json({ membership });
  } catch (err) {
    next(err);
  }
};

export const removeMemberController = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantContext || !req.user) {
      throw new AppError('Tenant context required.', 400, 'TENANT_CONTEXT_REQUIRED');
    }

    const { targetUserId } = req.params;
    const membership = await removeOrganizationMember(
      req.tenantContext.organizationId,
      targetUserId,
      req.user.id,
      req.id,
      req.ip
    );

    res.status(200).json({ membership, message: 'Member successfully removed.' });
  } catch (err) {
    next(err);
  }
};
