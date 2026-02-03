/**
 * Tool: upload_template
 * Upload a custom postcard template with HTML/CSS
 */

import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { validateInput } from '../../utils/validation.js';
import { requirePermission, type TenantContext } from '../../utils/auth.js';
import { ValidationError } from '../../utils/errors.js';
import sanitizeHtml from 'sanitize-html';

/**
 * Allowed HTML tags and attributes for template security
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'img', 'br', 'hr', 'strong', 'em', 'b', 'i', 'u',
    'table', 'tr', 'td', 'th', 'thead', 'tbody',
    'ul', 'ol', 'li', 'a', 'blockquote', 'pre', 'code',
  ],
  allowedAttributes: {
    '*': ['class', 'id', 'style'],
    'img': ['src', 'alt', 'width', 'height'],
    'a': ['href', 'target'],
    'td': ['colspan', 'rowspan'],
    'th': ['colspan', 'rowspan'],
  },
  allowedStyles: {
    '*': {
      'color': [/.*/],
      'background-color': [/.*/],
      'background': [/.*/],
      'font-family': [/.*/],
      'font-size': [/.*/],
      'font-weight': [/.*/],
      'text-align': [/.*/],
      'text-decoration': [/.*/],
      'padding': [/.*/],
      'padding-top': [/.*/],
      'padding-right': [/.*/],
      'padding-bottom': [/.*/],
      'padding-left': [/.*/],
      'margin': [/.*/],
      'margin-top': [/.*/],
      'margin-right': [/.*/],
      'margin-bottom': [/.*/],
      'margin-left': [/.*/],
      'width': [/.*/],
      'height': [/.*/],
      'max-width': [/.*/],
      'max-height': [/.*/],
      'border': [/.*/],
      'border-radius': [/.*/],
      'display': [/.*/],
      'flex': [/.*/],
      'flex-direction': [/.*/],
      'justify-content': [/.*/],
      'align-items': [/.*/],
      'position': [/.*/],
      'top': [/.*/],
      'right': [/.*/],
      'bottom': [/.*/],
      'left': [/.*/],
      'line-height': [/.*/],
      'letter-spacing': [/.*/],
    },
  },
};

/**
 * Input schema for upload_template
 */
const UploadTemplateInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  category: z.enum([
    'realtor', 'hvac', 'insurance', 'landscaping',
    'home_services', 'retail', 'general', 'custom',
  ]).default('custom'),
  size: z.enum(['4x6', '6x9', '6x11']).default('4x6'),
  html_front: z.string().min(10).max(50000),
  html_back: z.string().max(50000).optional(),
  css_styles: z.string().max(20000).optional(),
  is_public: z.boolean().default(false),
});

export type UploadTemplateInput = z.infer<typeof UploadTemplateInputSchema>;

/**
 * Tool definition for MCP server registration
 */
export const uploadTemplateTool = {
  name: 'upload_template',
  description: `Upload a custom postcard template.

Parameters:
- name: Template name
- description: Optional description
- category: Template category (realtor, hvac, insurance, landscaping, home_services, retail, general, custom)
- size: Postcard size (4x6, 6x9, 6x11)
- html_front: HTML content for front side
- html_back: Optional HTML content for back side
- css_styles: Optional CSS styles
- is_public: Make template available to other users (default: false)

Use merge fields like {{first_name}}, {{last_name}}, {{address}}, {{city}}, {{state}}, {{zip}} for personalization.

Returns the created template with detected merge fields.`,

  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Template name' },
      description: { type: 'string', description: 'Template description' },
      category: {
        type: 'string',
        enum: ['realtor', 'hvac', 'insurance', 'landscaping', 'home_services', 'retail', 'general', 'custom'],
        description: 'Template category',
      },
      size: {
        type: 'string',
        enum: ['4x6', '6x9', '6x11'],
        description: 'Postcard size in inches',
      },
      html_front: { type: 'string', description: 'HTML content for front side' },
      html_back: { type: 'string', description: 'HTML content for back side' },
      css_styles: { type: 'string', description: 'CSS styles' },
      is_public: { type: 'boolean', description: 'Make template public' },
    },
    required: ['name', 'html_front'],
  },
};

