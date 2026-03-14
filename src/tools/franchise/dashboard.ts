/**
 * Tool: franchise_dashboard
 * Franchisor HQ dashboard — view all store activity, spend, campaigns, and performance.
 */

import { type TenantContext } from '../../utils/auth.js';

/**
 * Tool definition for MCP server registration
 */
export const franchiseDashboardTool = {
  name: 'franchise_dashboard',
  description: `View your franchise dashboard — a complete overview of all store activity, spend, and campaign performance.

Shows:
- Store count and status breakdown (active, suspended, pending)
- Total spend across all stores (all time + last 30 days)
- Campaign counts by type (postcards, emails, data purchases)
- Top-performing stores by spend and activity
- Creative usage statistics
- Active subscriptions summary

This is the franchisor HQ view. For individual store details, the store manager can use their own AI connection.

Optional filters:
- Filter by state to see regional performance
- Filter by date range for specific periods
- Filter by store status

Example: "Show me my franchise dashboard" or "How are my Arizona stores performing?"`,

  inputSchema: {
    type: 'object',
    properties: {
      brand_slug: {
        type: 'string',
        description: 'The franchise brand slug',
      },
      state_filter: {
        type: 'string',
        description: 'Filter stores by state (e.g., "AZ")',
      },
      date_from: {
        type: 'string',
        description: 'Start date for activity filter (ISO 8601)',
      },
      date_to: {
        type: 'string',
        description: 'End date for activity filter (ISO 8601)',
      },
      status_filter: {
        type: 'string',
        enum: ['ACTIVE', 'SUSPENDED', 'PENDING_SETUP', 'CLOSED'],
        description: 'Filter stores by status',
      },
    },
    required: ['brand_slug'],
  },
};

/**
 * Execute franchise dashboard
 */
export async function executeFranchiseDashboard(
  input: unknown,
  _context: TenantContext
): Promise<unknown> {
  const params = input as Record<string, unknown>;
  const brandSlug = params.brand_slug as string;
  const stateFilter = params.state_filter as string | undefined;
  const statusFilter = params.status_filter as string | undefined;

  // In production:
  // 1. Look up FranchiseBrand by slug, verify caller is owner
  // 2. Aggregate FranchiseStore data with filters
  // 3. Sum UsageRecords across all child tenants
  // 4. Count campaigns (email + postcard + data purchases)
  // 5. Get creative usage stats

  // Return structured dashboard data
  // (placeholder — will be populated from real DB queries)
  return {
    success: true,
    brand: {
      name: brandSlug, // Would be real brand name from DB
      slug: brandSlug,
      status: 'ACTIVE',
    },
    filters: {
      state: stateFilter || 'all',
      status: statusFilter || 'all',
      dateFrom: params.date_from || null,
      dateTo: params.date_to || null,
    },
    stores: {
      total: 0,
      active: 0,
      suspended: 0,
      pendingSetup: 0,
      closed: 0,
      byState: {} as Record<string, number>,
    },
    financial: {
      totalSpendAllTime: 0,
      totalSpendLast30Days: 0,
      totalSpendThisMonth: 0,
      avgSpendPerStore: 0,
      currency: 'USD',
    },
    campaigns: {
      total: 0,
      postcardCampaigns: 0,
      emailCampaigns: 0,
      dataPurchases: 0,
      activeSubscriptions: 0,
    },
    creative: {
      totalAssets: 0,
      byType: {} as Record<string, number>,
      mostUsed: [] as Array<{ name: string; type: string; usageCount: number }>,
      required: 0,
    },
    topStores: [] as Array<{
      storeName: string;
      storeNumber: string | null;
      city: string;
      state: string;
      totalSpend: number;
      totalCampaigns: number;
      lastActivityAt: string | null;
    }>,
    recentActivity: [] as Array<{
      storeName: string;
      action: string;
      details: string;
      timestamp: string;
    }>,
    suggestions: [
      'Upload seasonal creative for upcoming campaigns',
      'Review stores with no activity in the last 30 days',
      'Consider setting up recurring new mover subscriptions for all stores',
    ],
    message: `📊 ${brandSlug} franchise dashboard loaded. ${stateFilter ? `Filtered to ${stateFilter} stores.` : 'Showing all stores.'} Use setup_franchise_store to add more locations.`,
  };
}
