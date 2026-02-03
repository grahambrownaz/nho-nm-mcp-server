/**
 * Intent Data Schemas
 * Zod schemas for intent/purchase signal data
 */

import { z } from 'zod';

/**
 * Intent signal categories with subcategories
 */
export const INTENT_CATEGORIES = {
  auto: {
    name: 'Automotive',
    description: 'Auto purchase and service intent signals',
    subcategories: {
      auto_purchase: 'New/Used Vehicle Purchase',
      auto_lease: 'Vehicle Leasing',
      auto_refinance: 'Auto Loan Refinancing',
      auto_insurance: 'Auto Insurance Shopping',
      auto_service: 'Auto Repair/Service',
      auto_parts: 'Auto Parts/Accessories',
    },
  },
  home: {
    name: 'Home & Real Estate',
    description: 'Home buying, improvement, and services',
    subcategories: {
      home_purchase: 'Home Buying Intent',
      home_refinance: 'Mortgage Refinancing',
      home_improvement: 'Home Improvement Projects',
      home_insurance: 'Home Insurance Shopping',
      home_security: 'Home Security Systems',
      home_solar: 'Solar Panel Installation',
      home_hvac: 'HVAC Services',
      home_roofing: 'Roofing Services',
      home_landscaping: 'Landscaping Services',
    },
  },
  financial: {
    name: 'Financial Services',
    description: 'Banking, credit, and investment intent',
    subcategories: {
      credit_card: 'Credit Card Shopping',
      personal_loan: 'Personal Loan Intent',
      debt_consolidation: 'Debt Consolidation',
      investment: 'Investment/Brokerage',
      retirement: 'Retirement Planning',
      life_insurance: 'Life Insurance Shopping',
      health_insurance: 'Health Insurance Shopping',
    },
  },
  education: {
    name: 'Education',
    description: 'Educational and career advancement intent',
    subcategories: {
      college: 'College/University Search',
      online_degree: 'Online Degree Programs',
      professional_cert: 'Professional Certifications',
      coding_bootcamp: 'Coding/Tech Bootcamps',
      mba: 'MBA Programs',
    },
  },
  telecom: {
    name: 'Telecommunications',
    description: 'Phone, internet, and streaming services',
    subcategories: {
      mobile_phone: 'Mobile Phone/Plan Shopping',
      internet_service: 'Internet Service Shopping',
      cable_tv: 'Cable/Satellite TV',
      streaming: 'Streaming Services',
    },
  },
  healthcare: {
    name: 'Healthcare',
    description: 'Medical and wellness services',
    subcategories: {
      dental: 'Dental Services',
      vision: 'Vision/Eye Care',
      cosmetic: 'Cosmetic Procedures',
      weight_loss: 'Weight Loss Programs',
      mental_health: 'Mental Health Services',
      senior_care: 'Senior Care/Assisted Living',
    },
  },
  travel: {
    name: 'Travel',
    description: 'Travel and vacation planning',
    subcategories: {
      vacation: 'Vacation Planning',
      cruise: 'Cruise Bookings',
      hotels: 'Hotel/Lodging',
      flights: 'Flight Bookings',
      car_rental: 'Car Rentals',
    },
  },
  b2b: {
    name: 'Business Services',
    description: 'B2B purchase intent signals',
    subcategories: {
      software: 'Business Software',
      office_supplies: 'Office Supplies',
      professional_services: 'Professional Services',
      commercial_insurance: 'Commercial Insurance',
      commercial_real_estate: 'Commercial Real Estate',
    },
  },
} as const;

/**
 * Flatten categories into a list
 */
export function getIntentCategoryList(): Array<{
  code: string;
  name: string;
  parent: string;
  parentName: string;
}> {
  const categories: Array<{
    code: string;
    name: string;
    parent: string;
    parentName: string;
  }> = [];

  for (const [parentCode, parent] of Object.entries(INTENT_CATEGORIES)) {
    for (const [code, name] of Object.entries(parent.subcategories)) {
      categories.push({
        code,
        name,
        parent: parentCode,
        parentName: parent.name,
      });
    }
  }

  return categories;
}

/**
 * Intent signal schema
 */
export const IntentSignalSchema = z.object({
  id: z.string(),
  category: z.string(),
  subcategory: z.string().optional(),

  // Consumer identification
  email: z.string().email().optional(),
  phone: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),

  // Address (if available)
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),

  // Intent signal details
  intentScore: z.number().min(1).max(100), // Higher = stronger intent
  signalType: z.enum(['search', 'click', 'form_submit', 'comparison', 'review', 'purchase_abandon']),
  signalSource: z.string().optional(), // e.g., "google_ads", "facebook", "website"

  // Timing
  signalTimestamp: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),

  // Additional context
  metadata: z.record(z.unknown()).optional(),
});

export type IntentSignal = z.infer<typeof IntentSignalSchema>;

/**
 * Intent search filters schema
 */
