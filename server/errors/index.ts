/**
 * MANDATORY FILE: Error class hierarchy
 *
 * Purpose: Provides proper error classes that map to correct HTTP status codes.
 * Without this hierarchy, all errors default to 500 Internal Server Error instead
 * of appropriate 4xx codes, making debugging impossible and breaking API contracts.
 *
 * @see Constitution Section C - Error Handling
 * @see API Contract Section 3 - Error Codes Registry
 */

/**
 * Base application error class
 * All custom errors should extend this class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    details?: any
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);

    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this);
  }
}

/**
 * 400 Bad Request - Invalid input data
 */
export class BadRequestError extends AppError {
  constructor(message: string = 'Invalid request', details?: any) {
    super(message, 400, 'BAD_REQUEST', true, details);
  }
}

/**
 * 400 Validation Error - Zod validation failure
 */
export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', details?: any) {
    super(message, 400, 'VALIDATION_ERROR', true, details);
  }
}

/**
 * 401 Unauthorized - Missing or invalid authentication
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED', true);
  }
}

/**
 * 401 Invalid Credentials - Wrong email/password
 */
export class InvalidCredentialsError extends AppError {
  constructor(message: string = 'Invalid email or password') {
    super(message, 401, 'INVALID_CREDENTIALS', true);
  }
}

/**
 * 401 Token Expired
 */
export class TokenExpiredError extends AppError {
  constructor(message: string = 'Token has expired') {
    super(message, 401, 'TOKEN_EXPIRED', true);
  }
}

/**
 * 403 Forbidden - User lacks permission
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Access forbidden') {
    super(message, 403, 'FORBIDDEN', true);
  }
}

/**
 * 404 Not Found - Resource doesn't exist
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND', true);
  }
}

/**
 * 409 Conflict - Duplicate resource
 */
export class ConflictError extends AppError {
  constructor(message: string = 'Resource already exists', code: string = 'CONFLICT') {
    super(message, 409, code, true);
  }
}

/**
 * 409 Duplicate Email
 */
export class DuplicateEmailError extends ConflictError {
  constructor(message: string = 'Email address already registered') {
    super(message, 'DUPLICATE_EMAIL');
  }
}

/**
 * 410 Gone - Resource permanently deleted or token expired
 */
export class GoneError extends AppError {
  constructor(message: string = 'Resource no longer available', code: string = 'GONE') {
    super(message, 410, code, true);
  }
}

/**
 * 422 Unprocessable Entity - Business rule violation
 */
export class UnprocessableError extends AppError {
  constructor(message: string = 'Cannot process request', details?: any) {
    super(message, 422, 'UNPROCESSABLE_ENTITY', true, details);
  }
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export class RateLimitError extends AppError {
  constructor(retryAfter: number) {
    super(
      'Too many requests. Please try again later.',
      429,
      'RATE_LIMIT_EXCEEDED',
      true,
      { retryAfter }
    );
  }
}

/**
 * 500 Internal Server Error
 */
export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error') {
    super(message, 500, 'INTERNAL_ERROR', false);
  }
}

/**
 * 503 Service Unavailable - External dependency failure
 */
export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE', true);
  }
}
