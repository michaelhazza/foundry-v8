/**
 * Shared API types between client and server
 */

// Response envelope
export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, any>;
}

// Pagination
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

// Error
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

// Auth
export interface User {
  id: number;
  email: string;
  name: string | null;
  role: 'admin' | 'user';
  organization: {
    id: number;
    name: string;
    slug: string;
  };
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: User;
}

// Projects
export interface Project {
  id: number;
  name: string;
  description: string | null;
  status: 'active' | 'archived' | 'deleted';
  sourceCount?: number;
  createdAt: string;
  updatedAt: string;
}

// Sources
export interface Source {
  id: number;
  projectId: number;
  name: string;
  type: 'file' | 'teamwork_desk' | 'api';
  status: 'pending' | 'configured' | 'processing' | 'ready' | 'error';
  metadata: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

export interface SourceConfiguration {
  targetSchema: {
    name: string;
    fields: Array<{
      name: string;
      type: string;
      required?: boolean;
    }>;
  };
  fieldMappings: Record<string, string>;
  deidentificationRules: Array<{
    field: string;
    action: 'redact' | 'tokenize' | 'hash' | 'mask' | 'remove';
    pattern?: string | null;
  }>;
}

// Processing Jobs
export interface ProcessingJob {
  id: number;
  sourceId: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  stage: string | null;
  progress: number;
  recordsProcessed: number;
  totalRecords: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

// Datasets
export interface Dataset {
  id: number;
  processingJobId: number;
  name: string;
  format: 'jsonl' | 'csv' | 'json';
  recordCount: number;
  fileSize: number;
  downloadUrl: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
}
