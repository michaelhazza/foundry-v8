/**
 * Shared validation schemas
 */

import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().min(1),
});

export const projectIdParamSchema = z.object({
  projectId: z.coerce.number().int().min(1),
});

export const sourceIdParamSchema = z.object({
  sourceId: z.coerce.number().int().min(1),
});

export const datasetIdParamSchema = z.object({
  datasetId: z.coerce.number().int().min(1),
});

export const jobIdParamSchema = z.object({
  jobId: z.coerce.number().int().min(1),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
