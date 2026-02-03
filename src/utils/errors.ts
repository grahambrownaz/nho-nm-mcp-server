/**
 * Custom error classes for the NHO/NM MCP Server
 * Provides structured error handling with appropriate error codes
 */

/**
 * Base error class for all MCP server errors
 */
export class McpError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'McpError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        name: this.name,
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

/**
 * Authentication errors (401)
 */
export class AuthenticationError extends McpError {
  constructor(message: string = 'Authentication required', details?: Record<string, unknown>) {
    super(message, 'AUTHENTICATION_ERROR', 401, details);
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization errors (403)
 */
export class AuthorizationError extends McpError {
  constructor(message: string = 'Access denied', details?: Record<string, unknown>) {
    super(message, 'AUTHORIZATION_ERROR', 403, details);
    this.name = 'AuthorizationError';
  }
}

/**
 * Validation errors (400)
 */
export class ValidationError extends McpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * Resource not found errors (404)
 */
export class NotFoundError extends McpError {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404, { resource, identifier });
    this.name = 'NotFoundError';
  }
}

/**
 * Rate limit errors (429)
 */
export class RateLimitError extends McpError {
  public readonly retryAfter: number;

  constructor(retryAfter: number = 60) {
    super(
      `Rate limit exceeded. Please retry after ${retryAfter} seconds`,
      'RATE_LIMIT_EXCEEDED',
      429,
      { retryAfter }
    );
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Subscription/quota errors (402)
 */
export class QuotaExceededError extends McpError {
  constructor(
    quotaType: string,
    current: number,
    limit: number
  ) {
    super(
      `${quotaType} quota exceeded: ${current}/${limit}`,
      'QUOTA_EXCEEDED',
      402,
      { quotaType, current, limit }
    );
    this.name = 'QuotaExceededError';
  }
}

/**
 * External service errors (502)
 */
export class ExternalServiceError extends McpError {
  constructor(service: string, originalError?: Error) {
    super(
      `External service error: ${service}`,
      'EXTERNAL_SERVICE_ERROR',
      502,
      {
        service,
        originalMessage: originalError?.message,
      }
    );
    this.name = 'ExternalServiceError';
  }
}

/**
 * Configuration errors (500)
 */
export class ConfigurationError extends McpError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR', 500);
    this.name = 'ConfigurationError';
  }
}

/**
 * Database errors (500)
 */
export class DatabaseError extends McpError {
  constructor(message: string, originalError?: Error) {
    super(
      `Database error: ${message}`,
      'DATABASE_ERROR',
      500,
      { originalMessage: originalError?.message }
    );
    this.name = 'DatabaseError';
  }
}

/**
 * Type guard to check if an error is an McpError
 */
export function isMcpError(error: unknown): error is McpError {
  return error instanceof McpError;
}

/**
 * Formats any error into a consistent structure
 */
export function formatError(error: unknown): {
  code: string;
  message: string;
  details?: Record<string, unknown>;
} {
  if (isMcpError(error)) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'INTERNAL_ERROR',
      message: error.message,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: String(error),
  };
}
