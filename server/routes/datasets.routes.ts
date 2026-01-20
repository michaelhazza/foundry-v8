/**
 * Dataset routes
 *
 * GET /api/datasets/:datasetId - Get dataset details
 * GET /api/datasets/:datasetId/download - Download dataset
 * GET /api/datasets/:datasetId/preview - Preview dataset records
 * DELETE /api/datasets/:datasetId - Delete dataset
 *
 * @see API Contract Section 4.7
 */

import { Router } from 'express';
import { eq } from 'drizzle-orm';

import { db } from '../db';
import { datasets, processingJobs, sources, projects, users } from '../db/schema';
import { requireAuth, getAuthUser } from '../middleware/auth.middleware';
import { parseIntParam } from '../lib/validation';
import { sendSuccess, sendNoContent } from '../lib/response';
import { NotFoundError, ForbiddenError } from '../errors';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// ============================================================================
// Helper Functions
// ============================================================================

async function verifyDatasetAccess(
  datasetId: number,
  userId: number
): Promise<typeof datasets.$inferSelect> {
  const [dataset] = await db
    .select()
    .from(datasets)
    .innerJoin(processingJobs, eq(datasets.processingJobId, processingJobs.id))
    .innerJoin(sources, eq(processingJobs.sourceId, sources.id))
    .innerJoin(projects, eq(sources.projectId, projects.id))
    .innerJoin(users, eq(projects.userId, users.id))
    .where(eq(datasets.id, datasetId))
    .limit(1);

  if (!dataset) {
    throw new NotFoundError('Dataset not found');
  }

  const [currentUser] = await db
    .select({ organizationId: users.organizationId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (currentUser?.organizationId !== dataset.users.organizationId) {
    throw new ForbiddenError('Access denied');
  }

  return dataset.datasets;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/datasets/:datasetId
 * Get dataset details
 */
router.get('/:datasetId', async (req, res, next) => {
  try {
    const user = getAuthUser(req);
    const datasetId = parseIntParam(req.params.datasetId, 'datasetId');

    const dataset = await verifyDatasetAccess(datasetId, user.userId);

    sendSuccess(res, {
      id: dataset.id,
      processingJobId: dataset.processingJobId,
      name: dataset.name,
      format: dataset.format,
      recordCount: dataset.recordCount,
      fileSize: dataset.fileSize,
      downloadUrl: dataset.downloadUrl,
      metadata: dataset.metadata ? JSON.parse(dataset.metadata) : null,
      expiresAt: dataset.expiresAt,
      createdAt: dataset.createdAt,
      updatedAt: dataset.updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/datasets/:datasetId/download
 * Download dataset file
 */
router.get('/:datasetId/download', async (req, res, next) => {
  try {
    const user = getAuthUser(req);
    const datasetId = parseIntParam(req.params.datasetId, 'datasetId');

    const dataset = await verifyDatasetAccess(datasetId, user.userId);

    if (!dataset.dataContent) {
      throw new NotFoundError('Dataset content not available');
    }

    // Determine content type based on format
    const contentTypes: Record<string, string> = {
      jsonl: 'application/x-ndjson',
      json: 'application/json',
      csv: 'text/csv',
    };

    const contentType = contentTypes[dataset.format] || 'application/octet-stream';
    const filename = `${dataset.name.replace(/[^a-z0-9]/gi, '_')}.${dataset.format}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(dataset.dataContent));

    res.send(dataset.dataContent);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/datasets/:datasetId/preview
 * Preview first N records of dataset
 */
router.get('/:datasetId/preview', async (req, res, next) => {
  try {
    const user = getAuthUser(req);
    const datasetId = parseIntParam(req.params.datasetId, 'datasetId');
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 10, 100);

    const dataset = await verifyDatasetAccess(datasetId, user.userId);

    if (!dataset.dataContent) {
      throw new NotFoundError('Dataset content not available');
    }

    // Parse and preview records
    let records: any[];
    try {
      if (dataset.format === 'jsonl') {
        records = dataset.dataContent
          .split('\n')
          .filter((line) => line.trim())
          .slice(0, limit)
          .map((line) => JSON.parse(line));
      } else if (dataset.format === 'json') {
        const allRecords = JSON.parse(dataset.dataContent);
        records = Array.isArray(allRecords) ? allRecords.slice(0, limit) : [allRecords];
      } else {
        // For CSV, return raw lines
        records = dataset.dataContent
          .split('\n')
          .slice(0, limit + 1) // Include header
          .map((line) => ({ raw: line }));
      }
    } catch {
      records = [];
    }

    sendSuccess(res, {
      records,
      total: dataset.recordCount,
      previewed: records.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/datasets/:datasetId
 * Delete dataset
 */
router.delete('/:datasetId', async (req, res, next) => {
  try {
    const user = getAuthUser(req);
    const datasetId = parseIntParam(req.params.datasetId, 'datasetId');

    await verifyDatasetAccess(datasetId, user.userId);

    // Delete dataset
    await db.delete(datasets).where(eq(datasets.id, datasetId));

    sendNoContent(res);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/projects/:projectId/datasets
 * List all datasets for a project
 */
router.get('/projects/:projectId/datasets', async (req, res, next) => {
  try {
    const user = getAuthUser(req);
    const projectId = parseIntParam(req.params.projectId, 'projectId');

    // Verify project access
    const [project] = await db
      .select()
      .from(projects)
      .innerJoin(users, eq(projects.userId, users.id))
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      throw new NotFoundError('Project not found');
    }

    const [currentUser] = await db
      .select({ organizationId: users.organizationId })
      .from(users)
      .where(eq(users.id, user.userId))
      .limit(1);

    if (currentUser?.organizationId !== project.users.organizationId) {
      throw new ForbiddenError('Access denied');
    }

    // Get all datasets for the project
    const projectDatasets = await db
      .select({
        id: datasets.id,
        name: datasets.name,
        format: datasets.format,
        recordCount: datasets.recordCount,
        fileSize: datasets.fileSize,
        downloadUrl: datasets.downloadUrl,
        createdAt: datasets.createdAt,
        sourceName: sources.name,
        sourceId: sources.id,
      })
      .from(datasets)
      .innerJoin(processingJobs, eq(datasets.processingJobId, processingJobs.id))
      .innerJoin(sources, eq(processingJobs.sourceId, sources.id))
      .where(eq(sources.projectId, projectId));

    sendSuccess(res, projectDatasets);
  } catch (error) {
    next(error);
  }
});

export default router;
