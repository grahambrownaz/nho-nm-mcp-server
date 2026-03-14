/**
 * Tool: upload_franchise_creative
 * Upload brand-approved creative assets (postcards, emails, etc.)
 * that stores can use for their campaigns.
 */

import { type TenantContext } from '../../utils/auth.js';
import { ValidationError } from '../../utils/errors.js';
import type { FranchiseCreativeConfig } from '../../types/franchise.js';

/**
 * Tool definition for MCP server registration
 */
export const uploadFranchiseCreativeTool = {
  name: 'upload_franchise_creative',
  description: `Upload brand-approved creative assets for your franchise stores to use.

Creative types:
- POSTCARD: Direct mail postcard template (4x6, 6x9, or 6x11)
- EMAIL: Email campaign template
- LETTER: Direct mail letter template
- BANNER: Display advertising creative
- SOCIAL: Social media post template
- LANDING_PAGE: Landing page template

Templates can include merge fields that are automatically personalized per store:
- {{store_name}} — The store's display name
- {{store_address}} — Full store address
- {{store_phone}} — Store phone number
- {{manager_name}} — Store manager name
- {{first_name}} — Recipient first name
- {{last_name}} — Recipient last name
- {{address}} — Recipient address

You can mark creative as "required" — stores must use it (e.g., brand-mandated new mover welcome postcard).

Example: "Upload a 6x9 postcard template for new mover welcomes — required for all stores"`,

  inputSchema: {
    type: 'object',
    properties: {
      brand_slug: {
        type: 'string',
        description: 'The franchise brand slug',
      },
      name: {
        type: 'string',
        description: 'Creative asset name (e.g., "Spring New Mover Welcome Postcard")',
      },
      description: {
        type: 'string',
        description: 'Description of the creative and when to use it',
      },
      type: {
        type: 'string',
        enum: ['POSTCARD', 'EMAIL', 'LETTER', 'BANNER', 'SOCIAL', 'LANDING_PAGE'],
        description: 'Type of creative asset',
      },
      category: {
        type: 'string',
        description: 'Category for organization (e.g., "seasonal", "new_mover", "retention", "grand_opening")',
      },
      template_id: {
        type: 'string',
        description: 'Link to an existing template ID (from upload_template tool)',
      },
      html_content: {
        type: 'string',
        description: 'HTML content for the creative (alternative to template_id)',
      },
      image_url: {
        type: 'string',
        description: 'URL to creative image/preview',
      },
      merge_fields: {
        type: 'array',
        items: { type: 'string' },
        description: 'Available merge fields (e.g., ["store_name", "first_name", "address"])',
      },
      is_required: {
        type: 'boolean',
        description: 'If true, stores must use this creative (brand-mandated). Default: false',
      },
      available_from: {
        type: 'string',
        description: 'Start date for availability (ISO 8601). For seasonal campaigns.',
      },
      available_to: {
        type: 'string',
        description: 'End date for availability (ISO 8601). For seasonal campaigns.',
      },
    },
    required: ['brand_slug', 'name', 'type'],
  },
};

/**
 * Execute creative upload
 */
export async function executeUploadFranchiseCreative(
  input: unknown,
  _context: TenantContext
): Promise<unknown> {
  const params = input as Record<string, unknown>;

  const config: FranchiseCreativeConfig = {
    brandSlug: params.brand_slug as string,
    name: params.name as string,
    description: params.description as string | undefined,
    type: params.type as FranchiseCreativeConfig['type'],
    category: params.category as string | undefined,
    templateId: params.template_id as string | undefined,
    htmlContent: params.html_content as string | undefined,
    imageUrl: params.image_url as string | undefined,
    mergeFields: params.merge_fields as string[] | undefined,
    isRequired: params.is_required as boolean | undefined,
    availableFrom: params.available_from as string | undefined,
    availableTo: params.available_to as string | undefined,
  };

  // Validate: must have either templateId or htmlContent for actionable types
  if (['POSTCARD', 'EMAIL', 'LETTER'].includes(config.type) && !config.templateId && !config.htmlContent) {
    throw new ValidationError(
      `${config.type} creative requires either a template_id (from upload_template) or html_content`
    );
  }

  // Default merge fields based on type
  const defaultMergeFields = ['store_name', 'store_address', 'store_phone'];
  if (['POSTCARD', 'EMAIL', 'LETTER'].includes(config.type)) {
    defaultMergeFields.push('first_name', 'last_name', 'address', 'city', 'state', 'zip');
  }
  const mergeFields = config.mergeFields || defaultMergeFields;

  const creativeId = `creative-${Date.now()}`;

  return {
    success: true,
    creative: {
      id: creativeId,
      brandSlug: config.brandSlug,
      name: config.name,
      description: config.description,
      type: config.type,
      category: config.category,
      isApproved: true,
      isRequired: config.isRequired || false,
      isActive: true,
    },
    content: {
      templateId: config.templateId,
      hasHtmlContent: !!config.htmlContent,
      imageUrl: config.imageUrl,
      mergeFields,
    },
    scheduling: config.availableFrom || config.availableTo
      ? {
          availableFrom: config.availableFrom,
          availableTo: config.availableTo,
          isSeasonal: true,
        }
      : {
          availableFrom: null,
          availableTo: null,
          isSeasonal: false,
        },
    storeUsage: {
      description: config.isRequired
        ? `This creative is REQUIRED — all stores must use it for ${config.category || config.type.toLowerCase()} campaigns`
        : `This creative is available for stores to choose when running ${config.category || config.type.toLowerCase()} campaigns`,
      mergeFieldsExplained: mergeFields.map((f) => {
        const explanations: Record<string, string> = {
          store_name: 'Auto-filled with the store\'s display name',
          store_address: 'Auto-filled with the store\'s full address',
          store_phone: 'Auto-filled with the store\'s phone number',
          manager_name: 'Auto-filled with the store manager\'s name',
          first_name: 'Recipient\'s first name from the data',
          last_name: 'Recipient\'s last name from the data',
          address: 'Recipient\'s street address',
          city: 'Recipient\'s city',
          state: 'Recipient\'s state',
          zip: 'Recipient\'s ZIP code',
        };
        return { field: `{{${f}}}`, description: explanations[f] || 'Custom field' };
      }),
    },
    message: `✅ Creative "${config.name}" (${config.type}) uploaded for ${config.brandSlug}. ${config.isRequired ? '⚠️ This is REQUIRED for all stores.' : 'Available for stores to use.'} ${mergeFields.length} merge fields configured.`,
  };
}
