/**
 * Tool: list_franchise_creative
 * Browse available creative assets for a franchise brand.
 * Used by both franchisors (to manage) and stores (to select for campaigns).
 */

import { type TenantContext } from '../../utils/auth.js';

/**
 * Tool definition for MCP server registration
 */
export const listFranchiseCreativeTool = {
  name: 'list_franchise_creative',
  description: `Browse brand-approved creative assets available for campaigns.

For franchisors: See all creative you've uploaded, usage stats, and which are required.
For store managers: See what creative is available for your next postcard or email campaign.

Filter by type (POSTCARD, EMAIL, etc.), category (new_mover, seasonal, etc.), or required status.

Example: "Show me available postcard designs" or "What email templates can I use?"`,

  inputSchema: {
    type: 'object',
    properties: {
      brand_slug: {
        type: 'string',
        description: 'The franchise brand slug',
      },
      type_filter: {
        type: 'string',
        enum: ['POSTCARD', 'EMAIL', 'LETTER', 'BANNER', 'SOCIAL', 'LANDING_PAGE'],
        description: 'Filter by creative type',
      },
      category_filter: {
        type: 'string',
        description: 'Filter by category (e.g., "new_mover", "seasonal")',
      },
      required_only: {
        type: 'boolean',
        description: 'Only show required (brand-mandated) creative',
      },
    },
    required: ['brand_slug'],
  },
};

/**
 * Execute list franchise creative
 */
export async function executeListFranchiseCreative(
  input: unknown,
  _context: TenantContext
): Promise<unknown> {
  const params = input as Record<string, unknown>;
  const brandSlug = params.brand_slug as string;
  const typeFilter = params.type_filter as string | undefined;
  const categoryFilter = params.category_filter as string | undefined;
  const requiredOnly = params.required_only as boolean | undefined;

  // In production: query FranchiseCreative by brandId with filters

  return {
    success: true,
    brandSlug,
    filters: {
      type: typeFilter || 'all',
      category: categoryFilter || 'all',
      requiredOnly: requiredOnly || false,
    },
    creative: [] as Array<{
      id: string;
      name: string;
      description: string | null;
      type: string;
      category: string | null;
      isRequired: boolean;
      isActive: boolean;
      thumbnailUrl: string | null;
      mergeFields: string[];
      availableFrom: string | null;
      availableTo: string | null;
      usageCount: number;
      createdAt: string;
    }>,
    summary: {
      total: 0,
      byType: {} as Record<string, number>,
      required: 0,
    },
    message: `📎 No creative assets found for ${brandSlug}. Use upload_franchise_creative to add postcard designs, email templates, and more.`,
  };
}
