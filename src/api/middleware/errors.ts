/**
 * REST API Error Handling Middleware
 * Provides consistent error responses for the REST API
 */

import type { Request, Response, NextFunction } from 'express';
import { isMcpError, formatError } from '../../utils/errors.js';
import { ZodError } from 'zod';

/**
 * API Error Response structure
 */
interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: {
    requestId: string;
    timestamp: string;
  };
}

/**
 * Creates a standardized error response
 */
function createErrorResponse(
  req: Request,
  code: string,
  message: string,
  details?: Record<string, unknown>
): ApiErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
    meta: {
      requestId: req.requestId || 'unknown',
      timestamp: req.timestamp || new Date().toISOString(),
    },
  };
}

/**
 * Main error handler middleware
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error for debugging
  console.error(`[API Error] ${req.method} ${req.path}:`, error);

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const details = {
      validationErrors: error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
        code: e.code,
      })),
    };

    res.status(400).json(
      createErrorResponse(
        req,
        'VALIDATION_ERROR',
        'Invalid request parameters',
        details
      )
    );
    return;
  }

  // Handle custom MCP errors
  if (isMcpError(error)) {
    const formatted = formatError(error);
    res.status(error.statusCode).json(
      createErrorResponse(
        req,
        formatted.code,
        formatted.message,
        formatted.details
      )
    );
    return;
  }

  // Handle standard JavaScript errors
  if (error instanceof Error) {
    // Check for specific error types
    if (error.message.includes('not found')) {
      res.status(404).json(
        createErrorResponse(req, 'NOT_FOUND', error.message)
      );
      return;
    }

    if (error.message.includes('unauthorized') || error.message.includes('authentication')) {
      res.status(401).json(
        createErrorResponse(req, 'AUTHENTICATION_ERROR', error.message)
      );
      return;
    }

    if (error.message.includes('forbidden') || error.message.includes('permission')) {
      res.status(403).json(
        createErrorResponse(req, 'AUTHORIZATION_ERROR', error.message)
      );
      return;
    }

    // Generic server error
    res.status(500).json(
      createErrorResponse(
        req,
        'INTERNAL_ERROR',
        process.env.NODE_ENV === 'production'
          ? 'An internal error occurred'
          : error.message
      )
    );
    return;
  }

  // Unknown error type
  res.status(500).json(
    createErrorResponse(
      req,
      'UNKNOWN_ERROR',
      'An unexpected error occurred'
    )
  );
}

/**
 * 404 Not Found handler for undefined routes
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  res.status(404).json(
    createErrorResponse(
      req,
      'ROUTE_NOT_FOUND',
      `Route ${req.method} ${req.path} not found`
    )
  );
}

/**
 * Async route handler wrapper
 * Catches async errors and passes them to the error handler
 */
export function asyncHandler<T extends Request, U extends Response>(
  fn: (req: T, res: U, next: NextFunction) => Promise<void>
) {
  return (req: T, res: U, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Creates a standardized success response
 */
export function createSuccessResponse<T>(
  req: Request,
  data: T
): {
  success: true;
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
  };
} {
  return {
    success: true,
    data,
    meta: {
      requestId: req.requestId || 'unknown',
      timestamp: req.timestamp || new Date().toISOString(),
    },
  };
}
