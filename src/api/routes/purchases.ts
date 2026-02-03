/**
 * Purchase Routes
 * REST API routes for one-time list purchases
 */

import { Router } from 'express';
import { asyncHandler, createSuccessResponse } from '../middleware/errors.js';
import { executePurchaseList, getPurchaseStatus } from '../../tools/purchases/index.js';
import { getPurchaseDownload } from '../../services/purchase-fulfillment.js';

const router = Router();

/**
 * @openapi
 * /api/v1/purchases:
 *   post:
 *     summary: Create list purchase
 *     description: Create a one-time list purchase with quote and payment link
 *     tags: [Purchases]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - database
 *               - geography
 *               - record_count
 *             properties:
 *               database:
 *                 type: string
 *                 enum: [consumer, business, nho, new_mover]
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
 *                 description: Database-specific filters
 *               record_count:
 *                 type: integer
 *                 minimum: 100
 *                 description: Number of records to purchase
 *               with_email:
 *                 type: integer
 *                 description: Number of records to append email to
 *               with_phone:
 *                 type: integer
 *                 description: Number of records to append phone to
 *               export_format:
 *                 type: string
 *                 enum: [csv, excel, json]
 *                 default: csv
 *               delivery_method:
 *                 type: string
 *                 enum: [download_url, email, webhook]
 *                 default: download_url
 *               delivery_config:
 *                 type: object
 *                 properties:
 *                   email:
 *                     type: string
 *                   webhook_url:
 *                     type: string
 *     responses:
 *       200:
 *         description: Purchase quote created
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
 *                     purchase_id:
 *                       type: string
 *                     pricing:
 *                       type: object
 *                     payment_link:
 *                       type: string
 *                     quote_valid_until:
 *                       type: string
 *                     sample_records:
 *                       type: array
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
    const result = await executePurchaseList(req.body, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/purchases/{purchaseId}:
 *   get:
 *     summary: Get purchase status
 *     description: Get the status and details of a list purchase
 *     tags: [Purchases]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: purchaseId
 *         required: true
 *         schema:
 *           type: string
 *         description: The purchase ID
 *     responses:
 *       200:
 *         description: Purchase status
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
 *                     purchase_id:
 *                       type: string
 *                     status:
 *                       type: string
 *                     created_at:
 *                       type: string
 *                     total_amount:
 *                       type: number
 *                     record_count:
 *                       type: integer
 *                     download_url:
 *                       type: string
 *                     download_expires:
 *                       type: string
 *       404:
 *         description: Purchase not found
 *       401:
 *         description: Authentication required
 */
router.get(
  '/:purchaseId',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const purchaseId = req.params.purchaseId as string;
    const result = await getPurchaseStatus(purchaseId, req.tenantContext.tenant.id);
    if (!result) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Purchase not found',
        },
      });
      return;
    }
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/purchases/{purchaseId}/download:
 *   get:
 *     summary: Get download URL
 *     description: Get or regenerate the download URL for a completed purchase
 *     tags: [Purchases]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: purchaseId
 *         required: true
 *         schema:
 *           type: string
 *         description: The purchase ID
 *     responses:
 *       200:
 *         description: Download URL
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
 *                     download_url:
 *                       type: string
 *                     expires_at:
 *                       type: string
 *       404:
 *         description: Purchase not found or not completed
 *       401:
 *         description: Authentication required
 */
router.get(
  '/:purchaseId/download',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const purchaseId = req.params.purchaseId as string;
    const result = await getPurchaseDownload(
      purchaseId,
      req.tenantContext.tenant.id
    );
    if (!result) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Purchase not found or not yet completed',
        },
      });
      return;
    }
    res.json(createSuccessResponse(req, {
      download_url: result.downloadUrl,
      expires_at: result.downloadExpires.toISOString(),
    }));
  })
);

export default router;
