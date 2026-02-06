/**
 * Tests for Rate Limiter Utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RateLimiter,
  RateLimiterConfig,
  RateLimitResult,
  leadspleaseRateLimiter,
  printApiRateLimiter,
  stripeRateLimiter,
  toolRateLimiter,
  platformSyncRateLimiter,
  rateLimitMiddleware,
  RateLimitError,
  withRateLimit,
} from '../../../src/utils/rate-limiter.js';

describe('Rate Limiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new RateLimiter({
      maxRequests: 100,
      windowMs: 60000,
    });
  });

  afterEach(() => {
    limiter.destroy();
    vi.useRealTimers();
  });

  describe('allows requests within limit', () => {
    it('allows first request', () => {
      const result = limiter.check('tenant-123');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(99);
    });

    it('allows multiple requests within limit', () => {
      for (let i = 0; i < 10; i++) {
        const result = limiter.check('tenant-123');
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(100 - i - 1);
      }
    });

    it('returns correct remaining count', () => {
      limiter.check('tenant-123');
      limiter.check('tenant-123');
      const result = limiter.check('tenant-123');

      expect(result.remaining).toBe(97);
    });
  });

  describe('blocks requests over limit', () => {
    it('blocks request when limit exceeded', () => {
      const smallLimiter = new RateLimiter({
        maxRequests: 3,
        windowMs: 60000,
      });

      // Use up the limit
      smallLimiter.check('tenant-123');
      smallLimiter.check('tenant-123');
      smallLimiter.check('tenant-123');

      // This should be blocked
      const result = smallLimiter.check('tenant-123');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);

      smallLimiter.destroy();
    });

    it('returns retry after time when blocked', () => {
      const smallLimiter = new RateLimiter({
        maxRequests: 1,
        windowMs: 60000,
      });

      smallLimiter.check('tenant-123');
      const result = smallLimiter.check('tenant-123');

      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(60000);

      smallLimiter.destroy();
    });

    it('continues blocking until window resets', () => {
      const smallLimiter = new RateLimiter({
        maxRequests: 2,
        windowMs: 60000,
      });

      smallLimiter.check('tenant-123');
      smallLimiter.check('tenant-123');

      // Advance time but not past window
      vi.advanceTimersByTime(30000);

      const result = smallLimiter.check('tenant-123');
      expect(result.allowed).toBe(false);

      smallLimiter.destroy();
    });
  });

  describe('resets after window', () => {
    it('allows requests after window expires', () => {
      const smallLimiter = new RateLimiter({
        maxRequests: 2,
        windowMs: 60000,
      });

      // Use up the limit
      smallLimiter.check('tenant-123');
      smallLimiter.check('tenant-123');

      // Should be blocked
      let result = smallLimiter.check('tenant-123');
      expect(result.allowed).toBe(false);

      // Advance past window
      vi.advanceTimersByTime(61000);

      // Should be allowed again
      result = smallLimiter.check('tenant-123');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);

      smallLimiter.destroy();
    });

    it('resets count after window', () => {
      const smallLimiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 60000,
      });

      // Use up some of the limit
      smallLimiter.check('tenant-123');
      smallLimiter.check('tenant-123');
      smallLimiter.check('tenant-123');

      // Advance past window
      vi.advanceTimersByTime(61000);

      // Count should be reset
      const result = smallLimiter.check('tenant-123');
      expect(result.remaining).toBe(4);

      smallLimiter.destroy();
    });
  });

  describe('per-tenant limits work', () => {
    it('tracks limits separately per tenant', () => {
      const smallLimiter = new RateLimiter({
        maxRequests: 2,
        windowMs: 60000,
      });

      // Use up tenant 1's limit
      smallLimiter.check('tenant-1');
      smallLimiter.check('tenant-1');

      // Tenant 1 should be blocked
      const result1 = smallLimiter.check('tenant-1');
      expect(result1.allowed).toBe(false);

      // Tenant 2 should still be allowed
      const result2 = smallLimiter.check('tenant-2');
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(1);

      smallLimiter.destroy();
    });

    it('allows different limiters with different configs', () => {
      const premiumLimiter = new RateLimiter({
        maxRequests: 1000,
        windowMs: 60000,
      });

      const basicLimiter = new RateLimiter({
        maxRequests: 100,
        windowMs: 60000,
      });

      const premiumResult = premiumLimiter.check('tenant');
      const basicResult = basicLimiter.check('tenant');

      expect(premiumResult.remaining).toBe(999);
      expect(basicResult.remaining).toBe(99);

      premiumLimiter.destroy();
      basicLimiter.destroy();
    });
  });

  describe('getStatus', () => {
    it('returns current rate limit status', () => {
      limiter.check('tenant-123');
      limiter.check('tenant-123');
      limiter.check('tenant-123');

      const status = limiter.getStatus('tenant-123');

      expect(status.remaining).toBe(97);
      expect(status.allowed).toBe(true);
    });

    it('returns full limit for unknown key', () => {
      const status = limiter.getStatus('unknown-key');

      expect(status.remaining).toBe(100);
      expect(status.allowed).toBe(true);
    });

    it('includes reset time in status', () => {
      limiter.check('tenant-123');

      const status = limiter.getStatus('tenant-123');

      expect(status.resetAt).toBeDefined();
      expect(status.resetAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('reset operations', () => {
    it('resets limit for specific key', () => {
      const smallLimiter = new RateLimiter({
        maxRequests: 2,
        windowMs: 60000,
      });

      smallLimiter.check('tenant-123');
      smallLimiter.check('tenant-123');

      // Should be blocked
      let result = smallLimiter.check('tenant-123');
      expect(result.allowed).toBe(false);

      // Reset the limit
      smallLimiter.reset('tenant-123');

      // Should be allowed again
      result = smallLimiter.check('tenant-123');
      expect(result.allowed).toBe(true);

      smallLimiter.destroy();
    });

    it('reset does not affect other keys', () => {
      limiter.check('tenant-1');
      limiter.check('tenant-2');

      limiter.reset('tenant-1');

      const status1 = limiter.getStatus('tenant-1');
      const status2 = limiter.getStatus('tenant-2');

      expect(status1.remaining).toBe(100); // Reset, so full limit
      expect(status2.remaining).toBe(99); // Still has one request counted
    });
  });

  describe('waitAndCheck', () => {
    it('returns immediately if allowed', async () => {
      const result = await limiter.waitAndCheck('tenant-123');

      expect(result.allowed).toBe(true);
    });

    it('waits if rate limited and retry time is within max wait', async () => {
      const smallLimiter = new RateLimiter({
        maxRequests: 1,
        windowMs: 1000, // 1 second window
      });

      smallLimiter.check('tenant-123');

      // Start wait and check
      const waitPromise = smallLimiter.waitAndCheck('tenant-123', 5000);

      // Advance time past the window
      vi.advanceTimersByTime(1500);

      const result = await waitPromise;
      expect(result.allowed).toBe(true);

      smallLimiter.destroy();
    });

    it('returns blocked if retry time exceeds max wait', async () => {
      const smallLimiter = new RateLimiter({
        maxRequests: 1,
        windowMs: 60000,
      });

      smallLimiter.check('tenant-123');

      const result = await smallLimiter.waitAndCheck('tenant-123', 1000);
      expect(result.allowed).toBe(false);

      smallLimiter.destroy();
    });
  });

  describe('key prefix', () => {
    it('prefixes keys when configured', () => {
      const prefixedLimiter = new RateLimiter({
        maxRequests: 10,
        windowMs: 60000,
        keyPrefix: 'api',
      });

      prefixedLimiter.check('tenant-123');

      // The key should be namespaced, so a different prefix shouldn't share limits
      const noPrefixLimiter = new RateLimiter({
        maxRequests: 10,
        windowMs: 60000,
      });

      const result = noPrefixLimiter.check('tenant-123');
      expect(result.remaining).toBe(9);

      prefixedLimiter.destroy();
      noPrefixLimiter.destroy();
    });
  });

  describe('pre-configured limiters', () => {
    it('exports leadspleaseRateLimiter', () => {
      expect(leadspleaseRateLimiter).toBeInstanceOf(RateLimiter);
    });

    it('exports printApiRateLimiter', () => {
      expect(printApiRateLimiter).toBeInstanceOf(RateLimiter);
    });

    it('exports stripeRateLimiter', () => {
      expect(stripeRateLimiter).toBeInstanceOf(RateLimiter);
    });

    it('exports toolRateLimiter', () => {
      expect(toolRateLimiter).toBeInstanceOf(RateLimiter);
    });

    it('exports platformSyncRateLimiter', () => {
      expect(platformSyncRateLimiter).toBeInstanceOf(RateLimiter);
    });
  });

  describe('rateLimitMiddleware', () => {
    it('provides middleware factory', () => {
      const middleware = rateLimitMiddleware(limiter);
      expect(typeof middleware).toBe('function');
    });

    it('middleware allows requests within limit', async () => {
      const middleware = rateLimitMiddleware(limiter);

      const req = { tenantContext: { tenant: { id: 'tenant-123' } } };
      const res = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await middleware(req as any, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '99');
    });

    it('middleware blocks and returns 429 when exceeded', async () => {
      const smallLimiter = new RateLimiter({
        maxRequests: 1,
        windowMs: 60000,
      });
      const middleware = rateLimitMiddleware(smallLimiter);

      const req = { tenantContext: { tenant: { id: 'tenant-123' } } };
      const res = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      // First request
      await middleware(req as any, res as any, next);
      expect(next).toHaveBeenCalledTimes(1);

      // Second request should be blocked
      await middleware(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'RATE_LIMIT_EXCEEDED',
          }),
        })
      );

      smallLimiter.destroy();
    });

    it('middleware uses IP when no tenant context', async () => {
      const middleware = rateLimitMiddleware(limiter);

      const req = { ip: '192.168.1.1' };
      const res = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await middleware(req as any, res as any, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('RateLimitError', () => {
    it('creates error with message', () => {
      const error = new RateLimitError('Rate limit exceeded', 30000);

      expect(error.message).toBe('Rate limit exceeded');
      expect(error.retryAfterMs).toBe(30000);
      expect(error.name).toBe('RateLimitError');
    });
  });

  describe('withRateLimit decorator', () => {
    it('wraps async functions with rate limiting', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      const keyFn = () => 'test-key';

      const wrapped = withRateLimit<typeof fn>(limiter, keyFn)(fn);

      const result = await wrapped();
      expect(result).toBe('result');
      expect(fn).toHaveBeenCalled();
    });

    it('throws RateLimitError when rate limit exceeded', async () => {
      const smallLimiter = new RateLimiter({
        maxRequests: 1,
        windowMs: 60000,
      });

      const fn = vi.fn().mockResolvedValue('result');
      const keyFn = () => 'test-key';

      const wrapped = withRateLimit<typeof fn>(smallLimiter, keyFn)(fn);

      // First call should succeed
      await wrapped();

      // Second call should throw
      await expect(wrapped()).rejects.toThrow(RateLimitError);

      smallLimiter.destroy();
    });
  });
});
