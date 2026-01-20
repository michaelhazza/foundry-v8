/**
 * Rate limiting middleware configurations
 *
 * Different rate limits for different endpoints
 *
 * @see Architecture Section 6.2
 */

import { rateLimit } from 'express-rate-limit';

/**
 * Strict rate limiter for authentication endpoints
 * 5 requests per 15 minutes
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts. Please try again later.',
        details: {
          retryAfter: 900, // 15 minutes in seconds
        },
      },
    });
  },
});

/**
 * Standard rate limiter for API endpoints
 * 100 requests per 15 minutes
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
        details: {
          retryAfter: 900,
        },
      },
    });
  },
});

/**
 * Relaxed rate limiter for read-heavy endpoints
 * 1000 requests per 15 minutes
 */
export const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * File upload rate limiter
 * 10 uploads per hour
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many file uploads. Please try again later.',
        details: {
          retryAfter: 3600,
        },
      },
    });
  },
});
