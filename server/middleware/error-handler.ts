/**
 * MANDATORY FILE: Global error handler middleware
 *
 * Purpose: Catches all unhandled errors and transforms them into proper HTTP responses.
 * Without this middleware, unhandled exceptions crash the server or return HTML error pages.
 *
 * @see Constitution Section C - Error Handling
 * @see API Contract Section 2.3 - Error Envelope
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors';

/**
 * Error response structure matching API Contract
 */
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

/**
 * Global error handling middleware
 * Must be registered AFTER all routes
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log error for debugging (but don't expose internals to client)
  if (process.env.NODE_ENV !== 'production') {
    console.error('Error caught by error handler:', err);
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const response: ErrorResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        details: {
          issues: err.errors.map((issue) => ({
            path: issue.path,
            message: issue.message,
            code: issue.code,
          })),
        },
      },
    };

    res.status(400).json(response);
    return;
  }

  // Handle AppError and subclasses
  if (err instanceof AppError) {
    const response: ErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
      },
    };

    if (err.details) {
      response.error.details = err.details;
    }

    res.status(err.statusCode).json(response);
    return;
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    const response: ErrorResponse = {
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid authentication token',
      },
    };

    res.status(401).json(response);
    return;
  }

  if (err.name === 'TokenExpiredError') {
    const response: ErrorResponse = {
      error: {
        code: 'TOKEN_EXPIRED',
        message: 'Authentication token has expired',
      },
    };

    res.status(401).json(response);
    return;
  }

  // Handle database errors (don't expose internals)
  if (err.message.includes('duplicate key') || err.message.includes('unique constraint')) {
    const response: ErrorResponse = {
      error: {
        code: 'CONFLICT',
        message: 'Resource already exists',
      },
    };

    res.status(409).json(response);
    return;
  }

  // Fallback: Unknown errors become 500 Internal Server Error
  // Don't expose error details in production
  const response: ErrorResponse = {
    error: {
      code: 'INTERNAL_ERROR',
      message:
        process.env.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : err.message,
    },
  };

  // Log the full error for debugging
  console.error('Unhandled error:', err);

  res.status(500).json(response);
}

/**
 * 404 handler for undefined routes
 * Should be registered AFTER all defined routes but BEFORE error handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  const response: ErrorResponse = {
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  };

  res.status(404).json(response);
}
