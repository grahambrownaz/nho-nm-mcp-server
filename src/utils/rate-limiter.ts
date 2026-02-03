/**
 * Rate Limiter Utility
 * Provides rate limiting for API calls and tool executions
 */

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  // Maximum number of requests
  maxRequests: number;
  // Time window in milliseconds
  windowMs: number;
  // Optional key prefix for namespacing
  keyPrefix?: string;
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterMs?: number;
}

/**
 * In-memory rate limiter entry
 */
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

/**
 * Simple in-memory rate limiter
 * For production, consider using Redis
 */
export class RateLimiter {
  private entries: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly config: RateLimiterConfig) {
    // Start cleanup interval (every minute)
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check if a request is allowed
   */
  check(key: string): RateLimitResult {
    const fullKey = this.config.keyPrefix ? `${this.config.keyPrefix}:${key}` : key;
    const now = Date.now();
    const entry = this.entries.get(fullKey);

    // If no entry or window expired, allow and start new window
    if (!entry || now - entry.windowStart >= this.config.windowMs) {
      this.entries.set(fullKey, {
        count: 1,
        windowStart: now,
      });

      return {
        allowed: true,
        remaining: this.config.maxRequests - 1,
        resetAt: new Date(now + this.config.windowMs),
      };
    }

    // Check if limit exceeded
    if (entry.count >= this.config.maxRequests) {
      const resetAt = entry.windowStart + this.config.windowMs;
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(resetAt),
        retryAfterMs: resetAt - now,
      };
    }

    // Increment count
    entry.count++;

    return {
      allowed: true,
      remaining: this.config.maxRequests - entry.count,
      resetAt: new Date(entry.windowStart + this.config.windowMs),
    };
  }

  /**
   * Wait for rate limit if needed, then check
   * Returns immediately if allowed, otherwise waits
   */
  async waitAndCheck(key: string, maxWaitMs: number = 30000): Promise<RateLimitResult> {
    const result = this.check(key);

    if (result.allowed) {
      return result;
    }

    // If retry time is within max wait, wait and retry
    if (result.retryAfterMs && result.retryAfterMs <= maxWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, result.retryAfterMs));
      return this.check(key);
    }

    return result;
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    const fullKey = this.config.keyPrefix ? `${this.config.keyPrefix}:${key}` : key;
    this.entries.delete(fullKey);
  }

  /**
   * Get current status for a key
   */
  getStatus(key: string): RateLimitResult {
    const fullKey = this.config.keyPrefix ? `${this.config.keyPrefix}:${key}` : key;
    const now = Date.now();
    const entry = this.entries.get(fullKey);

    if (!entry || now - entry.windowStart >= this.config.windowMs) {
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetAt: new Date(now + this.config.windowMs),
      };
    }

    const remaining = Math.max(0, this.config.maxRequests - entry.count);
    return {
      allowed: remaining > 0,
      remaining,
      resetAt: new Date(entry.windowStart + this.config.windowMs),
      retryAfterMs: remaining === 0 ? entry.windowStart + this.config.windowMs - now : undefined,
    };
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries.entries()) {
      if (now - entry.windowStart >= this.config.windowMs) {
        this.entries.delete(key);
      }
    }
  }

  /**
   * Destroy the rate limiter and cleanup
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.entries.clear();
  }
}

/**
 * Pre-configured rate limiters for different use cases
 */

// LeadsPlease API rate limiter (100 requests per minute)
export const leadspleaseRateLimiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60000,
  keyPrefix: 'leadsplease',
});

// Print API rate limiter (30 requests per minute)
export const printApiRateLimiter = new RateLimiter({
  maxRequests: 30,
  windowMs: 60000,
  keyPrefix: 'print_api',
});

// Stripe API rate limiter (100 requests per second, using 1000ms window)
export const stripeRateLimiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 1000,
  keyPrefix: 'stripe',
});

// Tool execution rate limiter (per tenant, 60 requests per minute)
export const toolRateLimiter = new RateLimiter({
  maxRequests: 60,
  windowMs: 60000,
  keyPrefix: 'tool',
});

// Platform sync rate limiter (10 syncs per minute per platform)
export const platformSyncRateLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60000,
  keyPrefix: 'platform_sync',
});

/**
 * Rate limit decorator for async functions
 */
export function withRateLimit<T extends (...args: unknown[]) => Promise<unknown>>(
  limiter: RateLimiter,
  keyFn: (...args: Parameters<T>) => string
): (fn: T) => T {
  return (fn: T) => {
    return (async (...args: Parameters<T>) => {
      const key = keyFn(...args);
      const result = await limiter.waitAndCheck(key);

      if (!result.allowed) {
        throw new RateLimitError(
          `Rate limit exceeded. Retry after ${Math.ceil((result.retryAfterMs || 0) / 1000)} seconds.`,
          result.retryAfterMs
        );
      }

      return fn(...args);
    }) as T;
  };
}

/**
 * Rate limit error
 */
export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * Express middleware for rate limiting
 */
export function rateLimitMiddleware(limiter: RateLimiter) {
  return async (
    req: { ip?: string; tenantContext?: { tenant: { id: string } } },
    res: {
      status: (code: number) => { json: (body: unknown) => void };
      setHeader: (name: string, value: string) => void;
    },
    next: () => void
  ) => {
    // Use tenant ID if available, otherwise use IP
    const key = req.tenantContext?.tenant.id || req.ip || 'anonymous';
    const result = limiter.check(key);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', String(limiter['config'].maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.floor(result.resetAt.getTime() / 1000)));

    if (!result.allowed) {
      res.setHeader('Retry-After', String(Math.ceil((result.retryAfterMs || 0) / 1000)));
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
          retryAfter: Math.ceil((result.retryAfterMs || 0) / 1000),
        },
      });
      return;
    }

    next();
  };
}
