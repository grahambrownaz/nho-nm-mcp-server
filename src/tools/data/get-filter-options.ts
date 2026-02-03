/**
 * Tool 20: get_filter_options
 * Returns available filters for a database with valid values, descriptions, and pricing impact
 */

import { z } from 'zod';
import type { TenantContext } from '../../utils/auth.js';
import {
  DatabaseTypeSchema,
  getFilterMetadata,
  getCommonSelections,
  SIC_GROUPS,
  CONSUMER_INTERESTS,
  BUSINESS_TITLES,
  type FilterCategory,
  type CommonSelection,
} from '../../schemas/filters.js';
import { getDatabasePricing } from '../../services/list-pricing.js';

/**
 * Input schema for get_filter_options
 */
const inputSchema = z.object({
  database: DatabaseTypeSchema,
  category: z.string().optional(),
});

// Type is inferred from inputSchema when parsing

/**
 * Tool definition for MCP
 */
export const getFilterOptionsTool = {
  name: 'get_filter_options',
  description: `Returns available filters for a specific database (consumer, business, nho, new_mover) with valid values, descriptions, and pricing impact. Use this to build dynamic filter interfaces or understand what filtering options are available for each database type.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      database: {
        type: 'string',
        enum: ['consumer', 'business', 'nho', 'new_mover'],
        description: 'Database type to get filters for',
      },
      category: {
        type: 'string',
        description: 'Optional: filter to specific category (e.g., "Demographics", "Housing")',
      },
    },
    required: ['database'],
  },
};

/**
 * Execute the get_filter_options tool
 */
export async function executeGetFilterOptions(
  input: unknown,
  _context: TenantContext
): Promise<{
  database: string;
  categories: FilterCategory[];
  common_selections: CommonSelection[];
  pricing: ReturnType<typeof getDatabasePricing>;
  reference_data: Record<string, unknown>;
}> {
  // Validate input
  const validatedInput = inputSchema.parse(input);
  const { database, category } = validatedInput;

  // Get filter metadata
  let categories = getFilterMetadata(database);

  // Filter to specific category if requested
  if (category) {
    categories = categories.filter(
      (c) => c.name.toLowerCase() === category.toLowerCase()
    );
  }

  // Get common selections for this database
  const commonSelections = getCommonSelections(database);

  // Get pricing info
  const pricing = getDatabasePricing(database);

  // Build reference data based on database type
  const referenceData: Record<string, unknown> = {};

  if (database === 'consumer') {
    referenceData.interests = CONSUMER_INTERESTS;
    referenceData.pet_types = ['dog', 'cat', 'bird', 'fish', 'other'];
    referenceData.children_age_ranges = ['0-2', '3-5', '6-10', '11-15', '16-18'];
  } else if (database === 'business') {
    referenceData.sic_groups = SIC_GROUPS;
    referenceData.business_titles = BUSINESS_TITLES;
    referenceData.employee_ranges = ['1-4', '5-9', '10-19', '20-49', '50-99', '100-249', '250-499', '500+'];
    referenceData.revenue_ranges = [
      'under_500k',
      '500k-1m',
      '1m-2.5m',
      '2.5m-5m',
      '5m-10m',
      '10m-25m',
      '25m-50m',
      '50m-100m',
      '100m+',
    ];
    referenceData.contact_levels = ['owner', 'c_level', 'vp', 'director', 'manager', 'any'];
  } else if (database === 'nho' || database === 'new_mover') {
    referenceData.dwelling_types =
      database === 'nho'
        ? ['single_family', 'condo', 'townhouse', 'multi_family', 'any']
        : ['single_family', 'condo', 'apartment', 'townhouse', 'any'];
    referenceData.move_types = database === 'new_mover' ? ['local', 'intrastate', 'interstate', 'any'] : undefined;
  }

  // Add state list for all databases
  referenceData.states = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
    'DC',
  ];

  return {
    database,
    categories,
    common_selections: commonSelections,
    pricing,
    reference_data: referenceData,
  };
}
