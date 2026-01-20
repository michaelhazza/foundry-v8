/**
 * Foundry Server Entry Point
 *
 * Express server with middleware, routing, and error handling
 *
 * @see Architecture Section 6.1
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import { config } from './config';
import { errorHandler, notFoundHandler } from './middleware/error-handler';

// Import routes (to be implemented)
import authRoutes from './routes/auth.routes';
import organizationsRoutes from './routes/organizations.routes';
import projectsRoutes from './routes/projects.routes';
import sourcesRoutes from './routes/sources.routes';
import processingRoutes from './routes/processing.routes';
import datasetsRoutes from './routes/datasets.routes';
import integrationsRoutes from './routes/integrations.routes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// ============================================================================
// Security Middleware
// ============================================================================

// Helmet security headers
app.use(
  helmet({
    contentSecurityPolicy: config.isProduction
      ? undefined
      : false, // Disable CSP in development for Vite HMR
  })
);

// CORS configuration
app.use(
  cors({
    origin: config.isProduction
      ? process.env.FRONTEND_URL || true
      : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
        details: {
          retryAfter: Math.ceil(config.rateLimitWindowMs / 1000),
        },
      },
    });
  },
});
app.use('/api', limiter);

// ============================================================================
// Body Parsing & Logging
// ============================================================================

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging
app.use(
  morgan(config.isProduction ? 'combined' : 'dev', {
    skip: (req) => req.path === '/api/health',
  })
);

// ============================================================================
// Health Check Endpoint
// ============================================================================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// API Routes
// ============================================================================

app.use('/api/auth', authRoutes);
app.use('/api/organizations', organizationsRoutes);
app.use('/api/projects', projectsRoutes);
// Sources routes use nested paths, mount at /api to handle /api/projects/:id/sources and /api/sources/:id
app.use('/api', sourcesRoutes);
// Processing routes handle both /api/sources/:id/process and /api/jobs/:id
app.use('/api', processingRoutes);
app.use('/api/datasets', datasetsRoutes);
app.use('/api/integrations', integrationsRoutes);

// ============================================================================
// Static Files (Production)
// ============================================================================

if (config.isProduction) {
  const publicPath = path.join(__dirname, '../dist/public');
  app.use(express.static(publicPath));

  // SPA fallback - serve index.html for non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(publicPath, 'index.html'));
  });
}

// ============================================================================
// Error Handling
// ============================================================================

// 404 handler for undefined routes
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// ============================================================================
// Server Startup
// ============================================================================

const PORT = config.isProduction ? config.port : 5001;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

export default app;
