/**
 * REST API Authentication Middleware
 * Validates API keys and attaches tenant context to requests
 */

import type { Request, Response, NextFunction } from 'express';
import { validateApiKey, extractApiKey } from '../../utils/auth.js';

/**
 * Authentication middleware for REST API routes
 * Validates API key from headers and attaches tenant context
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract API key from headers
    const apiKey = extractApiKey({
      'x-api-key': req.headers['x-api-key'] as string | undefined,
      authorization: req.headers.authorization,
    });

    if (!apiKey) {
      res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'API key is required. Provide via X-API-Key header or Authorization: Bearer <key>',
        },
        meta: {
          requestId: req.requestId,
          timestamp: req.timestamp,
        },
      });
      return;
    }

    // Validate API key and get tenant context
    const context = await validateApiKey(apiKey);

    // Attach context to request
    req.tenantContext = context;

    next();
  } catch (error) {
    // Handle authentication errors
    const message = error instanceof Error ? error.message : 'Authentication failed';
    const statusCode = message.includes('expired') ? 401 : 401;

    res.status(statusCode).json({
      success: false,
      error: {
        code: 'AUTHENTICATION_FAILED',
        message,
      },
      meta: {
        requestId: req.requestId,
        timestamp: req.timestamp,
      },
    });
  }
}

/**
 * Optional auth middleware - allows requests without API key but attaches context if present
 */
export async function optionalAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const apiKey = extractApiKey({
      'x-api-key': req.headers['x-api-key'] as string | undefined,
      authorization: req.headers.authorization,
    });

    if (apiKey) {
      const context = await validateApiKey(apiKey);
      req.tenantContext = context;
    }

    next();
  } catch {
    // Ignore auth errors for optional auth
    next();
  }
}

/**
 * Permission check middleware factory
 * Creates middleware that checks for specific permissions
 */
export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.tenantContext) {
      res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication is required',
        },
        meta: {
          requestId: req.requestId,
          timestamp: req.timestamp,
        },
      });
      return;
    }

    const { permissions } = req.tenantContext;

    // Check for admin/wildcard permissions
    if (permissions.includes('*') || permissions.includes('admin')) {
      next();
      return;
    }

    // Check for exact permission
    if (permissions.includes(permission)) {
      next();
      return;
    }

    // Check for category wildcard
    const [category] = permission.split(':');
    if (permissions.includes(`${category}:*`)) {
      next();
      return;
    }

    res.status(403).json({
      success: false,
      error: {
        code: 'PERMISSION_DENIED',
        message: `Permission denied: ${permission} required`,
        details: { requiredPermission: permission },
      },
      meta: {
        requestId: req.requestId,
        timestamp: req.timestamp,
      },
    });
  };
}
