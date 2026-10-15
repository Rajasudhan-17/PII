import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const incomingId = req.header('x-request-id');
  
  // Basic validation check for standard uuid format string
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const requestId = incomingId && uuidRegex.test(incomingId) ? incomingId : randomUUID();
  
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  next();
};
