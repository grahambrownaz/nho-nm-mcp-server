/**
 * Zod validation schemas for the NHO/NM MCP Server
 * Defines all input validation for tools and API requests
 */

import { z } from 'zod';

// ============================================================================
// ENUMS & BASE TYPES
// ============================================================================

/**
 * Supported database types
 */
export const DatabaseTypeSchema = z.enum(['nho', 'new_mover', 'consumer', 'business']);
export type DatabaseType = z.infer<typeof DatabaseTypeSchema>;

/**
 * Geography types for data filtering
 */
export const GeographyTypeSchema = z.enum(['zip', 'city', 'county', 'state', 'radius', 'nationwide']);
export type GeographyType = z.infer<typeof GeographyTypeSchema>;

/**
 * Geography filter object
 */
export const GeographySchema = z.object({
  type: GeographyTypeSchema,
  values: z.array(z.string()).min(1).optional(), // Required for zip, city, county, state
  center: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).optional(), // Required for radius
  radiusMiles: z.number().min(1).max(100).optional(), // Required for radius
}).refine(
  (data) => {
    if (data.type === 'radius') {
      return data.center !== undefined && data.radiusMiles !== undefined;
    }
    if (data.type === 'nationwide') {
      return true; // No additional fields required
    }
    return data.values !== undefined && data.values.length > 0;
  },
  {
    message: 'Invalid geography configuration for the specified type',
  }
);
export type Geography = z.infer<typeof GeographySchema>;

// ============================================================================
// DEMOGRAPHIC FILTERS
// ============================================================================

/**
 * Income range filter
 */
export const IncomeRangeSchema = z.object({
  min: z.number().min(0).optional(),
  max: z.number().min(0).optional(),
}).refine(
  (data) => {
    if (data.min !== undefined && data.max !== undefined) {
      return data.min <= data.max;
    }
    return true;
  },
  { message: 'min must be less than or equal to max' }
);

/**
 * Age range filter
 */
export const AgeRangeSchema = z.object({
  min: z.number().min(18).max(120).optional(),
  max: z.number().min(18).max(120).optional(),
}).refine(
  (data) => {
    if (data.min !== undefined && data.max !== undefined) {
      return data.min <= data.max;
    }
    return true;
  },
  { message: 'min must be less than or equal to max' }
);

/**
 * Home value range filter
 */
export const HomeValueRangeSchema = z.object({
  min: z.number().min(0).optional(),
  max: z.number().min(0).optional(),
}).refine(
  (data) => {
    if (data.min !== undefined && data.max !== undefined) {
      return data.min <= data.max;
    }
    return true;
  },
  { message: 'min must be less than or equal to max' }
);

/**
 * Date range filter (for move date, purchase date, etc.)
 */
export const DateRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
}).refine(
  (data) => {
    if (data.from && data.to) {
      return new Date(data.from) <= new Date(data.to);
    }
    return true;
  },
  { message: 'from date must be before or equal to to date' }
);

/**
 * Dwelling type enum
 */
export const DwellingTypeSchema = z.enum([
  'single_family',
  'condo',
  'townhouse',
  'multi_family',
  'apartment',
  'mobile_home',
]);

/**
 * Complete demographic filters
 */
export const DemographicFiltersSchema = z.object({
  income: IncomeRangeSchema.optional(),
  age: AgeRangeSchema.optional(),
  homeValue: HomeValueRangeSchema.optional(),
  moveDate: DateRangeSchema.optional(),
  purchaseDate: DateRangeSchema.optional(),
  dwellingType: z.array(DwellingTypeSchema).optional(),
  hasChildren: z.boolean().optional(),
  ownerOccupied: z.boolean().optional(),
  lengthOfResidence: z.object({
    minMonths: z.number().min(0).optional(),
    maxMonths: z.number().min(0).optional(),
  }).optional(),
}).optional();
export type DemographicFilters = z.infer<typeof DemographicFiltersSchema>;

// ============================================================================
// TOOL INPUT SCHEMAS
// ============================================================================

/**
 * search_data tool input
 */
