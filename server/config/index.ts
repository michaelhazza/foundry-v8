/**
 * Server configuration with environment variable validation
 *
 * Purpose: Validates required environment variables on startup with clear error messages.
 * Provides typed configuration object for use throughout the application.
 *
 * @see Architecture Section 6.2, API Contract Section 2.4
 */

import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Validate required environment variable
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Get optional environment variable with default
 */
function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

/**
 * Get optional integer environment variable with default
 */
function optionalIntEnv(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// Validate JWT_SECRET has minimum length
const jwtSecret = requireEnv('JWT_SECRET');
if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}

// Validate NODE_ENV
const nodeEnv = optionalEnv('NODE_ENV', 'development');
if (!['development', 'production', 'test'].includes(nodeEnv)) {
  throw new Error('NODE_ENV must be "development", "production", or "test"');
}

/**
 * Application configuration
 */
export const config = {
  // Server
  port: optionalIntEnv('PORT', 5000),
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isDevelopment: nodeEnv === 'development',

  // Database
  databaseUrl: requireEnv('DATABASE_URL'),

  // Authentication
  jwtSecret,
  sessionLifetimeHours: optionalIntEnv('SESSION_LIFETIME_HOURS', 24),
  refreshTokenLifetimeDays: optionalIntEnv('REFRESH_TOKEN_LIFETIME_DAYS', 7),
  bcryptRounds: 12,

  // Email
  sendgridApiKey: process.env.SENDGRID_API_KEY || null,
  resendApiKey: process.env.RESEND_API_KEY || null,
  fromEmail: optionalEnv('FROM_EMAIL', 'noreply@foundry.app'),

  // Teamwork integration
  teamwork: {
    clientId: process.env.TEAMWORK_CLIENT_ID || null,
    clientSecret: process.env.TEAMWORK_CLIENT_SECRET || null,
    redirectUri: process.env.TEAMWORK_REDIRECT_URI || null,
  },

  // File processing
  maxFileSizeMb: optionalIntEnv('MAX_FILE_SIZE_MB', 100),
  maxProcessingRecords: optionalIntEnv('MAX_PROCESSING_RECORDS', 10000),

  // Rate limiting
  rateLimitWindowMs: optionalIntEnv('RATE_LIMIT_WINDOW_MS', 900000), // 15 minutes
  rateLimitMaxRequests: optionalIntEnv('RATE_LIMIT_MAX_REQUESTS', 100),
} as const;

/**
 * Check if email service is available
 */
export function isEmailEnabled(): boolean {
  return !!(config.sendgridApiKey || config.resendApiKey);
}

/**
 * Check if Teamwork integration is available
 */
export function isTeamworkEnabled(): boolean {
  return !!(
    config.teamwork.clientId &&
    config.teamwork.clientSecret &&
    config.teamwork.redirectUri
  );
}

export default config;
