/**
 * Mailchimp Platform Sync Service
 * Syncs records to Mailchimp audiences
 */

import mailchimp from '@mailchimp/mailchimp_marketing';
import crypto from 'crypto';
import type {
  PlatformSyncProvider,
  PlatformCredentials,
  MailchimpCredentials,
  SyncRecord,
  SyncOptions,
  SyncResult,
  SyncError,
  FieldMapping,
} from './interface.js';
import { DEFAULT_FIELD_MAPPINGS as fieldMappings } from './interface.js';

/**
 * Generate MD5 hash for Mailchimp subscriber lookup
 */
function getSubscriberHash(email: string): string {
  return crypto.createHash('md5').update(email.toLowerCase()).digest('hex');
}

/**
 * Mailchimp sync provider
 */
export class MailchimpSyncProvider implements PlatformSyncProvider {
  readonly platform = 'mailchimp' as const;

  /**
   * Configure Mailchimp client
   */
  private configureClient(credentials: MailchimpCredentials): void {
    mailchimp.setConfig({
      apiKey: credentials.apiKey,
      server: credentials.server,
    });
  }

  /**
   * Test connection with Mailchimp
   */
  async testConnection(credentials: PlatformCredentials): Promise<{
    success: boolean;
    message: string;
    details?: Record<string, unknown>;
  }> {
    if (credentials.type !== 'mailchimp') {
      return {
        success: false,
        message: 'Invalid credentials type for Mailchimp',
      };
    }

    try {
      this.configureClient(credentials);

      // Try to ping the API
      const response = await mailchimp.ping.get();

      return {
        success: true,
        message: 'Successfully connected to Mailchimp',
        details: {
          healthStatus: (response as { health_status?: string }).health_status,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to connect to Mailchimp',
      };
    }
  }

  /**
   * Get available audiences/lists
   */
  async getLists(credentials: PlatformCredentials): Promise<Array<{
    id: string;
    name: string;
    memberCount?: number;
  }>> {
    if (credentials.type !== 'mailchimp') {
      throw new Error('Invalid credentials type for Mailchimp');
    }

    this.configureClient(credentials);

    const response = await mailchimp.lists.getAllLists({
      count: 100,
    });

    const lists = response as {
      lists?: Array<{
        id: string;
        name: string;
        stats?: { member_count?: number };
      }>;
    };

    return (lists.lists || []).map((list) => ({
      id: list.id,
      name: list.name,
      memberCount: list.stats?.member_count,
    }));
  }

  /**
   * Get merge fields for an audience
   */
  async getFields(credentials: PlatformCredentials): Promise<Array<{
    id: string;
    name: string;
    type: string;
    required?: boolean;
  }>> {
    if (credentials.type !== 'mailchimp') {
      throw new Error('Invalid credentials type for Mailchimp');
    }

    const audienceId = credentials.audienceId;
    if (!audienceId) {
      return [];
    }

    this.configureClient(credentials);

    const response = await mailchimp.lists.getListMergeFields(audienceId, {
      count: 100,
    });

    const fields = response as {
      merge_fields?: Array<{
        merge_id: number;
        tag: string;
        name: string;
        type: string;
        required: boolean;
      }>;
    };

    return (fields.merge_fields || []).map((field) => ({
      id: field.tag,
      name: field.name,
      type: field.type,
      required: field.required,
    }));
  }

  /**
   * Sync records to Mailchimp audience
   */
  async syncRecords(
    credentials: PlatformCredentials,
    records: SyncRecord[],
    options?: SyncOptions
  ): Promise<SyncResult> {
    if (credentials.type !== 'mailchimp') {
      return {
        success: false,
        platform: 'mailchimp',
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [{
          errorCode: 'INVALID_CREDENTIALS',
          message: 'Invalid credentials type for Mailchimp',
        }],
      };
    }

    const audienceId = options?.audienceId || credentials.audienceId;
    if (!audienceId) {
      return {
        success: false,
        platform: 'mailchimp',
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [{
          errorCode: 'MISSING_AUDIENCE',
          message: 'Audience ID is required for Mailchimp sync',
        }],
      };
    }

    this.configureClient(credentials);

    const fieldMapping = options?.fieldMapping || fieldMappings.mailchimp;
    const duplicateHandling = options?.duplicateHandling || 'update';

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: SyncError[] = [];

    // Process records in batches of 500 (Mailchimp limit)
    const batchSize = 500;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      // Build batch operations
      const operations = batch.map((record, index) => {
        if (!record.email) {
          errors.push({
            recordIndex: i + index,
            errorCode: 'MISSING_EMAIL',
            message: 'Email is required for Mailchimp sync',
          });
          return null;
        }

        const mergeFields = this.buildMergeFields(record, fieldMapping);

        return {
          method: duplicateHandling === 'skip' ? 'POST' : 'PUT',
          path: duplicateHandling === 'skip'
            ? `/lists/${audienceId}/members`
            : `/lists/${audienceId}/members/${getSubscriberHash(record.email)}`,
          body: JSON.stringify({
            email_address: record.email,
            status_if_new: 'subscribed',
            merge_fields: mergeFields,
            tags: options?.tags || [],
          }),
        };
      }).filter(Boolean);

      if (operations.length === 0) continue;

      try {
        // Execute batch
        const response = await mailchimp.batches.start({
          operations: operations as Array<{
            method: string;
            path: string;
            body: string;
          }>,
        });

        // Note: Batch operations are async in Mailchimp
        // For simplicity, we'll count based on what we sent
        // In production, you'd poll for batch completion

        // Count results (approximation since batch is async)
        const validOperations = operations.length;
        if (duplicateHandling === 'update') {
          // PUT operations can create or update
          updated += validOperations;
        } else {
          created += validOperations;
        }

        console.log(`[Mailchimp] Batch submitted: ${(response as { id: string }).id}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Batch operation failed';
        errors.push({
          errorCode: 'BATCH_FAILED',
          message: `Batch ${Math.floor(i / batchSize) + 1} failed: ${message}`,
        });
      }
    }

    // Adjust counts for errors
    const errorCount = errors.filter((e) => e.recordIndex !== undefined).length;
    skipped = errorCount;

    return {
      success: errors.length === 0,
      platform: 'mailchimp',
      created,
      updated: duplicateHandling === 'update' ? updated - created : 0,
      skipped,
      errors,
      metadata: {
        audienceId,
        totalProcessed: records.length,
      },
    };
  }

  /**
   * Sync a single record (useful for real-time sync)
   */
  async syncSingleRecord(
    credentials: MailchimpCredentials,
    record: SyncRecord,
    options?: SyncOptions
  ): Promise<{
    success: boolean;
    action: 'created' | 'updated' | 'skipped';
    error?: string;
  }> {
    if (!record.email) {
      return {
        success: false,
        action: 'skipped',
        error: 'Email is required',
      };
    }

    const audienceId = options?.audienceId || credentials.audienceId;
    if (!audienceId) {
      return {
        success: false,
        action: 'skipped',
        error: 'Audience ID is required',
      };
    }

    this.configureClient(credentials);

    const fieldMapping = options?.fieldMapping || fieldMappings.mailchimp;
    const mergeFields = this.buildMergeFields(record, fieldMapping);
    const subscriberHash = getSubscriberHash(record.email);

    try {
      // Use setListMember for upsert behavior
      await mailchimp.lists.setListMember(audienceId, subscriberHash, {
        email_address: record.email,
        status_if_new: 'subscribed',
        merge_fields: mergeFields,
      });

      return {
        success: true,
        action: 'updated', // setListMember does upsert
      };
    } catch (error) {
      return {
        success: false,
        action: 'skipped',
        error: error instanceof Error ? error.message : 'Failed to sync record',
      };
    }
  }

  /**
   * Build merge fields from record data
   */
  private buildMergeFields(
    record: SyncRecord,
    fieldMapping: FieldMapping
  ): Record<string, string | number> {
    const mergeFields: Record<string, string | number> = {};

    // Map standard fields
    if (record.firstName && fieldMapping.firstName) {
      mergeFields[fieldMapping.firstName] = record.firstName;
    }
    if (record.lastName && fieldMapping.lastName) {
      mergeFields[fieldMapping.lastName] = record.lastName;
    }
    if (record.phone && fieldMapping.phone) {
      mergeFields[fieldMapping.phone] = record.phone;
    }
    if (record.addressLine1 && fieldMapping.addressLine1) {
      mergeFields[fieldMapping.addressLine1] = record.addressLine1;
    }
    if (record.addressLine2 && fieldMapping.addressLine2) {
      mergeFields[fieldMapping.addressLine2] = record.addressLine2;
    }
    if (record.city && fieldMapping.city) {
      mergeFields[fieldMapping.city] = record.city;
    }
    if (record.state && fieldMapping.state) {
      mergeFields[fieldMapping.state] = record.state;
    }
    if (record.zip && fieldMapping.zip) {
      mergeFields[fieldMapping.zip] = record.zip;
    }
    if (record.country && fieldMapping.country) {
      mergeFields[fieldMapping.country] = record.country || 'US';
    }

    // Add custom fields
    if (record.customFields) {
      for (const [key, value] of Object.entries(record.customFields)) {
        if (value !== undefined && value !== null) {
          mergeFields[key.toUpperCase()] = String(value);
        }
      }
    }

    return mergeFields;
  }
}

/**
 * Export singleton instance
 */
export const mailchimpProvider = new MailchimpSyncProvider();
