/**
 * Source routes
 *
 * GET /api/projects/:projectId/sources - List sources in project
 * POST /api/projects/:projectId/sources - Create source (upload file)
 * GET /api/sources/:sourceId - Get source details
 * PUT /api/sources/:sourceId/configuration - Update source configuration
 * DELETE /api/sources/:sourceId - Delete source
 *
 * @see API Contract Section 4.5
 */

import { Router } from 'express';
import { z } from 'zod';
import { eq, and, isNull, desc, count } from 'drizzle-orm';

import { db } from '../db';
import { sources, sourceFiles, sourceConfigurations, projects, users, processingJobs } from '../db/schema';
import { requireAuth, getAuthUser } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { uploadLimiter } from '../middleware/rate-limit.middleware';
import { parseIntParam, parsePaginationParams } from '../lib/validation';
import { sendSuccess, sendCreated, sendNoContent, sendPaginated, calculatePagination } from '../lib/response';
import { NotFoundError, ForbiddenError, BadRequestError } from '../errors';
import { config } from '../config';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// ============================================================================
// Validation Schemas
// ============================================================================

const createSourceSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['file', 'teamwork_desk', 'api']),
  fileData: z.string().optional(), // Base64 encoded
  filename: z.string().optional(),
  mimeType: z.string().optional(),
});

