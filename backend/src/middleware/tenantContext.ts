import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Organization } from '../models/organization.model';
import { OrganizationMembership } from '../models/membership.model';
import { AppError } from '../utils/AppError';
import { logAuthAuditEvent } from '../services/audit.service';

export const tenantContextMiddleware = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required to access tenant resources.', 401, 'AUTHENTICATION_REQUIRED');
    }

    // Resolve requested organization ID from route parameters or HTTP header
    const organizationIdStr = req.params.organizationId || (req.headers['x-organization-id'] as string);

    if (!organizationIdStr) {
      // Endpoint is not tenant-scoped or org ID not provided
      return next();
    }

    if (!mongoose.Types.ObjectId.isValid(organizationIdStr)) {
      logAuthAuditEvent({
        event: 'TENANT_ACCESS_DENIED',
        userId: req.user.id,
        requestId: req.id,
        ip: req.ip,
        outcome: 'DENIED',
        reason: 'INVALID_ORGANIZATION_ID_FORMAT',
      });
      // 404 to prevent tenant ID enumeration
      throw new AppError('Organization not found.', 404, 'ORGANIZATION_NOT_FOUND');
    }

    const orgObjectId = new mongoose.Types.ObjectId(organizationIdStr);

    // Query Organization
    const organization = await Organization.findById(orgObjectId);
    if (!organization) {
      logAuthAuditEvent({
        event: 'TENANT_ACCESS_DENIED',
        userId: req.user.id,
        organizationId: organizationIdStr,
        requestId: req.id,
        ip: req.ip,
        outcome: 'DENIED',
        reason: 'ORGANIZATION_NOT_FOUND',
      });
      throw new AppError('Organization not found.', 404, 'ORGANIZATION_NOT_FOUND');
    }

    // Check Organization Status
    if (organization.status !== 'ACTIVE' && req.user.role !== 'SUPER_ADMIN') {
      logAuthAuditEvent({
        event: 'TENANT_ACCESS_DENIED',
        userId: req.user.id,
        organizationId: organizationIdStr,
        requestId: req.id,
        ip: req.ip,
        outcome: 'DENIED',
        reason: `ORGANIZATION_STATUS_${organization.status}`,
      });
      throw new AppError(
        `Organization is currently ${organization.status.toLowerCase()}. Access denied.`,
        403,
        'ORGANIZATION_INACTIVE'
      );
    }

    // Query User's Membership in Organization
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);
    const membership = await OrganizationMembership.findOne({
      userId: userObjectId,
      organizationId: orgObjectId,
    });

    // Handle SUPER_ADMIN platform elevation
    if (!membership && req.user.role === 'SUPER_ADMIN') {
      req.tenantContext = {
        organizationId: organization._id.toString(),
        organizationName: organization.name,
        organizationStatus: organization.status,
        membershipId: 'super_admin_virtual_membership',
        tenantRole: 'ORG_ADMIN',
        membershipStatus: 'ACTIVE',
      };
      return next();
    }

    if (!membership || membership.status === 'REMOVED' || membership.status === 'SUSPENDED') {
      const reason = !membership
        ? 'NO_MEMBERSHIP_RECORD'
        : `MEMBERSHIP_STATUS_${membership.status}`;

      logAuthAuditEvent({
        event: 'TENANT_ACCESS_DENIED',
        userId: req.user.id,
        organizationId: organizationIdStr,
        requestId: req.id,
        ip: req.ip,
        outcome: 'DENIED',
        reason,
      });

      // 404 to prevent tenant membership enumeration
      throw new AppError('Organization not found or access denied.', 404, 'ORGANIZATION_NOT_FOUND');
    }

    // Attach verified server-side tenant context to request
    req.tenantContext = {
      organizationId: organization._id.toString(),
      organizationName: organization.name,
      organizationStatus: organization.status,
      membershipId: membership._id.toString(),
      tenantRole: membership.tenantRole,
      membershipStatus: membership.status,
    };

    next();
  } catch (err) {
    next(err);
  }
};