export const SearchDataInputSchema = z.object({
  database: DatabaseTypeSchema,
  geography: GeographySchema,
  filters: DemographicFiltersSchema,
  limit: z.number().min(1).max(10000).default(100),
  offset: z.number().min(0).default(0),
  include_email: z.boolean().default(false),
  include_phone: z.boolean().default(false),
});
export type SearchDataInput = z.infer<typeof SearchDataInputSchema>;

/**
 * preview_count tool input
 */
export const PreviewCountInputSchema = z.object({
  database: DatabaseTypeSchema,
  geography: GeographySchema,
  filters: DemographicFiltersSchema,
});
export type PreviewCountInput = z.infer<typeof PreviewCountInputSchema>;

/**
 * get_sample_data tool input
 */
export const GetSampleDataInputSchema = z.object({
  database: DatabaseTypeSchema,
  geography: GeographySchema,
  count: z.number().min(1).max(10).default(5),
});
export type GetSampleDataInput = z.infer<typeof GetSampleDataInputSchema>;

/**
 * get_pricing tool input
 */
export const GetPricingInputSchema = z.object({
  database: DatabaseTypeSchema.optional(),
  volume: z.number().min(1).optional(), // Optional: get pricing for specific volume
}).optional();
export type GetPricingInput = z.infer<typeof GetPricingInputSchema>;

// ============================================================================
// OUTPUT SCHEMAS
// ============================================================================

/**
 * Individual record schema (NHO/New Mover)
 */
export const DataRecordSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  address: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
    zip4: z.string().optional(),
  }),
  // Optional fields based on include_email/include_phone
  email: z.string().email().optional(),
  phone: z.string().optional(),
  // Demographic data
  demographics: z.object({
    estimatedIncome: z.string().optional(),
    estimatedAge: z.string().optional(),
    homeValue: z.string().optional(),
    dwellingType: z.string().optional(),
    ownerOccupied: z.boolean().optional(),
    lengthOfResidence: z.string().optional(),
    hasChildren: z.boolean().optional(),
  }).optional(),
  // Move/purchase specific
  moveDate: z.string().optional(),
  purchaseDate: z.string().optional(),
  purchasePrice: z.number().optional(),
  // Metadata
  recordType: z.enum(['nho', 'new_mover', 'consumer', 'business']),
  dataDate: z.string(), // When this record was sourced
});
export type DataRecord = z.infer<typeof DataRecordSchema>;

/**
 * Preview count response
 */
export const PreviewCountResponseSchema = z.object({
  total_available: z.number(),
  estimated_weekly: z.number(),
  estimated_monthly: z.number(),
  geography_summary: z.string(),
  filters_applied: z.boolean(),
});
export type PreviewCountResponse = z.infer<typeof PreviewCountResponseSchema>;

/**
 * Pricing tier
 */
export const PricingTierSchema = z.object({
  tier: z.string(),
  minRecords: z.number(),
  maxRecords: z.number().nullable(),
  pricePerRecord: z.number(),
  priceEmailAppend: z.number(),
  pricePhoneAppend: z.number(),
  pricePdfGeneration: z.number(),
  pricePrintPerPiece: z.number(),
});
export type PricingTier = z.infer<typeof PricingTierSchema>;

/**
 * Full pricing response
 */
export const PricingResponseSchema = z.object({
  databases: z.record(z.object({
    name: z.string(),
    description: z.string(),
    available: z.boolean(),
  })),
  tiers: z.array(PricingTierSchema),
  addOns: z.object({
    emailAppend: z.object({
      description: z.string(),
      pricePerRecord: z.number(),
    }),
    phoneAppend: z.object({
      description: z.string(),
      pricePerRecord: z.number(),
    }),
    pdfGeneration: z.object({
      description: z.string(),
      pricePerDocument: z.number(),
    }),
    printFulfillment: z.object({
      description: z.string(),
      pricePerPiece: z.number(),
      minimumOrder: z.number(),
    }),
  }),
  effectiveDate: z.string(),
});
export type PricingResponse = z.infer<typeof PricingResponseSchema>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validates input against a schema and throws ValidationError on failure
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const { ValidationError } = require('./errors.js');
    const errors = result.error.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    throw new ValidationError('Invalid input parameters', { errors });
  }
  return result.data;
}
