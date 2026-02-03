/**
 * Data Routes
 * REST API routes for data tools (search, preview, sample, pricing)
 */

import { Router } from 'express';
import { asyncHandler, createSuccessResponse } from '../middleware/errors.js';
import {
  executeSearchData,
  executePreviewCount,
  executeGetSampleData,
  executeGetPricing,
} from '../../tools/data/index.js';

const router = Router();

/**
 * @openapi
 * /api/v1/data/search:
 *   post:
 *     summary: Search for data records
 *     description: Search NHO/New Mover databases with geography and filter criteria
 *     tags: [Data]
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
 *             properties:
 *               database:
 *                 type: string
 *                 enum: [nho, new_mover, consumer, business]
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
 *               limit:
 *                 type: integer
 *                 default: 100
 *               offset:
 *                 type: integer
 *                 default: 0
 *     responses:
 *       200:
 *         description: Search results
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 */
router.post(
  '/search',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const result = await executeSearchData(req.body, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/data/count:
 *   post:
 *     summary: Preview record count
 *     description: Get count of records matching criteria without returning data
 *     tags: [Data]
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
 *             properties:
 *               database:
 *                 type: string
 *                 enum: [nho, new_mover, consumer, business]
 *               geography:
 *                 type: object
 *               filters:
 *                 type: object
 *     responses:
 *       200:
 *         description: Record count
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 */
router.post(
  '/count',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const result = await executePreviewCount(req.body, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/data/sample:
 *   post:
 *     summary: Get sample data
 *     description: Get a sample of records matching criteria (for testing/preview)
 *     tags: [Data]
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
 *             properties:
 *               database:
 *                 type: string
 *                 enum: [nho, new_mover, consumer, business]
 *               geography:
 *                 type: object
 *               filters:
 *                 type: object
 *               sample_size:
 *                 type: integer
 *                 default: 10
 *     responses:
 *       200:
 *         description: Sample records
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 */
router.post(
  '/sample',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const result = await executeGetSampleData(req.body, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/pricing:
 *   get:
 *     summary: Get pricing information
 *     description: Get current pricing for data, appends, and PDF generation
 *     tags: [Data]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: database
 *         schema:
 *           type: string
 *         description: Specific database for pricing
 *       - in: query
 *         name: record_count
 *         schema:
 *           type: integer
 *         description: Estimated record count for volume pricing
 *     responses:
 *       200:
 *         description: Pricing information
 *       401:
 *         description: Authentication required
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    // Map query params to input format
    const input = {
      database: req.query.database as string | undefined,
      record_count: req.query.record_count
        ? parseInt(req.query.record_count as string, 10)
        : undefined,
    };
    const result = await executeGetPricing(input, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

export default router;
