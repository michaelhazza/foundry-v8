/**
 * Source validation schemas
 */

import { z } from 'zod';

export const createSourceSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['file', 'teamwork_desk', 'api']),
  fileData: z.string().optional(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
});

export const updateConfigurationSchema = z.object({
  targetSchema: z.object({
    name: z.string(),
    fields: z.array(z.object({
      name: z.string(),
      type: z.string(),
      required: z.boolean().optional(),
    })),
  }),
  fieldMappings: z.record(z.string()),
  deidentificationRules: z.array(z.object({
    field: z.string(),
    action: z.enum(['redact', 'tokenize', 'hash', 'mask', 'remove']),
    pattern: z.string().nullable().optional(),
  })),
});

export type CreateSourceInput = z.infer<typeof createSourceSchema>;
export type UpdateConfigurationInput = z.infer<typeof updateConfigurationSchema>;
