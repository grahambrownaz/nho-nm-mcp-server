/**
 * Email API Routes
 * REST API endpoints for email campaign management
 */

import { Router } from 'express';
import { asyncHandler, createSuccessResponse } from '../middleware/errors.js';
import {
  executeConfigureEmailAccount,
  executeCreateEmailList,
  executeCreateEmailCampaign,
  executeSendEmailCampaign,
  executeGetEmailAnalytics,
  executeListEmailCampaigns,
} from '../../tools/email/index.js';

const router = Router();

/**
 * @openapi
 * /api/v1/email/config:
 *   post:
 *     summary: Configure ReachMail email account
 *     tags: [Email]
 *     security:
 *       - ApiKeyAuth: []
 */
router.post(
  '/config',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) throw new Error('Authentication required');
    const result = await executeConfigureEmailAccount(req.body, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/email/lists:
 *   post:
 *     summary: Create a recipient list from data records
 *     tags: [Email]
 *     security:
 *       - ApiKeyAuth: []
 */
router.post(
  '/lists',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) throw new Error('Authentication required');
    const result = await executeCreateEmailList(req.body, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/email/campaigns:
 *   post:
 *     summary: Create an email campaign
 *     tags: [Email]
 *     security:
 *       - ApiKeyAuth: []
 */
router.post(
  '/campaigns',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) throw new Error('Authentication required');
    const result = await executeCreateEmailCampaign(req.body, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/email/campaigns:
 *   get:
 *     summary: List email campaigns
 *     tags: [Email]
 *     security:
 *       - ApiKeyAuth: []
 */
router.get(
  '/campaigns',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) throw new Error('Authentication required');
    const result = await executeListEmailCampaigns(req.query, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/email/campaigns/{id}/send:
 *   post:
 *     summary: Send or schedule an email campaign
 *     tags: [Email]
 *     security:
 *       - ApiKeyAuth: []
 */
router.post(
  '/campaigns/:id/send',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) throw new Error('Authentication required');
    const result = await executeSendEmailCampaign(
      { campaign_id: req.params.id, ...req.body },
      req.tenantContext
    );
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/email/campaigns/{id}/analytics:
 *   get:
 *     summary: Get campaign analytics
 *     tags: [Email]
 *     security:
 *       - ApiKeyAuth: []
 */
router.get(
  '/campaigns/:id/analytics',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) throw new Error('Authentication required');
    const result = await executeGetEmailAnalytics(
      { campaign_id: req.params.id, ...req.query },
      req.tenantContext
    );
    res.json(createSuccessResponse(req, result));
  })
);

export default router;
