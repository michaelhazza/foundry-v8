/**
 * Processing routes
 *
 * POST /api/sources/:sourceId/process - Start processing job
 * GET /api/jobs/:jobId - Get job status
 * GET /api/jobs/:jobId/progress - Get job progress (polling)
 * POST /api/jobs/:jobId/cancel - Cancel processing job
 *
 * @see API Contract Section 4.6
 */

import { Router } from 'express';
import { eq, and, isNull, desc } from 'drizzle-orm';

import { db } from '../db';
import { sources, sourceFiles, sourceConfigurations, processingJobs, datasets, projects, users } from '../db/schema';
import { requireAuth, getAuthUser } from '../middleware/auth.middleware';
import { parseIntParam } from '../lib/validation';
import { sendSuccess, sendCreated, sendNoContent } from '../lib/response';
import { NotFoundError, ForbiddenError, BadRequestError, UnprocessableError } from '../errors';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// ============================================================================
// Helper Functions
// ============================================================================

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

async function verifyJobAccess(
  jobId: number,
  userId: number
): Promise<typeof processingJobs.$inferSelect> {
  const [job] = await db
    .select()
    .from(processingJobs)
    .innerJoin(sources, eq(processingJobs.sourceId, sources.id))
    .innerJoin(projects, eq(sources.projectId, projects.id))
    .innerJoin(users, eq(projects.userId, users.id))
    .where(eq(processingJobs.id, jobId))
    .limit(1);

  if (!job) {
    throw new NotFoundError('Job not found');
  }

  const [currentUser] = await db
    .select({ organizationId: users.organizationId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (currentUser?.organizationId !== job.users.organizationId) {
    throw new ForbiddenError('Access denied');
  }

  return job.processing_jobs;
}

// ============================================================================
// Processing Simulation (TODO: Replace with actual processing)
// ============================================================================

async function simulateProcessing(jobId: number, sourceId: number): Promise<void> {
  // This is a simplified simulation of the processing pipeline
  // In production, this would be handled by a background worker

  try {
    // Get source file
    const [sourceFile] = await db
      .select()
      .from(sourceFiles)
      .where(eq(sourceFiles.sourceId, sourceId))
      .limit(1);

    if (!sourceFile) {
      throw new Error('Source file not found');
    }

    // Start processing
    await db
      .update(processingJobs)
      .set({
        status: 'running',
        stage: 'parsing',
        progress: 0,
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(processingJobs.id, jobId));

    // Simulate parsing stage
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await db
      .update(processingJobs)
      .set({
        stage: 'detecting_pii',
        progress: 25,
        recordsProcessed: 25,
        totalRecords: 100,
        updatedAt: new Date(),
      })
      .where(eq(processingJobs.id, jobId));

    // Simulate PII detection
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await db
      .update(processingJobs)
      .set({
        stage: 'deidentifying',
        progress: 50,
        recordsProcessed: 50,
        updatedAt: new Date(),
      })
      .where(eq(processingJobs.id, jobId));

    // Simulate deidentification
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await db
      .update(processingJobs)
      .set({
        stage: 'mapping',
        progress: 75,
        recordsProcessed: 75,
        updatedAt: new Date(),
      })
      .where(eq(processingJobs.id, jobId));

    // Complete processing
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Create output dataset
    const sampleData = JSON.stringify([
      { id: 1, text: 'Sample processed record 1' },
      { id: 2, text: 'Sample processed record 2' },
    ]);

    const [dataset] = await db
      .insert(datasets)
      .values({
        processingJobId: jobId,
        name: `Dataset - ${new Date().toISOString()}`,
        format: 'jsonl',
        recordCount: 100,
        fileSize: Buffer.byteLength(sampleData),
        storageKey: `dataset-${jobId}`,
        dataContent: sampleData,
        downloadUrl: `/api/datasets/${jobId}/download`,
        metadata: JSON.stringify({
          piiFieldsRedacted: ['email', 'phone'],
          transformationsSummary: 'Sample transformations applied',
        }),
      })
      .returning();

    // Mark job as completed
    await db
      .update(processingJobs)
      .set({
        status: 'completed',
        stage: 'complete',
        progress: 100,
        recordsProcessed: 100,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(processingJobs.id, jobId));

    // Update source status
    await db
      .update(sources)
      .set({ status: 'ready', updatedAt: new Date() })
      .where(eq(sources.id, sourceId));
  } catch (error) {
    // Mark job as failed
    await db
      .update(processingJobs)
      .set({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        updatedAt: new Date(),
      })
      .where(eq(processingJobs.id, jobId));

    await db
      .update(sources)
      .set({ status: 'error', updatedAt: new Date() })
      .where(eq(sources.id, sourceId));
  }
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/sources/:sourceId/process
 * Start a processing job for a source
 */
router.post('/sources/:sourceId/process', async (req, res, next) => {
  try {
    const user = getAuthUser(req);
    const sourceId = parseIntParam(req.params.sourceId, 'sourceId');

    const source = await verifySourceAccess(sourceId, user.userId);

    // Check source has configuration
    const [config] = await db
      .select()
      .from(sourceConfigurations)
      .where(eq(sourceConfigurations.sourceId, sourceId))
      .limit(1);

    if (!config || !JSON.parse(config.targetSchema).fields?.length) {
      throw new UnprocessableError('Source must be configured before processing');
    }

    // Check no running job for this source
    const [runningJob] = await db
      .select()
      .from(processingJobs)
      .where(
        and(
          eq(processingJobs.sourceId, sourceId),
          eq(processingJobs.status, 'running')
        )
      )
      .limit(1);

    if (runningJob) {
      throw new BadRequestError('A processing job is already running for this source');
    }

    // Create processing job
    const [newJob] = await db
      .insert(processingJobs)
      .values({
        sourceId,
        status: 'pending',
      })
      .returning();

    // Update source status
    await db
      .update(sources)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(sources.id, sourceId));

    // Start processing in background (non-blocking)
    simulateProcessing(newJob.id, sourceId);

    sendCreated(res, {
      id: newJob.id,
      sourceId: newJob.sourceId,
      status: newJob.status,
      stage: newJob.stage,
      progress: newJob.progress,
      createdAt: newJob.createdAt,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/jobs/:jobId
 * Get job details
 */
router.get('/jobs/:jobId', async (req, res, next) => {
  try {
    const user = getAuthUser(req);
    const jobId = parseIntParam(req.params.jobId, 'jobId');

    const job = await verifyJobAccess(jobId, user.userId);

    // Get output datasets if completed
    let outputDatasets: any[] = [];
    if (job.status === 'completed') {
      outputDatasets = await db
        .select({
          id: datasets.id,
          name: datasets.name,
          format: datasets.format,
          recordCount: datasets.recordCount,
          fileSize: datasets.fileSize,
          downloadUrl: datasets.downloadUrl,
          createdAt: datasets.createdAt,
        })
        .from(datasets)
        .where(eq(datasets.processingJobId, jobId));
    }

    sendSuccess(res, {
      id: job.id,
      sourceId: job.sourceId,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      recordsProcessed: job.recordsProcessed,
      totalRecords: job.totalRecords,
      errorMessage: job.errorMessage,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: job.createdAt,
      datasets: outputDatasets,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/jobs/:jobId/progress
 * Get job progress (for polling)
 */
router.get('/jobs/:jobId/progress', async (req, res, next) => {
  try {
    const user = getAuthUser(req);
    const jobId = parseIntParam(req.params.jobId, 'jobId');

    const job = await verifyJobAccess(jobId, user.userId);

    sendSuccess(res, {
      id: job.id,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      recordsProcessed: job.recordsProcessed,
      totalRecords: job.totalRecords,
      errorMessage: job.errorMessage,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/jobs/:jobId/cancel
 * Cancel a running job
 */
router.post('/jobs/:jobId/cancel', async (req, res, next) => {
  try {
    const user = getAuthUser(req);
    const jobId = parseIntParam(req.params.jobId, 'jobId');

    const job = await verifyJobAccess(jobId, user.userId);

    if (job.status !== 'pending' && job.status !== 'running') {
      throw new BadRequestError('Only pending or running jobs can be cancelled');
    }

    // Cancel job
    await db
      .update(processingJobs)
      .set({
        status: 'failed',
        errorMessage: 'Cancelled by user',
        updatedAt: new Date(),
      })
      .where(eq(processingJobs.id, jobId));

    // Update source status
    await db
      .update(sources)
      .set({ status: 'configured', updatedAt: new Date() })
      .where(eq(sources.id, job.sourceId));

    sendNoContent(res);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/sources/:sourceId/jobs
 * List processing jobs for a source
 */
router.get('/sources/:sourceId/jobs', async (req, res, next) => {
  try {
    const user = getAuthUser(req);
    const sourceId = parseIntParam(req.params.sourceId, 'sourceId');

    await verifySourceAccess(sourceId, user.userId);

    const jobs = await db
      .select({
        id: processingJobs.id,
        status: processingJobs.status,
        stage: processingJobs.stage,
        progress: processingJobs.progress,
        recordsProcessed: processingJobs.recordsProcessed,
        totalRecords: processingJobs.totalRecords,
        errorMessage: processingJobs.errorMessage,
        startedAt: processingJobs.startedAt,
        completedAt: processingJobs.completedAt,
        createdAt: processingJobs.createdAt,
      })
      .from(processingJobs)
      .where(eq(processingJobs.sourceId, sourceId))
      .orderBy(desc(processingJobs.createdAt));

    sendSuccess(res, jobs);
  } catch (error) {
    next(error);
  }
});

export default router;