export const IntentFiltersSchema = z.object({
  // Categories
  categories: z.array(z.string()).optional(),
  parentCategories: z.array(z.string()).optional(),

  // Intent strength
  minIntentScore: z.number().min(1).max(100).optional(),

  // Signal type
  signalTypes: z.array(z.enum(['search', 'click', 'form_submit', 'comparison', 'review', 'purchase_abandon'])).optional(),

  // Recency
  maxAgeHours: z.number().min(1).max(720).optional(), // Max 30 days
  minAgeHours: z.number().min(0).optional(),

  // Contact info requirements
  requireEmail: z.boolean().optional(),
  requirePhone: z.boolean().optional(),
  requireAddress: z.boolean().optional(),
});

export type IntentFilters = z.infer<typeof IntentFiltersSchema>;

/**
 * Geography schema for intent data
 */
export const IntentGeographySchema = z.object({
  type: z.enum(['nationwide', 'state', 'zip', 'dma']),
  values: z.array(z.string()).optional(),
});

export type IntentGeography = z.infer<typeof IntentGeographySchema>;

/**
 * Intent subscription configuration schema
 */
export const IntentSubscriptionConfigSchema = z.object({
  name: z.string().min(1).max(100),

  // Categories to subscribe to
  categories: z.array(z.string()).min(1),

  // Geographic targeting
  geography: IntentGeographySchema.optional(),

  // Filters
  filters: IntentFiltersSchema.optional(),

  // Delivery method
  deliveryMethod: z.enum(['webhook', 'batch_email', 'batch_sftp', 'api_poll']),

  // Webhook configuration (if webhook delivery)
  webhookId: z.string().uuid().optional(),

  // Batch settings (if batch delivery)
  batchFrequency: z.enum(['hourly', 'every_4_hours', 'daily', 'weekly']).optional(),

  // Volume cap
  monthlySignalCap: z.number().min(100).optional(),
});

export type IntentSubscriptionConfig = z.infer<typeof IntentSubscriptionConfigSchema>;

/**
 * Intent webhook configuration schema
 */
export const IntentWebhookConfigSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  secret: z.string().optional(),
  headers: z.record(z.string()).optional(),

  // Retry settings
  retryAttempts: z.number().min(0).max(10).default(3),
  retryDelayMs: z.number().min(100).max(60000).default(1000),

  // Filtering
  minIntentScore: z.number().min(1).max(100).optional(),
  categoryFilter: z.array(z.string()).optional(),
});

export type IntentWebhookConfig = z.infer<typeof IntentWebhookConfigSchema>;

/**
 * Intent pricing tiers (subscription only)
 */
export const INTENT_PRICING = {
  // Base monthly prices by category tier
  tiers: {
    standard: {
      monthlyBase: 299, // $299/month base
      perSignal: 0.50, // $0.50 per signal
      includedSignals: 500, // 500 signals included
    },
    professional: {
      monthlyBase: 799,
      perSignal: 0.35,
      includedSignals: 2000,
    },
    enterprise: {
      monthlyBase: 1999,
      perSignal: 0.25,
      includedSignals: 10000,
    },
  },

  // Category premiums (multiplier on per-signal cost)
  categoryPremiums: {
    auto_purchase: 1.5,
    home_purchase: 2.0,
    home_refinance: 1.8,
    credit_card: 1.3,
    personal_loan: 1.4,
    life_insurance: 1.5,
    health_insurance: 1.4,
    college: 1.2,
    mba: 1.6,
    b2b_software: 2.5,
    default: 1.0,
  },
} as const;

/**
 * Calculate intent subscription price
 */
export function calculateIntentPrice(params: {
  tier: 'standard' | 'professional' | 'enterprise';
  categories: string[];
  estimatedMonthlySignals: number;
}): {
  monthlyBase: number;
  estimatedOverage: number;
  estimatedTotal: number;
  includedSignals: number;
  perSignalRate: number;
  categoryPremium: number;
} {
  const tierConfig = INTENT_PRICING.tiers[params.tier];

  // Calculate category premium (average of all categories)
  let totalPremium = 0;
  for (const category of params.categories) {
    const premium = (INTENT_PRICING.categoryPremiums as Record<string, number>)[category]
      || INTENT_PRICING.categoryPremiums.default;
    totalPremium += premium;
  }
  const avgPremium = params.categories.length > 0 ? totalPremium / params.categories.length : 1.0;

  // Calculate per-signal rate with premium
  const perSignalRate = tierConfig.perSignal * avgPremium;

  // Calculate estimated overage
  const overageSignals = Math.max(0, params.estimatedMonthlySignals - tierConfig.includedSignals);
  const estimatedOverage = overageSignals * perSignalRate;

  return {
    monthlyBase: tierConfig.monthlyBase,
    estimatedOverage,
    estimatedTotal: tierConfig.monthlyBase + estimatedOverage,
    includedSignals: tierConfig.includedSignals,
    perSignalRate,
    categoryPremium: avgPremium,
  };
}
