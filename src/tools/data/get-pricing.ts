/**
 * Tool: get_pricing
 * Get pricing information for all products and services
 * Returns the complete rate card with volume tiers
 */

import {
  GetPricingInputSchema,
  validateInput,
  type PricingResponse,
  type PricingTier,
} from '../../utils/validation.js';
import { requirePermission, type TenantContext } from '../../utils/auth.js';

/**
 * Tool definition for MCP server registration
 */
export const getPricingTool = {
  name: 'get_pricing',
  description: `Get pricing information for data records and services.

Returns the complete rate card including:
- Available databases and their descriptions
- Volume-based pricing tiers
- Add-on services (email append, phone append, PDF generation, print fulfillment)

Pricing may vary based on your subscription level.`,

  inputSchema: {
    type: 'object',
    properties: {
      database: {
        type: 'string',
        enum: ['nho', 'new_mover', 'consumer', 'business'],
        description: 'Optional: Get pricing for a specific database',
      },
      volume: {
        type: 'number',
        description: 'Optional: Get pricing for a specific volume to see which tier applies',
      },
    },
  },
};

/**
 * Default pricing tiers (would come from database in production)
 */
const DEFAULT_PRICING_TIERS: PricingTier[] = [
  {
    tier: 'Starter',
    minRecords: 1,
    maxRecords: 500,
    pricePerRecord: 0.08,
    priceEmailAppend: 0.03,
    pricePhoneAppend: 0.04,
    pricePdfGeneration: 0.15,
    pricePrintPerPiece: 0.85,
  },
  {
    tier: 'Growth',
    minRecords: 501,
    maxRecords: 2500,
    pricePerRecord: 0.06,
    priceEmailAppend: 0.025,
    pricePhoneAppend: 0.035,
    pricePdfGeneration: 0.12,
    pricePrintPerPiece: 0.75,
  },
  {
    tier: 'Professional',
    minRecords: 2501,
    maxRecords: 10000,
    pricePerRecord: 0.05,
    priceEmailAppend: 0.02,
    pricePhoneAppend: 0.03,
    pricePdfGeneration: 0.10,
    pricePrintPerPiece: 0.65,
  },
  {
    tier: 'Enterprise',
    minRecords: 10001,
    maxRecords: null, // Unlimited
    pricePerRecord: 0.04,
    priceEmailAppend: 0.015,
    pricePhoneAppend: 0.025,
    pricePdfGeneration: 0.08,
    pricePrintPerPiece: 0.55,
  },
];

/**
 * Database descriptions
 */
const DATABASE_INFO = {
  nho: {
    name: 'New Homeowner',
    description:
      'Recently purchased homes. Includes purchase date, price, and homeowner demographics. ' +
      'Ideal for home services, insurance, and retail marketing.',
    available: true,
  },
  new_mover: {
    name: 'New Mover',
    description:
      'Recent address changes (both homeowners and renters). ' +
      'Includes move date and demographics. Great for local services and retail.',
    available: true,
  },
  consumer: {
    name: 'Consumer',
    description:
      'General consumer database with demographics, lifestyle, and purchasing behavior. ' +
      'Best for broad consumer marketing campaigns.',
    available: true,
  },
  business: {
    name: 'Business',
    description:
      'Business database with company information, employee count, revenue, and SIC codes. ' +
      'Ideal for B2B marketing and sales.',
    available: true,
  },
};

/**
 * Execute the get_pricing tool
 */
export async function executeGetPricing(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: PricingResponse & {
    your_tier?: string;
    volume_discount_available?: boolean;
    custom_pricing_note?: string;
  };
  error?: string;
}> {
  // Validate input (optional params)
  const params = validateInput(GetPricingInputSchema, input) || {};

  // Check permissions (basic read access)
  requirePermission(context, 'data:read');

  // Get tiers - in production, might fetch from database
  let tiers = [...DEFAULT_PRICING_TIERS];

  // If subscription has custom pricing, adjust
  if (context.subscription) {
    const customPricePerRecord = context.subscription.pricePerRecord;
    if (customPricePerRecord) {
      // Apply custom pricing to all tiers proportionally
      const customRate = Number(customPricePerRecord);
      const baseRate = 0.05; // Professional tier rate
      const ratio = customRate / baseRate;

      tiers = tiers.map((tier) => ({
        ...tier,
        pricePerRecord: Math.round(tier.pricePerRecord * ratio * 1000) / 1000,
      }));
    }
  }

  // Filter to specific database if requested
  let databases = DATABASE_INFO;
  if (params?.database) {
    databases = {
      [params.database]: DATABASE_INFO[params.database],
    } as typeof DATABASE_INFO;
  }

  // Find applicable tier if volume specified
  let yourTier: string | undefined;
  if (params?.volume) {
    const applicableTier = tiers.find(
      (tier) =>
        params.volume! >= tier.minRecords &&
        (tier.maxRecords === null || params.volume! <= tier.maxRecords)
    );
    yourTier = applicableTier?.tier;
  }

  // Check if volume discount available
  const currentTierIndex = yourTier
    ? tiers.findIndex((t) => t.tier === yourTier)
    : 0;
  const volumeDiscountAvailable = currentTierIndex < tiers.length - 1;

  const response: PricingResponse = {
    databases,
    tiers,
    addOns: {
      emailAppend: {
        description:
          'Append email addresses to records. Match rates typically 30-50% depending on geography.',
        pricePerRecord: tiers[2].priceEmailAppend, // Professional tier default
      },
      phoneAppend: {
        description:
          'Append phone numbers to records. Match rates typically 40-60% depending on geography.',
        pricePerRecord: tiers[2].pricePhoneAppend,
      },
      pdfGeneration: {
        description:
          'Generate personalized PDF documents (letters, postcards) for each record.',
        pricePerDocument: tiers[2].pricePdfGeneration,
      },
      printFulfillment: {
        description:
          'Print and mail physical postcards or letters. Includes postage. Minimum order 200 pieces.',
        pricePerPiece: tiers[2].pricePrintPerPiece,
        minimumOrder: 200,
      },
    },
    effectiveDate: new Date().toISOString().split('T')[0],
  };

  return {
    success: true,
    data: {
      ...response,
      your_tier: yourTier,
      volume_discount_available: volumeDiscountAvailable,
      custom_pricing_note:
        context.subscription?.plan === 'ENTERPRISE'
          ? 'You have custom enterprise pricing. Contact your account manager for volume discounts.'
          : undefined,
    },
  };
}
