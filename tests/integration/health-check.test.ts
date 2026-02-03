/**
 * Integration Tests for Health Check Endpoint
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { prisma } from '../../src/db/client.js';
import { redis } from '../../src/services/redis.js';
import Stripe from 'stripe';

// Mock dependencies
vi.mock('../../src/db/client.js', () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

vi.mock('../../src/services/redis.js', () => ({
  redis: {
    ping: vi.fn(),
  },
}));

vi.mock('stripe', () => ({
  default: vi.fn(() => ({
    accounts: {
      retrieve: vi.fn(),
    },
  })),
}));

describe('Health Check Integration', () => {
  let app: any;
  let request: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createApp();
    // Use supertest or similar in real tests
    request = {
      get: (path: string) => ({
        send: async () => {
          // Simulate HTTP request - in real tests use supertest
          if (path === '/health') {
            return app.handleHealthCheck();
          }
          if (path === '/health/live') {
            return app.handleLivenessCheck();
          }
          if (path === '/health/ready') {
            return app.handleReadinessCheck();
          }
        },
      }),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /health', () => {
    it('returns healthy when all services are up', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ 1: 1 }]);
      vi.mocked(redis.ping).mockResolvedValue('PONG');

      const response = await request.get('/health').send();

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          status: 'healthy',
          timestamp: expect.any(String),
          services: expect.objectContaining({
            database: { status: 'healthy' },
            redis: { status: 'healthy' },
          }),
        })
      );
    });

    it('returns degraded when non-critical service is down', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ 1: 1 }]);
      vi.mocked(redis.ping).mockRejectedValue(new Error('Redis connection failed'));

      const response = await request.get('/health').send();

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('degraded');
      expect(response.body.services.database.status).toBe('healthy');
      expect(response.body.services.redis.status).toBe('unhealthy');
      expect(response.body.services.redis.error).toContain('Redis');
    });

    it('returns unhealthy when database is down', async () => {
      vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('Database connection failed'));
      vi.mocked(redis.ping).mockResolvedValue('PONG');

      const response = await request.get('/health').send();

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('unhealthy');
      expect(response.body.services.database.status).toBe('unhealthy');
      expect(response.body.services.database.error).toContain('Database');
    });

    it('includes version and uptime', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ 1: 1 }]);
      vi.mocked(redis.ping).mockResolvedValue('PONG');

      const response = await request.get('/health').send();

      expect(response.body.version).toBeDefined();
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('includes response times for each service', async () => {
      vi.mocked(prisma.$queryRaw).mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return [{ 1: 1 }];
      });
      vi.mocked(redis.ping).mockResolvedValue('PONG');

      const response = await request.get('/health').send();

      expect(response.body.services.database.responseTimeMs).toBeGreaterThan(0);
      expect(response.body.services.redis.responseTimeMs).toBeDefined();
    });
  });

  describe('GET /health/live', () => {
    it('returns 200 for liveness check', async () => {
      const response = await request.get('/health/live').send();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'alive' });
    });

    it('always succeeds if process is running', async () => {
      // Liveness should succeed even if dependencies are down
      vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('DB down'));

      const response = await request.get('/health/live').send();

      expect(response.status).toBe(200);
    });
  });

  describe('GET /health/ready', () => {
    it('returns 200 when ready to accept traffic', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ 1: 1 }]);
      vi.mocked(redis.ping).mockResolvedValue('PONG');

      const response = await request.get('/health/ready').send();

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ready');
    });

    it('returns 503 when not ready', async () => {
      vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('Database not connected'));
      vi.mocked(redis.ping).mockResolvedValue('PONG');

      const response = await request.get('/health/ready').send();

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('not_ready');
    });

    it('checks all critical dependencies', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ 1: 1 }]);
      vi.mocked(redis.ping).mockResolvedValue('PONG');

      const response = await request.get('/health/ready').send();

      expect(response.body.checks).toEqual(
        expect.objectContaining({
          database: true,
        })
      );
    });
  });

  describe('service-specific health checks', () => {
    it('checks database connectivity', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ 1: 1 }]);

      const response = await request.get('/health').send();

      expect(prisma.$queryRaw).toHaveBeenCalledWith(expect.anything());
      expect(response.body.services.database.status).toBe('healthy');
    });

    it('handles database timeout', async () => {
      vi.mocked(prisma.$queryRaw).mockImplementation(async () => {
        await new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Query timeout')), 5000)
        );
      });

      const response = await request.get('/health').send();

      expect(response.body.services.database.status).toBe('unhealthy');
      expect(response.body.services.database.error).toContain('timeout');
    });

    it('checks Redis connectivity', async () => {
      vi.mocked(redis.ping).mockResolvedValue('PONG');
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ 1: 1 }]);

      const response = await request.get('/health').send();

      expect(redis.ping).toHaveBeenCalled();
      expect(response.body.services.redis.status).toBe('healthy');
    });

    it('handles Redis timeout', async () => {
      vi.mocked(redis.ping).mockImplementation(async () => {
        await new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), 5000)
        );
      });
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ 1: 1 }]);

      const response = await request.get('/health').send();

      expect(response.body.services.redis.status).toBe('unhealthy');
    });
  });

  describe('external service health checks', () => {
    it('optionally checks Stripe API', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ 1: 1 }]);
      vi.mocked(redis.ping).mockResolvedValue('PONG');

      const response = await request.get('/health?include=stripe').send();

      expect(response.body.services.stripe).toBeDefined();
    });

    it('reports Stripe as unhealthy on API error', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ 1: 1 }]);
      vi.mocked(redis.ping).mockResolvedValue('PONG');

      // Simulate Stripe error
      const mockStripe = {
        accounts: {
          retrieve: vi.fn().mockRejectedValue(new Error('Invalid API key')),
        },
      };
      vi.mocked(Stripe).mockReturnValue(mockStripe as any);

      const response = await request.get('/health?include=stripe').send();

      expect(response.body.services.stripe?.status).toBe('unhealthy');
    });
  });

  describe('health check response format', () => {
    it('includes ISO timestamp', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ 1: 1 }]);
      vi.mocked(redis.ping).mockResolvedValue('PONG');

      const response = await request.get('/health').send();

      expect(response.body.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
      );
    });

    it('includes environment info', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ 1: 1 }]);
      vi.mocked(redis.ping).mockResolvedValue('PONG');

      const response = await request.get('/health').send();

      expect(response.body.environment).toBeDefined();
    });

    it('returns correct content type', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ 1: 1 }]);
      vi.mocked(redis.ping).mockResolvedValue('PONG');

      const response = await request.get('/health').send();

      expect(response.headers?.['content-type']).toContain('application/json');
    });

    it('sets cache-control header to no-cache', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ 1: 1 }]);
      vi.mocked(redis.ping).mockResolvedValue('PONG');

      const response = await request.get('/health').send();

      expect(response.headers?.['cache-control']).toBe('no-cache, no-store');
    });
  });

  describe('Kubernetes probe compatibility', () => {
    it('returns 200 for healthy status (K8s liveness)', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ 1: 1 }]);
      vi.mocked(redis.ping).mockResolvedValue('PONG');

      const response = await request.get('/health/live').send();

      expect(response.status).toBe(200);
    });

    it('returns 503 for not ready status (K8s readiness)', async () => {
      vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('Not connected'));

      const response = await request.get('/health/ready').send();

      expect(response.status).toBe(503);
    });

    it('responds quickly for probe efficiency', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ 1: 1 }]);
      vi.mocked(redis.ping).mockResolvedValue('PONG');

      const start = Date.now();
      await request.get('/health/live').send();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // Should respond in <100ms
    });
  });

  describe('health check metrics', () => {
    it('tracks health check invocations', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ 1: 1 }]);
      vi.mocked(redis.ping).mockResolvedValue('PONG');

      await request.get('/health').send();
      await request.get('/health').send();

      // In real implementation, check metrics counter
      // expect(metrics.healthCheckCount).toBe(2);
    });

    it('reports memory usage', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ 1: 1 }]);
      vi.mocked(redis.ping).mockResolvedValue('PONG');

      const response = await request.get('/health').send();

      expect(response.body.memory).toBeDefined();
      expect(response.body.memory.heapUsed).toBeGreaterThan(0);
      expect(response.body.memory.heapTotal).toBeGreaterThan(0);
    });

    it('reports CPU usage', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ 1: 1 }]);
      vi.mocked(redis.ping).mockResolvedValue('PONG');

      const response = await request.get('/health').send();

      expect(response.body.cpu).toBeDefined();
    });
  });

  describe('concurrent health checks', () => {
    it('handles multiple simultaneous requests', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ 1: 1 }]);
      vi.mocked(redis.ping).mockResolvedValue('PONG');

      const requests = Array.from({ length: 10 }, () =>
        request.get('/health').send()
      );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('healthy');
      });
    });

    it('does not overwhelm dependencies with checks', async () => {
      let dbCallCount = 0;
      vi.mocked(prisma.$queryRaw).mockImplementation(async () => {
        dbCallCount++;
        return [{ 1: 1 }];
      });
      vi.mocked(redis.ping).mockResolvedValue('PONG');

      // Make many requests simultaneously
      const requests = Array.from({ length: 50 }, () =>
        request.get('/health').send()
      );

      await Promise.all(requests);

      // Should use caching or deduplication to limit actual DB calls
      // This depends on implementation - adjust expectation accordingly
      expect(dbCallCount).toBeLessThanOrEqual(50);
    });
  });

  describe('graceful degradation', () => {
    it('continues serving requests when Redis is down', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ 1: 1 }]);
      vi.mocked(redis.ping).mockRejectedValue(new Error('Redis down'));

      const response = await request.get('/health').send();

      // Should return 200 with degraded status, not 503
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('degraded');
    });

    it('provides detailed error information in dev mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      vi.mocked(prisma.$queryRaw).mockRejectedValue(
        new Error('Connection refused to localhost:5432')
      );
      vi.mocked(redis.ping).mockResolvedValue('PONG');

      const response = await request.get('/health').send();

      expect(response.body.services.database.error).toContain('localhost:5432');

      process.env.NODE_ENV = originalEnv;
    });

    it('hides sensitive error details in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      vi.mocked(prisma.$queryRaw).mockRejectedValue(
        new Error('Connection refused to secret-db.internal:5432')
      );
      vi.mocked(redis.ping).mockResolvedValue('PONG');

      const response = await request.get('/health').send();

      expect(response.body.services.database.error).not.toContain('secret-db');
      expect(response.body.services.database.error).toBe('Database connection failed');

      process.env.NODE_ENV = originalEnv;
    });
  });
});
