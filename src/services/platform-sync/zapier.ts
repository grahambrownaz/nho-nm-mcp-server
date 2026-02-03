/**
 * Zapier Platform Sync Service
 * Sends records to Zapier webhooks
 */

import type {
  PlatformSyncProvider,
  PlatformCredentials,
  ZapierCredentials,
  SyncRecord,
  SyncOptions,
  SyncResult,
  SyncError,
  FieldMapping,
} from './interface.js';
import { DEFAULT_FIELD_MAPPINGS } from './interface.js';

/**
 * Zapier sync provider
 */
export class ZapierSyncProvider implements PlatformSyncProvider {
  readonly platform = 'zapier' as const;

  /**
   * Test connection with Zapier webhook
   */
  async testConnection(credentials: PlatformCredentials): Promise<{
    success: boolean;
    message: string;
    details?: Record<string, unknown>;
  }> {
    if (credentials.type !== 'zapier') {
      return {
        success: false,
        message: 'Invalid credentials type for Zapier',
      };
    }

    try {
      // Send a test ping to the webhook
      const response = await fetch(credentials.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          test: true,
          timestamp: new Date().toISOString(),
          message: 'Connection test from NHO/NM MCP Server',
        }),
      });

      if (response.ok) {
        return {
          success: true,
          message: 'Successfully connected to Zapier webhook',
          details: {
            statusCode: response.status,
            webhookUrl: credentials.webhookUrl.substring(0, 50) + '...',
          },
        };
      } else {
        return {
          success: false,
          message: `Webhook returned status ${response.status}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to connect to Zapier webhook',
      };
    }
  }

  /**
   * Sync records to Zapier webhook
   */
  async syncRecords(
    credentials: PlatformCredentials,
    records: SyncRecord[],
    options?: SyncOptions
  ): Promise<SyncResult> {
    if (credentials.type !== 'zapier') {
      return {
        success: false,
        platform: 'zapier',
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [{
          errorCode: 'INVALID_CREDENTIALS',
          message: 'Invalid credentials type for Zapier',
        }],
      };
    }

    const fieldMapping = options?.fieldMapping || DEFAULT_FIELD_MAPPINGS.zapier;
    let created = 0;
    let skipped = 0;
    const errors: SyncError[] = [];

    // Send records to webhook - can send individually or in batch
    // Most Zapier webhooks expect individual records, but we'll batch for efficiency
    const batchSize = 50;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      // Transform records for Zapier
      const transformedRecords = batch.map((record) => {
        return this.transformRecord(record, fieldMapping, options);
      });

      try {
        const response = await fetch(credentials.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            records: transformedRecords,
            metadata: {
              source: 'nho-nm-mcp-server',
              timestamp: new Date().toISOString(),
              batchIndex: Math.floor(i / batchSize),
              totalRecords: records.length,
              tags: options?.tags || [],
            },
          }),
        });

        if (response.ok) {
          created += batch.length;
        } else {
          const errorText = await response.text().catch(() => 'Unknown error');
          errors.push({
            errorCode: 'WEBHOOK_ERROR',
            message: `Batch ${Math.floor(i / batchSize) + 1} failed: ${response.status} - ${errorText}`,
          });
          skipped += batch.length;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Request failed';
        errors.push({
          errorCode: 'REQUEST_FAILED',
          message: `Batch ${Math.floor(i / batchSize) + 1} failed: ${message}`,
        });
        skipped += batch.length;
      }
    }

    return {
      success: errors.length === 0,
      platform: 'zapier',
      created,
      updated: 0, // Zapier doesn't have update concept
      skipped,
      errors,
      metadata: {
        webhookUrl: credentials.webhookUrl.substring(0, 50) + '...',
        totalProcessed: records.length,
      },
    };
  }

  /**
   * Send a single record to Zapier webhook
   */
  async sendSingleRecord(
    credentials: ZapierCredentials,
    record: SyncRecord,
    options?: SyncOptions
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    const fieldMapping = options?.fieldMapping || DEFAULT_FIELD_MAPPINGS.zapier;
    const transformedRecord = this.transformRecord(record, fieldMapping, options);

    try {
      const response = await fetch(credentials.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...transformedRecord,
          metadata: {
            source: 'nho-nm-mcp-server',
            timestamp: new Date().toISOString(),
            tags: options?.tags || [],
          },
        }),
      });

      if (response.ok) {
        return { success: true };
      } else {
        const errorText = await response.text().catch(() => 'Unknown error');
        return {
          success: false,
          error: `Webhook returned ${response.status}: ${errorText}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Request failed',
      };
    }
  }

  /**
   * Transform record for Zapier webhook
   */
  private transformRecord(
    record: SyncRecord,
    fieldMapping: FieldMapping,
    options?: SyncOptions
  ): Record<string, unknown> {
    const transformed: Record<string, unknown> = {};

    // Map standard fields
    if (record.email) {
      transformed[fieldMapping.email || 'email'] = record.email;
    }
    if (record.firstName) {
      transformed[fieldMapping.firstName || 'first_name'] = record.firstName;
    }
    if (record.lastName) {
      transformed[fieldMapping.lastName || 'last_name'] = record.lastName;
    }
    if (record.fullName) {
      transformed.full_name = record.fullName;
    }
    if (record.phone) {
      transformed[fieldMapping.phone || 'phone'] = record.phone;
    }
    if (record.addressLine1) {
      transformed[fieldMapping.addressLine1 || 'address_line_1'] = record.addressLine1;
    }
    if (record.addressLine2) {
      transformed[fieldMapping.addressLine2 || 'address_line_2'] = record.addressLine2;
    }
    if (record.city) {
      transformed[fieldMapping.city || 'city'] = record.city;
    }
    if (record.state) {
      transformed[fieldMapping.state || 'state'] = record.state;
    }
    if (record.zip) {
      transformed[fieldMapping.zip || 'zip'] = record.zip;
    }
    if (record.country) {
      transformed[fieldMapping.country || 'country'] = record.country;
    }
    if (record.company) {
      transformed.company = record.company;
    }

    // Add additional data fields
    if (record.moveDate) {
      transformed.move_date = record.moveDate;
    }
    if (record.propertyType) {
      transformed.property_type = record.propertyType;
    }
    if (record.homeValue !== undefined) {
      transformed.home_value = record.homeValue;
    }
    if (record.income) {
      transformed.income = record.income;
    }
    if (record.age) {
      transformed.age = record.age;
    }

    // Add source tracking
    if (record.source) {
      transformed.source = record.source;
    }
    if (record.subscriptionId) {
      transformed.subscription_id = record.subscriptionId;
    }
    if (record.deliveryId) {
      transformed.delivery_id = record.deliveryId;
    }

    // Add custom fields
    if (record.customFields) {
      for (const [key, value] of Object.entries(record.customFields)) {
        if (value !== undefined && value !== null) {
          transformed[key] = value;
        }
      }
    }

    // Add tags from options
    if (options?.tags && options.tags.length > 0) {
      transformed.tags = options.tags;
    }

    return transformed;
  }
}

/**
 * Export singleton instance
 */
export const zapierProvider = new ZapierSyncProvider();
