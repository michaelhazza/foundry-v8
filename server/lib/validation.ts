/**
 * MANDATORY FILE: Validation helpers to prevent NaN database errors
 *
 * Purpose: 38+ routes use these helpers to safely parse integer IDs from params/query.
 * Without these, invalid IDs cause "NaN" to be passed to database queries, resulting
 * in cryptic errors instead of proper 400 Bad Request responses.
 *
 * @see API Contract Section 2.6 - Validation Rules
 */

import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../errors';

/**
 * Get first string from a value that may be string or string[]
 */
function getFirstString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

/**
 * Parse an integer from a path parameter
 * @throws BadRequestError if parameter is not a valid positive integer
 */
export function parseIntParam(param: string | string[] | undefined, paramName: string): number {
  const value = getFirstString(param);

  if (!value) {
    throw new BadRequestError(`${paramName} is required`);
  }

  const parsed = parseInt(value, 10);

  if (isNaN(parsed) || parsed < 1 || !Number.isInteger(parsed)) {
    throw new BadRequestError(`${paramName} must be a valid positive integer`);
  }

  return parsed;
}

/**
 * Parse an integer from a query parameter (optional)
 * @returns parsed integer or undefined if not provided/invalid
 */
export function parseQueryInt(
  value: string | string[] | undefined,
  defaultValue?: number
): number | undefined {
  const strValue = getFirstString(value);

  if (!strValue) {
    return defaultValue;
  }

  const parsed = parseInt(strValue, 10);

  if (isNaN(parsed) || parsed < 1) {
    return defaultValue;
  }

  return parsed;
}

/**
 * Parse pagination parameters from query string
 * @returns { page, pageSize } with sensible defaults
 */
export function parsePaginationParams(req: Request): {
  page: number;
  pageSize: number;
} {
  const page = parseQueryInt(req.query.page as string | string[] | undefined, 1) || 1;
  const pageSize = parseQueryInt(req.query.pageSize as string | string[] | undefined, 20) || 20;

  // Enforce maximum page size to prevent abuse
  const maxPageSize = 100;
  const limitedPageSize = Math.min(pageSize, maxPageSize);

  return {
    page: Math.max(1, page),
    pageSize: Math.max(1, limitedPageSize),
  };
}

/**
 * Middleware to validate and parse :projectId param
 * Attaches parsed integer to req.params.projectId
 */
export function validateProjectId(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const projectId = parseIntParam(req.params.projectId, 'projectId');
    // Store parsed value back into params
    (req.params as any).projectId = projectId;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware to validate and parse :sourceId param
 */
export function validateSourceId(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const sourceId = parseIntParam(req.params.sourceId, 'sourceId');
    (req.params as any).sourceId = sourceId;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware to validate and parse :datasetId param
 */
export function validateDatasetId(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const datasetId = parseIntParam(req.params.datasetId, 'datasetId');
    (req.params as any).datasetId = datasetId;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware to validate and parse :jobId param
 */
export function validateJobId(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const jobId = parseIntParam(req.params.jobId, 'jobId');
    (req.params as any).jobId = jobId;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware to validate and parse :userId param
 */
export function validateUserId(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const userId = parseIntParam(req.params.userId, 'userId');
    (req.params as any).userId = userId;
    next();
  } catch (error) {
    next(error);
  }
}
