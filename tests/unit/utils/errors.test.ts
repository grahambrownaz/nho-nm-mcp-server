/**
 * Tests for Custom Error Types
 */

import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  NotFoundError,
  AuthorizationError,
  ExternalServiceError,
  RateLimitError,
  ConflictError,
  BadRequestError,
  isAppError,
  toHttpError,
  errorHandler,
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
      const error = new AppError('Detailed error', 'DETAILED', 500, {
        field: 'email',
        reason: 'invalid format',
      });

      expect(error.details).toEqual({
        field: 'email',
        reason: 'invalid format',
      });
    });

    it('serializes to JSON correctly', () => {
      const error = new AppError('JSON error', 'JSON_TEST', 400, { foo: 'bar' });
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'JSON error',
        code: 'JSON_TEST',
        statusCode: 400,
        details: { foo: 'bar' },
      });
    });
  });

  describe('ValidationError', () => {
    it('creates validation error with 400 status', () => {
      const error = new ValidationError('Invalid input');

      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
    });

    it('supports field-specific errors', () => {
      const error = new ValidationError('Validation failed', {
        fields: {
          email: 'Invalid email format',
          zip: 'Must be 5 digits',
        },
      });

      expect(error.details.fields).toEqual({
        email: 'Invalid email format',
        zip: 'Must be 5 digits',
      });
    });

    it('handles array of errors', () => {
      const error = new ValidationError('Multiple errors', {
        errors: [
          { field: 'email', message: 'Required' },
          { field: 'name', message: 'Too short' },
        ],
      });

      expect(error.details.errors).toHaveLength(2);
    });

    it('works with Zod error format', () => {
      const zodErrors = {
        issues: [
          { path: ['email'], message: 'Invalid email' },
          { path: ['age'], message: 'Must be positive' },
        ],
      };

      const error = ValidationError.fromZodError(zodErrors);

      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details.errors).toBeDefined();
    });
  });

  describe('NotFoundError', () => {
    it('creates not found error with 404 status', () => {
      const error = new NotFoundError('User not found');

      expect(error.message).toBe('User not found');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
    });

    it('supports resource type', () => {
      const error = new NotFoundError('Record not found', {
        resourceType: 'subscription',
        resourceId: 'sub-123',
      });

      expect(error.details.resourceType).toBe('subscription');
      expect(error.details.resourceId).toBe('sub-123');
    });

    it('provides factory method', () => {
      const error = NotFoundError.forResource('Tenant', 'tenant-456');

      expect(error.message).toBe('Tenant not found: tenant-456');
      expect(error.details.resourceType).toBe('Tenant');
      expect(error.details.resourceId).toBe('tenant-456');
    });
  });

  describe('AuthorizationError', () => {
    it('creates authorization error with 403 status', () => {
      const error = new AuthorizationError('Access denied');

      expect(error.message).toBe('Access denied');
      expect(error.code).toBe('FORBIDDEN');
      expect(error.statusCode).toBe(403);
    });

    it('supports action and resource', () => {
      const error = new AuthorizationError('Not authorized', {
        action: 'delete',
        resource: 'subscription',
      });

      expect(error.details.action).toBe('delete');
      expect(error.details.resource).toBe('subscription');
    });

    it('creates authentication error with 401 status', () => {
      const error = AuthorizationError.unauthenticated('Invalid API key');

      expect(error.message).toBe('Invalid API key');
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.statusCode).toBe(401);
    });

    it('creates permission error', () => {
      const error = AuthorizationError.insufficientPermissions('admin', 'templates');

      expect(error.message).toContain('admin');
      expect(error.details.requiredRole).toBe('admin');
    });
  });

  describe('ExternalServiceError', () => {
    it('creates external service error with 502 status', () => {
      const error = new ExternalServiceError('Stripe API failed');

      expect(error.message).toBe('Stripe API failed');
      expect(error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(error.statusCode).toBe(502);
    });

    it('identifies service and operation', () => {
      const error = new ExternalServiceError('API call failed', {
        service: 'stripe',
        operation: 'createPaymentIntent',
        originalError: 'Card declined',
      });

      expect(error.details.service).toBe('stripe');
      expect(error.details.operation).toBe('createPaymentIntent');
      expect(error.details.originalError).toBe('Card declined');
    });

    it('supports timeout errors', () => {
      const error = ExternalServiceError.timeout('HubSpot', 30000);

      expect(error.message).toContain('HubSpot');
      expect(error.message).toContain('timeout');
      expect(error.details.timeoutMs).toBe(30000);
    });

    it('supports connection errors', () => {
      const error = ExternalServiceError.connectionFailed('Mailchimp');

      expect(error.message).toContain('Mailchimp');
      expect(error.details.service).toBe('Mailchimp');
    });

    it('wraps unknown errors', () => {
      const originalError = new Error('Something broke');
      const error = ExternalServiceError.wrap(originalError, 'SFTP');

      expect(error.details.service).toBe('SFTP');
      expect(error.details.originalError).toBe('Something broke');
    });
  });

  describe('RateLimitError', () => {
    it('creates rate limit error with 429 status', () => {
      const error = new RateLimitError('Too many requests');

      expect(error.message).toBe('Too many requests');
      expect(error.code).toBe('RATE_LIMITED');
      expect(error.statusCode).toBe(429);
    });

    it('includes retry information', () => {
      const error = new RateLimitError('Rate limit exceeded', {
        retryAfterMs: 60000,
        limit: 100,
        remaining: 0,
      });

      expect(error.details.retryAfterMs).toBe(60000);
      expect(error.details.limit).toBe(100);
      expect(error.details.remaining).toBe(0);
    });

    it('calculates retry-after header', () => {
      const error = new RateLimitError('Rate limited', {
        retryAfterMs: 30000,
      });

      expect(error.retryAfterSeconds).toBe(30);
    });
  });

  describe('ConflictError', () => {
    it('creates conflict error with 409 status', () => {
      const error = new ConflictError('Resource already exists');

      expect(error.message).toBe('Resource already exists');
      expect(error.code).toBe('CONFLICT');
      expect(error.statusCode).toBe(409);
    });

    it('identifies conflicting resource', () => {
      const error = new ConflictError('Duplicate email', {
        field: 'email',
        value: 'test@example.com',
      });

      expect(error.details.field).toBe('email');
      expect(error.details.value).toBe('test@example.com');
    });
  });

  describe('BadRequestError', () => {
    it('creates bad request error with 400 status', () => {
      const error = new BadRequestError('Invalid request');

      expect(error.message).toBe('Invalid request');
      expect(error.code).toBe('BAD_REQUEST');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('isAppError', () => {
    it('returns true for AppError instances', () => {
      expect(isAppError(new AppError('test', 'TEST'))).toBe(true);
      expect(isAppError(new ValidationError('test'))).toBe(true);
      expect(isAppError(new NotFoundError('test'))).toBe(true);
      expect(isAppError(new AuthorizationError('test'))).toBe(true);
    });

    it('returns false for regular errors', () => {
      expect(isAppError(new Error('test'))).toBe(false);
      expect(isAppError(new TypeError('test'))).toBe(false);
    });

    it('returns false for non-errors', () => {
      expect(isAppError(null)).toBe(false);
      expect(isAppError(undefined)).toBe(false);
      expect(isAppError('error')).toBe(false);
      expect(isAppError({ message: 'error' })).toBe(false);
    });
  });

  describe('toHttpError', () => {
    it('converts AppError to HTTP response', () => {
      const error = new ValidationError('Invalid email', { field: 'email' });
      const httpError = toHttpError(error);

      expect(httpError).toEqual({
        status: 400,
        body: {
          error: 'Invalid email',
          code: 'VALIDATION_ERROR',
          details: { field: 'email' },
        },
      });
    });

    it('converts regular error to 500 response', () => {
      const error = new Error('Unknown error');
      const httpError = toHttpError(error);

      expect(httpError.status).toBe(500);
      expect(httpError.body.error).toBe('Internal server error');
      expect(httpError.body.code).toBe('INTERNAL_ERROR');
    });

    it('hides error details in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Secret database error');
      const httpError = toHttpError(error);

      expect(httpError.body.error).toBe('Internal server error');
      expect(httpError.body.details).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });

    it('exposes error details in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Database connection failed');
      const httpError = toHttpError(error);

      expect(httpError.body.details?.originalMessage).toBe('Database connection failed');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('errorHandler', () => {
    it('handles ValidationError', () => {
      const error = new ValidationError('Bad input');
      const result = errorHandler(error);

      expect(result.statusCode).toBe(400);
      expect(result.body.code).toBe('VALIDATION_ERROR');
    });

    it('handles NotFoundError', () => {
      const error = new NotFoundError('Not found');
      const result = errorHandler(error);

      expect(result.statusCode).toBe(404);
      expect(result.body.code).toBe('NOT_FOUND');
    });

    it('handles AuthorizationError', () => {
      const error = new AuthorizationError('Forbidden');
      const result = errorHandler(error);

      expect(result.statusCode).toBe(403);
      expect(result.body.code).toBe('FORBIDDEN');
    });

    it('handles ExternalServiceError', () => {
      const error = new ExternalServiceError('Service unavailable');
      const result = errorHandler(error);

      expect(result.statusCode).toBe(502);
      expect(result.body.code).toBe('EXTERNAL_SERVICE_ERROR');
    });

    it('handles RateLimitError', () => {
      const error = new RateLimitError('Too many requests', {
        retryAfterMs: 60000,
      });
      const result = errorHandler(error);

      expect(result.statusCode).toBe(429);
      expect(result.headers?.['Retry-After']).toBe('60');
    });

    it('handles unknown errors', () => {
      const error = new Error('Something unexpected');
      const result = errorHandler(error);

      expect(result.statusCode).toBe(500);
      expect(result.body.code).toBe('INTERNAL_ERROR');
    });

    it('handles null/undefined', () => {
      const result1 = errorHandler(null);
      const result2 = errorHandler(undefined);

      expect(result1.statusCode).toBe(500);
      expect(result2.statusCode).toBe(500);
    });

    it('handles string errors', () => {
      const result = errorHandler('String error message');

      expect(result.statusCode).toBe(500);
      expect(result.body.error).toBe('Internal server error');
    });
  });

  describe('Error chaining', () => {
    it('supports cause for error chaining', () => {
      const originalError = new Error('Database connection failed');
      const error = new ExternalServiceError('Failed to fetch data', {
        service: 'database',
        cause: originalError,
      });

      expect(error.cause).toBe(originalError);
    });

    it('unwraps nested errors', () => {
      const dbError = new Error('Connection timeout');
      const serviceError = new ExternalServiceError('Service failed', {
        service: 'postgres',
        cause: dbError,
      });
      const appError = new AppError('Request failed', 'REQUEST_FAILED', 500, {
        cause: serviceError,
      });

      expect(appError.getRootCause()).toBe(dbError);
    });
  });

  describe('Error formatting', () => {
    it('formats error for logging', () => {
      const error = new ValidationError('Invalid input', {
        fields: { email: 'required' },
      });

      const formatted = error.toLogFormat();

      expect(formatted).toEqual({
        name: 'ValidationError',
        message: 'Invalid input',
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        details: { fields: { email: 'required' } },
        stack: expect.any(String),
      });
    });

    it('formats error for client response', () => {
      const error = new NotFoundError('User not found', {
        resourceId: 'user-123',
      });

      const clientFormat = error.toClientFormat();

      expect(clientFormat).toEqual({
        error: 'User not found',
        code: 'NOT_FOUND',
      });
      // Should not include internal details
      expect(clientFormat.details).toBeUndefined();
    });
  });
});
