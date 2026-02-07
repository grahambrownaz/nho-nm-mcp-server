/**
 * Tool: get_sample_data
 * Get sample records to preview data quality and format
 * No charge - useful for evaluating data before committing
 */

import { leadsPleaseApi } from '../../services/leadsplease-api.js';
import {
  GetSampleDataInputSchema,
  validateInput,
  type DataRecord,
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
export const getSampleDataTool = {
  name: 'get_sample_data',
  description: `Get sample records to preview data quality and format.

This tool is FREE and does NOT count against your quota.
Use it to evaluate the data structure and quality before purchasing records.

Important notes:
- Returns 1-10 sample records (default 5)
- Email and phone are NOT included in samples
- Samples are representative but not deliverable addresses
- Use search_data for actual deliverable records

IMPORTANT - geography parameter format:
The geography object MUST include a "type" field and a "values" array.
Examples:
- By ZIP: {"type": "zip", "values": ["85255"]}
- By city: {"type": "city", "values": ["Phoenix"]}
- By state: {"type": "state", "values": ["AZ"]}
- Nationwide: {"type": "nationwide"}`,

  inputSchema: {
    type: 'object',
    properties: {
      database: {
        type: 'string',
        enum: ['nho', 'new_mover', 'consumer', 'business'],
        description: 'The database to sample from',
      },
      geography: {
        type: 'object',
        description: 'Geographic area to sample from',
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
      count: {
        type: 'number',
        description: 'Number of sample records to return (1-10, default 5)',
        default: 5,
      },
    },
    required: ['database', 'geography'],
  },
};

/**
 * Execute the get_sample_data tool
 */
export async function executeGetSampleData(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    samples: DataRecord[];
    count: number;
    database: string;
    geography_summary: string;
    disclaimer: string;
  };
  error?: string;
}> {
  // Validate input
  const params = validateInput(GetSampleDataInputSchema, input);

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

  // Execute the sample request
  const sampleCount = params.count ?? 5;
  const samples = await leadsPleaseApi.getSamples({
    database: params.database,
    geography: params.geography,
    count: sampleCount,
  });

  // Format geography summary
  const geographySummary = formatGeographySummary(params.geography);

  return {
    success: true,
    data: {
      samples,
      count: samples.length,
      database: params.database,
      geography_summary: geographySummary,
      disclaimer:
        'These are sample records for preview purposes only. ' +
        'Email and phone are not included. ' +
        'Use search_data to retrieve actual deliverable records.',
    },
  };
}

/**
 * Format geography for display
 */
function formatGeographySummary(geography: {
  type: string;
  values?: string[];
  center?: { lat: number; lng: number };
  radiusMiles?: number;
}): string {
  switch (geography.type) {
    case 'nationwide':
      return 'Nationwide';
    case 'state':
      return `States: ${geography.values?.join(', ') || 'None specified'}`;
    case 'county':
      return `Counties: ${geography.values?.join(', ') || 'None specified'}`;
    case 'city':
      return `Cities: ${geography.values?.join(', ') || 'None specified'}`;
    case 'zip':
      const zips = geography.values || [];
      if (zips.length <= 5) {
        return `ZIP Codes: ${zips.join(', ')}`;
      }
      return `${zips.length} ZIP Codes`;
    case 'radius':
      return `${geography.radiusMiles} mile radius from (${geography.center?.lat}, ${geography.center?.lng})`;
    default:
      return 'Custom geography';
  }
}
