export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    errorCode: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    details?: unknown
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = isOperational;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, errorCode: string = 'BAD_REQUEST', details?: unknown): AppError {
    return new AppError(message, 400, errorCode, true, details);
  }

  static unauthorized(message: string = 'Authentication required', errorCode: string = 'UNAUTHORIZED'): AppError {
    return new AppError(message, 401, errorCode, true);
  }

  static forbidden(message: string = 'Permission denied', errorCode: string = 'FORBIDDEN'): AppError {
    return new AppError(message, 403, errorCode, true);
  }

  static notFound(message: string = 'Requested resource not found', errorCode: string = 'NOT_FOUND'): AppError {
    return new AppError(message, 404, errorCode, true);
  }

  static conflict(message: string = 'Resource state conflict', errorCode: string = 'CONFLICT'): AppError {
    return new AppError(message, 409, errorCode, true);
  }

  static payloadTooLarge(message: string = 'Payload size exceeds limit', errorCode: string = 'PAYLOAD_TOO_LARGE'): AppError {
    return new AppError(message, 413, errorCode, true);
  }

  static internal(message: string = 'An unexpected error occurred.', errorCode: string = 'INTERNAL_ERROR'): AppError {
    return new AppError(message, 500, errorCode, false);
  }

  static serviceUnavailable(message: string = 'Service temporarily unavailable', errorCode: string = 'SERVICE_UNAVAILABLE'): AppError {
    return new AppError(message, 533, errorCode, true);
  }
}
