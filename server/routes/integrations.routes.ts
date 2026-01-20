/**
 * Integration routes
 *
 * GET /api/integrations/teamwork/auth - Initiate Teamwork OAuth
 * GET /api/integrations/teamwork/callback - OAuth callback
 * GET /api/integrations/teamwork/tickets - Fetch tickets from Teamwork
 *
 * @see API Contract Section 4.8
 */

import { Router } from 'express';
import { z } from 'zod';
import { eq, and, isNull } from 'drizzle-orm';

import { db } from '../db';
import { sources, apiCredentials, projects, users } from '../db/schema';
import { requireAuth, getAuthUser } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { parseIntParam } from '../lib/validation';
import { sendSuccess, sendCreated } from '../lib/response';
import { NotFoundError, ForbiddenError, BadRequestError, ServiceUnavailableError } from '../errors';
import { config, isTeamworkEnabled } from '../config';

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const teamworkAuthSchema = z.object({
  projectId: z.number(),
  sourceName: z.string().min(1).max(100),
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

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/integrations/teamwork/status
 * Check if Teamwork integration is enabled
 */
router.get('/teamwork/status', requireAuth, async (req, res, next) => {
  try {
    sendSuccess(res, {
      enabled: isTeamworkEnabled(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/integrations/teamwork/auth
 * Initiate Teamwork OAuth flow
 */
router.post(
  '/teamwork/auth',
  requireAuth,
  validateRequest(teamworkAuthSchema),
  async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const { projectId, sourceName } = req.body;

      if (!isTeamworkEnabled()) {
        throw new ServiceUnavailableError('Teamwork integration is not configured');
      }

      await verifyProjectAccess(projectId, user.userId);

      // Build OAuth URL
      const state = Buffer.from(
        JSON.stringify({
          projectId,
          sourceName,
          userId: user.userId,
        })
      ).toString('base64');

      const authUrl = new URL('https://www.teamwork.com/launchpad/login');
      authUrl.searchParams.set('client_id', config.teamwork.clientId!);
      authUrl.searchParams.set('redirect_uri', config.teamwork.redirectUri!);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('state', state);

      sendSuccess(res, {
        authUrl: authUrl.toString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/integrations/teamwork/callback
 * Handle Teamwork OAuth callback
 */
router.get('/teamwork/callback', async (req, res, next) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      throw new BadRequestError(`OAuth error: ${oauthError}`);
    }

    if (!code || !state) {
      throw new BadRequestError('Missing code or state parameter');
    }

    if (!isTeamworkEnabled()) {
      throw new ServiceUnavailableError('Teamwork integration is not configured');
    }

    // Decode state
    let stateData: { projectId: number; sourceName: string; userId: number };
    try {
      stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    } catch {
      throw new BadRequestError('Invalid state parameter');
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://www.teamwork.com/launchpad/v1/token.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        client_id: config.teamwork.clientId!,
        client_secret: config.teamwork.clientSecret!,
        redirect_uri: config.teamwork.redirectUri!,
      }),
    });

    if (!tokenResponse.ok) {
      throw new ServiceUnavailableError('Failed to exchange code for tokens');
    }

    const tokenData = await tokenResponse.json();

    // Create source
    const [newSource] = await db
      .insert(sources)
      .values({
        projectId: stateData.projectId,
        name: stateData.sourceName,
        type: 'teamwork_desk',
        status: 'pending',
        metadata: JSON.stringify({
          domain: tokenData.installation?.company?.subdomain || 'unknown',
        }),
      })
      .returning();

    // Store credentials (TODO: encrypt tokens)
    await db.insert(apiCredentials).values({
      sourceId: newSource.id,
      provider: 'teamwork_desk',
      encryptedAccessToken: tokenData.access_token, // TODO: Encrypt
      encryptedRefreshToken: tokenData.refresh_token, // TODO: Encrypt
      tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
      metadata: JSON.stringify({
        domain: tokenData.installation?.company?.subdomain,
        userId: tokenData.installation?.user?.id,
      }),
    });

    // Redirect to frontend with success
    res.redirect(`/projects/${stateData.projectId}/sources/${newSource.id}?connected=teamwork`);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/integrations/teamwork/:sourceId/tickets
 * Fetch tickets from Teamwork Desk
 */
router.get(
  '/teamwork/:sourceId/tickets',
  requireAuth,
  async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const sourceId = parseIntParam(req.params.sourceId, 'sourceId');
      const page = parseInt(req.query.page as string, 10) || 1;
      const pageSize = parseInt(req.query.pageSize as string, 10) || 50;

      // Verify source access
      const [source] = await db
        .select()
        .from(sources)
        .innerJoin(projects, eq(sources.projectId, projects.id))
        .innerJoin(users, eq(projects.userId, users.id))
        .where(eq(sources.id, sourceId))
        .limit(1);

      if (!source) {
        throw new NotFoundError('Source not found');
      }

      const [currentUser] = await db
        .select({ organizationId: users.organizationId })
        .from(users)
        .where(eq(users.id, user.userId))
        .limit(1);

      if (currentUser?.organizationId !== source.users.organizationId) {
        throw new ForbiddenError('Access denied');
      }

      if (source.sources.type !== 'teamwork_desk') {
        throw new BadRequestError('Source is not a Teamwork Desk source');
      }

      // Get credentials
      const [credentials] = await db
        .select()
        .from(apiCredentials)
        .where(eq(apiCredentials.sourceId, sourceId))
        .limit(1);

      if (!credentials) {
        throw new NotFoundError('Credentials not found');
      }

      // TODO: Implement actual Teamwork API call
      // For now, return mock data
      sendSuccess(res, {
        tickets: [
          { id: 1, subject: 'Sample ticket 1', status: 'open' },
          { id: 2, subject: 'Sample ticket 2', status: 'closed' },
        ],
        pagination: {
          page,
          pageSize,
          total: 2,
          totalPages: 1,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
