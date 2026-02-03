/**
 * Delivery Routes
 * REST API routes for delivery configuration and fulfillment status
 */

import { Router } from 'express';
import { asyncHandler, createSuccessResponse } from '../middleware/errors.js';
import {
  executeConfigureDelivery,
  executeGetFulfillmentStatus,
} from '../../tools/delivery/index.js';

const router = Router();

/**
 * @openapi
 * /api/v1/delivery/config:
 *   post:
 *     summary: Configure delivery settings
 *     description: Set up SFTP hot folder, print API, or other delivery methods
 *     tags: [Delivery]
 *     security:
 *       - ApiKeyAuth: []
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
 *                 enum: [create, update, test, delete, list]
 *               config_id:
 *                 type: string
 *                 format: uuid
 *                 description: Required for update/test/delete actions
 *               name:
 *                 type: string
 *                 description: Configuration name
 *               method:
 *                 type: string
 *                 enum: [sftp_hot_folder, print_api, email, webhook, cloud_storage]
 *               is_default:
 *                 type: boolean
 *               sftp:
 *                 type: object
 *                 description: SFTP configuration (for sftp_hot_folder method)
 *                 properties:
 *                   host:
 *                     type: string
 *                   port:
 *                     type: integer
 *                     default: 22
 *                   username:
 *                     type: string
 *                   password:
 *                     type: string
 *                   private_key:
 *                     type: string
 *                   folder_path:
 *                     type: string
 *               include_jdf:
 *                 type: boolean
 *                 default: false
 *               jdf_preset:
 *                 type: string
 *                 enum:
 *                   - 4x6_100lb_gloss_fc
 *                   - 4x6_100lb_matte_fc
 *                   - 6x9_100lb_gloss_fc
 *                   - 6x9_100lb_matte_fc
 *                   - 6x11_120lb_gloss_fc
 *                   - 6x11_120lb_matte_fc
 *               email:
 *                 type: object
 *                 description: Email configuration
 *                 properties:
 *                   recipients:
 *                     type: array
 *                     items:
 *                       type: string
 *                       format: email
 *               webhook:
 *                 type: object
 *                 description: Webhook configuration
 *                 properties:
 *                   url:
 *                     type: string
 *                     format: uri
 *                   secret:
 *                     type: string
 *               print_api:
 *                 type: object
 *                 description: Print API configuration
 *                 properties:
 *                   provider:
 *                     type: string
 *                   api_key:
 *                     type: string
 *               cloud_storage:
 *                 type: object
 *                 description: Cloud storage configuration
 *                 properties:
 *                   provider:
 *                     type: string
 *                     enum: [s3, gcs, azure]
 *                   bucket:
 *                     type: string
 *                   path:
 *                     type: string
 *     responses:
 *       200:
 *         description: Configuration result
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 */
router.post(
  '/config',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const result = await executeConfigureDelivery(req.body, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/delivery/status:
 *   get:
 *     summary: Get fulfillment status
 *     description: Get delivery and fulfillment status for deliveries
 *     tags: [Delivery]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: delivery_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Specific delivery ID
 *       - in: query
 *         name: subscription_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Subscription ID for recent deliveries
 *       - in: query
 *         name: include_records
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include individual record details
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of deliveries to return
 *     responses:
 *       200:
 *         description: Fulfillment status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     deliveries:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           subscriptionId:
 *                             type: string
 *                           status:
 *                             type: string
 *                           fulfillmentStatus:
 *                             type: string
 *                           recordCount:
 *                             type: integer
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalDeliveries:
 *                           type: integer
 *                         completed:
 *                           type: integer
 *                         failed:
 *                           type: integer
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Delivery or subscription not found
 */
router.get(
  '/status',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const input = {
      delivery_id: req.query.delivery_id as string | undefined,
      subscription_id: req.query.subscription_id as string | undefined,
      include_records: req.query.include_records === 'true',
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    };
    const result = await executeGetFulfillmentStatus(input, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

export default router;
