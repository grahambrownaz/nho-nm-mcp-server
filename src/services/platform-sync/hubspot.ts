/**
 * HubSpot Platform Sync Service
 * Syncs records to HubSpot CRM as contacts
 */

import { Client } from '@hubspot/api-client';
import type {
  PlatformSyncProvider,
  PlatformCredentials,
  HubSpotCredentials,
  SyncRecord,
  SyncOptions,
  SyncResult,
  SyncError,
  FieldMapping,
} from './interface.js';
import { DEFAULT_FIELD_MAPPINGS } from './interface.js';

/**
 * HubSpot sync provider
 */
export class HubSpotSyncProvider implements PlatformSyncProvider {
  readonly platform = 'hubspot' as const;

  /**
   * Create HubSpot client
   */
  private createClient(credentials: HubSpotCredentials): Client {
    return new Client({
      accessToken: credentials.accessToken,
    });
  }

  /**
   * Test connection with HubSpot
   */
  async testConnection(credentials: PlatformCredentials): Promise<{
    success: boolean;
    message: string;
    details?: Record<string, unknown>;
  }> {
    if (credentials.type !== 'hubspot') {
      return {
        success: false,
        message: 'Invalid credentials type for HubSpot',
      };
    }

    try {
      const client = this.createClient(credentials);

      // Try to get account info
      const response = await client.crm.contacts.basicApi.getPage(1);

      return {
        success: true,
        message: 'Successfully connected to HubSpot',
        details: {
          hasContacts: response.results.length > 0,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to connect to HubSpot',
      };
    }
  }

  /**
   * Get available contact properties
   */
  async getFields(credentials: PlatformCredentials): Promise<Array<{
    id: string;
    name: string;
    type: string;
    required?: boolean;
  }>> {
    if (credentials.type !== 'hubspot') {
      throw new Error('Invalid credentials type for HubSpot');
    }

    const client = this.createClient(credentials);

    const response = await client.crm.properties.coreApi.getAll('contacts');

    return response.results.map((prop) => ({
      id: prop.name,
      name: prop.label,
      type: prop.type,
      required: false, // HubSpot doesn't have required in same way
    }));
  }

  /**
   * Sync records to HubSpot
   */
  async syncRecords(
    credentials: PlatformCredentials,
    records: SyncRecord[],
    options?: SyncOptions
  ): Promise<SyncResult> {
    if (credentials.type !== 'hubspot') {
      return {
        success: false,
        platform: 'hubspot',
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [{
          errorCode: 'INVALID_CREDENTIALS',
          message: 'Invalid credentials type for HubSpot',
        }],
      };
    }

    const client = this.createClient(credentials);
    const fieldMapping = options?.fieldMapping || DEFAULT_FIELD_MAPPINGS.hubspot;
    const duplicateHandling = options?.duplicateHandling || 'update';

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: SyncError[] = [];

    // Process records in batches of 100 (HubSpot limit)
    const batchSize = 100;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      // Build batch inputs
      const createInputs: Array<{
        properties: Record<string, string>;
      }> = [];

      const updateInputs: Array<{
        id: string;
        properties: Record<string, string>;
      }> = [];

      const emailsToCheck: string[] = [];
      const recordsByEmail = new Map<string, { record: SyncRecord; index: number }>();

      // First, collect emails to check for existing contacts
      for (let j = 0; j < batch.length; j++) {
        const record = batch[j];
        if (!record.email) {
          errors.push({
            recordIndex: i + j,
            errorCode: 'MISSING_EMAIL',
            message: 'Email is required for HubSpot sync',
          });
          continue;
        }
        emailsToCheck.push(record.email);
        recordsByEmail.set(record.email.toLowerCase(), { record, index: i + j });
      }

      if (emailsToCheck.length === 0) continue;

      // Search for existing contacts by email
      const existingContacts = new Map<string, string>();

      try {
        // Search in smaller batches due to filter limitations
        for (let k = 0; k < emailsToCheck.length; k += 50) {
          const emailBatch = emailsToCheck.slice(k, k + 50);

          const searchResponse = await client.crm.contacts.searchApi.doSearch({
            filterGroups: [{
              filters: [{
                propertyName: 'email',
                operator: 'IN' as never,
                values: emailBatch,
              }],
            }],
            properties: ['email'],
            limit: 100,
          });

          for (const contact of searchResponse.results) {
            const email = contact.properties?.email?.toLowerCase();
            if (email) {
              existingContacts.set(email, contact.id);
            }
          }
        }
      } catch (error) {
        console.error('[HubSpot] Error searching for existing contacts:', error);
        // Continue anyway - will create new contacts
      }

      // Build create and update batches
      for (const email of emailsToCheck) {
        const data = recordsByEmail.get(email.toLowerCase());
        if (!data) continue;

        const properties = this.buildProperties(data.record, fieldMapping);
        const existingId = existingContacts.get(email.toLowerCase());

        if (existingId) {
          if (duplicateHandling === 'skip') {
            skipped++;
          } else {
            updateInputs.push({
              id: existingId,
              properties,
            });
          }
        } else {
          createInputs.push({ properties });
        }
      }

      // Execute batch create
      if (createInputs.length > 0) {
        try {
          await client.crm.contacts.batchApi.create({
            inputs: createInputs,
          });
          created += createInputs.length;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Batch create failed';
          errors.push({
            errorCode: 'BATCH_CREATE_FAILED',
            message: `Failed to create ${createInputs.length} contacts: ${message}`,
          });
        }
      }

      // Execute batch update
      if (updateInputs.length > 0) {
        try {
          await client.crm.contacts.batchApi.update({
            inputs: updateInputs,
          });
          updated += updateInputs.length;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Batch update failed';
          errors.push({
            errorCode: 'BATCH_UPDATE_FAILED',
            message: `Failed to update ${updateInputs.length} contacts: ${message}`,
          });
        }
      }
    }

    return {
      success: errors.length === 0,
      platform: 'hubspot',
      created,
      updated,
      skipped,
      errors,
      metadata: {
        totalProcessed: records.length,
      },
    };
  }

