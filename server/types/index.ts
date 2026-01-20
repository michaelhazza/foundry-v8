/**
 * Server-side type definitions
 */

import { Request } from 'express';

// Re-export shared types
export * from '../../shared/types/api';

// Authenticated request type
export interface AuthenticatedUser {
  userId: number;
  email: string;
  organizationId: number;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
