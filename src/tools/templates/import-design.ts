/**
 * Tool: import_design
 * Import design from external sources (Canva, email, URL)
 */

import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { validateInput } from '../../utils/validation.js';
import { requirePermission, type TenantContext } from '../../utils/auth.js';
import { ValidationError } from '../../utils/errors.js';
import sanitizeHtml from 'sanitize-html';

/**
 * Sanitize options for imported HTML
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
};

/**
 * Input schema for import_design
 */
const ImportDesignInputSchema = z.object({
  source: z.enum(['canva', 'html', 'email', 'url']),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  category: z.enum([
    'realtor', 'hvac', 'insurance', 'landscaping',
    'home_services', 'retail', 'general', 'custom',
  ]).default('custom'),
  size: z.enum(['4x6', '6x9', '6x11']).default('4x6'),
  // Source-specific inputs
  canva_export_url: z.string().url().optional(),
  html_content: z.string().optional(),
  email_html: z.string().optional(),
  url: z.string().url().optional(),
  // Additional options
  extract_styles: z.boolean().default(true),
  convert_images_to_data_urls: z.boolean().default(false),
});

export type ImportDesignInput = z.infer<typeof ImportDesignInputSchema>;

/**
 * Tool definition for MCP server registration
 */
export const importDesignTool = {
  name: 'import_design',
  description: `Import a design from external sources.

Supported sources:
- canva: Import from Canva export URL
- html: Import raw HTML content
- email: Import from email HTML (common for marketing emails)
- url: Fetch and import from a URL

Parameters:
- source: Import source type
- name: Name for the new template
- description: Optional description
- category: Template category
- size: Target postcard size (4x6, 6x9, 6x11)
- canva_export_url: URL for Canva exports
- html_content: Raw HTML content
- email_html: Email HTML content
- url: URL to fetch design from
- extract_styles: Extract inline styles to CSS (default: true)
- convert_images_to_data_urls: Convert image URLs to data URLs (default: false)

Returns the imported template with detected merge fields.`,

  inputSchema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        enum: ['canva', 'html', 'email', 'url'],
        description: 'Import source type',
      },
      name: { type: 'string', description: 'Template name' },
      description: { type: 'string', description: 'Template description' },
      category: {
        type: 'string',
        enum: ['realtor', 'hvac', 'insurance', 'landscaping', 'home_services', 'retail', 'general', 'custom'],
      },
      size: {
        type: 'string',
        enum: ['4x6', '6x9', '6x11'],
        description: 'Target postcard size',
      },
      canva_export_url: { type: 'string', description: 'Canva export URL' },
      html_content: { type: 'string', description: 'Raw HTML content' },
      email_html: { type: 'string', description: 'Email HTML content' },
      url: { type: 'string', description: 'URL to fetch design from' },
      extract_styles: { type: 'boolean', description: 'Extract inline styles to CSS' },
      convert_images_to_data_urls: { type: 'boolean', description: 'Convert images to data URLs' },
    },
    required: ['source', 'name'],
  },
};

/**
 * Extract merge fields from HTML
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
 * Extract inline styles to separate CSS
 */
function extractStyles(html: string): { html: string; css: string } {
  const styleMap = new Map<string, string>();
  let classCounter = 0;
  let css = '';

  // Extract style attributes and create classes
  const processedHtml = html.replace(
    /style="([^"]+)"/g,
    (_match, styleContent) => {
      // Check if we've seen this style before
      const existingClass = Array.from(styleMap.entries()).find(
        ([, style]) => style === styleContent
      );

      if (existingClass) {
        return `class="${existingClass[0]}"`;
      }

      // Create new class
      const className = `imported-style-${++classCounter}`;
      styleMap.set(className, styleContent);
      return `class="${className}"`;
    }
  );

  // Build CSS
  for (const [className, styles] of styleMap) {
    css += `.${className} { ${styles} }\n`;
  }

  return { html: processedHtml, css };
}

