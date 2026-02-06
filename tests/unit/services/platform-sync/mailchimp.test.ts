/**
 * Tests for Mailchimp Platform Sync Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MailchimpSyncProvider,
  mailchimpProvider,
} from '../../../../src/services/platform-sync/mailchimp.js';
import type {
  MailchimpCredentials,
  SyncRecord,
  SyncOptions,
} from '../../../../src/services/platform-sync/interface.js';

// Mock the Mailchimp Marketing client
vi.mock('@mailchimp/mailchimp_marketing', () => ({
  default: {
    setConfig: vi.fn(),
    ping: {
      get: vi.fn(),
    },
    lists: {
      getAllLists: vi.fn(),
      getListMergeFields: vi.fn(),
      setListMember: vi.fn(),
    },
    batches: {
      start: vi.fn(),
    },
  },
}));

// Import the mocked module after vi.mock
import mailchimp from '@mailchimp/mailchimp_marketing';

// Create mock record
function createMockRecord(overrides: Partial<SyncRecord> = {}): SyncRecord {
  return {
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Smith',
    addressLine1: '123 Main Street',
    city: 'Phoenix',
    state: 'AZ',
    zip: '85001',
    phone: '6025551234',
    ...overrides,
  };
}

// Create mock credentials
function createMockCredentials(overrides: Partial<MailchimpCredentials> = {}): MailchimpCredentials {
  return {
    type: 'mailchimp',
    apiKey: 'test-api-key-us1',
    server: 'us1',
    audienceId: 'audience-123',
    ...overrides,
  };
}

describe('MailchimpSyncProvider', () => {
  let provider: MailchimpSyncProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new MailchimpSyncProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('platform identifier', () => {
    it('has correct platform value', () => {
      expect(provider.platform).toBe('mailchimp');
    });
  });

  describe('testConnection', () => {
    it('validates API key with successful ping', async () => {
      vi.mocked(mailchimp.ping.get).mockResolvedValue({
        health_status: "Everything's Chimpy!",
      });

      const credentials = createMockCredentials();
      const result = await provider.testConnection(credentials);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully connected');
      expect(mailchimp.setConfig).toHaveBeenCalledWith({
        apiKey: credentials.apiKey,
        server: credentials.server,
      });
    });

    it('returns health status in details', async () => {
      vi.mocked(mailchimp.ping.get).mockResolvedValue({
        health_status: "Everything's Chimpy!",
      });

      const credentials = createMockCredentials();
      const result = await provider.testConnection(credentials);

      expect(result.details?.healthStatus).toBe("Everything's Chimpy!");
    });

    it('returns false for invalid API key', async () => {
      vi.mocked(mailchimp.ping.get).mockRejectedValue(
        new Error('API Key Invalid')
      );

      const credentials = createMockCredentials();
      const result = await provider.testConnection(credentials);

      expect(result.success).toBe(false);
      expect(result.message).toContain('API Key Invalid');
    });

    it('handles network errors', async () => {
      vi.mocked(mailchimp.ping.get).mockRejectedValue(new Error('Network Error'));

      const credentials = createMockCredentials();
      const result = await provider.testConnection(credentials);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Network Error');
    });

    it('rejects invalid credentials type', async () => {
      const invalidCredentials = {
        type: 'zapier',
        webhookUrl: 'https://test.com',
      } as any;

      const result = await provider.testConnection(invalidCredentials);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid credentials type');
    });
  });

  describe('syncRecords', () => {
    it('syncs records to Mailchimp audience', async () => {
      vi.mocked(mailchimp.batches.start).mockResolvedValue({
        id: 'batch-123',
        status: 'pending',
      });

      const credentials = createMockCredentials();
      const records = [
        createMockRecord({ email: 'user1@example.com' }),
        createMockRecord({ email: 'user2@example.com' }),
      ];

      const result = await provider.syncRecords(credentials, records);

      expect(result.platform).toBe('mailchimp');
      expect(mailchimp.batches.start).toHaveBeenCalled();
    });

    it('requires audience ID', async () => {
      const credentials = createMockCredentials({ audienceId: undefined });
      const records = [createMockRecord()];

      const result = await provider.syncRecords(credentials, records);

      expect(result.success).toBe(false);
      expect(result.errors[0].errorCode).toBe('MISSING_AUDIENCE');
    });

    it('handles missing email gracefully', async () => {
      vi.mocked(mailchimp.batches.start).mockResolvedValue({
        id: 'batch-123',
        status: 'pending',
      });

      const credentials = createMockCredentials();
      const records = [
        createMockRecord({ email: undefined }),
        createMockRecord({ email: 'valid@example.com' }),
      ];

      const result = await provider.syncRecords(credentials, records);

      expect(result.errors.some(e => e.errorCode === 'MISSING_EMAIL')).toBe(true);
    });

    it('rejects invalid credentials type', async () => {
      const invalidCredentials = {
        type: 'zapier',
        webhookUrl: 'https://test.com',
      } as any;

      const records = [createMockRecord()];
      const result = await provider.syncRecords(invalidCredentials, records);

      expect(result.success).toBe(false);
      expect(result.errors[0].errorCode).toBe('INVALID_CREDENTIALS');
    });

    it('uses audience ID from options over credentials', async () => {
      vi.mocked(mailchimp.batches.start).mockResolvedValue({
        id: 'batch-123',
        status: 'pending',
      });

      const credentials = createMockCredentials({ audienceId: 'default-audience' });
      const records = [createMockRecord()];
      const options: SyncOptions = {
        audienceId: 'override-audience',
      };

      const result = await provider.syncRecords(credentials, records, options);

      expect(result.metadata?.audienceId).toBe('override-audience');
    });

    it('processes records in batches of 500', async () => {
      vi.mocked(mailchimp.batches.start).mockResolvedValue({
        id: 'batch-123',
        status: 'pending',
      });

      const credentials = createMockCredentials();
      const records = Array.from({ length: 600 }, (_, i) =>
        createMockRecord({ email: `user${i}@example.com` })
      );

      const result = await provider.syncRecords(credentials, records);

      expect(mailchimp.batches.start).toHaveBeenCalledTimes(2); // 500 + 100
      expect(result.platform).toBe('mailchimp');
    });

    it('handles batch API errors', async () => {
      vi.mocked(mailchimp.batches.start).mockRejectedValue(
        new Error('Batch operation failed')
      );

      const credentials = createMockCredentials();
      const records = [createMockRecord()];

      const result = await provider.syncRecords(credentials, records);

      expect(result.errors.some(e => e.errorCode === 'BATCH_FAILED')).toBe(true);
    });

    it('uses PUT for update duplicate handling', async () => {
      vi.mocked(mailchimp.batches.start).mockResolvedValue({
        id: 'batch-123',
        status: 'pending',
      });

      const credentials = createMockCredentials();
      const records = [createMockRecord()];
      const options: SyncOptions = {
        duplicateHandling: 'update',
      };

      await provider.syncRecords(credentials, records, options);

      const batchCall = vi.mocked(mailchimp.batches.start).mock.calls[0][0];
      expect(batchCall.operations[0].method).toBe('PUT');
    });

    it('uses POST for skip duplicate handling', async () => {
      vi.mocked(mailchimp.batches.start).mockResolvedValue({
        id: 'batch-123',
        status: 'pending',
      });

      const credentials = createMockCredentials();
      const records = [createMockRecord()];
      const options: SyncOptions = {
        duplicateHandling: 'skip',
      };

      await provider.syncRecords(credentials, records, options);

      const batchCall = vi.mocked(mailchimp.batches.start).mock.calls[0][0];
      expect(batchCall.operations[0].method).toBe('POST');
    });

    it('includes tags in batch operations', async () => {
      vi.mocked(mailchimp.batches.start).mockResolvedValue({
        id: 'batch-123',
        status: 'pending',
      });

      const credentials = createMockCredentials();
      const records = [createMockRecord()];
      const options: SyncOptions = {
        tags: ['new-mover', 'priority'],
      };

      await provider.syncRecords(credentials, records, options);

      const batchCall = vi.mocked(mailchimp.batches.start).mock.calls[0][0];
      const body = JSON.parse(batchCall.operations[0].body);
      expect(body.tags).toEqual(['new-mover', 'priority']);
    });
  });

  describe('getLists', () => {
    it('returns available audiences', async () => {
      vi.mocked(mailchimp.lists.getAllLists).mockResolvedValue({
        lists: [
          { id: 'list-1', name: 'Main List', stats: { member_count: 1000 } },
          { id: 'list-2', name: 'Newsletter', stats: { member_count: 500 } },
        ],
      });

      const credentials = createMockCredentials();
      const lists = await provider.getLists(credentials);

      expect(lists).toHaveLength(2);
      expect(lists[0].id).toBe('list-1');
      expect(lists[0].name).toBe('Main List');
      expect(lists[0].memberCount).toBe(1000);
    });

    it('rejects invalid credentials type', async () => {
      const invalidCredentials = {
        type: 'zapier',
        webhookUrl: 'https://test.com',
      } as any;

      await expect(provider.getLists(invalidCredentials)).rejects.toThrow(
        'Invalid credentials type'
      );
    });

    it('handles empty list response', async () => {
      vi.mocked(mailchimp.lists.getAllLists).mockResolvedValue({
        lists: [],
      });

      const credentials = createMockCredentials();
      const lists = await provider.getLists(credentials);

      expect(lists).toHaveLength(0);
    });
  });

  describe('getFields', () => {
    it('returns merge fields for audience', async () => {
      vi.mocked(mailchimp.lists.getListMergeFields).mockResolvedValue({
        merge_fields: [
          { merge_id: 1, tag: 'FNAME', name: 'First Name', type: 'text', required: false },
          { merge_id: 2, tag: 'LNAME', name: 'Last Name', type: 'text', required: false },
          { merge_id: 3, tag: 'PHONE', name: 'Phone Number', type: 'phone', required: false },
        ],
      });

      const credentials = createMockCredentials();
      const fields = await provider.getFields(credentials);

      expect(fields).toHaveLength(3);
      expect(fields[0].id).toBe('FNAME');
      expect(fields[0].name).toBe('First Name');
      expect(fields[0].type).toBe('text');
    });

    it('returns empty array if no audience ID', async () => {
      const credentials = createMockCredentials({ audienceId: undefined });
      const fields = await provider.getFields(credentials);

      expect(fields).toHaveLength(0);
    });

    it('rejects invalid credentials type', async () => {
      const invalidCredentials = {
        type: 'zapier',
        webhookUrl: 'https://test.com',
      } as any;

      await expect(provider.getFields(invalidCredentials)).rejects.toThrow(
        'Invalid credentials type'
      );
    });
  });

  describe('syncSingleRecord', () => {
    it('syncs a single record using upsert', async () => {
      vi.mocked(mailchimp.lists.setListMember).mockResolvedValue({
        id: 'member-123',
        email_address: 'test@example.com',
        status: 'subscribed',
      });

      const credentials = createMockCredentials();
      const record = createMockRecord();

      const result = await provider.syncSingleRecord(credentials, record);

      expect(result.success).toBe(true);
      expect(result.action).toBe('updated');
    });

    it('requires email', async () => {
      const credentials = createMockCredentials();
      const record = createMockRecord({ email: undefined });

      const result = await provider.syncSingleRecord(credentials, record);

      expect(result.success).toBe(false);
      expect(result.action).toBe('skipped');
      expect(result.error).toContain('Email is required');
    });

    it('requires audience ID', async () => {
      const credentials = createMockCredentials({ audienceId: undefined });
      const record = createMockRecord();

      const result = await provider.syncSingleRecord(credentials, record);

      expect(result.success).toBe(false);
      expect(result.action).toBe('skipped');
      expect(result.error).toContain('Audience ID is required');
    });

    it('handles API errors', async () => {
      vi.mocked(mailchimp.lists.setListMember).mockRejectedValue(
        new Error('API Error')
      );

      const credentials = createMockCredentials();
      const record = createMockRecord();

      const result = await provider.syncSingleRecord(credentials, record);

      expect(result.success).toBe(false);
      expect(result.action).toBe('skipped');
      expect(result.error).toContain('API Error');
    });

    it('uses audience ID from options', async () => {
      vi.mocked(mailchimp.lists.setListMember).mockResolvedValue({
        id: 'member-123',
        status: 'subscribed',
      });

      const credentials = createMockCredentials({ audienceId: 'default' });
      const record = createMockRecord();
      const options: SyncOptions = {
        audienceId: 'override',
      };

      await provider.syncSingleRecord(credentials, record, options);

      expect(mailchimp.lists.setListMember).toHaveBeenCalledWith(
        'override',
        expect.any(String),
        expect.any(Object)
      );
    });

    it('builds merge fields correctly', async () => {
      vi.mocked(mailchimp.lists.setListMember).mockResolvedValue({
        id: 'member-123',
        status: 'subscribed',
      });

      const credentials = createMockCredentials();
      const record = createMockRecord({
        firstName: 'Jane',
        lastName: 'Doe',
        phone: '4805551234',
      });

      await provider.syncSingleRecord(credentials, record);

      expect(mailchimp.lists.setListMember).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          merge_fields: expect.objectContaining({
            FNAME: 'Jane',
            LNAME: 'Doe',
            PHONE: '4805551234',
          }),
        })
      );
    });
  });

  describe('field mapping', () => {
    it('uses custom field mapping', async () => {
      vi.mocked(mailchimp.batches.start).mockResolvedValue({
        id: 'batch-123',
        status: 'pending',
      });

      const credentials = createMockCredentials();
      const records = [createMockRecord()];
      const options: SyncOptions = {
        fieldMapping: {
          firstName: 'CUSTOM_FNAME',
          lastName: 'CUSTOM_LNAME',
        },
      };

      await provider.syncRecords(credentials, records, options);

      const batchCall = vi.mocked(mailchimp.batches.start).mock.calls[0][0];
      const body = JSON.parse(batchCall.operations[0].body);
      expect(body.merge_fields).toHaveProperty('CUSTOM_FNAME', 'John');
      expect(body.merge_fields).toHaveProperty('CUSTOM_LNAME', 'Smith');
    });

    it('uses default merge field mappings', async () => {
      vi.mocked(mailchimp.batches.start).mockResolvedValue({
        id: 'batch-123',
        status: 'pending',
      });

      const credentials = createMockCredentials();
      const records = [createMockRecord()];

      await provider.syncRecords(credentials, records);

      const batchCall = vi.mocked(mailchimp.batches.start).mock.calls[0][0];
      const body = JSON.parse(batchCall.operations[0].body);
      expect(body.merge_fields).toHaveProperty('FNAME', 'John');
      expect(body.merge_fields).toHaveProperty('LNAME', 'Smith');
    });

    it('handles custom fields with uppercase conversion', async () => {
      vi.mocked(mailchimp.lists.setListMember).mockResolvedValue({
        id: 'member-123',
        status: 'subscribed',
      });

      const credentials = createMockCredentials();
      const record = createMockRecord({
        customFields: {
          lead_source: 'website',
          campaign_id: 'summer-2026',
        },
      });

      await provider.syncSingleRecord(credentials, record);

      expect(mailchimp.lists.setListMember).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          merge_fields: expect.objectContaining({
            LEAD_SOURCE: 'website',
            CAMPAIGN_ID: 'summer-2026',
          }),
        })
      );
    });
  });

  describe('email hashing', () => {
    it('uses MD5 hash for subscriber lookup', async () => {
      vi.mocked(mailchimp.lists.setListMember).mockResolvedValue({
        id: 'member-123',
        status: 'subscribed',
      });

      const credentials = createMockCredentials();
      const record = createMockRecord({ email: 'TEST@EXAMPLE.COM' });

      await provider.syncSingleRecord(credentials, record);

      // Verify that setListMember was called with a 32-character MD5 hash
      expect(mailchimp.lists.setListMember).toHaveBeenCalled();
      const callArgs = vi.mocked(mailchimp.lists.setListMember).mock.calls[0];
      expect(callArgs[0]).toBe('audience-123'); // audience ID
      expect(callArgs[1]).toMatch(/^[a-f0-9]{32}$/); // MD5 hash format
      // Verify email is lowercased in the body
      expect(callArgs[2]).toEqual(expect.objectContaining({
        email_address: 'TEST@EXAMPLE.COM',
      }));
    });
  });

  describe('singleton instance', () => {
    it('exports mailchimpProvider singleton', () => {
      expect(mailchimpProvider).toBeDefined();
      expect(mailchimpProvider).toBeInstanceOf(MailchimpSyncProvider);
    });

    it('singleton has correct platform', () => {
      expect(mailchimpProvider.platform).toBe('mailchimp');
    });
  });
});
