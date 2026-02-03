/**
 * Filter Routes
 * REST API routes for filter options and metadata
 */

import { Router } from 'express';
import { asyncHandler, createSuccessResponse } from '../middleware/errors.js';
import { executeGetFilterOptions } from '../../tools/data/index.js';

const router = Router();

/**
 * @openapi
 * /api/v1/filters:
 *   get:
 *     summary: Get filter options
 *     description: Get available filters, options, and metadata for a database
 *     tags: [Filters]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: database
 *         required: true
 *         schema:
 *           type: string
 *           enum: [consumer, business, nho, new_mover]
 *         description: The database type to get filters for
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [demographics, housing, financial, lifestyle, interests, move_timing, property, industry, company_size, contacts]
 *         description: Filter to a specific category
 *       - in: query
 *         name: include_reference_data
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include reference data like SIC codes, interests, etc.
 *     responses:
 *       200:
 *         description: Filter options and metadata
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
 *                     database:
 *                       type: string
 *                     filters:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           category:
 *                             type: string
 *                           type:
 *                             type: string
 *                           description:
 *                             type: string
 *                           options:
 *                             type: array
 *                     common_selections:
 *                       type: object
 *                     reference_data:
 *                       type: object
 *       400:
 *         description: Invalid request parameters
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
      database: req.query.database as string,
      category: req.query.category as string | undefined,
      include_reference_data: req.query.include_reference_data !== 'false',
    };
    const result = await executeGetFilterOptions(input, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/filters/{database}:
 *   get:
 *     summary: Get filter options for specific database
 *     description: Get available filters, options, and metadata for a specific database
 *     tags: [Filters]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: database
 *         required: true
 *         schema:
 *           type: string
 *           enum: [consumer, business, nho, new_mover]
 *         description: The database type
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter to a specific category
 *     responses:
 *       200:
 *         description: Filter options and metadata
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 */
router.get(
  '/:database',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const input = {
      database: req.params.database,
      category: req.query.category as string | undefined,
      include_reference_data: req.query.include_reference_data !== 'false',
    };
    const result = await executeGetFilterOptions(input, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

export default router;