const updateConfigurationSchema = z.object({
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

// ============================================================================
// Helper Functions
// ============================================================================

async function verifyProjectAccess(
  projectId: number,
  userId: number
): Promise<void> {
  const [project] = await db
    .select()
    .from(projects)
    .innerJoin(users, eq(projects.userId, users.id))
    .where(
      and(
        eq(projects.id, projectId),
        isNull(projects.deletedAt)
      )
    )
    .limit(1);

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  const [currentUser] = await db
    .select({ organizationId: users.organizationId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const [projectUser] = await db
    .select({ organizationId: users.organizationId })
    .from(users)
    .where(eq(users.id, project.projects.userId))
    .limit(1);

  if (currentUser?.organizationId !== projectUser?.organizationId) {
    throw new ForbiddenError('Access denied');
  }
}

async function verifySourceAccess(
  sourceId: number,
  userId: number
): Promise<typeof sources.$inferSelect> {
  const [source] = await db
    .select()
    .from(sources)
    .innerJoin(projects, eq(sources.projectId, projects.id))
    .innerJoin(users, eq(projects.userId, users.id))
    .where(
      and(
        eq(sources.id, sourceId),
        isNull(sources.deletedAt)
      )
    )
    .limit(1);

  if (!source) {
    throw new NotFoundError('Source not found');
  }

  const [currentUser] = await db
    .select({ organizationId: users.organizationId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (currentUser?.organizationId !== source.users.organizationId) {
    throw new ForbiddenError('Access denied');
  }

  return source.sources;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/projects/:projectId/sources
 * List sources in project
 */
router.get('/projects/:projectId/sources', async (req, res, next) => {
  try {
    const user = getAuthUser(req);
    const projectId = parseIntParam(req.params.projectId, 'projectId');
    const { page, pageSize } = parsePaginationParams(req);

    await verifyProjectAccess(projectId, user.userId);

    // Get total count
    const [{ total }] = await db
      .select({ total: count() })
      .from(sources)
      .where(
        and(
          eq(sources.projectId, projectId),
          isNull(sources.deletedAt)
        )
      );

    // Get paginated sources
    const offset = (page - 1) * pageSize;
    const sourcesList = await db
      .select({
        id: sources.id,
        name: sources.name,
        type: sources.type,
        status: sources.status,
        metadata: sources.metadata,
        createdAt: sources.createdAt,
        updatedAt: sources.updatedAt,
      })
      .from(sources)
      .where(
        and(
          eq(sources.projectId, projectId),
          isNull(sources.deletedAt)
        )
      )
      .orderBy(desc(sources.createdAt))
      .limit(pageSize)
      .offset(offset);

    // Parse metadata JSON for each source
    const sourcesWithParsedMetadata = sourcesList.map((source) => ({
      ...source,
      metadata: source.metadata ? JSON.parse(source.metadata) : null,
    }));

    sendPaginated(res, sourcesWithParsedMetadata, calculatePagination(page, pageSize, total));
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/projects/:projectId/sources
 * Create a new source (file upload)
 */
router.post(
  '/projects/:projectId/sources',
  uploadLimiter,
  validateRequest(createSourceSchema),
  async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const projectId = parseIntParam(req.params.projectId, 'projectId');
      const { name, type, fileData, filename, mimeType } = req.body;

      await verifyProjectAccess(projectId, user.userId);

      // Validate file upload for file type
      if (type === 'file') {
        if (!fileData || !filename || !mimeType) {
          throw new BadRequestError('File data, filename, and mimeType are required for file sources');
        }

        // Calculate file size from base64
        const fileSize = Math.ceil((fileData.length * 3) / 4);
        const maxFileSize = config.maxFileSizeMb * 1024 * 1024;

        if (fileSize > maxFileSize) {
          throw new BadRequestError(`File size exceeds ${config.maxFileSizeMb}MB limit`);
        }
      }

      // Create source
      const [newSource] = await db
        .insert(sources)
        .values({
          projectId,
          name,
          type,
          status: 'pending',
          metadata: JSON.stringify({
            originalFilename: filename,
            mimeType,
          }),
        })
        .returning();

      // If file type, store file data
      if (type === 'file' && fileData) {
        const fileSize = Math.ceil((fileData.length * 3) / 4);

        await db.insert(sourceFiles).values({
          sourceId: newSource.id,
          filename: filename!,
          mimeType: mimeType!,
          fileSize,
          fileData,
        });
      }

      // Create default configuration
      await db.insert(sourceConfigurations).values({
        sourceId: newSource.id,
        targetSchema: JSON.stringify({ name: '', fields: [] }),
        fieldMappings: JSON.stringify({}),
        deidentificationRules: JSON.stringify([]),
      });

      sendCreated(res, {
        id: newSource.id,
        name: newSource.name,
        type: newSource.type,
        status: newSource.status,
        metadata: JSON.parse(newSource.metadata || '{}'),
        createdAt: newSource.createdAt,
        updatedAt: newSource.updatedAt,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/sources/:sourceId
 * Get source details
 */
router.get('/:sourceId', async (req, res, next) => {
  try {
    const user = getAuthUser(req);
    const sourceId = parseIntParam(req.params.sourceId, 'sourceId');

    const source = await verifySourceAccess(sourceId, user.userId);

    // Get configuration
    const [sourceConfig] = await db
      .select()
      .from(sourceConfigurations)
      .where(eq(sourceConfigurations.sourceId, sourceId))
      .limit(1);

    // Get latest processing job
    const [latestJob] = await db
      .select()
      .from(processingJobs)
      .where(eq(processingJobs.sourceId, sourceId))
      .orderBy(desc(processingJobs.createdAt))
      .limit(1);

    sendSuccess(res, {
      id: source.id,
      name: source.name,
      type: source.type,
      status: source.status,
      metadata: source.metadata ? JSON.parse(source.metadata) : null,
      configuration: sourceConfig
        ? {
            targetSchema: JSON.parse(sourceConfig.targetSchema),
            fieldMappings: JSON.parse(sourceConfig.fieldMappings),
            deidentificationRules: JSON.parse(sourceConfig.deidentificationRules),
          }
        : null,
      latestJob: latestJob
        ? {
            id: latestJob.id,
            status: latestJob.status,
            stage: latestJob.stage,
            progress: latestJob.progress,
            recordsProcessed: latestJob.recordsProcessed,
            totalRecords: latestJob.totalRecords,
            errorMessage: latestJob.errorMessage,
            createdAt: latestJob.createdAt,
          }
        : null,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/sources/:sourceId/configuration
 * Update source configuration
 */
router.put(
  '/:sourceId/configuration',
  validateRequest(updateConfigurationSchema),
  async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const sourceId = parseIntParam(req.params.sourceId, 'sourceId');
      const { targetSchema, fieldMappings, deidentificationRules } = req.body;

      await verifySourceAccess(sourceId, user.userId);

      // Update configuration
      const [updated] = await db
        .update(sourceConfigurations)
        .set({
          targetSchema: JSON.stringify(targetSchema),
          fieldMappings: JSON.stringify(fieldMappings),
          deidentificationRules: JSON.stringify(deidentificationRules),
          updatedAt: new Date(),
        })
        .where(eq(sourceConfigurations.sourceId, sourceId))
        .returning();

      // Update source status to configured
      await db
        .update(sources)
        .set({ status: 'configured', updatedAt: new Date() })
        .where(eq(sources.id, sourceId));

      sendSuccess(res, {
        targetSchema: JSON.parse(updated.targetSchema),
        fieldMappings: JSON.parse(updated.fieldMappings),
        deidentificationRules: JSON.parse(updated.deidentificationRules),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/sources/:sourceId
 * Soft delete source
 */
router.delete('/:sourceId', async (req, res, next) => {
  try {
    const user = getAuthUser(req);
    const sourceId = parseIntParam(req.params.sourceId, 'sourceId');

    await verifySourceAccess(sourceId, user.userId);

    // Soft delete
    await db
      .update(sources)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sources.id, sourceId));

    sendNoContent(res);
  } catch (error) {
    next(error);
  }
});

export default router;
