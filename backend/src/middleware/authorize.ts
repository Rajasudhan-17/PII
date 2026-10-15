import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../models/user.model';
import { Permission, hasAllPermissions } from '../config/rbac';
import { AppError } from '../utils/AppError';
import { logAuthAuditEvent } from '../services/audit.service';

export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'AUTHENTICATION_REQUIRED'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      logAuthAuditEvent({
        event: 'AUTH_ACCESS_DENIED',
        userId: req.user.id,
        requestId: req.id,
        ip: req.ip,
        outcome: 'DENIED',
        reason: `ROLE_MISMATCH [Required: ${allowedRoles.join(',')}, User: ${req.user.role}]`,
      });

      return next(
        new AppError(
          'You do not have the required role privileges to access this resource.',
          403,
          'INSUFFICIENT_ROLE'
        )
      );
    }

    next();
  };
};

export const requirePermission = (...requiredPermissions: Permission[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'AUTHENTICATION_REQUIRED'));
    }

    const permitted = hasAllPermissions(req.user.role, requiredPermissions);

    if (!permitted) {
      logAuthAuditEvent({
        event: 'AUTH_ACCESS_DENIED',
        userId: req.user.id,
        requestId: req.id,
        ip: req.ip,
        outcome: 'DENIED',
        reason: `PERMISSION_MISMATCH [Required: ${requiredPermissions.join(',')}, Role: ${req.user.role}]`,
      });

      return next(
        new AppError(
          'You do not have the required permissions to perform this action.',
          403,
          'INSUFFICIENT_PERMISSIONS'
        )
      );
    }

    next();
  };
};
