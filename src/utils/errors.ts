/**
 * Custom error classes for the NHO/NM MCP Server
 * Provides structured error handling with appropriate error codes
 */

/**
 * Base error class for all application errors
 * Includes isOperational flag to distinguish between operational errors
 * (expected errors like validation failures) and programming errors (bugs)
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
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
 * Base error class for all MCP server errors
 * Extends AppError for backward compatibility
 */
export class McpError extends AppError {
  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message, code, statusCode, true, details);
    this.name = 'McpError';
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
 * Platform sync errors (502)
 */
export class PlatformSyncError extends McpError {
  constructor(platform: string, message: string, details?: Record<string, unknown>) {
    super(
      `Platform sync error (${platform}): ${message}`,
      'PLATFORM_SYNC_ERROR',
      502,
      { platform, ...details }
    );
    this.name = 'PlatformSyncError';
  }
}

/**
 * Print API errors (502)
 */
export class PrintApiError extends McpError {
  constructor(provider: string, message: string, details?: Record<string, unknown>) {
    super(
      `Print API error (${provider}): ${message}`,
      'PRINT_API_ERROR',
      502,
      { provider, ...details }
    );
    this.name = 'PrintApiError';
  }
}

/**
 * Billing errors (402)
 */
export class BillingError extends McpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'BILLING_ERROR', 402, details);
    this.name = 'BillingError';
  }
}

/**
 * SFTP delivery errors (502)
 */
export class SftpError extends McpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(
      `SFTP error: ${message}`,
      'SFTP_ERROR',
      502,
      details
    );
    this.name = 'SftpError';
  }
}

/**
 * Template errors (400)
 */
export class TemplateError extends McpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'TEMPLATE_ERROR', 400, details);
    this.name = 'TemplateError';
  }
}

/**
 * PDF generation errors (500)
 */
export class PdfGenerationError extends McpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(
      `PDF generation error: ${message}`,
      'PDF_GENERATION_ERROR',
      500,
      details
    );
    this.name = 'PdfGenerationError';
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

/**
 * Wraps an async function with standardized error handling
 */
export function withErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  context: string
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      // Log the error with context
      console.error(`[${context}] Error:`, error);

      // Re-throw McpErrors as-is
      if (isMcpError(error)) {
        throw error;
      }

      // Wrap other errors
      throw new McpError(
        error instanceof Error ? error.message : 'An unexpected error occurred',
        'INTERNAL_ERROR',
        500,
        { context, originalError: error instanceof Error ? error.name : undefined }
      );
    }
  }) as T;
}

/**
 * Safely execute an external API call with error handling
 */
export async function safeApiCall<T>(
  serviceName: string,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[${serviceName}] ${operation} failed:`, error);

    if (isMcpError(error)) {
      throw error;
    }

    throw new ExternalServiceError(
      `${serviceName} ${operation}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Creates a user-friendly error message from an error
 */
export function getUserFriendlyMessage(error: unknown): string {
  if (isMcpError(error)) {
    switch (error.code) {
      case 'AUTHENTICATION_ERROR':
        return 'Please check your API key and try again.';
      case 'AUTHORIZATION_ERROR':
        return 'You do not have permission to perform this action.';
      case 'VALIDATION_ERROR':
        return error.message;
      case 'NOT_FOUND':
        return error.message;
      case 'RATE_LIMIT_EXCEEDED':
        return 'Too many requests. Please wait a moment and try again.';
      case 'QUOTA_EXCEEDED':
        return 'You have exceeded your usage quota. Please upgrade your plan or wait for the next billing cycle.';
      case 'EXTERNAL_SERVICE_ERROR':
        return 'An external service is temporarily unavailable. Please try again later.';
      case 'PLATFORM_SYNC_ERROR':
        return 'Failed to sync with the external platform. Please check your connection settings.';
      case 'PRINT_API_ERROR':
        return 'Failed to submit print job. Please check your print API configuration.';
      case 'BILLING_ERROR':
        return 'There was an issue with billing. Please check your payment information.';
      case 'SFTP_ERROR':
        return 'Failed to deliver files via SFTP. Please check your SFTP settings.';
      default:
        return 'An unexpected error occurred. Please try again later.';
    }
  }

  return 'An unexpected error occurred. Please try again later.';
}

/**
 * Error logging with structured data
 */
export function logError(
  context: string,
  error: unknown,
  additionalData?: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString();
  const errorData = formatError(error);

  const logEntry = {
    timestamp,
    context,
    ...errorData,
    ...additionalData,
    stack: error instanceof Error ? error.stack : undefined,
  };

  // In production, this could send to a logging service
  console.error(JSON.stringify(logEntry, null, 2));
}
