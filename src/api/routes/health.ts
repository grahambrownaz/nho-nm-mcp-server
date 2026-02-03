import { Router } from 'express';
import { prisma } from '../../db/client.js';
import Stripe from 'stripe';
import { logger } from '../../utils/logger.js';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: { status: string; latency?: number; error?: string };
    stripe: { status: string; error?: string };
    leadsplease: { status: string; error?: string };
  };
  metrics: {
    lastDelivery: string | null;
    deliveriesToday: number;
    activeSubscriptions: number;
    pendingDeliveries: number;
  };
}

router.get('/', async (_req, res) => {
  const health: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    checks: {
      database: { status: 'unknown' },
      stripe: { status: 'unknown' },
      leadsplease: { status: 'unknown' },
    },
    metrics: {
      lastDelivery: null,
      deliveriesToday: 0,
      activeSubscriptions: 0,
      pendingDeliveries: 0,
    },
  };

  // Check database
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    health.checks.database = {
      status: 'connected',
      latency: Date.now() - dbStart,
    };
  } catch (error) {
    health.checks.database = {
      status: 'disconnected',
      error: (error as Error).message,
    };
    health.status = 'unhealthy';
  }

  // Check Stripe
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    await stripe.balance.retrieve();
    health.checks.stripe = { status: 'connected' };
  } catch (error) {
    health.checks.stripe = {
      status: 'error',
      error: (error as Error).message,
    };
    health.status = 'degraded';
  }

  // Check LeadsPlease API
  try {
    const response = await fetch(`${process.env.LEADSPLEASE_API_URL}/health`, {
      headers: { 'X-API-Key': process.env.LEADSPLEASE_API_KEY! },
      signal: AbortSignal.timeout(5000),
    });
    health.checks.leadsplease = {
      status: response.ok ? 'connected' : 'error',
    };
  } catch (error) {
    health.checks.leadsplease = {
      status: 'error',
      error: (error as Error).message,
    };
    health.status = 'degraded';
  }

  // Get metrics
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [lastDelivery, deliveriesToday, activeSubscriptions, pendingDeliveries] =
      await Promise.all([
        prisma.delivery.findFirst({
          where: { status: 'COMPLETED' },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.delivery.count({
          where: {
            createdAt: { gte: today },
            status: 'COMPLETED',
          },
        }),
        prisma.subscription.count({
          where: { status: 'ACTIVE' },
        }),
        prisma.delivery.count({
          where: { status: 'PENDING' },
        }),
      ]);

    health.metrics = {
      lastDelivery: lastDelivery?.createdAt?.toISOString() || null,
      deliveriesToday,
      activeSubscriptions,
      pendingDeliveries,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to fetch health metrics');
  }

  const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Lightweight liveness probe
router.get('/live', (_req, res) => {
  res.status(200).json({ status: 'alive' });
});

// Readiness probe (checks if ready to serve traffic)
router.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not ready' });
  }
});

export default router;
