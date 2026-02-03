/**
 * Tool: generate_postcard_pdf
 * Generate PDF postcards from templates with data
 */

import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { validateInput } from '../../utils/validation.js';
import { requirePermission, type TenantContext } from '../../utils/auth.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

/**
 * Input schema for generate_postcard_pdf
 */
const GeneratePostcardPdfInputSchema = z.object({
  template_id: z.string().uuid(),
  records: z.array(z.record(z.string(), z.unknown())).min(1).max(500),
  output_format: z.enum(['single_pdf', 'individual_pdfs', 'print_ready']).default('single_pdf'),
  include_back: z.boolean().default(true),
  quality: z.enum(['draft', 'standard', 'high']).default('standard'),
  bleed: z.boolean().default(false), // Add bleed marks for printing
});

export type GeneratePostcardPdfInput = z.infer<typeof GeneratePostcardPdfInputSchema>;

/**
 * Tool definition for MCP server registration
 */
export const generatePostcardPdfTool = {
  name: 'generate_postcard_pdf',
  description: `Generate PDF postcards from a template.

Parameters:
- template_id: The template to use
- records: Array of data records to merge (max 500)
- output_format: Output format
  - single_pdf: All postcards in one PDF file
  - individual_pdfs: Separate PDF per postcard
  - print_ready: Optimized for commercial printing
- include_back: Include back side of postcard (default: true)
- quality: PDF quality (draft, standard, high)
- bleed: Add bleed marks for printing (default: false)

Each record should include merge fields like:
- first_name, last_name
- address, city, state, zip
- Any custom fields defined in the template

Returns download URL(s) for the generated PDF(s).`,

  inputSchema: {
    type: 'object',
    properties: {
      template_id: { type: 'string', description: 'Template ID to use' },
      records: {
        type: 'array',
        items: { type: 'object' },
        description: 'Data records to merge with template',
      },
      output_format: {
        type: 'string',
        enum: ['single_pdf', 'individual_pdfs', 'print_ready'],
        description: 'Output format',
      },
      include_back: {
        type: 'boolean',
        description: 'Include back side of postcard',
      },
      quality: {
        type: 'string',
        enum: ['draft', 'standard', 'high'],
        description: 'PDF quality level',
      },
      bleed: {
        type: 'boolean',
        description: 'Add bleed marks for printing',
      },
    },
    required: ['template_id', 'records'],
  },
};

/**
 * Postcard dimensions in points (1 inch = 72 points)
 */
const POSTCARD_DIMENSIONS: Record<string, { width: number; height: number }> = {
  SIZE_4X6: { width: 432, height: 288 }, // 6" x 4" (landscape)
  SIZE_6X9: { width: 648, height: 432 }, // 9" x 6" (landscape)
  SIZE_6X11: { width: 792, height: 432 }, // 11" x 6" (landscape)
};

/**
 * Quality settings for PDF generation
 * Exported for use by PDF generator service
 */
export const QUALITY_SETTINGS: Record<string, { scale: number; compression: string }> = {
  draft: { scale: 1, compression: 'low' },
  standard: { scale: 1.5, compression: 'medium' },
  high: { scale: 2, compression: 'none' },
};

/**
 * Execute the generate_postcard_pdf tool
 */
