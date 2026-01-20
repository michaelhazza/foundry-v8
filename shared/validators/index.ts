/**
 * Shared validation schemas between client and server
 */

import { z } from 'zod';

// Auth
export const emailSchema = z.string().email('Invalid email address');
export const passwordSchema = z.string().min(8, 'Password must be at least 8 characters');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1, 'Name is required'),
  inviteToken: z.string().optional(),
});

// Projects
export const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
});

// Sources
export const createSourceSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['file', 'teamwork_desk', 'api']),
  fileData: z.string().optional(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
});

// Configuration
export const targetSchemaFieldSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  required: z.boolean().optional(),
});

export const targetSchemaSchema = z.object({
  name: z.string().min(1),
  fields: z.array(targetSchemaFieldSchema),
});

export const deidentificationRuleSchema = z.object({
  field: z.string().min(1),
  action: z.enum(['redact', 'tokenize', 'hash', 'mask', 'remove']),
  pattern: z.string().nullable().optional(),
});

export const sourceConfigurationSchema = z.object({
  targetSchema: targetSchemaSchema,
  fieldMappings: z.record(z.string()),
  deidentificationRules: z.array(deidentificationRuleSchema),
});

// Pagination
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// Types from schemas
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateSourceInput = z.infer<typeof createSourceSchema>;
export type SourceConfigurationInput = z.infer<typeof sourceConfigurationSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