/**
 * Extract merge fields from HTML content
 */
function extractMergeFields(html: string): string[] {
  const regex = /\{\{([a-z_]+)\}\}/gi;
  const fields = new Set<string>();
  let match;

  while ((match = regex.exec(html)) !== null) {
    fields.add(match[1].toLowerCase());
  }

  return Array.from(fields);
}

/**
 * Map size string to enum
 */
function mapSize(size: string): 'SIZE_4X6' | 'SIZE_6X9' | 'SIZE_6X11' {
  const map: Record<string, 'SIZE_4X6' | 'SIZE_6X9' | 'SIZE_6X11'> = {
    '4x6': 'SIZE_4X6',
    '6x9': 'SIZE_6X9',
    '6x11': 'SIZE_6X11',
  };
  return map[size] || 'SIZE_4X6';
}

/**
 * Map category string to enum
 */
function mapCategory(
  category: string
): 'REALTOR' | 'HVAC' | 'INSURANCE' | 'LANDSCAPING' | 'HOME_SERVICES' | 'RETAIL' | 'GENERAL' | 'CUSTOM' {
  const map: Record<
    string,
    'REALTOR' | 'HVAC' | 'INSURANCE' | 'LANDSCAPING' | 'HOME_SERVICES' | 'RETAIL' | 'GENERAL' | 'CUSTOM'
  > = {
    realtor: 'REALTOR',
    hvac: 'HVAC',
    insurance: 'INSURANCE',
    landscaping: 'LANDSCAPING',
    home_services: 'HOME_SERVICES',
    retail: 'RETAIL',
    general: 'GENERAL',
    custom: 'CUSTOM',
  };
  return map[category] || 'CUSTOM';
}

/**
 * Execute the upload_template tool
 */
export async function executeUploadTemplate(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    template: {
      id: string;
      name: string;
      description: string | null;
      category: string;
      size: string;
      mergeFields: string[];
      isPublic: boolean;
      createdAt: string;
    };
    validation: {
      htmlFrontSanitized: boolean;
      htmlBackSanitized: boolean;
      mergeFieldsDetected: number;
    };
  };
  error?: string;
}> {
  // Validate input
  const params = validateInput(UploadTemplateInputSchema, input);

  // Check permissions
  requirePermission(context, 'template:write');

  // Sanitize HTML content
  const sanitizedFront = sanitizeHtml(params.html_front, SANITIZE_OPTIONS);
  const sanitizedBack = params.html_back
    ? sanitizeHtml(params.html_back, SANITIZE_OPTIONS)
    : null;

  // Check if sanitization removed significant content
  const frontSizeReduction =
    (params.html_front.length - sanitizedFront.length) / params.html_front.length;
  if (frontSizeReduction > 0.5) {
    throw new ValidationError(
      'HTML front content contains too many disallowed elements. Please use standard HTML tags.',
      { original_size: params.html_front.length, sanitized_size: sanitizedFront.length }
    );
  }

  // Extract merge fields
  const allHtml = sanitizedFront + (sanitizedBack || '');
  const mergeFields = extractMergeFields(allHtml);

  // Get defaults for optional fields
  const category = params.category || 'custom';
  const size = params.size || '4x6';
  const isPublic = params.is_public ?? false;

  // Create the template
  const template = await prisma.template.create({
    data: {
      tenantId: context.tenant.id,
      name: params.name,
      description: params.description || null,
      category: mapCategory(category),
      size: mapSize(size),
      htmlFront: sanitizedFront,
      htmlBack: sanitizedBack,
      cssStyles: params.css_styles || null,
      mergeFields,
      isPublic: isPublic,
      isActive: true,
    },
  });

  return {
    success: true,
    data: {
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        category: category,
        size: size,
        mergeFields,
        isPublic: template.isPublic,
        createdAt: template.createdAt.toISOString(),
      },
      validation: {
        htmlFrontSanitized: sanitizedFront !== params.html_front,
        htmlBackSanitized: params.html_back ? sanitizedBack !== params.html_back : false,
        mergeFieldsDetected: mergeFields.length,
      },
    },
  };
}
