import { Request, Response, NextFunction } from 'express';
import { TenantRole } from '../types';
import { AppError } from '../utils/AppError';
import { logAuthAuditEvent } from '../services/audit.service';

export const requireTenantRole = (...allowedRoles: TenantRole[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.tenantContext) {
      return next(new AppError('Tenant context required for this resource.', 400, 'TENANT_CONTEXT_REQUIRED'));
    }

    const { tenantRole, organizationId } = req.tenantContext;
    const isSuperAdmin = req.user?.role === 'SUPER_ADMIN';

    if (!allowedRoles.includes(tenantRole) && !isSuperAdmin) {
      logAuthAuditEvent({
        event: 'TENANT_ACCESS_DENIED',
        userId: req.user?.id,
        organizationId,
        requestId: req.id,
        ip: req.ip,
        outcome: 'DENIED',
        reason: `TENANT_ROLE_MISMATCH [Required: ${allowedRoles.join(',')}, Present: ${tenantRole}]`,
      });

      return next(
        new AppError(
          'You do not have the required tenant role privileges in this organization.',
          403,
          'INSUFFICIENT_TENANT_ROLE'
        )
      );
    }

    next();
  };
};
