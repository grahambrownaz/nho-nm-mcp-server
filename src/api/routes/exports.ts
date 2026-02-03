/**
 * Export Routes
 * REST API routes for data export functionality
 */

import { Router } from 'express';
import { asyncHandler, createSuccessResponse } from '../middleware/errors.js';
import { executeExportData } from '../../tools/exports/index.js';
import { prisma } from '../../db/client.js';

const router = Router();

/**
 * @openapi
 * /api/v1/exports:
 *   post:
 *     summary: Export data
 *     description: Export data records to CSV, Excel, or JSON format
 *     tags: [Exports]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - source
 *               - format
 *             properties:
 *               source:
 *                 type: object
 *                 required:
 *                   - type
 *                 properties:
 *                   type:
 *                     type: string
 *                     enum: [query, delivery, subscription, purchase]
 *                   database:
 *                     type: string
 *                     description: Required for query source
 *                   geography:
 *                     type: object
 *                     description: Required for query source
 *                   filters:
 *                     type: object
 *                   record_count:
 *                     type: integer
 *                   delivery_id:
 *                     type: string
 *                     description: For delivery source
 *                   subscription_id:
 *                     type: string
 *                     description: For subscription source
 *                   purchase_id:
 *                     type: string
 *                     description: For purchase source
 *               format:
 *                 type: string
 *                 enum: [csv, excel, json]
 *               delivery_method:
 *                 type: string
 *                 enum: [download_url, email, sftp, webhook]
 *                 default: download_url
 *               delivery_config:
 *                 type: object
 *                 properties:
 *                   email:
 *                     type: string
 *                   sftp_config_id:
 *                     type: string
 *                   webhook_url:
 *                     type: string
 *     responses:
 *       200:
 *         description: Export created
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
 *                     export_id:
 *                       type: string
 *                     status:
 *                       type: string
 *                     download_url:
 *                       type: string
 *                     expires_at:
 *                       type: string
 *                     record_count:
 *                       type: integer
 *                     file_size_bytes:
 *                       type: integer
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
    const result = await executeExportData(req.body, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/exports:
 *   get:
 *     summary: List exports
 *     description: List all exports for the tenant
 *     tags: [Exports]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Maximum number of exports to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of exports to skip
 *       - in: query
 *         name: source_type
 *         schema:
 *           type: string
 *           enum: [query, delivery, subscription, list_purchase]
 *         description: Filter by source type
 *     responses:
 *       200:
 *         description: List of exports
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
 *                     exports:
 *                       type: array
 *                       items:
 *                         type: object
 *                     total:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *       401:
 *         description: Authentication required
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }

    const limit = parseInt(req.query.limit as string, 10) || 20;
    const offset = parseInt(req.query.offset as string, 10) || 0;
    const sourceTypeParam = req.query.source_type;
    const sourceType = typeof sourceTypeParam === 'string' ? sourceTypeParam : undefined;

    const where: { tenantId: string; sourceType?: string } = {
      tenantId: req.tenantContext.tenant.id,
    };

    if (sourceType) {
      where.sourceType = sourceType;
    }

    const [exports, total] = await Promise.all([
      prisma.exportFile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.exportFile.count({ where }),
    ]);

    res.json(createSuccessResponse(req, {
      exports: exports.map((exp) => ({
        export_id: exp.id,
        source_type: exp.sourceType,
        source_id: exp.sourceId,
        format: exp.format,
        record_count: exp.recordCount,
        file_size_bytes: exp.fileSizeBytes,
        download_url: exp.downloadExpires && exp.downloadExpires > new Date() ? exp.downloadUrl : null,
        download_expires: exp.downloadExpires?.toISOString(),
        created_at: exp.createdAt.toISOString(),
      })),
      total,
      limit,
      offset,
    }));
  })
);

/**
 * @openapi
 * /api/v1/exports/{exportId}:
 *   get:
 *     summary: Get export details
 *     description: Get details and download URL for a specific export
 *     tags: [Exports]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: exportId
 *         required: true
 *         schema:
 *           type: string
 *         description: The export ID
 *     responses:
 *       200:
 *         description: Export details
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
 *                     export_id:
 *                       type: string
 *                     source_type:
 *                       type: string
 *                     format:
 *                       type: string
 *                     record_count:
 *                       type: integer
 *                     download_url:
 *                       type: string
 *       404:
 *         description: Export not found
 *       401:
 *         description: Authentication required
 */
router.get(
  '/:exportId',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }

    const exportId = req.params.exportId as string;
    const exportFile = await prisma.exportFile.findFirst({
      where: {
        id: exportId,
        tenantId: req.tenantContext.tenant.id,
      },
    });

    if (!exportFile) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Export not found',
        },
      });
      return;
    }

    res.json(createSuccessResponse(req, {
      export_id: exportFile.id,
      source_type: exportFile.sourceType,
      source_id: exportFile.sourceId,
      format: exportFile.format,
      record_count: exportFile.recordCount,
      file_size_bytes: exportFile.fileSizeBytes,
      download_url: exportFile.downloadExpires && exportFile.downloadExpires > new Date()
        ? exportFile.downloadUrl
        : null,
      download_expires: exportFile.downloadExpires?.toISOString(),
      created_at: exportFile.createdAt.toISOString(),
    }));
  })
);

export default router;
