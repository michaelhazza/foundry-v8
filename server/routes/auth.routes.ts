/**
 * Authentication routes
 *
 * POST /api/auth/register - Register new user
 * POST /api/auth/login - Authenticate user
 * POST /api/auth/logout - Logout user
 * POST /api/auth/refresh - Refresh access token
 * POST /api/auth/forgot-password - Request password reset
 * POST /api/auth/reset-password - Reset password with token
 *
 * @see API Contract Section 4.2
 */

import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { eq, and, gt, isNull } from 'drizzle-orm';

import { db } from '../db';
import { users, organizations, refreshTokens } from '../db/schema';
import { config } from '../config';
import { validateRequest } from '../middleware/validation.middleware';
import { authLimiter } from '../middleware/rate-limit.middleware';
import { requireAuth, getAuthUser } from '../middleware/auth.middleware';
import { sendSuccess, sendCreated, sendNoContent } from '../lib/response';
import {
  BadRequestError,
  InvalidCredentialsError,
  DuplicateEmailError,
  NotFoundError,
  UnauthorizedError,
} from '../errors';

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required'),
  inviteToken: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// ============================================================================
// Helper Functions
// ============================================================================

function generateAccessToken(user: {
  id: number;
  email: string;
  organizationId: number;
  role: string;
}): string {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
    },
    config.jwtSecret,
    { expiresIn: `${config.sessionLifetimeHours}h` }
  );
}

function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function storeRefreshToken(userId: number, token: string): Promise<void> {
  const tokenHash = hashToken(token);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.refreshTokenLifetimeDays);

  await db.insert(refreshTokens).values({
    userId,
    tokenHash,
    expiresAt,
  });
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/auth/register
 * Register a new user account
 */
