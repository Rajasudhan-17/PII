import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { getConfig } from '../config/env';

// Express error handler middleware (must accept 4 arguments)
export const errorHandlerMiddleware: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const requestId = req.id || 'unknown';
  let statusCode = 500;
  let errorCode = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred.';
  let details: unknown = undefined;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorCode = err.errorCode;
    message = err.message;
    details = err.details;
  } else if (err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400 && 'body' in err) {
    // Malformed JSON payload request error
    statusCode = 400;
    errorCode = 'MALFORMED_JSON';
    message = 'Invalid JSON payload received.';
  } else if ('type' in err && (err as { type?: string }).type === 'entity.too.large') {
    statusCode = 413;
    errorCode = 'PAYLOAD_TOO_LARGE';
    message = 'Request payload exceeds maximum allowed size.';
  }

  // Structured operational log without printing secrets or raw PII
  if (statusCode >= 500) {
    logger.error({
      event: 'api_error',
      requestId,
      statusCode,
      errorCode,
      errorName: err.name,
      errorMessage: err.message,
      stack: getConfig().NODE_ENV === 'development' ? err.stack : undefined,
    }, `API Error [${errorCode}]: ${message}`);
  } else {
    logger.warn({
      event: 'api_warning',
      requestId,
      statusCode,
      errorCode,
      errorName: err.name,
      errorMessage: err.message,
    }, `API Client Warning [${errorCode}]: ${message}`);
  }

  const responseBody = {
    error: {
      code: errorCode,
      message,
      requestId,
      ...(details ? { details } : {}),
      ...(getConfig().NODE_ENV === 'development' && !(err instanceof AppError) ? { stack: err.stack } : {}),
    },
  };

  res.status(statusCode).json(responseBody);
};
