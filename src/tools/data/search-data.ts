/**
 * Tool: search_data
 * Searches for NHO/NM records based on geography and demographic filters
 * Returns actual data records (charged per record)
 */

import { leadsPleaseApi } from '../../services/leadsplease-api.js';
import {
  SearchDataInputSchema,
  validateInput,
  type DataRecord,
} from '../../utils/validation.js';
import {
  requirePermission,
  requireDatabaseAccess,
  isGeographyAllowed,
  type TenantContext,
} from '../../utils/auth.js';
import { AuthorizationError, QuotaExceededError } from '../../utils/errors.js';

/**
 * Tool definition for MCP server registration
 */
export const searchDataTool = {
  name: 'search_data',
  description: `Search for New Homeowner (NHO) or New Mover records based on geography and demographic filters.

This tool returns actual data records and incurs charges based on the number of records returned.

Supported databases:
- nho: New Homeowner records (recent home purchases)
- new_mover: New Mover records (recent address changes)
- consumer: General consumer database
- business: Business database

Use preview_count first to estimate record counts before pulling data.

IMPORTANT - geography parameter format:
The geography object MUST include a "type" field and a "values" array.
Examples:
- By ZIP: {"type": "zip", "values": ["85001", "85002"]}
- By city: {"type": "city", "values": ["Phoenix", "Tucson"]}
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
        description: 'The database to search',
      },
      geography: {
        type: 'object',
        description: 'Geographic filter for the search',
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
      limit: {
        type: 'number',
        description: 'Maximum number of records to return (1-10000, default 100)',
        default: 100,
      },
      offset: {
        type: 'number',
        description: 'Number of records to skip (for pagination)',
        default: 0,
      },
      include_email: {
        type: 'boolean',
        description: 'Include email addresses (additional charge)',
        default: false,
      },
      include_phone: {
        type: 'boolean',
        description: 'Include phone numbers (additional charge)',
        default: false,
      },
    },
    required: ['database', 'geography'],
  },
};

/**
 * Execute the search_data tool
 */
export async function executeSearchData(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    records: DataRecord[];
    total: number;
    returned: number;
    offset: number;
    hasMore: boolean;
  };
  usage?: {
    recordsReturned: number;
    emailAppends: number;
    phoneAppends: number;
    estimatedCost: number;
  };
  error?: string;
}> {
  // Validate input
  const params = validateInput(SearchDataInputSchema, input);

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

  // Extract params with defaults
  const limit = params.limit ?? 100;
  const offset = params.offset ?? 0;
  const includeEmail = params.include_email ?? false;
  const includePhone = params.include_phone ?? false;

  // Check quota (simplified - in production would check against usage records)
  if (context.subscription) {
    const monthlyLimit = context.subscription.monthlyRecordLimit;
    // In production, would query actual usage for this billing period
    const currentUsage = 0; // Placeholder

    if (currentUsage + limit > monthlyLimit) {
      throw new QuotaExceededError(
        'Monthly record limit',
        currentUsage,
        monthlyLimit
      );
    }
  }

  // Execute the search
  const result = await leadsPleaseApi.searchRecords({
    database: params.database,
    geography: params.geography,
    filters: params.filters,
    limit,
    offset,
    includeEmail,
    includePhone,
  });

  // Calculate usage
  const recordCount = result.records.length;
  const emailAppends = includeEmail ? recordCount : 0;
  const phoneAppends = includePhone ? recordCount : 0;

  // Get pricing (would come from subscription or default)
  const pricePerRecord = Number(context.subscription?.pricePerRecord) || 0.05;
  const priceEmailAppend = Number(context.subscription?.priceEmailAppend) || 0.02;
  const pricePhoneAppend = Number(context.subscription?.pricePhoneAppend) || 0.03;

  const estimatedCost =
    recordCount * pricePerRecord +
    emailAppends * priceEmailAppend +
    phoneAppends * pricePhoneAppend;

  // In production, would record usage in database here

  return {
    success: true,
    data: {
      records: result.records,
      total: result.total,
      returned: recordCount,
      offset,
      hasMore: offset + recordCount < result.total,
    },
    usage: {
      recordsReturned: recordCount,
      emailAppends,
      phoneAppends,
      estimatedCost: Math.round(estimatedCost * 100) / 100,
    },
  };
}
