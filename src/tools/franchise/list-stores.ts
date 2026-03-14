/**
 * Tool: list_franchise_stores
 * List all stores/locations in a franchise brand with status and activity summary.
 */

import { type TenantContext } from '../../utils/auth.js';

/**
 * Tool definition for MCP server registration
 */
export const listFranchiseStoresTool = {
  name: 'list_franchise_stores',
  description: `List all stores in your franchise network with their status, location, and activity summary.

Filter by state, status, or search by store name/number.

Example: "List all my stores in Arizona" or "Show inactive stores" or "Find store #1234"`,

  inputSchema: {
    type: 'object',
    properties: {
      brand_slug: {
        type: 'string',
        description: 'The franchise brand slug',
      },
      state_filter: {
        type: 'string',
        description: 'Filter by state abbreviation (e.g., "AZ")',
      },
      status_filter: {
        type: 'string',
        enum: ['ACTIVE', 'SUSPENDED', 'PENDING_SETUP', 'CLOSED'],
        description: 'Filter by store status',
      },
      search: {
        type: 'string',
        description: 'Search by store name or number',
      },
      page: {
        type: 'number',
        description: 'Page number (default: 1, 25 stores per page)',
      },
    },
    required: ['brand_slug'],
  },
};

/**
 * Execute list franchise stores
 */
export async function executeListFranchiseStores(
  input: unknown,
  _context: TenantContext
): Promise<unknown> {
  const params = input as Record<string, unknown>;
  const brandSlug = params.brand_slug as string;
  const page = (params.page as number) || 1;

  // In production: query FranchiseStore by brandId with filters and pagination

  return {
    success: true,
    brandSlug,
    filters: {
      state: params.state_filter || 'all',
      status: params.status_filter || 'all',
      search: params.search || null,
    },
    pagination: {
      page,
      perPage: 25,
      total: 0,
      totalPages: 0,
    },
    stores: [] as Array<{
      id: string;
      storeNumber: string | null;
      storeName: string;
      address: string;
      city: string;
      state: string;
      zip: string;
      status: string;
      managerName: string | null;
      managerEmail: string;
      radiusMiles: number;
      totalSpend: number;
      totalCampaigns: number;
      lastActivityAt: string | null;
      createdAt: string;
    }>,
    summary: {
      total: 0,
      active: 0,
      byState: {} as Record<string, number>,
    },
    message: `📍 No stores found for ${brandSlug}. Use setup_franchise_store to add your first location.`,
  };
}
