/**
 * Tests for Custom Error Types
 */

import { describe, it, expect } from 'vitest';
import {
  AppError,
  McpError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  ExternalServiceError,
  RateLimitError,
  QuotaExceededError,
  ConfigurationError,
  DatabaseError,
  PlatformSyncError,
  PrintApiError,
  BillingError,
  SftpError,
  TemplateError,
  PdfGenerationError,
  isMcpError,
  formatError,
  withErrorHandling,
  safeApiCall,
  getUserFriendlyMessage,
  logError,
} from '../../../src/utils/errors.js';

describe('Custom Error Types', () => {
  describe('AppError', () => {
    it('creates error with message and code', () => {
      const error = new AppError('Something went wrong', 'INTERNAL_ERROR');

      expect(error.message).toBe('Something went wrong');
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error instanceof Error).toBe(true);
    });

    it('includes stack trace', () => {
      const error = new AppError('Test error', 'TEST_ERROR');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
    });

    it('allows custom status code', () => {
      const error = new AppError('Custom error', 'CUSTOM', 418);

      expect(error.statusCode).toBe(418);
    });

    it('supports details object', () => {
      const error = new AppError('Detailed error', 'DETAILED', 500, true, {
        field: 'email',
        reason: 'invalid format',
      });

      expect(error.details).toEqual({
        field: 'email',
        reason: 'invalid format',
      });
    });

    it('serializes to JSON correctly', () => {
      const error = new AppError('JSON error', 'JSON_TEST', 400, true, { foo: 'bar' });
      const json = error.toJSON();

      expect(json).toEqual({
        error: {
          name: 'AppError',
          code: 'JSON_TEST',
          message: 'JSON error',
          details: { foo: 'bar' },
        },
      });
    });

    it('has isOperational flag', () => {
      const opError = new AppError('Operational', 'OP_ERROR', 400, true);
      const nonOpError = new AppError('Non-operational', 'NON_OP_ERROR', 500, false);

      expect(opError.isOperational).toBe(true);
      expect(nonOpError.isOperational).toBe(false);
    });
  });

  describe('McpError', () => {
    it('extends AppError', () => {
      const error = new McpError('MCP error', 'MCP_CODE');

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(McpError);
      expect(error.name).toBe('McpError');
    });
  });

  describe('ValidationError', () => {
    it('creates validation error with 400 status', () => {
      const error = new ValidationError('Invalid input');

      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
    });

    it('supports field-specific errors in details', () => {
      const error = new ValidationError('Validation failed', {
        fields: {
          email: 'Invalid email format',
          zip: 'Must be 5 digits',
        },
      });

      expect(error.details?.fields).toEqual({
        email: 'Invalid email format',
        zip: 'Must be 5 digits',
      });
    });
  });

  describe('NotFoundError', () => {
    it('creates not found error with 404 status', () => {
      const error = new NotFoundError('User');

      expect(error.message).toBe('User not found');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
    });

    it('includes identifier in message', () => {
      const error = new NotFoundError('Subscription', 'sub-123');

      expect(error.message).toBe("Subscription with identifier 'sub-123' not found");
      expect(error.details?.resource).toBe('Subscription');
      expect(error.details?.identifier).toBe('sub-123');
    });
  });

  describe('AuthenticationError', () => {
    it('creates authentication error with 401 status', () => {
      const error = new AuthenticationError();

      expect(error.message).toBe('Authentication required');
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.statusCode).toBe(401);
    });

    it('allows custom message', () => {
      const error = new AuthenticationError('Invalid API key');

      expect(error.message).toBe('Invalid API key');
    });
  });

  describe('AuthorizationError', () => {
    it('creates authorization error with 403 status', () => {
      const error = new AuthorizationError();

      expect(error.message).toBe('Access denied');
      expect(error.code).toBe('AUTHORIZATION_ERROR');
      expect(error.statusCode).toBe(403);
    });

    it('supports details about permission', () => {
      const error = new AuthorizationError('Not authorized', {
        action: 'delete',
        resource: 'subscription',
      });

      expect(error.details?.action).toBe('delete');
      expect(error.details?.resource).toBe('subscription');
    });
  });

  describe('ExternalServiceError', () => {
    it('creates external service error with 502 status', () => {
      const error = new ExternalServiceError('Stripe');

      expect(error.message).toBe('External service error: Stripe');
      expect(error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(error.statusCode).toBe(502);
    });

    it('includes original error message', () => {
      const originalError = new Error('Connection timeout');
      const error = new ExternalServiceError('HubSpot', originalError);

      expect(error.details?.originalMessage).toBe('Connection timeout');
    });
  });

  describe('RateLimitError', () => {
    it('creates rate limit error with 429 status', () => {
      const error = new RateLimitError();

      expect(error.message).toContain('Rate limit exceeded');
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.statusCode).toBe(429);
    });

    it('includes retry information', () => {
      const error = new RateLimitError(30);

      expect(error.retryAfter).toBe(30);
      expect(error.details?.retryAfter).toBe(30);
    });
  });

  describe('QuotaExceededError', () => {
    it('creates quota exceeded error with 402 status', () => {
      const error = new QuotaExceededError('Monthly records', 5000, 5000);

      expect(error.code).toBe('QUOTA_EXCEEDED');
      expect(error.statusCode).toBe(402);
      expect(error.message).toContain('Monthly records');
      expect(error.message).toContain('5000/5000');
    });
  });

  describe('ConfigurationError', () => {
    it('creates configuration error with 500 status', () => {
      const error = new ConfigurationError('Missing API key');

      expect(error.code).toBe('CONFIGURATION_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe('Missing API key');
    });
  });

  describe('DatabaseError', () => {
    it('creates database error with 500 status', () => {
      const error = new DatabaseError('Connection failed');

      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.message).toContain('Database error');
    });
  });

  describe('PlatformSyncError', () => {
    it('creates platform sync error with 502 status', () => {
      const error = new PlatformSyncError('Mailchimp', 'Audience sync failed');

      expect(error.code).toBe('PLATFORM_SYNC_ERROR');
      expect(error.statusCode).toBe(502);
      expect(error.message).toContain('Mailchimp');
      expect(error.details?.platform).toBe('Mailchimp');
    });
  });

  describe('PrintApiError', () => {
    it('creates print API error with 502 status', () => {
      const error = new PrintApiError('ReminderMedia', 'Job submission failed');

      expect(error.code).toBe('PRINT_API_ERROR');
      expect(error.statusCode).toBe(502);
      expect(error.details?.provider).toBe('ReminderMedia');
    });
  });

  describe('BillingError', () => {
    it('creates billing error with 402 status', () => {
      const error = new BillingError('Payment failed');

      expect(error.code).toBe('BILLING_ERROR');
      expect(error.statusCode).toBe(402);
    });
  });

  describe('SftpError', () => {
    it('creates SFTP error with 502 status', () => {
      const error = new SftpError('Connection timeout');

      expect(error.code).toBe('SFTP_ERROR');
      expect(error.statusCode).toBe(502);
      expect(error.message).toContain('SFTP error');
    });
  });

  describe('TemplateError', () => {
    it('creates template error with 400 status', () => {
      const error = new TemplateError('Invalid template format');

      expect(error.code).toBe('TEMPLATE_ERROR');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('PdfGenerationError', () => {
    it('creates PDF generation error with 500 status', () => {
      const error = new PdfGenerationError('Rendering failed');

      expect(error.code).toBe('PDF_GENERATION_ERROR');
      expect(error.statusCode).toBe(500);
    });
  });

  describe('isMcpError', () => {
    it('returns true for McpError and subclasses', () => {
      expect(isMcpError(new McpError('test', 'TEST'))).toBe(true);
      expect(isMcpError(new ValidationError('test'))).toBe(true);
      expect(isMcpError(new NotFoundError('test'))).toBe(true);
      expect(isMcpError(new AuthorizationError())).toBe(true);
      expect(isMcpError(new AuthenticationError())).toBe(true);
    });

    it('returns false for regular errors', () => {
      expect(isMcpError(new Error('test'))).toBe(false);
      expect(isMcpError(new TypeError('test'))).toBe(false);
    });

    it('returns false for non-errors', () => {
      expect(isMcpError(null)).toBe(false);
      expect(isMcpError(undefined)).toBe(false);
      expect(isMcpError('error')).toBe(false);
      expect(isMcpError({ message: 'error' })).toBe(false);
    });
  });

  describe('formatError', () => {
    it('formats McpError correctly', () => {
      const error = new ValidationError('Invalid email', { field: 'email' });
      const formatted = formatError(error);

      expect(formatted).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Invalid email',
        details: { field: 'email' },
      });
    });

    it('formats regular Error', () => {
      const error = new Error('Something broke');
      const formatted = formatError(error);

      expect(formatted).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'Something broke',
      });
    });

    it('formats non-Error objects', () => {
      const formatted = formatError('String error');

      expect(formatted).toEqual({
        code: 'UNKNOWN_ERROR',
        message: 'String error',
      });
    });
  });

  describe('withErrorHandling', () => {
    it('passes through successful results', async () => {
      const fn = async () => 'success';
      const wrapped = withErrorHandling(fn, 'test');

      const result = await wrapped();
      expect(result).toBe('success');
    });

    it('re-throws McpError as-is', async () => {
      const error = new ValidationError('Bad input');
      const fn = async () => {
        throw error;
      };
      const wrapped = withErrorHandling(fn, 'test');

      await expect(wrapped()).rejects.toThrow(ValidationError);
    });

    it('wraps regular errors in McpError', async () => {
      const fn = async () => {
        throw new Error('Something broke');
      };
      const wrapped = withErrorHandling(fn, 'test');

      await expect(wrapped()).rejects.toThrow(McpError);
    });
  });

  describe('safeApiCall', () => {
    it('returns result on success', async () => {
      const result = await safeApiCall('TestService', 'fetchData', async () => 'data');

      expect(result).toBe('data');
    });

    it('throws ExternalServiceError on failure', async () => {
      await expect(
        safeApiCall('TestService', 'fetchData', async () => {
          throw new Error('Network error');
        })
      ).rejects.toThrow(ExternalServiceError);
    });

    it('re-throws McpError as-is', async () => {
      await expect(
        safeApiCall('TestService', 'fetchData', async () => {
          throw new ValidationError('Bad input');
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('getUserFriendlyMessage', () => {
    it('returns friendly message for known error codes', () => {
      expect(getUserFriendlyMessage(new AuthenticationError())).toContain('API key');
      expect(getUserFriendlyMessage(new AuthorizationError())).toContain('permission');
      expect(getUserFriendlyMessage(new RateLimitError())).toContain('wait');
      expect(getUserFriendlyMessage(new QuotaExceededError('test', 1, 1))).toContain('quota');
    });

    it('returns ValidationError message directly', () => {
      const error = new ValidationError('Email is invalid');
      expect(getUserFriendlyMessage(error)).toBe('Email is invalid');
    });

    it('returns generic message for unknown errors', () => {
      const message = getUserFriendlyMessage(new Error('Internal error'));
      expect(message).toContain('unexpected error');
    });
  });

  describe('logError', () => {
    it('logs error with context', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const error = new ValidationError('Test error');
      logError('TestContext', error, { userId: '123' });

      expect(consoleSpy).toHaveBeenCalled();
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(loggedData.context).toBe('TestContext');
      expect(loggedData.code).toBe('VALIDATION_ERROR');
      expect(loggedData.userId).toBe('123');

      consoleSpy.mockRestore();
    });
  });
});
