/**
 * Rate Limiting Middleware
 * Protects API from abuse with configurable limits
 */

import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';

/**
 * Standard response format for rate limit errors
 */
function rateLimitHandler(_req: Request, res: Response): void {
  res.status(429).json({
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
    },
  });
}

/**
 * Key generator - uses API key if available, otherwise IP
 */
function keyGenerator(req: Request): string {
  // Use tenant ID if authenticated
  const tenantContext = (req as Request & { tenantContext?: { tenant: { id: string } } }).tenantContext;
  if (tenantContext?.tenant?.id) {
    return `tenant:${tenantContext.tenant.id}`;
  }

  // Fall back to API key header
  const apiKey = req.headers['x-api-key'] || req.headers.authorization?.replace('Bearer ', '');
  if (apiKey && typeof apiKey === 'string') {
    return `apikey:${apiKey.substring(0, 16)}`;
  }

  // Fall back to IP address
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `ip:${ip}`;
}

/**
 * Standard API rate limiter
 * 100 requests per minute per key
 */
export const standardRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per window
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  keyGenerator,
  handler: rateLimitHandler,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/api/health' || req.path === '/api/ready' || req.path === '/api/live';
  },
});

/**
 * Strict rate limiter for sensitive endpoints
 * 10 requests per minute per key
 */
export const strictRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: rateLimitHandler,
});

/**
 * Search rate limiter - higher limit for data queries
 * 200 requests per minute per key
 */
export const searchRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // 200 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: rateLimitHandler,
});

/**
 * Webhook rate limiter - allow more requests from known webhook sources
 * 1000 requests per minute
 */
export const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // 1000 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/**
 * Authentication rate limiter - strict limit for auth-related endpoints
 * 5 requests per minute per IP to prevent brute force
 */
export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || 'unknown',
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts. Please try again in a minute.',
      },
    });
  },
});
