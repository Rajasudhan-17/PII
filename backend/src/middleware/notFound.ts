import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';

export const notFoundMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  next(AppError.notFound(`Cannot ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));
};
