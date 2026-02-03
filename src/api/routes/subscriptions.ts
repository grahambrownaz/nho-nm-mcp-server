/**
 * Subscription Routes
 * REST API routes for subscription management tools
 */

import { Router } from 'express';
import { asyncHandler, createSuccessResponse } from '../middleware/errors.js';
import {
  executeCreateSubscription,
  executeManageSubscription,
  executeListSubscriptions,
  executeDeliveryReport,
} from '../../tools/subscriptions/index.js';

const router = Router();

/**
 * @openapi
 * /api/v1/subscriptions:
 *   post:
 *     summary: Create a new data subscription
 *     description: Create a recurring subscription for data delivery
 *     tags: [Subscriptions]
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
 *               - database
 *               - geography
 *               - frequency
 *             properties:
 *               name:
 *                 type: string
 *                 description: Subscription name
 *               database:
 *                 type: string
 *                 enum: [nho, new_mover]
 *               geography:
 *                 type: object
 *                 properties:
 *                   type:
 *                     type: string
 *                     enum: [nationwide, state, zip, city, county, radius]
 *                   values:
 *                     type: array
 *                     items:
 *                       type: string
 *               filters:
 *                 type: object
 *               frequency:
 *                 type: string
 *                 enum: [daily, weekly, biweekly, monthly]
 *               template_id:
 *                 type: string
 *                 format: uuid
 *               client_name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Subscription created
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const result = await executeCreateSubscription(req.body, req.tenantContext);
    res.status(201).json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/subscriptions:
 *   get:
 *     summary: List subscriptions
 *     description: Get all subscriptions for the authenticated tenant
 *     tags: [Subscriptions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, paused, cancelled]
 *         description: Filter by status
 *       - in: query
 *         name: database
 *         schema:
 *           type: string
 *         description: Filter by database type
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of subscriptions
 *       401:
 *         description: Authentication required
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const input = {
      status: req.query.status as string | undefined,
      database: req.query.database as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
    };
    const result = await executeListSubscriptions(input, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/subscriptions/{id}:
 *   patch:
 *     summary: Manage a subscription
 *     description: Update, pause, resume, or cancel a subscription
 *     tags: [Subscriptions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Subscription ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [pause, resume, cancel, update]
 *               updates:
 *                 type: object
 *                 description: Fields to update (when action is 'update')
 *                 properties:
 *                   name:
 *                     type: string
 *                   frequency:
 *                     type: string
 *                   filters:
 *                     type: object
 *                   template_id:
 *                     type: string
 *     responses:
 *       200:
 *         description: Subscription updated
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Subscription not found
 */
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const input = {
      subscription_id: req.params.id,
      ...req.body,
    };
    const result = await executeManageSubscription(input, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/subscriptions/{id}/deliveries:
 *   get:
 *     summary: Get delivery report
 *     description: Get delivery history and statistics for a subscription
 *     tags: [Subscriptions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Subscription ID
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for report period
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for report period
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Delivery report
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Subscription not found
 */
router.get(
  '/:id/deliveries',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const input = {
      subscription_id: req.params.id,
      start_date: req.query.start_date as string | undefined,
      end_date: req.query.end_date as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    };
    const result = await executeDeliveryReport(input, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

export default router;
