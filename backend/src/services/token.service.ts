import jwt, { SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { getConfig } from '../config/env';
import { getRedisClient, isRedisConnected } from '../config/redis';
import { UserRole, UserStatus } from '../models/user.model';
import { logAuthAuditEvent } from './audit.service';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

export interface AccessTokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
  familyId: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days in seconds

export const generateAccessToken = (payload: AccessTokenPayload): string => {
  const config = getConfig();
  const options: SignOptions = {
    expiresIn: config.JWT_ACCESS_EXPIRES_IN as unknown as SignOptions['expiresIn'],
    issuer: 'pii-platform',
  };
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, options);
};

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  const config = getConfig();
  return jwt.verify(token, config.JWT_ACCESS_SECRET) as AccessTokenPayload;
};

export const generateRefreshToken = async (userId: string, familyId?: string): Promise<{ refreshToken: string; tokenId: string; familyId: string }> => {
  const config = getConfig();
  const tokenId = randomUUID();
  const finalFamilyId = familyId || randomUUID();

  const payload: RefreshTokenPayload = {
    userId,
    tokenId,
    familyId: finalFamilyId,
  };

  const options: SignOptions = {
    expiresIn: config.JWT_REFRESH_EXPIRES_IN as unknown as SignOptions['expiresIn'],
    issuer: 'pii-platform',
  };

  const refreshToken = jwt.sign(payload, config.JWT_REFRESH_SECRET, options);

  // Register in Redis if available
  if (isRedisConnected()) {
    try {
      const redis = getRedisClient();
      await redis.setex(
        `refresh_token:${tokenId}`,
        REFRESH_TOKEN_TTL_SECONDS,
        JSON.stringify({ userId, familyId: finalFamilyId })
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ event: 'redis_store_token_error', error: msg }, 'Failed to store refresh token in Redis');
    }
  }

  return { refreshToken, tokenId, familyId: finalFamilyId };
};

export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  const config = getConfig();
  return jwt.verify(token, config.JWT_REFRESH_SECRET) as RefreshTokenPayload;
};

export const isTokenRevoked = async (userId: string, tokenId?: string): Promise<boolean> => {
  if (!isRedisConnected()) return false;

  try {
    const redis = getRedisClient();
    
    // Check if user has global revocation flag
    const userRevocation = await redis.get(`user_revoked:${userId}`);
    if (userRevocation) {
      return true;
    }

    // Check specific refresh token key
    if (tokenId) {
      const activeToken = await redis.get(`refresh_token:${tokenId}`);
      if (!activeToken) {
        return true; // Token has been revoked or used
      }
    }

    return false;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ event: 'redis_check_token_error', error: msg }, 'Failed to check token revocation status in Redis');
    return false;
  }
};

export const revokeRefreshToken = async (tokenId: string): Promise<void> => {
  if (!isRedisConnected()) return;

  try {
    const redis = getRedisClient();
    await redis.del(`refresh_token:${tokenId}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ event: 'redis_revoke_token_error', error: msg }, 'Failed to revoke refresh token in Redis');
  }
};

export const revokeAllUserTokens = async (userId: string): Promise<void> => {
  if (!isRedisConnected()) return;

  try {
    const redis = getRedisClient();
    // Set user revocation marker for 7 days
    await redis.setex(`user_revoked:${userId}`, REFRESH_TOKEN_TTL_SECONDS, Date.now().toString());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ event: 'redis_revoke_user_tokens_error', error: msg }, 'Failed to revoke all user tokens in Redis');
  }
};

export const rotateRefreshToken = async (
  oldRefreshToken: string,
  userEmail: string,
  userRole: UserRole,
  userStatus: UserStatus,
  requestId?: string,
  ip?: string
): Promise<TokenPair> => {
  const payload = verifyRefreshToken(oldRefreshToken);
  const { userId, tokenId, familyId } = payload;

  // Check if token has been revoked or already used (reuse detection)
  if (isRedisConnected()) {
    const redis = getRedisClient();
    const activeToken = await redis.get(`refresh_token:${tokenId}`);
    
    if (!activeToken) {
      // REUSE DETECTED! Revoke entire token family for security
      await revokeAllUserTokens(userId);
      logAuthAuditEvent({
        event: 'AUTH_TOKEN_REUSE_DETECTED',
        userId,
        requestId,
        ip,
        outcome: 'DENIED',
        reason: 'Refresh token reuse or invalid token presented',
        details: { familyId, tokenId },
      });
      throw new AppError('Invalid or reused refresh token.', 401, 'INVALID_REFRESH_TOKEN');
    }

    // Delete old token as part of rotation
    await redis.del(`refresh_token:${tokenId}`);
  }

  // Issue new token pair preserving familyId
  const newAccessToken = generateAccessToken({ userId, email: userEmail, role: userRole, status: userStatus });
  const newRefreshTokenObj = await generateRefreshToken(userId, familyId);

  logAuthAuditEvent({
    event: 'AUTH_TOKEN_REFRESHED',
    userId,
    requestId,
    ip,
    outcome: 'SUCCESS',
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshTokenObj.refreshToken,
    expiresIn: getConfig().JWT_ACCESS_EXPIRES_IN,
  };
};
