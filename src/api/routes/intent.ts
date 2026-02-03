/**
 * Intent Routes
 * REST API routes for intent data tools
 */

import { Router } from 'express';
import { asyncHandler, createSuccessResponse } from '../middleware/errors.js';
import {
  executeSearchIntentData,
  executeCreateIntentSubscription,
  executeListIntentCategories,
  executeConfigureIntentWebhook,
} from '../../tools/intent/index.js';
import { prisma } from '../../db/client.js';

const router = Router();

/**
 * @openapi
 * /api/v1/intent/categories:
 *   get:
 *     summary: List intent categories
 *     description: Get available intent data categories with descriptions and pricing
 *     tags: [Intent]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: parent
 *         schema:
 *           type: string
 *           enum: [auto, home, financial, education, telecom, healthcare, travel, b2b]
 *         description: Filter by parent category
 *       - in: query
 *         name: includeStats
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include signal volumes and pricing
 *     responses:
 *       200:
 *         description: List of intent categories
 *       401:
 *         description: Authentication required
 */
router.get(
  '/categories',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const input = {
      parent: typeof req.query.parent === 'string' ? req.query.parent : undefined,
      includeStats: req.query.includeStats !== 'false',
    };
    const result = await executeListIntentCategories(input, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/intent/search:
 *   post:
 *     summary: Search intent signals
 *     description: Search for purchase intent signals by category and geography
 *     tags: [Intent]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - categories
 *             properties:
 *               categories:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Intent categories to search
 *               geography:
 *                 type: object
 *                 properties:
 *                   type:
 *                     type: string
 *                     enum: [nationwide, state, zip, dma]
 *                   values:
 *                     type: array
 *                     items:
 *                       type: string
 *               filters:
 *                 type: object
 *                 properties:
 *                   minIntentScore:
 *                     type: number
 *                   maxAgeHours:
 *                     type: number
 *                   requireEmail:
 *                     type: boolean
 *                   requirePhone:
 *                     type: boolean
 *               limit:
 *                 type: number
 *                 default: 100
 *               offset:
 *                 type: number
 *                 default: 0
 *     responses:
 *       200:
 *         description: Intent signals
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Authentication required
 */
router.post(
  '/search',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const result = await executeSearchIntentData(req.body, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/intent/subscriptions:
 *   post:
 *     summary: Create intent subscription
 *     description: Create a recurring subscription for intent data delivery
 *     tags: [Intent]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - categories
 *               - deliveryMethod
 *             properties:
 *               name:
 *                 type: string
 *               categories:
 *                 type: array
 *                 items:
 *                   type: string
 *               geography:
 *                 type: object
 *               filters:
 *                 type: object
 *               tier:
 *                 type: string
 *                 enum: [standard, professional, enterprise]
 *               deliveryMethod:
 *                 type: string
 *                 enum: [webhook, batch_email, batch_sftp, api_poll]
 *               webhookId:
 *                 type: string
 *               batchFrequency:
 *                 type: string
 *                 enum: [hourly, every_4_hours, daily, weekly]
 *               monthlySignalCap:
 *                 type: number
 *               startImmediately:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Subscription created
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Authentication required
 */
router.post(
  '/subscriptions',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const result = await executeCreateIntentSubscription(req.body, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/intent/subscriptions:
 *   get:
 *     summary: List intent subscriptions
 *     description: List all intent data subscriptions for the tenant
 *     tags: [Intent]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, PAUSED, CANCELLED, SUSPENDED]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: List of subscriptions
 *       401:
 *         description: Authentication required
 */
router.get(
  '/subscriptions',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }

    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    const subscriptions = await prisma.intentSubscription.findMany({
      where: {
        tenantId: req.tenantContext.tenant.id,
        ...(status ? { status: status as 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'SUSPENDED' } : {}),
      },
      include: {
        webhook: {
          select: {
            id: true,
            name: true,
            url: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(createSuccessResponse(req, {
      subscriptions: subscriptions.map((s) => ({
        id: s.id,
        name: s.name,
        categories: s.categoryIds,
        status: s.status,
        delivery_method: s.deliveryMethod,
        webhook: s.webhook,
        monthly_price: Number(s.monthlyPrice),
        signals_this_month: s.signalsThisMonth,
        signal_cap: s.signalCap,
        total_signals_received: s.totalSignalsReceived,
        created_at: s.createdAt.toISOString(),
      })),
      total: subscriptions.length,
    }));
  })
);

/**
 * @openapi
 * /api/v1/intent/subscriptions/{subscriptionId}:
 *   get:
 *     summary: Get intent subscription
 *     description: Get details of a specific intent subscription
 *     tags: [Intent]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: subscriptionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Subscription details
 *       404:
 *         description: Subscription not found
 *       401:
 *         description: Authentication required
 */
router.get(
  '/subscriptions/:subscriptionId',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }

    const subscriptionId = req.params.subscriptionId as string;

    const subscription = await prisma.intentSubscription.findFirst({
      where: {
        id: subscriptionId,
        tenantId: req.tenantContext.tenant.id,
      },
      include: {
        webhook: true,
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!subscription) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Subscription not found',
        },
      });
      return;
    }

    res.json(createSuccessResponse(req, {
      id: subscription.id,
      name: subscription.name,
      categories: subscription.categoryIds,
      geography: subscription.geography,
      status: subscription.status,
      delivery_method: subscription.deliveryMethod,
      batch_frequency: subscription.batchFrequency,
      webhook: subscription.webhook ? {
        id: subscription.webhook.id,
        name: subscription.webhook.name,
        url: subscription.webhook.url,
        is_active: subscription.webhook.isActive,
      } : null,
      pricing: {
        monthly_price: Number(subscription.monthlyPrice),
        signal_cap: subscription.signalCap,
      },
      stats: {
        signals_this_month: subscription.signalsThisMonth,
        total_signals_received: subscription.totalSignalsReceived,
        total_deliveries: subscription.totalDeliveries,
      },
      recent_deliveries: subscription.deliveries.map((d) => ({
        id: d.id,
        status: d.status,
        signal_count: d.signalCount,
        delivered_at: d.deliveredAt?.toISOString(),
      })),
      created_at: subscription.createdAt.toISOString(),
    }));
  })
);

/**
 * @openapi
 * /api/v1/intent/webhooks:
 *   get:
 *     summary: List intent webhooks
 *     description: List all configured intent webhooks
 *     tags: [Intent]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of webhooks
 *       401:
 *         description: Authentication required
 */
router.get(
  '/webhooks',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const result = await executeConfigureIntentWebhook(
      { action: 'list' },
      req.tenantContext
    );
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/intent/webhooks:
 *   post:
 *     summary: Create intent webhook
 *     description: Create a new webhook for intent signal delivery
 *     tags: [Intent]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - url
 *             properties:
 *               name:
 *                 type: string
 *               url:
 *                 type: string
 *               secret:
 *                 type: string
 *               headers:
 *                 type: object
 *               retryAttempts:
 *                 type: number
 *               retryDelayMs:
 *                 type: number
 *               minIntentScore:
 *                 type: number
 *               categoryFilter:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Webhook created
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Authentication required
 */
router.post(
  '/webhooks',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const result = await executeConfigureIntentWebhook(
      { action: 'create', ...req.body },
      req.tenantContext
    );
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/intent/webhooks/{webhookId}:
 *   patch:
 *     summary: Update intent webhook
 *     description: Update an existing intent webhook configuration
 *     tags: [Intent]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: webhookId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Webhook updated
 *       404:
 *         description: Webhook not found
 *       401:
 *         description: Authentication required
 */
router.patch(
  '/webhooks/:webhookId',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const webhookId = req.params.webhookId as string;
    const result = await executeConfigureIntentWebhook(
      { action: 'update', webhookId, ...req.body },
      req.tenantContext
    );
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/intent/webhooks/{webhookId}:
 *   delete:
 *     summary: Delete intent webhook
 *     description: Delete an intent webhook configuration
 *     tags: [Intent]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: webhookId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Webhook deleted
 *       400:
 *         description: Cannot delete webhook in use
 *       404:
 *         description: Webhook not found
 *       401:
 *         description: Authentication required
 */
router.delete(
  '/webhooks/:webhookId',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const webhookId = req.params.webhookId as string;
    const result = await executeConfigureIntentWebhook(
      { action: 'delete', webhookId },
      req.tenantContext
    );
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/intent/webhooks/{webhookId}/test:
 *   post:
 *     summary: Test intent webhook
 *     description: Send a test payload to verify webhook connectivity
 *     tags: [Intent]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: webhookId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Test result
 *       404:
 *         description: Webhook not found
 *       401:
 *         description: Authentication required
 */
router.post(
  '/webhooks/:webhookId/test',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const webhookId = req.params.webhookId as string;
    const result = await executeConfigureIntentWebhook(
      { action: 'test', webhookId },
      req.tenantContext
    );
    res.json(createSuccessResponse(req, result));
  })
);

export default router;
