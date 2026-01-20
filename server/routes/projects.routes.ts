/**
 * Project routes
 *
 * GET /api/projects - List user's projects
 * POST /api/projects - Create new project
 * GET /api/projects/:id - Get project details
 * PUT /api/projects/:id - Update project
 * DELETE /api/projects/:id - Delete project
 *
 * @see API Contract Section 4.4
 */

import { Router } from 'express';
import { z } from 'zod';
import { eq, and, isNull, desc, count } from 'drizzle-orm';

import { db } from '../db';
import { projects, sources, users } from '../db/schema';
import { requireAuth, getAuthUser } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { validateProjectId, parsePaginationParams, parseIntParam } from '../lib/validation';
import { sendSuccess, sendCreated, sendNoContent, sendPaginated, calculatePagination } from '../lib/response';
import { NotFoundError, ForbiddenError } from '../errors';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// ============================================================================
// Validation Schemas
// ============================================================================

const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
});

// ============================================================================
// Helper Functions
// ============================================================================

async function verifyProjectAccess(
  projectId: number,
  userId: number
): Promise<typeof projects.$inferSelect> {
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

  // Verify user has access (same organization)
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

  return project.projects;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/projects
 * List user's projects with pagination
 */
router.get('/', async (req, res, next) => {
  try {
    const user = getAuthUser(req);
    const { page, pageSize } = parsePaginationParams(req);

    // Get user's projects (from same organization)
    const [currentUser] = await db
      .select({ organizationId: users.organizationId })
      .from(users)
      .where(eq(users.id, user.userId))
      .limit(1);

    if (!currentUser) {
      throw new NotFoundError('User not found');
    }

    // Get total count
    const [{ total }] = await db
      .select({ total: count() })
      .from(projects)
      .innerJoin(users, eq(projects.userId, users.id))
      .where(
        and(
          eq(users.organizationId, currentUser.organizationId),
          isNull(projects.deletedAt)
        )
      );

    // Get paginated projects with source count
    const offset = (page - 1) * pageSize;
    const projectsList = await db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        status: projects.status,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
        userId: projects.userId,
      })
      .from(projects)
      .innerJoin(users, eq(projects.userId, users.id))
      .where(
        and(
          eq(users.organizationId, currentUser.organizationId),
          isNull(projects.deletedAt)
        )
      )
      .orderBy(desc(projects.createdAt))
      .limit(pageSize)
      .offset(offset);

    // Get source counts for each project
    const projectsWithCounts = await Promise.all(
      projectsList.map(async (project) => {
        const [{ sourceCount }] = await db
          .select({ sourceCount: count() })
          .from(sources)
          .where(
            and(
              eq(sources.projectId, project.id),
              isNull(sources.deletedAt)
            )
          );

        return {
          ...project,
          sourceCount,
        };
      })
    );

    sendPaginated(res, projectsWithCounts, calculatePagination(page, pageSize, total));
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/projects
 * Create a new project
 */
router.post(
  '/',
  validateRequest(createProjectSchema),
  async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const { name, description } = req.body;

      const [newProject] = await db
        .insert(projects)
        .values({
          userId: user.userId,
          name,
          description,
        })
        .returning();

      sendCreated(res, {
        id: newProject.id,
        name: newProject.name,
        description: newProject.description,
        status: newProject.status,
        createdAt: newProject.createdAt,
        updatedAt: newProject.updatedAt,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/projects/:projectId
 * Get project details
 */
router.get('/:projectId', async (req, res, next) => {
  try {
    const user = getAuthUser(req);
    const projectId = parseIntParam(req.params.projectId, 'projectId');

    const project = await verifyProjectAccess(projectId, user.userId);

    // Get source count
    const [{ sourceCount }] = await db
      .select({ sourceCount: count() })
      .from(sources)
      .where(
        and(
          eq(sources.projectId, project.id),
          isNull(sources.deletedAt)
        )
      );

    sendSuccess(res, {
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      sourceCount,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/projects/:projectId
 * Update project
 */
router.put(
  '/:projectId',
  validateRequest(updateProjectSchema),
  async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const projectId = parseIntParam(req.params.projectId, 'projectId');
      const { name, description } = req.body;

      await verifyProjectAccess(projectId, user.userId);

      const [updated] = await db
        .update(projects)
        .set({
          ...(name && { name }),
          ...(description !== undefined && { description }),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId))
        .returning();

      sendSuccess(res, {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        status: updated.status,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/projects/:projectId
 * Soft delete project
 */
router.delete('/:projectId', async (req, res, next) => {
  try {
    const user = getAuthUser(req);
    const projectId = parseIntParam(req.params.projectId, 'projectId');

    await verifyProjectAccess(projectId, user.userId);

    // Soft delete
    await db
      .update(projects)
      .set({
        status: 'deleted',
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    sendNoContent(res);
  } catch (error) {
    next(error);
  }
});

export default router;
