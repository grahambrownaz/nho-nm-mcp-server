/**
 * Tests for Zapier Platform Sync Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ZapierSyncProvider,
  zapierProvider,
} from '../../../../src/services/platform-sync/zapier.js';
import type {
  ZapierCredentials,
  SyncRecord,
  SyncOptions,
} from '../../../../src/services/platform-sync/interface.js';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

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
    moveDate: '2026-02-03',
    propertyType: 'Single Family',
    homeValue: 450000,
    ...overrides,
  };
}

// Create mock credentials
function createMockCredentials(overrides: Partial<ZapierCredentials> = {}): ZapierCredentials {
  return {
    type: 'zapier',
    webhookUrl: 'https://hooks.zapier.com/hooks/catch/123456/abcdef/',
    ...overrides,
  };
}

describe('ZapierSyncProvider', () => {
  let provider: ZapierSyncProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ZapierSyncProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('platform identifier', () => {
    it('has correct platform value', () => {
      expect(provider.platform).toBe('zapier');
    });
  });

  describe('testConnection', () => {
    it('successfully tests webhook connection', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      const credentials = createMockCredentials();
      const result = await provider.testConnection(credentials);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully connected');
      expect(mockFetch).toHaveBeenCalledWith(
        credentials.webhookUrl,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.any(String),
        })
      );
    });

    it('returns connection test details', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      const credentials = createMockCredentials();
      const result = await provider.testConnection(credentials);

      expect(result.details).toBeDefined();
      expect(result.details?.statusCode).toBe(200);
    });

    it('handles webhook error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const credentials = createMockCredentials();
      const result = await provider.testConnection(credentials);

      expect(result.success).toBe(false);
      expect(result.message).toContain('500');
    });

    it('handles network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network Error'));

      const credentials = createMockCredentials();
      const result = await provider.testConnection(credentials);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Network Error');
    });

    it('rejects invalid credentials type', async () => {
      const invalidCredentials = {
        type: 'hubspot',
        accessToken: 'test',
      } as any;

      const result = await provider.testConnection(invalidCredentials);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid credentials type');
    });
  });

  describe('syncRecords', () => {
    it('sends records to webhook', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      const credentials = createMockCredentials();
      const records = [
        createMockRecord({ email: 'user1@example.com' }),
        createMockRecord({ email: 'user2@example.com' }),
      ];

      const result = await provider.syncRecords(credentials, records);

      expect(result.success).toBe(true);
      expect(result.platform).toBe('zapier');
      expect(result.created).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('transforms records with field mapping', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      const credentials = createMockCredentials();
      const records = [createMockRecord()];
      const options: SyncOptions = {
        fieldMapping: {
          firstName: 'custom_first_name',
          lastName: 'custom_last_name',
        },
      };

      await provider.syncRecords(credentials, records, options);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.records[0]).toHaveProperty('custom_first_name', 'John');
      expect(callBody.records[0]).toHaveProperty('custom_last_name', 'Smith');
    });

    it('includes metadata in payload', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      const credentials = createMockCredentials();
      const records = [createMockRecord()];
      const options: SyncOptions = {
        tags: ['new-mover', 'phoenix'],
      };

      await provider.syncRecords(credentials, records, options);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.metadata).toBeDefined();
      expect(callBody.metadata.source).toBe('nho-nm-mcp-server');
      expect(callBody.metadata.tags).toEqual(['new-mover', 'phoenix']);
    });

    it('batches records in groups of 50', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      const credentials = createMockCredentials();
      const records = Array.from({ length: 75 }, (_, i) =>
        createMockRecord({ email: `user${i}@example.com` })
      );

      const result = await provider.syncRecords(credentials, records);

      expect(mockFetch).toHaveBeenCalledTimes(2); // 50 + 25
      expect(result.created).toBe(75);
    });

    it('handles partial batch failures', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, status: 200 })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Server error'),
        });

      const credentials = createMockCredentials();
      const records = Array.from({ length: 75 }, (_, i) =>
        createMockRecord({ email: `user${i}@example.com` })
      );

      const result = await provider.syncRecords(credentials, records);

      expect(result.success).toBe(false);
      expect(result.created).toBe(50);
      expect(result.skipped).toBe(25);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errorCode).toBe('WEBHOOK_ERROR');
    });

    it('handles network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const credentials = createMockCredentials();
      const records = [createMockRecord()];

      const result = await provider.syncRecords(credentials, records);

      expect(result.success).toBe(false);
      expect(result.errors[0].errorCode).toBe('REQUEST_FAILED');
      expect(result.errors[0].message).toContain('Connection refused');
    });

    it('rejects invalid credentials type', async () => {
      const invalidCredentials = {
        type: 'hubspot',
        accessToken: 'test',
      } as any;

      const records = [createMockRecord()];
      const result = await provider.syncRecords(invalidCredentials, records);

      expect(result.success).toBe(false);
      expect(result.errors[0].errorCode).toBe('INVALID_CREDENTIALS');
    });

    it('includes custom fields in transformed records', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      const credentials = createMockCredentials();
      const records = [
        createMockRecord({
          customFields: {
            lead_source: 'website',
            campaign_id: 'summer-2026',
          },
        }),
      ];

      await provider.syncRecords(credentials, records);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.records[0]).toHaveProperty('lead_source', 'website');
      expect(callBody.records[0]).toHaveProperty('campaign_id', 'summer-2026');
    });

    it('returns metadata with webhook URL preview', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      const credentials = createMockCredentials();
      const records = [createMockRecord()];

      const result = await provider.syncRecords(credentials, records);

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.webhookUrl).toContain('...');
      expect(result.metadata?.totalProcessed).toBe(1);
    });
  });

  describe('sendSingleRecord', () => {
    it('sends a single record to webhook', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      const credentials = createMockCredentials();
      const record = createMockRecord();

      const result = await provider.sendSingleRecord(credentials, record);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('includes record data directly in payload', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      const credentials = createMockCredentials();
      const record = createMockRecord();

      await provider.sendSingleRecord(credentials, record);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody).toHaveProperty('email', 'test@example.com');
      expect(callBody).toHaveProperty('first_name', 'John');
      expect(callBody.metadata).toBeDefined();
    });

    it('handles webhook errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad request'),
      });

      const credentials = createMockCredentials();
      const record = createMockRecord();

      const result = await provider.sendSingleRecord(credentials, record);

      expect(result.success).toBe(false);
      expect(result.error).toContain('400');
    });

    it('handles network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Connection timeout'));

      const credentials = createMockCredentials();
      const record = createMockRecord();

      const result = await provider.sendSingleRecord(credentials, record);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection timeout');
    });

    it('applies custom field mapping', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      const credentials = createMockCredentials();
      const record = createMockRecord();
      const options: SyncOptions = {
        fieldMapping: {
          email: 'contact_email',
        },
      };

      await provider.sendSingleRecord(credentials, record, options);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody).toHaveProperty('contact_email', 'test@example.com');
    });

    it('includes tags from options', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      const credentials = createMockCredentials();
      const record = createMockRecord();
      const options: SyncOptions = {
        tags: ['priority', 'auto-sync'],
      };

      await provider.sendSingleRecord(credentials, record, options);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.tags).toEqual(['priority', 'auto-sync']);
    });
  });

  describe('singleton instance', () => {
    it('exports zapierProvider singleton', () => {
      expect(zapierProvider).toBeDefined();
      expect(zapierProvider).toBeInstanceOf(ZapierSyncProvider);
    });

    it('singleton has correct platform', () => {
      expect(zapierProvider.platform).toBe('zapier');
    });
  });
});
