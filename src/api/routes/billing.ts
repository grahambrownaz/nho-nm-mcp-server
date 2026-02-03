/**
 * Billing Routes
 * REST API routes for billing tools (checkout, status, portal)
 */

import { Router } from 'express';
import { asyncHandler, createSuccessResponse } from '../middleware/errors.js';
import {
  executeCreateCheckoutSession,
  executeGetBillingStatus,
  executeGetBillingPortal,
  executeCreatePaymentLink,
} from '../../tools/billing/index.js';

const router = Router();

/**
 * @openapi
 * /api/v1/billing/checkout:
 *   post:
 *     summary: Create checkout session
 *     description: Create a Stripe Checkout session for Direct Mode signup
 *     tags: [Billing]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - plan
 *             properties:
 *               plan:
 *                 type: string
 *                 enum: [starter, growth, pro]
 *                 description: The subscription plan to sign up for
 *               success_url:
 *                 type: string
 *                 description: URL to redirect after successful payment
 *               cancel_url:
 *                 type: string
 *                 description: URL to redirect if customer cancels
 *               customer_email:
 *                 type: string
 *                 description: Pre-fill customer email in checkout
 *               metadata:
 *                 type: object
 *                 description: Custom metadata to attach to the subscription
 *     responses:
 *       200:
 *         description: Checkout session created
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
 *                     checkout_url:
 *                       type: string
 *                     session_id:
 *                       type: string
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 */
router.post(
  '/checkout',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const result = await executeCreateCheckoutSession(req.body, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/billing/status:
 *   get:
 *     summary: Get billing status
 *     description: Get current subscription status, usage, and billing details
 *     tags: [Billing]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Billing status information
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
 *                     subscription:
 *                       type: object
 *                     usage:
 *                       type: object
 *                     upcoming_invoice:
 *                       type: object
 *                     payment_method:
 *                       type: object
 *       401:
 *         description: Authentication required
 */
router.get(
  '/status',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const result = await executeGetBillingStatus({}, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/billing/portal:
 *   post:
 *     summary: Get billing portal URL
 *     description: Generate a Stripe Customer Portal URL for self-service billing management
 *     tags: [Billing]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - return_url
 *             properties:
 *               return_url:
 *                 type: string
 *                 description: URL to redirect back to after portal session
 *     responses:
 *       200:
 *         description: Portal URL generated
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
 *                     portal_url:
 *                       type: string
 *                     expires_in:
 *                       type: string
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 */
router.post(
  '/portal',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const result = await executeGetBillingPortal(req.body, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/billing/payment-link:
 *   post:
 *     summary: Create payment link
 *     description: Create a Stripe Payment Link for one-time purchases
 *     tags: [Billing]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - purpose
 *             properties:
 *               purpose:
 *                 type: string
 *                 enum: [list_purchase, postcard_batch, custom]
 *               reference_id:
 *                 type: string
 *                 description: ID of the list purchase or postcard batch
 *               line_items:
 *                 type: array
 *                 description: Custom line items (for custom purpose)
 *                 items:
 *                   type: object
 *                   properties:
 *                     description:
 *                       type: string
 *                     amount:
 *                       type: number
 *                     quantity:
 *                       type: integer
 *               expires_hours:
 *                 type: integer
 *                 default: 24
 *                 description: Hours until link expires (1-168)
 *               metadata:
 *                 type: object
 *                 description: Custom metadata to attach
 *     responses:
 *       200:
 *         description: Payment link created
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
 *                     payment_link:
 *                       type: string
 *                     payment_link_id:
 *                       type: string
 *                     expires_at:
 *                       type: string
 *                     amount:
 *                       type: number
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 */
router.post(
  '/payment-link',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const result = await executeCreatePaymentLink(req.body, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

export default router;
