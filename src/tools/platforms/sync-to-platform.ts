/**
 * Tool: sync_to_platform
 * Sync records to external platforms (Mailchimp, HubSpot, Zapier, etc.)
 */

import { z } from 'zod';
import { validateInput } from '../../utils/validation.js';
import { requirePermission, type TenantContext } from '../../utils/auth.js';
import { prisma } from '../../db/client.js';
import {
  syncToPlatform,
  isPlatformSupported,
  type PlatformType,
  type SyncRecord,
  type SyncOptions,
  type PlatformCredentials,
} from '../../services/platform-sync/index.js';

/**
 * Input schema for sync_to_platform
 */
const SyncToPlatformInputSchema = z.object({
  platform: z.enum(['mailchimp', 'hubspot', 'salesforce', 'zapier', 'google_sheets']),
  connection_id: z.string().min(1),
  records: z.array(z.object({
    email: z.string().email().optional(),
    phone: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    fullName: z.string().optional(),
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    country: z.string().optional(),
    company: z.string().optional(),
    moveDate: z.string().optional(),
    propertyType: z.string().optional(),
    homeValue: z.number().optional(),
    income: z.string().optional(),
    age: z.string().optional(),
    customFields: z.record(z.unknown()).optional(),
  })).min(1).max(10000),
  field_mapping: z.record(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  duplicate_handling: z.enum(['update', 'skip', 'create_new']).optional(),
  list_id: z.string().optional(),
  audience_id: z.string().optional(),
});

export type SyncToPlatformInput = z.infer<typeof SyncToPlatformInputSchema>;

/**
 * Tool definition for MCP server registration
 */
export const syncToPlatformTool = {
  name: 'sync_to_platform',
  description: `Sync records to external platforms like Mailchimp, HubSpot, or Zapier.

Supported platforms:
- mailchimp: Add contacts to audiences with merge tags
- hubspot: Create/update CRM contacts with properties
- zapier: POST records to webhook for automation
- salesforce: Create leads (coming soon)
- google_sheets: Append rows (coming soon)

Features:
- Batch processing for efficiency
- Deduplication (update existing vs. create new)
- Custom field mapping
- Tagging support

Returns counts of created, updated, and skipped records with any errors.`,

  inputSchema: {
    type: 'object',
    properties: {
      platform: {
        type: 'string',
        enum: ['mailchimp', 'hubspot', 'salesforce', 'zapier', 'google_sheets'],
        description: 'Target platform for sync',
      },
      connection_id: {
        type: 'string',
        description: 'ID of the platform connection to use (from configure_platform_connection)',
      },
      records: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            email: { type: 'string', description: 'Email address' },
            phone: { type: 'string', description: 'Phone number' },
            firstName: { type: 'string', description: 'First name' },
            lastName: { type: 'string', description: 'Last name' },
            fullName: { type: 'string', description: 'Full name' },
            addressLine1: { type: 'string', description: 'Address line 1' },
            addressLine2: { type: 'string', description: 'Address line 2' },
            city: { type: 'string', description: 'City' },
            state: { type: 'string', description: 'State' },
            zip: { type: 'string', description: 'ZIP code' },
            country: { type: 'string', description: 'Country' },
            company: { type: 'string', description: 'Company name' },
            moveDate: { type: 'string', description: 'Move date' },
            propertyType: { type: 'string', description: 'Property type' },
            homeValue: { type: 'number', description: 'Home value' },
            income: { type: 'string', description: 'Income range' },
            age: { type: 'string', description: 'Age range' },
            customFields: { type: 'object', description: 'Custom fields' },
          },
        },
        description: 'Records to sync',
        minItems: 1,
        maxItems: 10000,
      },
      field_mapping: {
        type: 'object',
        description: 'Map our field names to platform field names (e.g., { "firstName": "FNAME" })',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags to apply to synced records',
      },
      duplicate_handling: {
        type: 'string',
        enum: ['update', 'skip', 'create_new'],
        description: 'How to handle existing records (default: update)',
      },
      list_id: {
        type: 'string',
        description: 'Platform-specific list/audience ID (overrides connection default)',
      },
      audience_id: {
        type: 'string',
        description: 'Mailchimp audience ID (alias for list_id)',
      },
    },
    required: ['platform', 'connection_id', 'records'],
  },
};

/**
 * Execute the sync_to_platform tool
 */
export async function executeSyncToPlatform(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    platform: string;
    created: number;
    updated: number;
    skipped: number;
    errors: Array<{
      recordIndex?: number;
      email?: string;
      errorCode: string;
      message: string;
    }>;
    totalProcessed: number;
  };
  error?: string;
}> {
  // Validate input
  const params = validateInput(SyncToPlatformInputSchema, input);

  // Check permissions
  requirePermission(context, 'platform:sync');

  // Validate platform
  if (!isPlatformSupported(params.platform)) {
    return {
      success: false,
      error: `Unsupported platform: ${params.platform}`,
    };
  }

  // Get connection from database
  const connection = await prisma.deliveryConfig.findFirst({
    where: {
      id: params.connection_id,
      tenantId: context.tenant.id,
      method: 'WEBHOOK', // Platform connections stored as webhook type
      isActive: true,
    },
  });

  if (!connection) {
    return {
      success: false,
      error: `Connection not found: ${params.connection_id}`,
    };
  }

  // Parse credentials from connection
  let credentials: PlatformCredentials;
  try {
    const settings = connection.printApiSettings as {
      platform?: string;
      credentials?: PlatformCredentials;
    } | null;

    if (!settings?.credentials) {
      return {
        success: false,
        error: 'Connection credentials not configured',
      };
    }

    credentials = settings.credentials;

    // Verify platform matches
    if (credentials.type !== params.platform) {
      return {
        success: false,
        error: `Connection is for ${credentials.type}, not ${params.platform}`,
      };
    }
  } catch {
    return {
      success: false,
      error: 'Failed to parse connection credentials',
    };
  }

  // Build sync options
  const syncOptions: SyncOptions = {
    duplicateHandling: params.duplicate_handling || 'update',
    fieldMapping: params.field_mapping,
    tags: params.tags,
    listId: params.list_id,
    audienceId: params.audience_id || params.list_id,
  };

  // Transform records to SyncRecord format
  const syncRecords: SyncRecord[] = params.records.map((r) => ({
    email: r.email,
    phone: r.phone,
    firstName: r.firstName,
    lastName: r.lastName,
    fullName: r.fullName,
    addressLine1: r.addressLine1,
    addressLine2: r.addressLine2,
    city: r.city,
    state: r.state,
    zip: r.zip,
    country: r.country,
    company: r.company,
    moveDate: r.moveDate,
    propertyType: r.propertyType,
    homeValue: r.homeValue,
    income: r.income,
    age: r.age,
    customFields: r.customFields,
    source: 'sync_to_platform',
  }));

  try {
    // Execute sync
    const result = await syncToPlatform(
      params.platform as PlatformType,
      credentials,
      syncRecords,
      syncOptions
    );

    // Log sync activity
    await prisma.usageRecord.create({
      data: {
        tenantId: context.tenant.id,
        usageType: 'DATA_RECORD',
        quantity: params.records.length,
        unitPrice: 0,
        totalCost: 0,
        toolName: 'sync_to_platform',
        billingMonth: new Date(),
        geography: {
          platform: params.platform,
          connectionId: params.connection_id,
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
        },
      },
    });

    return {
      success: result.success,
      data: {
        platform: params.platform,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
        totalProcessed: params.records.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Sync failed',
    };
  }
}
