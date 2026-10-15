import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, isTokenRevoked } from '../services/token.service';
import { AppError } from '../utils/AppError';
import { logAuthAuditEvent } from '../services/audit.service';
import { User } from '../models/user.model';

export const authenticate = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      throw new AppError('Authentication token missing.', 401, 'AUTHENTICATION_REQUIRED');
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      logAuthAuditEvent({
        event: 'AUTH_ACCESS_DENIED',
        requestId: req.id,
        ip: req.ip,
        outcome: 'DENIED',
        reason: 'INVALID_OR_EXPIRED_JWT',
      });
      throw new AppError('Invalid or expired authentication token.', 401, 'INVALID_TOKEN');
    }

    // Check Redis token revocation flag
    const revoked = await isTokenRevoked(payload.userId);
    if (revoked) {
      logAuthAuditEvent({
        event: 'AUTH_ACCESS_DENIED',
        userId: payload.userId,
        requestId: req.id,
        ip: req.ip,
        outcome: 'DENIED',
        reason: 'TOKEN_REVOKED',
      });
      throw new AppError('Authentication session has been revoked. Please log in again.', 401, 'TOKEN_REVOKED');
    }

    // Verify user exists and is active
    const user = await User.findById(payload.userId);
    if (!user || user.status !== 'ACTIVE') {
      logAuthAuditEvent({
        event: 'AUTH_ACCESS_DENIED',
        userId: payload.userId,
        requestId: req.id,
        ip: req.ip,
        outcome: 'DENIED',
        reason: user ? `USER_STATUS_${user.status}` : 'USER_NOT_FOUND',
      });
      throw new AppError('User account is inactive or no longer exists.', 401, 'ACCOUNT_INACTIVE');
    }

    // Attach authenticated context to request
    req.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      status: user.status,
    };

    next();
  } catch (err) {
    next(err);
  }
};
