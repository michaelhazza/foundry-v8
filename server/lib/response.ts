/**
 * MANDATORY FILE: Response envelope helpers
 *
 * Purpose: Ensures consistent API responses with proper "data" envelope and "meta" field.
 * Without these helpers, developers may return raw data objects, breaking frontend contracts.
 *
 * @see Constitution Section C - Response Envelopes
 * @see API Contract Section 2.3 - Response Conventions
 */

import { Response } from 'express';

/**
 * Standard success response envelope
 */
interface ApiResponse<T> {
  data: T;
  meta?: Record<string, any>;
}

/**
 * Pagination metadata
 */
interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Send a successful response with data envelope
 * @param res Express response object
 * @param data Response payload
 * @param statusCode HTTP status code (default: 200)
 * @param meta Optional metadata (pagination, etc.)
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode: number = 200,
  meta?: Record<string, any>
): void {
  const response: ApiResponse<T> = { data };

  if (meta) {
    response.meta = meta;
  }

  res.status(statusCode).json(response);
}

/**
 * Send a paginated response
 * @param res Express response object
 * @param data Array of items
 * @param pagination Pagination details
 * @param statusCode HTTP status code (default: 200)
 */
export function sendPaginated<T>(
  res: Response,
  data: T[],
  pagination: PaginationMeta,
  statusCode: number = 200
): void {
  res.status(statusCode).json({
    data,
    pagination,
  });
}

/**
 * Send a created response (201)
 * @param res Express response object
 * @param data Created resource
 */
export function sendCreated<T>(res: Response, data: T): void {
  sendSuccess(res, data, 201);
}

/**
 * Send a no content response (204)
 * @param res Express response object
 */
export function sendNoContent(res: Response): void {
  res.status(204).send();
}

/**
 * Calculate pagination metadata
 * @param page Current page number (1-indexed)
 * @param pageSize Items per page
 * @param total Total number of items
 * @returns Pagination metadata object
 */
export function calculatePagination(
  page: number,
  pageSize: number,
  total: number
): PaginationMeta {
  const totalPages = Math.ceil(total / pageSize);

  return {
    page,
    pageSize,
    total,
    totalPages,
  };
}
