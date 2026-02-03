/**
 * Tests for Rate Limiter Utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RateLimiter,
  rateLimiter,
  RateLimitConfig,
  RateLimitResult,
} from '../../../src/utils/rate-limiter.js';

describe('Rate Limiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new RateLimiter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('allows requests within limit', () => {
    it('allows first request', async () => {
      const result = await limiter.checkLimit({
        key: 'tenant-123',
        limit: 100,
        windowMs: 60000, // 1 minute
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(99);
    });

    it('allows multiple requests within limit', async () => {
      const config: RateLimitConfig = {
        key: 'tenant-123',
        limit: 10,
        windowMs: 60000,
      };

      for (let i = 0; i < 10; i++) {
        const result = await limiter.checkLimit(config);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(10 - i - 1);
      }
    });

    it('returns correct remaining count', async () => {
      const config: RateLimitConfig = {
        key: 'tenant-123',
        limit: 5,
        windowMs: 60000,
      };

      await limiter.checkLimit(config);
      await limiter.checkLimit(config);
      const result = await limiter.checkLimit(config);

      expect(result.remaining).toBe(2);
    });
  });

  describe('blocks requests over limit', () => {
    it('blocks request when limit exceeded', async () => {
      const config: RateLimitConfig = {
        key: 'tenant-123',
        limit: 3,
        windowMs: 60000,
      };

      // Use up the limit
      await limiter.checkLimit(config);
      await limiter.checkLimit(config);
      await limiter.checkLimit(config);

      // This should be blocked
      const result = await limiter.checkLimit(config);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('returns retry after time when blocked', async () => {
      const config: RateLimitConfig = {
        key: 'tenant-123',
        limit: 1,
        windowMs: 60000,
      };

      await limiter.checkLimit(config);
      const result = await limiter.checkLimit(config);

      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(60000);
    });

    it('continues blocking until window resets', async () => {
      const config: RateLimitConfig = {
        key: 'tenant-123',
        limit: 2,
        windowMs: 60000,
      };

      await limiter.checkLimit(config);
      await limiter.checkLimit(config);

      // Advance time but not past window
      vi.advanceTimersByTime(30000);

      const result = await limiter.checkLimit(config);
      expect(result.allowed).toBe(false);
    });
  });

  describe('resets after window', () => {
    it('allows requests after window expires', async () => {
      const config: RateLimitConfig = {
        key: 'tenant-123',
        limit: 2,
        windowMs: 60000,
      };

      // Use up the limit
      await limiter.checkLimit(config);
      await limiter.checkLimit(config);

      // Should be blocked
      let result = await limiter.checkLimit(config);
      expect(result.allowed).toBe(false);

      // Advance past window
      vi.advanceTimersByTime(61000);

      // Should be allowed again
      result = await limiter.checkLimit(config);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
    });

    it('resets count after window', async () => {
      const config: RateLimitConfig = {
        key: 'tenant-123',
        limit: 5,
        windowMs: 60000,
      };

      // Use up some of the limit
      await limiter.checkLimit(config);
      await limiter.checkLimit(config);
      await limiter.checkLimit(config);

      // Advance past window
      vi.advanceTimersByTime(61000);

      // Count should be reset
      const result = await limiter.checkLimit(config);
      expect(result.remaining).toBe(4);
    });

    it('handles sliding window correctly', async () => {
      const config: RateLimitConfig = {
        key: 'tenant-123',
        limit: 3,
        windowMs: 60000,
        sliding: true,
      };

      await limiter.checkLimit(config);
      vi.advanceTimersByTime(20000);

      await limiter.checkLimit(config);
      vi.advanceTimersByTime(20000);

      await limiter.checkLimit(config);
      vi.advanceTimersByTime(20000);

      // First request should have expired (60 seconds passed)
      const result = await limiter.checkLimit(config);
      expect(result.allowed).toBe(true);
    });
  });

  describe('per-tenant limits work', () => {
    it('tracks limits separately per tenant', async () => {
      const configTenant1: RateLimitConfig = {
        key: 'tenant-1',
        limit: 2,
        windowMs: 60000,
      };

      const configTenant2: RateLimitConfig = {
        key: 'tenant-2',
        limit: 2,
        windowMs: 60000,
      };

      // Use up tenant 1's limit
      await limiter.checkLimit(configTenant1);
      await limiter.checkLimit(configTenant1);

      // Tenant 1 should be blocked
      const result1 = await limiter.checkLimit(configTenant1);
      expect(result1.allowed).toBe(false);

      // Tenant 2 should still be allowed
      const result2 = await limiter.checkLimit(configTenant2);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(1);
    });

    it('allows different limits per tenant', async () => {
      const configPremium: RateLimitConfig = {
        key: 'premium-tenant',
        limit: 1000,
        windowMs: 60000,
      };

      const configBasic: RateLimitConfig = {
        key: 'basic-tenant',
        limit: 100,
        windowMs: 60000,
      };

      const premiumResult = await limiter.checkLimit(configPremium);
      const basicResult = await limiter.checkLimit(configBasic);

      expect(premiumResult.remaining).toBe(999);
      expect(basicResult.remaining).toBe(99);
    });

    it('isolates window resets per tenant', async () => {
      const configTenant1: RateLimitConfig = {
        key: 'tenant-1',
        limit: 2,
        windowMs: 60000,
      };

      const configTenant2: RateLimitConfig = {
        key: 'tenant-2',
        limit: 2,
        windowMs: 120000, // Different window
      };

      // Use up both limits
      await limiter.checkLimit(configTenant1);
      await limiter.checkLimit(configTenant1);
      await limiter.checkLimit(configTenant2);
      await limiter.checkLimit(configTenant2);

      // Advance past tenant 1's window but not tenant 2's
      vi.advanceTimersByTime(61000);

      const result1 = await limiter.checkLimit(configTenant1);
      const result2 = await limiter.checkLimit(configTenant2);

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(false);
    });
  });

  describe('increment and consume operations', () => {
    it('consumes multiple tokens at once', async () => {
      const config: RateLimitConfig = {
        key: 'tenant-123',
        limit: 10,
        windowMs: 60000,
      };

      const result = await limiter.consume(config, 5);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5);
    });

    it('blocks when consuming more than remaining', async () => {
      const config: RateLimitConfig = {
        key: 'tenant-123',
        limit: 10,
        windowMs: 60000,
      };

      await limiter.consume(config, 8);
      const result = await limiter.consume(config, 5);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(2);
    });

    it('allows consuming exact remaining amount', async () => {
      const config: RateLimitConfig = {
        key: 'tenant-123',
        limit: 10,
        windowMs: 60000,
      };

      await limiter.consume(config, 7);
      const result = await limiter.consume(config, 3);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('returns current rate limit status', async () => {
      const config: RateLimitConfig = {
        key: 'tenant-123',
        limit: 10,
        windowMs: 60000,
      };

      await limiter.checkLimit(config);
      await limiter.checkLimit(config);
      await limiter.checkLimit(config);

      const status = await limiter.getStatus('tenant-123');

      expect(status).toEqual(
        expect.objectContaining({
          used: 3,
          remaining: 7,
          limit: 10,
        })
      );
    });

    it('returns null for unknown key', async () => {
      const status = await limiter.getStatus('unknown-key');

      expect(status).toBeNull();
    });

    it('includes reset time in status', async () => {
      const config: RateLimitConfig = {
        key: 'tenant-123',
        limit: 10,
        windowMs: 60000,
      };

      await limiter.checkLimit(config);

      const status = await limiter.getStatus('tenant-123');

      expect(status?.resetAt).toBeDefined();
      expect(status?.resetAt).toBeGreaterThan(Date.now());
    });
  });

  describe('reset operations', () => {
    it('resets limit for specific key', async () => {
      const config: RateLimitConfig = {
        key: 'tenant-123',
        limit: 2,
        windowMs: 60000,
      };

      await limiter.checkLimit(config);
      await limiter.checkLimit(config);

      // Should be blocked
      let result = await limiter.checkLimit(config);
      expect(result.allowed).toBe(false);

      // Reset the limit
      await limiter.reset('tenant-123');

      // Should be allowed again
      result = await limiter.checkLimit(config);
      expect(result.allowed).toBe(true);
    });

    it('reset does not affect other keys', async () => {
      const config1: RateLimitConfig = {
        key: 'tenant-1',
        limit: 2,
        windowMs: 60000,
      };

      const config2: RateLimitConfig = {
        key: 'tenant-2',
        limit: 2,
        windowMs: 60000,
      };

      await limiter.checkLimit(config1);
      await limiter.checkLimit(config2);

      await limiter.reset('tenant-1');

      const status1 = await limiter.getStatus('tenant-1');
      const status2 = await limiter.getStatus('tenant-2');

      expect(status1).toBeNull();
      expect(status2?.used).toBe(1);
    });

    it('clears all limits', async () => {
      await limiter.checkLimit({ key: 'tenant-1', limit: 10, windowMs: 60000 });
      await limiter.checkLimit({ key: 'tenant-2', limit: 10, windowMs: 60000 });
      await limiter.checkLimit({ key: 'tenant-3', limit: 10, windowMs: 60000 });

      await limiter.clearAll();

      expect(await limiter.getStatus('tenant-1')).toBeNull();
      expect(await limiter.getStatus('tenant-2')).toBeNull();
      expect(await limiter.getStatus('tenant-3')).toBeNull();
    });
  });

  describe('distributed rate limiting', () => {
    it('supports external store for distributed limiting', async () => {
      const store = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        increment: vi.fn().mockResolvedValue(1),
        delete: vi.fn().mockResolvedValue(undefined),
      };

      const distributedLimiter = new RateLimiter({ store });

      const config: RateLimitConfig = {
        key: 'tenant-123',
        limit: 10,
        windowMs: 60000,
      };

      await distributedLimiter.checkLimit(config);

      expect(store.increment).toHaveBeenCalledWith(
        expect.stringContaining('tenant-123'),
        expect.any(Number)
      );
    });
  });

  describe('middleware integration', () => {
    it('provides middleware factory', () => {
      const middleware = limiter.middleware({
        limit: 100,
        windowMs: 60000,
        keyGenerator: (req: any) => req.tenantId,
      });

      expect(typeof middleware).toBe('function');
    });

    it('middleware sets rate limit headers', async () => {
      const middleware = limiter.middleware({
        limit: 100,
        windowMs: 60000,
        keyGenerator: (req: any) => req.tenantId,
      });

      const req = { tenantId: 'tenant-123' };
      const res = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 99);
      expect(next).toHaveBeenCalled();
    });

    it('middleware blocks and returns 429 when exceeded', async () => {
      const middleware = limiter.middleware({
        limit: 1,
        windowMs: 60000,
        keyGenerator: (req: any) => req.tenantId,
      });

      const req = { tenantId: 'tenant-123' };
      const res = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      // First request
      await middleware(req, res, next);

      // Second request should be blocked
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('rate limit'),
        })
      );
    });
  });

  describe('singleton instance', () => {
    it('exports singleton instance', () => {
      expect(rateLimiter).toBeDefined();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
    });
  });
});
