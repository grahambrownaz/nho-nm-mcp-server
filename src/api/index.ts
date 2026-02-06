/**
 * REST API Server
 * Express-based REST API layer for headless/machine-to-machine access
 */

import express, { type Express } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { standardRateLimiter, webhookRateLimiter, searchRateLimiter } from './middleware/rate-limit.js';

// Import routes
import dataRoutes from './routes/data.js';
import subscriptionRoutes from './routes/subscriptions.js';
import templateRoutes from './routes/templates.js';
import deliveryRoutes from './routes/delivery.js';
import billingRoutes from './routes/billing.js';
import platformRoutes from './routes/platforms.js';
import filterRoutes from './routes/filters.js';
import purchaseRoutes from './routes/purchases.js';
import exportRoutes from './routes/exports.js';
import intentRoutes from './routes/intent.js';
import emailRoutes from './routes/email.js';
import healthRoutes from './routes/health.js';

// Import webhook handlers
import { handleStripeWebhook } from '../webhooks/stripe.js';
import { handleReachMailWebhook } from '../webhooks/reachmail.js';

/**
 * Create and configure the Express app
 */
export function createRestApi(): Express {
  const app = express();

  // Middleware
  app.use(cors());

  // Stripe webhook needs raw body for signature verification
  app.post('/webhooks/stripe', webhookRateLimiter, express.raw({ type: 'application/json' }), handleStripeWebhook);

  // ReachMail webhook for email campaign events
  app.post('/webhooks/reachmail', webhookRateLimiter, express.json(), handleReachMailWebhook);

  // JSON body parser for all other routes
  app.use(express.json({ limit: '10mb' }));

  // Request ID and timestamp middleware
  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    req.timestamp = new Date().toISOString();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });

  // API Documentation
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'NHO/NM API Documentation',
    customCss: '.swagger-ui .topbar { display: none }',
  }));

  // OpenAPI spec endpoint
  app.get('/api/openapi.json', (_req, res) => {
    res.json(swaggerSpec);
  });

  // Comprehensive health check routes (no auth required)
  app.use('/health', healthRoutes);
  // Also expose at /api/health for backwards compatibility
  app.use('/api/health', healthRoutes);

  // Apply rate limiting and auth middleware to all /api/v1 routes
  app.use('/api/v1', standardRateLimiter);
  app.use('/api/v1', authMiddleware);

  // API Routes (data routes get higher limits for search operations)
  app.use('/api/v1/data', searchRateLimiter, dataRoutes);
  app.use('/api/v1/subscriptions', subscriptionRoutes);
  app.use('/api/v1/templates', templateRoutes);
  app.use('/api/v1/delivery', deliveryRoutes);
  app.use('/api/v1/billing', billingRoutes);
  app.use('/api/v1/platforms', platformRoutes);
  app.use('/api/v1/pricing', dataRoutes); // Pricing is part of data routes
  // New routes (Week 6)
  app.use('/api/v1/filters', filterRoutes);
  app.use('/api/v1/purchases', purchaseRoutes);
  app.use('/api/v1/exports', exportRoutes);
  app.use('/api/v1/intent', intentRoutes);
  app.use('/api/v1/email', emailRoutes);

  // 404 handler
  app.use('/api', notFoundHandler);

  // Error handler
  app.use(errorHandler);

  return app;
}

/**
 * Start the REST API server
 */
export async function startRestApi(port: number = 3000): Promise<void> {
  const app = createRestApi();

  return new Promise((resolve) => {
    app.listen(port, () => {
      console.error(`REST API server running on port ${port}`);
      console.error(`API Documentation: http://localhost:${port}/api/docs`);
      resolve();
    });
  });
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      timestamp: string;
      tenantContext?: import('../utils/auth.js').TenantContext;
    }
  }
}
