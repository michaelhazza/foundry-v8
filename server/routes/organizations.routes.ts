/**
 * Organization routes
 *
 * GET /api/organizations/current - Get current organization
 * PUT /api/organizations/current - Update current organization
 * GET /api/organizations/current/members - List organization members
 * POST /api/organizations/current/members/invite - Invite user
 * DELETE /api/organizations/current/members/:userId - Remove member
 *
 * @see API Contract Section 4.3
 */

import { Router } from 'express';
import { z } from 'zod';
import { eq, and, ne } from 'drizzle-orm';

import { db } from '../db';
import { organizations, users } from '../db/schema';
import { requireAuth, requireAdmin, getAuthUser } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { sendSuccess, sendNoContent } from '../lib/response';
import { NotFoundError, ForbiddenError, BadRequestError } from '../errors';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// ============================================================================
// Validation Schemas
// ============================================================================

const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

const inviteUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['admin', 'user']).default('user'),
});

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/organizations/current
 * Get current user's organization
 */
router.get('/current', async (req, res, next) => {
  try {
    const user = getAuthUser(req);

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, user.organizationId))
      .limit(1);

    if (!org) {
      throw new NotFoundError('Organization not found');
    }

    sendSuccess(res, {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/organizations/current
 * Update current organization (admin only)
 */
router.put(
  '/current',
  requireAdmin,
  validateRequest(updateOrganizationSchema),
  async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const { name } = req.body;

      const [updated] = await db
        .update(organizations)
        .set({
          ...(name && { name }),
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, user.organizationId))
        .returning();

      if (!updated) {
        throw new NotFoundError('Organization not found');
      }

      sendSuccess(res, {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
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
 * GET /api/organizations/current/members
 * List organization members
 */
router.get('/current/members', async (req, res, next) => {
  try {
    const user = getAuthUser(req);

    const members = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.organizationId, user.organizationId))
      .orderBy(users.createdAt);

    sendSuccess(res, members);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/organizations/current/members/invite
 * Invite a new member to the organization (admin only)
 */
router.post(
  '/current/members/invite',
  requireAdmin,
  validateRequest(inviteUserSchema),
  async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const { email, role } = req.body;

      // Check if user already exists in organization
      const [existingUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      if (existingUser) {
        throw new BadRequestError('User with this email already exists');
      }

      // TODO: Generate invite token and send email
      // For now, return a placeholder response
      sendSuccess(res, {
        message: 'Invitation sent successfully',
        email,
        role,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/organizations/current/members/:userId
 * Remove a member from the organization (admin only)
 */
router.delete(
  '/current/members/:userId',
  requireAdmin,
  async (req, res, next) => {
    try {
      const authUser = getAuthUser(req);
      const memberId = parseInt(req.params.userId as string, 10);

      if (isNaN(memberId)) {
        throw new BadRequestError('Invalid user ID');
      }

      // Cannot remove yourself
      if (memberId === authUser.userId) {
        throw new ForbiddenError('Cannot remove yourself from the organization');
      }

      // Find user
      const [memberToRemove] = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.id, memberId),
            eq(users.organizationId, authUser.organizationId)
          )
        )
        .limit(1);

      if (!memberToRemove) {
        throw new NotFoundError('User not found');
      }

      // Delete user
      await db.delete(users).where(eq(users.id, memberId));

      sendNoContent(res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/organizations/current/members/:userId/role
 * Update a member's role (admin only)
 */
router.patch(
  '/current/members/:userId/role',
  requireAdmin,
  validateRequest(z.object({ role: z.enum(['admin', 'user']) })),
  async (req, res, next) => {
    try {
      const authUser = getAuthUser(req);
      const memberId = parseInt(req.params.userId as string, 10);
      const { role } = req.body;

      if (isNaN(memberId)) {
        throw new BadRequestError('Invalid user ID');
      }

      // Cannot change your own role
      if (memberId === authUser.userId) {
        throw new ForbiddenError('Cannot change your own role');
      }

      const [updated] = await db
        .update(users)
        .set({ role, updatedAt: new Date() })
        .where(
          and(
            eq(users.id, memberId),
            eq(users.organizationId, authUser.organizationId)
          )
        )
        .returning();

      if (!updated) {
        throw new NotFoundError('User not found');
      }

      sendSuccess(res, {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