  /**
   * Create a single contact
   */
  async createContact(
    credentials: HubSpotCredentials,
    record: SyncRecord,
    options?: SyncOptions
  ): Promise<{
    success: boolean;
    contactId?: string;
    error?: string;
  }> {
    const client = this.createClient(credentials);
    const fieldMapping = options?.fieldMapping || DEFAULT_FIELD_MAPPINGS.hubspot;
    const properties = this.buildProperties(record, fieldMapping);

    try {
      const response = await client.crm.contacts.basicApi.create({
        properties,
        associations: [],
      });

      return {
        success: true,
        contactId: response.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create contact',
      };
    }
  }

  /**
   * Update a contact by email
   */
  async updateContactByEmail(
    credentials: HubSpotCredentials,
    email: string,
    record: Partial<SyncRecord>,
    options?: SyncOptions
  ): Promise<{
    success: boolean;
    contactId?: string;
    error?: string;
  }> {
    const client = this.createClient(credentials);
    const fieldMapping = options?.fieldMapping || DEFAULT_FIELD_MAPPINGS.hubspot;

    try {
      // Find contact by email
      const searchResponse = await client.crm.contacts.searchApi.doSearch({
        filterGroups: [{
          filters: [{
            propertyName: 'email',
            operator: 'EQ' as never,
            value: email,
          }],
        }],
        properties: ['email'],
        limit: 1,
      });

      if (searchResponse.results.length === 0) {
        return {
          success: false,
          error: 'Contact not found',
        };
      }

      const contactId = searchResponse.results[0].id;
      const properties = this.buildProperties(record as SyncRecord, fieldMapping);

      await client.crm.contacts.basicApi.update(contactId, { properties });

      return {
        success: true,
        contactId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update contact',
      };
    }
  }

  /**
   * Build HubSpot contact properties from record
   */
  private buildProperties(
    record: SyncRecord,
    fieldMapping: FieldMapping
  ): Record<string, string> {
    const properties: Record<string, string> = {};

    // Map standard fields
    if (record.email && fieldMapping.email) {
      properties[fieldMapping.email] = record.email;
    }
    if (record.firstName && fieldMapping.firstName) {
      properties[fieldMapping.firstName] = record.firstName;
    }
    if (record.lastName && fieldMapping.lastName) {
      properties[fieldMapping.lastName] = record.lastName;
    }
    if (record.phone && fieldMapping.phone) {
      properties[fieldMapping.phone] = record.phone;
    }
    if (record.addressLine1 && fieldMapping.addressLine1) {
      properties[fieldMapping.addressLine1] = record.addressLine1;
    }
    if (record.city && fieldMapping.city) {
      properties[fieldMapping.city] = record.city;
    }
    if (record.state && fieldMapping.state) {
      properties[fieldMapping.state] = record.state;
    }
    if (record.zip && fieldMapping.zip) {
      properties[fieldMapping.zip] = record.zip;
    }
    if (record.country && fieldMapping.country) {
      properties[fieldMapping.country] = record.country || 'US';
    }
    if (record.company && fieldMapping.company) {
      properties[fieldMapping.company] = record.company;
    }

    // Add custom fields
    if (record.customFields) {
      for (const [key, value] of Object.entries(record.customFields)) {
        if (value !== undefined && value !== null) {
          properties[key.toLowerCase()] = String(value);
        }
      }
    }

    return properties;
  }
}

/**
 * Export singleton instance
 */
export const hubspotProvider = new HubSpotSyncProvider();