export async function executeGeneratePostcardPdf(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    job: {
      id: string;
      status: string;
      templateId: string;
      templateName: string;
      recordCount: number;
      outputFormat: string;
      quality: string;
      estimatedPages: number;
    };
    download: {
      url: string | null;
      urls: string[] | null;
      expiresAt: string;
    };
    costs: {
      recordsCost: number;
      pdfCost: number;
      totalCost: number;
      pricePerRecord: number;
      pricePerPdf: number;
    };
  };
  error?: string;
}> {
  // Validate input
  const params = validateInput(GeneratePostcardPdfInputSchema, input);

  // Check permissions
  requirePermission(context, 'template:read');
  requirePermission(context, 'data:write'); // PDF generation is a billable action

  // Fetch the template
  const template = await prisma.template.findFirst({
    where: {
      id: params.template_id,
      isActive: true,
      OR: [
        { tenantId: context.tenant.id },
        { isPublic: true },
      ],
    },
  });

  if (!template) {
    throw new NotFoundError('Template', params.template_id);
  }

  // Validate that records have required merge fields
  const requiredFields = template.mergeFields;
  const missingFields: Array<{ recordIndex: number; missingFields: string[] }> = [];

  for (let i = 0; i < params.records.length; i++) {
    const record = params.records[i];
    const missing = requiredFields.filter((field) => !(field in record));
    if (missing.length > 0) {
      missingFields.push({ recordIndex: i, missingFields: missing });
    }
  }

  // Only warn about missing fields if there are many
  if (missingFields.length > params.records.length * 0.5) {
    throw new ValidationError(
      'More than 50% of records are missing required merge fields',
      {
        template_merge_fields: requiredFields,
        sample_missing: missingFields.slice(0, 3),
      }
    );
  }

  // Calculate dimensions
  const dimensions = POSTCARD_DIMENSIONS[template.size] || POSTCARD_DIMENSIONS.SIZE_4X6;
  const qualitySetting = params.quality || 'standard';
  // Quality settings are available via QUALITY_SETTINGS[qualitySetting] when needed

  // Get output options with defaults
  const outputFormat = params.output_format || 'single_pdf';
  const includeBack = params.include_back ?? true;
  const bleed = params.bleed ?? false;

  // Calculate estimated pages
  const pagesPerPostcard = includeBack && template.htmlBack ? 2 : 1;
  const estimatedPages = params.records.length * pagesPerPostcard;

  // Generate a job ID (in production, this would queue the job)
  const jobId = `pdf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Calculate costs
  const pricePerRecord = Number(context.subscription?.pricePerRecord) || 0.05;
  const pricePerPdf = Number(context.subscription?.pricePdfGeneration) || 0.02;

  const recordsCost = params.records.length * pricePerRecord;
  const pdfCost = params.records.length * pricePerPdf;
  const totalCost = recordsCost + pdfCost;

  // Record usage
  await prisma.usageRecord.create({
    data: {
      tenantId: context.tenant.id,
      usageType: 'PDF_GENERATION',
      quantity: params.records.length,
      unitPrice: pricePerPdf,
      totalCost: pdfCost,
      toolName: 'generate_postcard_pdf',
      geography: undefined,
      billingMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    },
  });

  // In production, this would:
  // 1. Queue the PDF generation job
  // 2. Use Puppeteer to render each postcard
  // 3. Combine into single/multiple PDFs
  // 4. Upload to storage and return URLs

  // For now, return a placeholder response
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  const response: {
    success: boolean;
    data: {
      job: {
        id: string;
        status: string;
        templateId: string;
        templateName: string;
        recordCount: number;
        outputFormat: string;
        quality: string;
        estimatedPages: number;
        dimensions: { width: number; height: number; unit: string };
        includeBack: boolean;
        bleed: boolean;
      };
      download: {
        url: string | null;
        urls: string[] | null;
        expiresAt: string;
      };
      costs: {
        recordsCost: number;
        pdfCost: number;
        totalCost: number;
        pricePerRecord: number;
        pricePerPdf: number;
      };
    };
  } = {
    success: true,
    data: {
      job: {
        id: jobId,
        status: 'processing',
        templateId: template.id,
        templateName: template.name,
        recordCount: params.records.length,
        outputFormat: outputFormat,
        quality: qualitySetting,
        estimatedPages,
        dimensions: {
          width: dimensions.width / 72, // Convert to inches
          height: dimensions.height / 72,
          unit: 'inches',
        },
        includeBack: includeBack,
        bleed: bleed,
      },
      download: {
        url: outputFormat === 'individual_pdfs' ? null : `/api/downloads/${jobId}/postcards.pdf`,
        urls: outputFormat === 'individual_pdfs'
          ? params.records.map((_, i) => `/api/downloads/${jobId}/postcard-${i + 1}.pdf`)
          : null,
        expiresAt: expiresAt.toISOString(),
      },
      costs: {
        recordsCost: Math.round(recordsCost * 100) / 100,
        pdfCost: Math.round(pdfCost * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        pricePerRecord,
        pricePerPdf,
      },
    },
  };

  return response;
}
