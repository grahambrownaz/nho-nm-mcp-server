/**
 * Tool 24: search_intent_data
 * Search for purchase intent signals
 */

import { z } from 'zod';
import type { TenantContext } from '../../utils/auth.js';
import { intentApi } from '../../services/intent-api.js';
import { IntentFiltersSchema, IntentGeographySchema } from '../../schemas/intent.js';

/**
 * Input schema for search_intent_data
 */
const inputSchema = z.object({
  categories: z.array(z.string()).min(1).describe('Intent categories to search'),
  geography: IntentGeographySchema.optional(),
  filters: IntentFiltersSchema.optional(),
  limit: z.number().min(1).max(1000).default(100),
  offset: z.number().min(0).default(0),
});

// Type is inferred from inputSchema when parsing

/**
 * Tool definition for MCP
 */
export const searchIntentDataTool = {
  name: 'search_intent_data',
  description: `Search for purchase intent signals by category, geography, and recency. Returns consumers who have shown intent to purchase in specific categories (auto, home, financial, etc.). Intent data requires an active subscription - use this tool to preview available signals before subscribing.

Intent signals include:
- Consumer contact info (email, phone, address when available)
- Intent score (1-100, higher = stronger intent)
- Signal type (search, click, form_submit, comparison, review, purchase_abandon)
- Signal timestamp and recency

Note: This tool shows available signals but does not charge. Subscribe via create_intent_subscription to receive ongoing signals.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      categories: {
        type: 'array',
        items: { type: 'string' },
        description: 'Intent categories to search (use list_intent_categories to see available)',
      },
      geography: {
        type: 'object',
        description: 'Geographic targeting',
        properties: {
          type: {
            type: 'string',
            enum: ['nationwide', 'state', 'zip', 'dma'],
          },
          values: {
            type: 'array',
            items: { type: 'string' },
            description: 'State codes, ZIP codes, or DMA codes',
          },
        },
      },
      filters: {
        type: 'object',
        description: 'Additional filters',
        properties: {
          minIntentScore: {
            type: 'number',
            description: 'Minimum intent score (1-100)',
          },
          maxAgeHours: {
            type: 'number',
            description: 'Maximum signal age in hours (1-720)',
          },
          signalTypes: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['search', 'click', 'form_submit', 'comparison', 'review', 'purchase_abandon'],
            },
          },
          requireEmail: { type: 'boolean' },
          requirePhone: { type: 'boolean' },
          requireAddress: { type: 'boolean' },
        },
      },
      limit: {
        type: 'number',
        description: 'Max signals to return (1-1000, default 100)',
      },
      offset: {
        type: 'number',
        description: 'Pagination offset',
      },
    },
    required: ['categories'],
  },
};

/**
 * Execute the search_intent_data tool
 */
export async function executeSearchIntentData(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    signals: Array<{
      id: string;
      category: string;
      intentScore: number;
      signalType: string;
      signalTimestamp: string;
      email?: string;
      phone?: string;
      firstName?: string;
      lastName?: string;
      city?: string;
      state?: string;
      zip?: string;
    }>;
    total: number;
    returned: number;
    offset: number;
    hasMore: boolean;
    summary: {
      avgIntentScore: number;
      byCategory: Record<string, number>;
      bySignalType: Record<string, number>;
      withEmail: number;
      withPhone: number;
      withAddress: number;
    };
    subscription_required: boolean;
  };
  error?: string;
}> {
  // Validate input
  const validatedInput = inputSchema.parse(input);
  const { categories, geography, filters, limit, offset } = validatedInput;

  // Check that tenant has INTENT database access (or trial)
  const hasIntentAccess = context.subscription?.allowedDatabases.includes('INTENT') ||
    context.tenant.status === 'ACTIVE';

  if (!hasIntentAccess) {
    return {
      success: false,
      error: 'Intent data requires an active subscription. Contact sales to enable.',
    };
  }

  try {
    // Search for signals
    const result = await intentApi.searchSignals({
      categories,
      geography,
      filters,
      limit,
      offset,
    });

    // Calculate summary statistics
    const summary = {
      avgIntentScore: 0,
      byCategory: {} as Record<string, number>,
      bySignalType: {} as Record<string, number>,
      withEmail: 0,
      withPhone: 0,
      withAddress: 0,
    };

    let totalScore = 0;

    for (const signal of result.signals) {
      totalScore += signal.intentScore;

      // Count by category
      summary.byCategory[signal.category] = (summary.byCategory[signal.category] || 0) + 1;

      // Count by signal type
      summary.bySignalType[signal.signalType] = (summary.bySignalType[signal.signalType] || 0) + 1;

      // Count contact availability
      if (signal.email) summary.withEmail++;
      if (signal.phone) summary.withPhone++;
      if (signal.address) summary.withAddress++;
    }

    summary.avgIntentScore = result.signals.length > 0
      ? Math.round(totalScore / result.signals.length)
      : 0;

    return {
      success: true,
      data: {
        signals: result.signals.map((s) => ({
          id: s.id,
          category: s.category,
          intentScore: s.intentScore,
          signalType: s.signalType,
          signalTimestamp: s.signalTimestamp,
          email: s.email,
          phone: s.phone,
          firstName: s.firstName,
          lastName: s.lastName,
          city: s.city,
          state: s.state,
          zip: s.zip,
        })),
        total: result.total,
        returned: result.signals.length,
        offset,
        hasMore: result.hasMore,
        summary,
        subscription_required: true, // Intent data always requires subscription
      },
    };
  } catch (error) {
    console.error('[search_intent_data] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to search intent data',
    };
  }
}
