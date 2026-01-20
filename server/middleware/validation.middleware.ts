/**
 * Validation middleware
 *
 * Zod schema validation for request bodies
 *
 * @see Architecture Section 6.4
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../errors';

/**
 * Create validation middleware for a Zod schema
 * Validates request body and transforms it according to schema
 */
export function validateRequest<T>(schema: ZodSchema<T>) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated = await schema.parseAsync(req.body);
      req.body = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(
          new ValidationError('Invalid input data', {
            issues: error.errors.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
              code: issue.code,
            })),
          })
        );
      } else {
        next(error);
      }
    }
  };
}

/**
 * Validate query parameters
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated = await schema.parseAsync(req.query);
      req.query = validated as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(
          new ValidationError('Invalid query parameters', {
            issues: error.errors.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
              code: issue.code,
            })),
          })
        );
      } else {
        next(error);
      }
    }
  };
}

/**
 * Validate route parameters
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated = await schema.parseAsync(req.params);
      req.params = validated as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(
          new ValidationError('Invalid route parameters', {
            issues: error.errors.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
              code: issue.code,
            })),
          })
        );
      } else {
        next(error);
      }
    }
  };
}
