/**
 * MANDATORY FILE: Database connection with postgres-js
 *
 * Purpose: Establishes database connection using the correct driver (postgres-js).
 * Using wrong driver (e.g., pg, node-postgres) causes "fetch failed" errors with Drizzle.
 *
 * @see Architecture ADR-006 - Database Driver Selection
 * @see Drizzle Docs: https://orm.drizzle.team/docs/get-started-postgresql#postgresjs
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

// Validate DATABASE_URL is present
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

/**
 * Create postgres-js client
 * Connection pool configured for optimal performance on Replit
 */
const queryClient = postgres(process.env.DATABASE_URL, {
  max: 10, // Maximum number of connections in pool
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 10, // Connection timeout in seconds
  ssl: process.env.NODE_ENV === 'production' ? 'require' : undefined,
  onnotice: () => {}, // Suppress Postgres notices in logs
});

/**
 * Drizzle ORM instance
 * Use this for all database queries
 *
 * @example
 * import { db } from './db';
 * import { users } from './db/schema';
 *
 * const allUsers = await db.select().from(users);
 */
export const db = drizzle(queryClient, { schema });

/**
 * Close database connection
 * Call this on graceful shutdown
 */
export async function closeDb(): Promise<void> {
  await queryClient.end();
}

/**
 * Test database connection
 * Useful for health checks
 */
export async function testConnection(): Promise<boolean> {
  try {
    await queryClient`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}
