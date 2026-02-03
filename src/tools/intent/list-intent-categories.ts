/**
 * Tool 26: list_intent_categories
 * List available intent data categories
 */

import { z } from 'zod';
import type { TenantContext } from '../../utils/auth.js';
import { intentApi, getParentCategories } from '../../services/intent-api.js';
import { INTENT_PRICING } from '../../schemas/intent.js';

/**
 * Input schema for list_intent_categories
 */
const inputSchema = z.object({
  parent: z.string().optional().describe('Filter by parent category'),
  includeStats: z.boolean().default(true).describe('Include signal volume and pricing'),
});

// Type is inferred from inputSchema when parsing

/**
 * Tool definition for MCP
 */
export const listIntentCategoriesTool = {
  name: 'list_intent_categories',
  description: `List available intent data categories with their descriptions, estimated signal volumes, and pricing. Intent categories cover purchase intent across automotive, home, financial, education, telecom, healthcare, travel, and B2B sectors.

Use this to explore what intent signals are available before creating a subscription.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      parent: {
        type: 'string',
        description: 'Filter by parent category (auto, home, financial, education, telecom, healthcare, travel, b2b)',
      },
      includeStats: {
        type: 'boolean',
        description: 'Include estimated volumes and pricing (default: true)',
      },
    },
  },
};

/**
 * Execute the list_intent_categories tool
 */
export async function executeListIntentCategories(
  input: unknown,
  _context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    parentCategories: Array<{
      code: string;
      name: string;
      description: string;
      subcategoryCount: number;
    }>;
    categories: Array<{
      code: string;
      name: string;
      parent: string;
      parentName: string;
      avgMonthlySignals?: number;
      pricePerSignal?: number;
      pricePremium?: number;
    }>;
    pricing: {
      tiers: Array<{
        name: string;
        monthlyBase: number;
        includedSignals: number;
        perSignalRate: number;
      }>;
      note: string;
    };
    total_categories: number;
  };
  error?: string;
}> {
  // Validate input
  const validatedInput = inputSchema.parse(input);
  const { parent, includeStats } = validatedInput;

  try {
    // Get parent categories with structure
    const parentCategories = getParentCategories();

    // Filter if requested
    const filteredParents = parent
      ? parentCategories.filter((p) => p.code === parent)
      : parentCategories;

    // Get detailed category info from API
    const apiCategories = includeStats ? await intentApi.getCategories() : [];

    // Build category list
    const categories: Array<{
      code: string;
      name: string;
      parent: string;
      parentName: string;
      avgMonthlySignals?: number;
      pricePerSignal?: number;
      pricePremium?: number;
    }> = [];

    for (const parentCat of filteredParents) {
      for (const subCat of parentCat.subcategories) {
        const apiCat = apiCategories.find((c) => c.code === subCat.code);

        const category: {
          code: string;
          name: string;
          parent: string;
          parentName: string;
          avgMonthlySignals?: number;
          pricePerSignal?: number;
          pricePremium?: number;
        } = {
          code: subCat.code,
          name: subCat.name,
          parent: parentCat.code,
          parentName: parentCat.name,
        };

        if (includeStats) {
          category.avgMonthlySignals = apiCat?.avgMonthlySignals || 1000;
          category.pricePerSignal = apiCat?.pricePerSignal || 0.50;

          // Get premium multiplier
          const premium = (INTENT_PRICING.categoryPremiums as Record<string, number>)[subCat.code]
            || INTENT_PRICING.categoryPremiums.default;
          category.pricePremium = premium;
        }

        categories.push(category);
      }
    }

    // Build pricing info
    const pricingTiers = Object.entries(INTENT_PRICING.tiers).map(([name, tier]) => ({
      name,
      monthlyBase: tier.monthlyBase,
      includedSignals: tier.includedSignals,
      perSignalRate: tier.perSignal,
    }));

    return {
      success: true,
      data: {
        parentCategories: filteredParents.map((p) => ({
          code: p.code,
          name: p.name,
          description: p.description,
          subcategoryCount: p.subcategories.length,
        })),
        categories,
        pricing: {
          tiers: pricingTiers,
          note: 'Intent data is subscription-only. Per-signal rates apply after included signals are exhausted. Some categories have price premiums.',
        },
        total_categories: categories.length,
      },
    };
  } catch (error) {
    console.error('[list_intent_categories] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list categories',
    };
  }
}
