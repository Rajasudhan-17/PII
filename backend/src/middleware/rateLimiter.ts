import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';

const createRateLimiter = (maxRequests: number, windowMs: number, message: string) => {
  return rateLimit({
    windowMs,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, _res: Response, next: NextFunction) => {
      next(new AppError(message, 429, 'TOO_MANY_REQUESTS'));
    },
  });
};

export const registerLimiter = createRateLimiter(
  10,
  15 * 60 * 1000,
  'Too many registration attempts from this IP. Please try again later.'
);

export const loginLimiter = createRateLimiter(
  15,
  15 * 60 * 1000,
  'Too many login attempts from this IP. Please try again later.'
);

export const refreshLimiter = createRateLimiter(
  30,
  15 * 60 * 1000,
  'Too many token refresh attempts from this IP. Please try again later.'
);

export const uploadLimiter = createRateLimiter(
  20,
  15 * 60 * 1000,
  'Too many document upload attempts. Please try again later.'
);
