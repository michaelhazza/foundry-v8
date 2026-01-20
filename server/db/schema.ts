/**
 * Database Schema: Foundry
 *
 * 10 tables for multi-tenant SaaS platform
 *
 * @see Data Model Document Section 2
 */

import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================================================
// 1. Organizations Table
// ============================================================================

export const organizations = pgTable('organizations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  status: text('status').notNull().default('active'), // active | suspended | deleted
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

// ============================================================================
// 2. Users Table
// ============================================================================

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    name: text('name'),
    role: text('role').notNull().default('user'), // admin | user
    status: text('status').notNull().default('active'), // active | invited | suspended
    invitedBy: integer('invited_by'),
    passwordResetToken: text('password_reset_token'),
    passwordResetExpires: timestamp('password_reset_expires'),
    lastLoginAt: timestamp('last_login_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_users_organization_id').on(table.organizationId),
    index('idx_users_password_reset_token').on(table.passwordResetToken),
  ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// ============================================================================
// 3. Refresh Tokens Table
// ============================================================================

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    usedAt: timestamp('used_at'),
    replacedBy: integer('replaced_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_refresh_tokens_user_id').on(table.userId),
    index('idx_refresh_tokens_expires_at').on(table.expiresAt),
  ]
);

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;

// ============================================================================
// 4. Projects Table
// ============================================================================

export const projects = pgTable(
  'projects',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status').notNull().default('active'), // active | archived | deleted
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_projects_user_id').on(table.userId),
    index('idx_projects_deleted_at').on(table.deletedAt),
    index('idx_projects_user_deleted').on(table.userId, table.deletedAt),
  ]
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

// ============================================================================
// 5. Sources Table
// ============================================================================

export const sources = pgTable(
  'sources',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull(), // file | teamwork_desk | api
    status: text('status').notNull().default('pending'), // pending | configured | processing | ready | error
    metadata: text('metadata'), // JSON
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_sources_project_id').on(table.projectId),
    index('idx_sources_status').on(table.status),
    index('idx_sources_deleted_at').on(table.deletedAt),
    index('idx_sources_project_status').on(table.projectId, table.status),
  ]
);

export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;

// ============================================================================
// 6. Source Files Table (1:1 with sources)
// ============================================================================

export const sourceFiles = pgTable('source_files', {
  id: serial('id').primaryKey(),
  sourceId: integer('source_id')
    .notNull()
    .references(() => sources.id, { onDelete: 'cascade' })
    .unique(),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  fileSize: integer('file_size').notNull(),
  fileData: text('file_data').notNull(), // Base64-encoded
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type SourceFile = typeof sourceFiles.$inferSelect;
export type NewSourceFile = typeof sourceFiles.$inferInsert;

// ============================================================================
// 7. Source Configurations Table (1:1 with sources)
// ============================================================================

export const sourceConfigurations = pgTable('source_configurations', {
  id: serial('id').primaryKey(),
  sourceId: integer('source_id')
    .notNull()
    .references(() => sources.id, { onDelete: 'cascade' })
    .unique(),
  targetSchema: text('target_schema').notNull(), // JSON
  fieldMappings: text('field_mappings').notNull(), // JSON
  deidentificationRules: text('deidentification_rules').notNull(), // JSON
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type SourceConfiguration = typeof sourceConfigurations.$inferSelect;
export type NewSourceConfiguration = typeof sourceConfigurations.$inferInsert;

// ============================================================================
// 8. API Credentials Table (1:1 with sources)
// ============================================================================

export const apiCredentials = pgTable('api_credentials', {
  id: serial('id').primaryKey(),
  sourceId: integer('source_id')
    .notNull()
    .references(() => sources.id, { onDelete: 'cascade' })
    .unique(),
  provider: text('provider').notNull(), // teamwork_desk | salesforce | etc.
  encryptedAccessToken: text('encrypted_access_token').notNull(),
  encryptedRefreshToken: text('encrypted_refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at'),
  metadata: text('metadata'), // JSON
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type ApiCredential = typeof apiCredentials.$inferSelect;
export type NewApiCredential = typeof apiCredentials.$inferInsert;

// ============================================================================
// 9. Processing Jobs Table
// ============================================================================

export const processingJobs = pgTable(
  'processing_jobs',
  {
    id: serial('id').primaryKey(),
    sourceId: integer('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'), // pending | running | completed | failed
    stage: text('stage'), // parsing | detecting_pii | deidentifying | mapping | complete
    progress: integer('progress').notNull().default(0), // 0-100
    recordsProcessed: integer('records_processed').notNull().default(0),
    totalRecords: integer('total_records'),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_processing_jobs_source_id').on(table.sourceId),
    index('idx_processing_jobs_status').on(table.status),
    index('idx_processing_jobs_status_started').on(table.status, table.startedAt),
    index('idx_processing_jobs_source_created').on(table.sourceId, table.createdAt),
  ]
);

export type ProcessingJob = typeof processingJobs.$inferSelect;
export type NewProcessingJob = typeof processingJobs.$inferInsert;

// ============================================================================
// 10. Datasets Table
// ============================================================================

export const datasets = pgTable(
  'datasets',
  {
    id: serial('id').primaryKey(),
    processingJobId: integer('processing_job_id')
      .notNull()
      .references(() => processingJobs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    format: text('format').notNull().default('jsonl'), // jsonl | csv | json
    recordCount: integer('record_count').notNull(),
    fileSize: integer('file_size').notNull(),
    storageKey: text('storage_key').notNull(),
    dataContent: text('data_content'), // JSON array or Base64
    downloadUrl: text('download_url'),
    metadata: text('metadata'), // JSON
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_datasets_processing_job_id').on(table.processingJobId),
    index('idx_datasets_expires_at').on(table.expiresAt),
  ]
);

export type Dataset = typeof datasets.$inferSelect;
export type NewDataset = typeof datasets.$inferInsert;

// ============================================================================
// Relations
// ============================================================================

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  inviter: one(users, {
    fields: [users.invitedBy],
    references: [users.id],
    relationName: 'userInvites',
  }),
  invitedUsers: many(users, { relationName: 'userInvites' }),
  refreshTokens: many(refreshTokens),
  projects: many(projects),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, {
    fields: [projects.userId],
    references: [users.id],
  }),
  sources: many(sources),
}));

export const sourcesRelations = relations(sources, ({ one, many }) => ({
  project: one(projects, {
    fields: [sources.projectId],
    references: [projects.id],
  }),
  sourceFile: one(sourceFiles),
  sourceConfiguration: one(sourceConfigurations),
  apiCredential: one(apiCredentials),
  processingJobs: many(processingJobs),
}));

export const sourceFilesRelations = relations(sourceFiles, ({ one }) => ({
  source: one(sources, {
    fields: [sourceFiles.sourceId],
    references: [sources.id],
  }),
}));

export const sourceConfigurationsRelations = relations(sourceConfigurations, ({ one }) => ({
  source: one(sources, {
    fields: [sourceConfigurations.sourceId],
    references: [sources.id],
  }),
}));

export const apiCredentialsRelations = relations(apiCredentials, ({ one }) => ({
  source: one(sources, {
    fields: [apiCredentials.sourceId],
    references: [sources.id],
  }),
}));

export const processingJobsRelations = relations(processingJobs, ({ one, many }) => ({
  source: one(sources, {
    fields: [processingJobs.sourceId],
    references: [sources.id],
  }),
  datasets: many(datasets),
}));

export const datasetsRelations = relations(datasets, ({ one }) => ({
  processingJob: one(processingJobs, {
    fields: [datasets.processingJobId],
    references: [processingJobs.id],
  }),
}));
