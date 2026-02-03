/**
 * Structured JSON logging with pino
 * Provides consistent logging across the application
 */

import pino from 'pino';

/**
 * Base logger configuration
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // In development, use pino-pretty for readable output
  ...(process.env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
});

/**
 * Create a child logger with tenant context
 */
export function createTenantLogger(tenantId: string) {
  return logger.child({ tenantId });
}

/**
 * Create a child logger with request context
 */
export function createRequestLogger(requestId: string, tenantId?: string) {
  return logger.child({
    requestId,
    ...(tenantId && { tenantId }),
  });
}

/**
 * Create a child logger for a specific tool
 */
export function createToolLogger(toolName: string, tenantId: string) {
  return logger.child({ tool: toolName, tenantId });
}

/**
 * Sanitize input for logging (remove sensitive fields)
 */
export function sanitizeForLogging(input: unknown): unknown {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input !== 'object') {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map(sanitizeForLogging);
  }

  const sensitiveKeys = [
    'password',
    'secret',
    'apiKey',
    'api_key',
    'token',
    'authorization',
    'credit_card',
    'creditCard',
    'ssn',
    'social_security',
  ];

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLogging(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Log tool invocation with timing
 */
export async function logToolExecution<T>(
  toolName: string,
  tenantId: string,
  input: unknown,
  operation: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  const log = createToolLogger(toolName, tenantId);

  log.info({ input: sanitizeForLogging(input) }, 'Tool invoked');

  try {
    const result = await operation();
    const duration = Date.now() - start;

    log.info({ duration, success: true }, 'Tool completed');

    return result;
  } catch (error) {
    const duration = Date.now() - start;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    log.error({ duration, success: false, error: errorMessage }, 'Tool failed');

    throw error;
  }
}

/**
 * Log HTTP request
 */
export function logHttpRequest(
  method: string,
  path: string,
  statusCode: number,
  duration: number,
  requestId?: string,
  tenantId?: string
): void {
  const log = requestId ? createRequestLogger(requestId, tenantId) : logger;

  log.info(
    {
      http: {
        method,
        path,
        statusCode,
        duration,
      },
    },
    `${method} ${path} ${statusCode} ${duration}ms`
  );
}

/**
 * Log external API call
 */
export function logExternalApiCall(
  service: string,
  operation: string,
  success: boolean,
  duration: number,
  error?: string
): void {
  const logData = {
    service,
    operation,
    success,
    duration,
    ...(error && { error }),
  };

  if (success) {
    logger.info(logData, `External API call: ${service}.${operation}`);
  } else {
    logger.error(logData, `External API call failed: ${service}.${operation}`);
  }
}

/**
 * Log database query (for slow query detection)
 */
export function logSlowQuery(query: string, duration: number, threshold: number = 1000): void {
  if (duration > threshold) {
    logger.warn(
      {
        query: query.substring(0, 200), // Truncate long queries
        duration,
        threshold,
      },
      'Slow query detected'
    );
  }
}

export default logger;
