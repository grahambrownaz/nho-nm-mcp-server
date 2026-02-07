/**
 * Tool: preview_count
 * Get a count of available records without fetching actual data
 * No charge - useful for planning data pulls
 */

import { leadsPleaseApi } from '../../services/leadsplease-api.js';
import {
  PreviewCountInputSchema,
  validateInput,
  type PreviewCountResponse,
} from '../../utils/validation.js';
import {
  requirePermission,
  requireDatabaseAccess,
  isGeographyAllowed,
  type TenantContext,
} from '../../utils/auth.js';
import { AuthorizationError } from '../../utils/errors.js';

/**
 * Tool definition for MCP server registration
 */
export const previewCountTool = {
  name: 'preview_count',
  description: `Get a count of available records for a given geography and filter criteria.

This tool does NOT return actual data and does NOT incur any charges.
Use this to estimate record volumes before executing a search_data call.

Returns:
- total_available: Total records matching criteria
- estimated_weekly: Estimated new records added per week
- estimated_monthly: Estimated new records added per month
- geography_summary: Human-readable summary of the geography
- filters_applied: Whether any demographic filters were applied

IMPORTANT - geography parameter format:
The geography object MUST include a "type" field and a "values" array.
Examples:
- By ZIP: {"type": "zip", "values": ["85255", "85260"]}
- By city: {"type": "city", "values": ["Phoenix", "Scottsdale"]}
- By state: {"type": "state", "values": ["AZ", "CA"]}
- By county: {"type": "county", "values": ["Maricopa"]}
- Nationwide: {"type": "nationwide"}
- By radius: {"type": "radius", "center": {"lat": 33.5, "lng": -111.9}, "radiusMiles": 25}`,

  inputSchema: {
    type: 'object',
    properties: {
      database: {
        type: 'string',
        enum: ['nho', 'new_mover', 'consumer', 'business'],
        description: 'The database to query',
      },
      geography: {
        type: 'object',
        description: 'Geographic filter for the count',
        properties: {
          type: {
            type: 'string',
            enum: ['zip', 'city', 'county', 'state', 'radius', 'nationwide'],
          },
          values: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of values for zip, city, county, or state searches',
          },
          center: {
            type: 'object',
            properties: {
              lat: { type: 'number' },
              lng: { type: 'number' },
            },
            description: 'Center point for radius searches',
          },
          radiusMiles: {
            type: 'number',
            description: 'Radius in miles for radius searches (1-100)',
          },
        },
        required: ['type'],
      },
      filters: {
        type: 'object',
        description: 'Optional demographic filters',
        properties: {
          income: {
            type: 'object',
            properties: {
              min: { type: 'number' },
              max: { type: 'number' },
            },
          },
          age: {
            type: 'object',
            properties: {
              min: { type: 'number' },
              max: { type: 'number' },
            },
          },
          homeValue: {
            type: 'object',
            properties: {
              min: { type: 'number' },
              max: { type: 'number' },
            },
          },
          dwellingType: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['single_family', 'condo', 'townhouse', 'multi_family', 'apartment', 'mobile_home'],
            },
          },
          hasChildren: { type: 'boolean' },
          ownerOccupied: { type: 'boolean' },
        },
      },
    },
    required: ['database', 'geography'],
  },
};

/**
 * Execute the preview_count tool
 */
export async function executePreviewCount(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: PreviewCountResponse & {
    database: string;
    pricing_estimate?: {
      per_record: number;
      for_100_records: number;
      for_1000_records: number;
      email_append_per_record: number;
      phone_append_per_record: number;
    };
  };
  error?: string;
}> {
  // Validate input
  const params = validateInput(PreviewCountInputSchema, input);

  // Check permissions
  requirePermission(context, 'data:read');
  requireDatabaseAccess(context, params.database);

  // Check geography access
  if (!isGeographyAllowed(context, params.geography)) {
    throw new AuthorizationError(
      'Geography not allowed for your subscription',
      { geography: params.geography }
    );
  }

  // Execute the count
  const result = await leadsPleaseApi.getCount({
    database: params.database,
    geography: params.geography,
    filters: params.filters,
  });

  // Get pricing for estimate
  const pricePerRecord = Number(context.subscription?.pricePerRecord) || 0.05;
  const priceEmailAppend = Number(context.subscription?.priceEmailAppend) || 0.02;
  const pricePhoneAppend = Number(context.subscription?.pricePhoneAppend) || 0.03;

  return {
    success: true,
    data: {
      ...result,
      database: params.database,
      pricing_estimate: {
        per_record: pricePerRecord,
        for_100_records: Math.round(100 * pricePerRecord * 100) / 100,
        for_1000_records: Math.round(1000 * pricePerRecord * 100) / 100,
        email_append_per_record: priceEmailAppend,
        phone_append_per_record: pricePhoneAppend,
      },
    },
  };
}
