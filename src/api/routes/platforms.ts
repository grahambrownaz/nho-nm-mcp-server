/**
 * Platform Routes
 * REST API routes for platform integration tools
 */

import { Router } from 'express';
import { asyncHandler, createSuccessResponse } from '../middleware/errors.js';
import {
  executeSyncToPlatform,
  executeConfigurePlatformConnection,
} from '../../tools/platforms/index.js';

const router = Router();

/**
 * @openapi
 * /api/v1/platforms/sync:
 *   post:
 *     summary: Sync records to external platform
 *     description: Sync records to Mailchimp, HubSpot, Zapier, or other platforms
 *     tags: [Platforms]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - platform
 *               - connection_id
 *               - records
 *             properties:
 *               platform:
 *                 type: string
 *                 enum: [mailchimp, hubspot, salesforce, zapier, google_sheets]
 *               connection_id:
 *                 type: string
 *               records:
 *                 type: array
 *                 items:
 *                   type: object
 *               field_mapping:
 *                 type: object
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               duplicate_handling:
 *                 type: string
 *                 enum: [update, skip, create_new]
 *     responses:
 *       200:
 *         description: Sync results
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Authentication required
 */
router.post(
  '/sync',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const result = await executeSyncToPlatform(req.body, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/platforms/connections:
 *   post:
 *     summary: Configure platform connection
 *     description: Set up credentials for a platform integration
 *     tags: [Platforms]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - platform
 *               - connection_name
 *               - credentials
 *             properties:
 *               platform:
 *                 type: string
 *                 enum: [mailchimp, hubspot, salesforce, zapier, google_sheets]
 *               connection_name:
 *                 type: string
 *               credentials:
 *                 type: object
 *               default_settings:
 *                 type: object
 *               test:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Connection configured
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Authentication required
 */
router.post(
  '/connections',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const result = await executeConfigurePlatformConnection(req.body, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

export default router;