/**
 * Process email HTML (remove email-specific elements)
 */
function processEmailHtml(html: string): string {
  // Remove email tracking pixels
  let processed = html.replace(/<img[^>]*tracking[^>]*>/gi, '');
  processed = processed.replace(/<img[^>]*1x1[^>]*>/gi, '');

  // Remove unsubscribe links (keep other links)
  processed = processed.replace(/<a[^>]*unsubscribe[^>]*>.*?<\/a>/gi, '');

  // Remove view in browser links
  processed = processed.replace(/<a[^>]*view.*?browser[^>]*>.*?<\/a>/gi, '');

  // Clean up empty containers
  processed = processed.replace(/<(div|td|tr)[^>]*>\s*<\/(div|td|tr)>/gi, '');

  return processed;
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
 * Execute the import_design tool
 */
export async function executeImportDesign(
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
      createdAt: string;
    };
    import_details: {
      source: string;
      original_size_bytes: number;
      processed_size_bytes: number;
      styles_extracted: boolean;
      merge_fields_detected: number;
      warnings: string[];
    };
  };
  error?: string;
}> {
  // Validate input
  const params = validateInput(ImportDesignInputSchema, input);

  // Check permissions
  requirePermission(context, 'template:write');

  let rawHtml: string;
  const warnings: string[] = [];

  // Get HTML content based on source
  switch (params.source) {
    case 'canva': {
      if (!params.canva_export_url) {
        throw new ValidationError('canva_export_url required for Canva import');
      }
      // In production, this would fetch from Canva's API
      // For now, we'll note it's not implemented
      warnings.push('Canva API integration pending - please use html_content directly');
      rawHtml = params.html_content || '<div>Canva import placeholder</div>';
      break;
    }

    case 'html': {
      if (!params.html_content) {
        throw new ValidationError('html_content required for HTML import');
      }
      rawHtml = params.html_content;
      break;
    }

    case 'email': {
      if (!params.email_html) {
        throw new ValidationError('email_html required for email import');
      }
      rawHtml = processEmailHtml(params.email_html);
      warnings.push('Email tracking pixels and unsubscribe links removed');
      break;
    }

    case 'url': {
      if (!params.url) {
        throw new ValidationError('url required for URL import');
      }
      // In production, this would fetch the URL
      warnings.push('URL fetching pending implementation - please use html_content directly');
      rawHtml = params.html_content || '<div>URL import placeholder</div>';
      break;
    }

    default:
      throw new ValidationError(`Unknown source: ${params.source}`);
  }

  const originalSize = rawHtml.length;

  // Get defaults for optional fields
  const category = params.category || 'custom';
  const size = params.size || '4x6';
  const shouldExtractStyles = params.extract_styles ?? true;

  // Sanitize HTML
  let sanitizedHtml = sanitizeHtml(rawHtml, SANITIZE_OPTIONS);

  // Extract styles if requested
  let cssStyles: string | null = null;
  if (shouldExtractStyles) {
    const extracted = extractStyles(sanitizedHtml);
    sanitizedHtml = extracted.html;
    cssStyles = extracted.css || null;
  }

  // Extract merge fields
  const mergeFields = extractMergeFields(sanitizedHtml);

  // Create the template
  const template = await prisma.template.create({
    data: {
      tenantId: context.tenant.id,
      name: params.name,
      description: params.description || null,
      category: mapCategory(category),
      size: mapSize(size),
      htmlFront: sanitizedHtml,
      htmlBack: null,
      cssStyles,
      mergeFields,
      isPublic: false,
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
        createdAt: template.createdAt.toISOString(),
      },
      import_details: {
        source: params.source,
        original_size_bytes: originalSize,
        processed_size_bytes: sanitizedHtml.length,
        styles_extracted: shouldExtractStyles && (cssStyles?.length || 0) > 0,
        merge_fields_detected: mergeFields.length,
        warnings,
      },
    },
  };
}
