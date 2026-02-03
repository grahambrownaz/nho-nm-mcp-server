/**
 * Template Routes
 * REST API routes for template management and PDF generation
 */

import { Router } from 'express';
import { asyncHandler, createSuccessResponse } from '../middleware/errors.js';
import {
  executeUploadTemplate,
  executeBrowseTemplates,
  executeImportDesign,
  executeGeneratePostcardPdf,
} from '../../tools/templates/index.js';

const router = Router();

/**
 * @openapi
 * /api/v1/templates:
 *   post:
 *     summary: Upload a new template
 *     description: Upload HTML/Handlebars template for postcard generation
 *     tags: [Templates]
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
 *               - front_html
 *               - size
 *             properties:
 *               name:
 *                 type: string
 *                 description: Template name
 *               description:
 *                 type: string
 *               front_html:
 *                 type: string
 *                 description: HTML/Handlebars markup for front
 *               back_html:
 *                 type: string
 *                 description: HTML/Handlebars markup for back (optional)
 *               size:
 *                 type: string
 *                 enum: [4x6, 6x9, 6x11]
 *               orientation:
 *                 type: string
 *                 enum: [landscape, portrait]
 *                 default: landscape
 *               is_public:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       201:
 *         description: Template created
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
    const result = await executeUploadTemplate(req.body, req.tenantContext);
    res.status(201).json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/templates:
 *   get:
 *     summary: Browse templates
 *     description: List available templates (own + public starter templates)
 *     tags: [Templates]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [nho, new_mover, general, all]
 *         description: Filter by category
 *       - in: query
 *         name: size
 *         schema:
 *           type: string
 *           enum: [4x6, 6x9, 6x11]
 *         description: Filter by size
 *       - in: query
 *         name: include_public
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include public starter templates
 *     responses:
 *       200:
 *         description: List of templates
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
      category: req.query.category as string | undefined,
      size: req.query.size as string | undefined,
      include_public: req.query.include_public !== 'false',
    };
    const result = await executeBrowseTemplates(input, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/templates/import:
 *   post:
 *     summary: Import design from external URL
 *     description: Import a design from Canva, Vistaprint, or image URL
 *     tags: [Templates]
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
 *               - source_url
 *               - size
 *             properties:
 *               name:
 *                 type: string
 *                 description: Template name
 *               source_url:
 *                 type: string
 *                 format: uri
 *                 description: URL to import from
 *               source_type:
 *                 type: string
 *                 enum: [canva, vistaprint, image, html]
 *               size:
 *                 type: string
 *                 enum: [4x6, 6x9, 6x11]
 *               merge_fields:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     placeholder:
 *                       type: string
 *     responses:
 *       201:
 *         description: Design imported
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 */
router.post(
  '/import',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const result = await executeImportDesign(req.body, req.tenantContext);
    res.status(201).json(createSuccessResponse(req, result));
  })
);

/**
 * @openapi
 * /api/v1/templates/{id}/generate:
 *   post:
 *     summary: Generate postcard PDF
 *     description: Generate PDF(s) from template with data records
 *     tags: [Templates]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Template ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - records
 *             properties:
 *               records:
 *                 type: array
 *                 items:
 *                   type: object
 *                 description: Data records to merge
 *               output_format:
 *                 type: string
 *                 enum: [single_pdf, individual_pdfs, zip]
 *                 default: single_pdf
 *               include_back:
 *                 type: boolean
 *                 default: true
 *               quality:
 *                 type: string
 *                 enum: [draft, standard, high]
 *                 default: standard
 *               bleed:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: PDF generation result
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Template not found
 */
router.post(
  '/:id/generate',
  asyncHandler(async (req, res) => {
    if (!req.tenantContext) {
      throw new Error('Authentication required');
    }
    const input = {
      template_id: req.params.id,
      ...req.body,
    };
    const result = await executeGeneratePostcardPdf(input, req.tenantContext);
    res.json(createSuccessResponse(req, result));
  })
);

export default router;
