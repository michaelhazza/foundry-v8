/**
 * Authentication middleware
 *
 * Validates JWT tokens and attaches user to request
 *
 * @see Architecture Section 6.3
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UnauthorizedError } from '../errors';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

/**
 * User payload from JWT token
 */
export interface JwtPayload {
  userId: number;
  email: string;
  organizationId: number;
  role: string;
}

/**
 * Extended Express Request with user
 * Use this type for route handlers that require authentication
 */
export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

/**
 * Helper to get user from request
 * Use this instead of type casting in route handlers
 */
export function getAuthUser(req: Request): JwtPayload {
  const user = (req as any).user as JwtPayload | undefined;
  if (!user) {
    throw new UnauthorizedError('Authentication required');
  }
  return user;
}

/**
 * Middleware to require authentication
 * Validates Bearer token and attaches user to request
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No authentication token provided');
    }

    const token = authHeader.substring(7);

    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;

    // Verify user still exists and is active
    const [user] = await db
      .select({
        id: users.id,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedError('Account is not active');
    }

    (req as any).user = payload;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid authentication token'));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Authentication token has expired'));
    } else {
      next(error);
    }
  }
}

/**
 * Middleware to require admin role
 * Must be used after requireAuth
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const user = (req as any).user as JwtPayload | undefined;

  if (!user) {
    next(new UnauthorizedError('Authentication required'));
    return;
  }

  if (user.role !== 'admin') {
    next(new UnauthorizedError('Admin access required'));
    return;
  }

  next();
}

/**
 * Optional authentication middleware
 * Attaches user if token is valid, continues without user otherwise
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.substring(7);
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;

    (req as any).user = payload;
    next();
  } catch {
    // Invalid token, continue without user
    next();
  }
}