router.post(
  '/register',
  authLimiter,
  validateRequest(registerSchema),
  async (req, res, next) => {
    try {
      const { email, password, name, inviteToken } = req.body;

      // Check if email already exists
      const [existingUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      if (existingUser) {
        throw new DuplicateEmailError();
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, config.bcryptRounds);

      let organizationId: number;
      let userRole = 'user';

      if (inviteToken) {
        // TODO: Handle invite token - join existing organization
        throw new BadRequestError('Invite tokens not yet implemented');
      } else {
        // Create new organization
        const orgName = email.split('@')[1] || 'My Organization';
        const slug = generateSlug(orgName) + '-' + Date.now();

        const [org] = await db
          .insert(organizations)
          .values({
            name: orgName,
            slug,
          })
          .returning();

        organizationId = org.id;
        userRole = 'admin'; // First user is admin
      }

      // Create user
      const [newUser] = await db
        .insert(users)
        .values({
          email: email.toLowerCase(),
          passwordHash,
          name,
          organizationId,
          role: userRole,
          status: 'active',
        })
        .returning();

      // Generate tokens
      const accessToken = generateAccessToken({
        id: newUser.id,
        email: newUser.email,
        organizationId: newUser.organizationId,
        role: newUser.role,
      });
      const refreshToken = generateRefreshToken();
      await storeRefreshToken(newUser.id, refreshToken);

      // Get organization details
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);

      sendCreated(res, {
        token: accessToken,
        refreshToken,
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          organization: {
            id: org.id,
            name: org.name,
            slug: org.slug,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/auth/login
 * Authenticate user and issue tokens
 */
router.post(
  '/login',
  authLimiter,
  validateRequest(loginSchema),
  async (req, res, next) => {
    try {
      const { email, password } = req.body;

      // Find user by email
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      if (!user) {
        throw new InvalidCredentialsError();
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        throw new InvalidCredentialsError();
      }

      // Check user status
      if (user.status !== 'active') {
        throw new UnauthorizedError('Account is not active');
      }

      // Update last login
      await db
        .update(users)
        .set({ lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, user.id));

      // Generate tokens
      const accessToken = generateAccessToken({
        id: user.id,
        email: user.email,
        organizationId: user.organizationId,
        role: user.role,
      });
      const refreshToken = generateRefreshToken();
      await storeRefreshToken(user.id, refreshToken);

      // Get organization
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, user.organizationId))
        .limit(1);

      sendSuccess(res, {
        token: accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organization: {
            id: org.id,
            name: org.name,
            slug: org.slug,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/auth/logout
 * Logout user and invalidate refresh token
 */
router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const user = getAuthUser(req);

    // Invalidate all refresh tokens for this user
    await db
      .update(refreshTokens)
      .set({ usedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.userId, user.userId),
          isNull(refreshTokens.usedAt)
        )
      );

    sendNoContent(res);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post(
  '/refresh',
  validateRequest(refreshTokenSchema),
  async (req, res, next) => {
    try {
      const { refreshToken: token } = req.body;
      const tokenHash = hashToken(token);

      // Find valid refresh token
      const [storedToken] = await db
        .select()
        .from(refreshTokens)
        .where(
          and(
            eq(refreshTokens.tokenHash, tokenHash),
            isNull(refreshTokens.usedAt),
            gt(refreshTokens.expiresAt, new Date())
          )
        )
        .limit(1);

      if (!storedToken) {
        throw new UnauthorizedError('Invalid or expired refresh token');
      }

      // Mark token as used
      await db
        .update(refreshTokens)
        .set({ usedAt: new Date(), updatedAt: new Date() })
        .where(eq(refreshTokens.id, storedToken.id));

      // Get user
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, storedToken.userId))
        .limit(1);

      if (!user || user.status !== 'active') {
        throw new UnauthorizedError('User not found or inactive');
      }

      // Generate new tokens
      const newAccessToken = generateAccessToken({
        id: user.id,
        email: user.email,
        organizationId: user.organizationId,
        role: user.role,
      });
      const newRefreshToken = generateRefreshToken();
      await storeRefreshToken(user.id, newRefreshToken);

      // Update replaced_by on old token
      await db
        .update(refreshTokens)
        .set({
          replacedBy: (
            await db
              .select({ id: refreshTokens.id })
              .from(refreshTokens)
              .where(eq(refreshTokens.tokenHash, hashToken(newRefreshToken)))
              .limit(1)
          )[0]?.id,
        })
        .where(eq(refreshTokens.id, storedToken.id));

      sendSuccess(res, {
        token: newAccessToken,
        refreshToken: newRefreshToken,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/auth/forgot-password
 * Request password reset email
 */
router.post(
  '/forgot-password',
  authLimiter,
  validateRequest(forgotPasswordSchema),
  async (req, res, next) => {
    try {
      const { email } = req.body;

      // Always return success to prevent email enumeration
      const successResponse = {
        message: 'If an account with that email exists, a reset link has been sent.',
      };

      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      if (!user) {
        sendSuccess(res, successResponse);
        return;
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date();
      resetExpires.setHours(resetExpires.getHours() + 1); // 1 hour expiry

      await db
        .update(users)
        .set({
          passwordResetToken: hashToken(resetToken),
          passwordResetExpires: resetExpires,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      // TODO: Send email with reset link
      // For now, log the token (development only)
      if (!config.isProduction) {
        console.log(`Password reset token for ${email}: ${resetToken}`);
      }

      sendSuccess(res, successResponse);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/auth/reset-password
 * Reset password with token
 */
router.post(
  '/reset-password',
  authLimiter,
  validateRequest(resetPasswordSchema),
  async (req, res, next) => {
    try {
      const { token, password } = req.body;
      const tokenHash = hashToken(token);

      const [user] = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.passwordResetToken, tokenHash),
            gt(users.passwordResetExpires!, new Date())
          )
        )
        .limit(1);

      if (!user) {
        throw new BadRequestError('Invalid or expired reset token');
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(password, config.bcryptRounds);

      // Update user and clear reset token
      await db
        .update(users)
        .set({
          passwordHash,
          passwordResetToken: null,
          passwordResetExpires: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      // Invalidate all refresh tokens
      await db
        .update(refreshTokens)
        .set({ usedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(refreshTokens.userId, user.id),
            isNull(refreshTokens.usedAt)
          )
        );

      sendSuccess(res, { message: 'Password has been reset successfully' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const authUser = getAuthUser(req);

    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, authUser.userId))
      .limit(1);

    if (!dbUser) {
      throw new NotFoundError('User not found');
    }

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, dbUser.organizationId))
      .limit(1);

    sendSuccess(res, {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
