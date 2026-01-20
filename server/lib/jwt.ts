/**
 * JWT token utilities
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';

export interface TokenPayload {
  userId: number;
  email: string;
  organizationId: number;
  role: string;
}

/**
 * Generate an access token
 */
export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: `${config.sessionLifetimeHours}h`,
  });
}

/**
 * Generate a refresh token (random string)
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Hash a token for storage
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Verify an access token
 */
export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwtSecret) as TokenPayload;
}
