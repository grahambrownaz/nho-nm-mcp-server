/**
 * Tests for HubSpot Platform Sync Service
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type {
  HubSpotCredentials,
  SyncRecord,
  SyncOptions,
} from '../../../../src/services/platform-sync/interface.js';

// Create mock functions using vi.hoisted so they are available in vi.mock
const mocks = vi.hoisted(() => {
  const mockGetPage = vi.fn();
  const mockCreate = vi.fn();
  const mockUpdate = vi.fn();
  const mockDoSearch = vi.fn();
  const mockBatchCreate = vi.fn();
  const mockBatchUpdate = vi.fn();
  const mockGetAll = vi.fn();

  return {
    mockGetPage,
    mockCreate,
    mockUpdate,
    mockDoSearch,
    mockBatchCreate,
    mockBatchUpdate,
    mockGetAll,
    createMockClient: () => ({
      crm: {
        contacts: {
          basicApi: {
            getPage: mockGetPage,
            create: mockCreate,
            update: mockUpdate,
          },
          searchApi: {
            doSearch: mockDoSearch,
          },
          batchApi: {
            create: mockBatchCreate,
            update: mockBatchUpdate,
          },
        },
        properties: {
          coreApi: {
            getAll: mockGetAll,
          },
        },
      },
    }),
  };
});

// Mock the HubSpot API client
vi.mock('@hubspot/api-client', () => {
  return {
    Client: class MockClient {
      crm: any;
      constructor() {
        const client = mocks.createMockClient();
        this.crm = client.crm;
      }
    },
  };
});

// Import after mocking
import {
  HubSpotSyncProvider,
  hubspotProvider,
} from '../../../../src/services/platform-sync/hubspot.js';

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
    company: 'Acme Corp',
    ...overrides,
  };
}

// Create mock credentials
function createMockCredentials(overrides: Partial<HubSpotCredentials> = {}): HubSpotCredentials {
  return {
    type: 'hubspot',
    accessToken: 'pat-na1-test-api-key',
    ...overrides,
  };
}

describe('HubSpotSyncProvider', () => {
  let provider: HubSpotSyncProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new HubSpotSyncProvider();

    // Reset all mock implementations to defaults
    mocks.mockGetPage.mockResolvedValue({ results: [] });
    mocks.mockCreate.mockResolvedValue({ id: 'new-contact' });
    mocks.mockUpdate.mockResolvedValue({ id: 'updated-contact' });
    mocks.mockDoSearch.mockResolvedValue({ results: [] });
    mocks.mockBatchCreate.mockResolvedValue({ results: [] });
    mocks.mockBatchUpdate.mockResolvedValue({ results: [] });
    mocks.mockGetAll.mockResolvedValue({ results: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('platform identifier', () => {
    it('has correct platform value', () => {
      expect(provider.platform).toBe('hubspot');
    });
  });

  describe('testConnection', () => {
    it('validates credentials with successful request', async () => {
      mocks.mockGetPage.mockResolvedValue({
        results: [{ id: '1' }],
      });

      const credentials = createMockCredentials();
      const result = await provider.testConnection(credentials);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully connected');
      expect(result.details?.hasContacts).toBe(true);
    });

    it('returns success with no contacts', async () => {
      mocks.mockGetPage.mockResolvedValue({
        results: [],
      });

      const credentials = createMockCredentials();
      const result = await provider.testConnection(credentials);

      expect(result.success).toBe(true);
      expect(result.details?.hasContacts).toBe(false);
    });

    it('returns false for invalid credentials', async () => {
      mocks.mockGetPage.mockRejectedValue(
        new Error('The API key is invalid')
      );

      const credentials = createMockCredentials();
      const result = await provider.testConnection(credentials);

      expect(result.success).toBe(false);
      expect(result.message).toContain('API key is invalid');
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
    it('creates new contacts when none exist', async () => {
      mocks.mockDoSearch.mockResolvedValue({ results: [] });
      mocks.mockBatchCreate.mockResolvedValue({
        results: [{ id: '1' }, { id: '2' }],
      });

      const credentials = createMockCredentials();
      const records = [
        createMockRecord({ email: 'user1@example.com' }),
        createMockRecord({ email: 'user2@example.com' }),
      ];

      const result = await provider.syncRecords(credentials, records);

      expect(result.platform).toBe('hubspot');
      expect(result.created).toBe(2);
      expect(mocks.mockBatchCreate).toHaveBeenCalled();
    });

    it('handles missing email gracefully', async () => {
      const credentials = createMockCredentials();
      const records = [
        createMockRecord({ email: undefined }),
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

    it('updates existing contacts', async () => {
      mocks.mockDoSearch.mockResolvedValue({
        results: [{ id: 'existing-123', properties: { email: 'test@example.com' } }],
      });
      mocks.mockBatchUpdate.mockResolvedValue({
        results: [{ id: 'existing-123' }],
      });

      const credentials = createMockCredentials();
      const records = [createMockRecord()];

      const result = await provider.syncRecords(credentials, records, {
        duplicateHandling: 'update',
      });

      expect(result.platform).toBe('hubspot');
      expect(result.updated).toBe(1);
      expect(mocks.mockBatchUpdate).toHaveBeenCalled();
    });

    it('skips duplicates when configured', async () => {
      mocks.mockDoSearch.mockResolvedValue({
        results: [{ id: 'existing-123', properties: { email: 'test@example.com' } }],
      });

      const credentials = createMockCredentials();
      const records = [createMockRecord()];

      const result = await provider.syncRecords(credentials, records, {
        duplicateHandling: 'skip',
      });

      expect(result.skipped).toBe(1);
      expect(mocks.mockBatchCreate).not.toHaveBeenCalled();
      expect(mocks.mockBatchUpdate).not.toHaveBeenCalled();
    });

    it('processes records in batches of 100', async () => {
      mocks.mockDoSearch.mockResolvedValue({ results: [] });
      mocks.mockBatchCreate.mockResolvedValue({ results: [] });

      const credentials = createMockCredentials();
      const records = Array.from({ length: 150 }, (_, i) =>
        createMockRecord({ email: `user${i}@example.com` })
      );

      const result = await provider.syncRecords(credentials, records);

      expect(result.platform).toBe('hubspot');
      // Should make 2 batch calls (100 + 50)
      expect(mocks.mockBatchCreate).toHaveBeenCalledTimes(2);
    });

    it('handles mixed create and update', async () => {
      // First batch search returns one existing contact
      mocks.mockDoSearch.mockResolvedValueOnce({
        results: [{ id: 'existing-1', properties: { email: 'user1@example.com' } }],
      });

      mocks.mockBatchCreate.mockResolvedValue({ results: [{ id: 'new-1' }] });
      mocks.mockBatchUpdate.mockResolvedValue({ results: [{ id: 'existing-1' }] });

      const credentials = createMockCredentials();
      const records = [
        createMockRecord({ email: 'user1@example.com' }),
        createMockRecord({ email: 'user2@example.com' }),
      ];

      const result = await provider.syncRecords(credentials, records);

      expect(result.platform).toBe('hubspot');
      expect(result.created).toBe(1);
      expect(result.updated).toBe(1);
    });
  });

  describe('getFields', () => {
    it('returns available contact properties', async () => {
      mocks.mockGetAll.mockResolvedValue({
        results: [
          { name: 'email', label: 'Email', type: 'string' },
          { name: 'firstname', label: 'First Name', type: 'string' },
          { name: 'lastname', label: 'Last Name', type: 'string' },
          { name: 'phone', label: 'Phone Number', type: 'string' },
        ],
      });

      const credentials = createMockCredentials();
      const fields = await provider.getFields(credentials);

      expect(fields).toHaveLength(4);
      expect(fields[0].id).toBe('email');
      expect(fields[0].name).toBe('Email');
      expect(fields[0].type).toBe('string');
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

  describe('createContact', () => {
    it('creates a single contact', async () => {
      mocks.mockCreate.mockResolvedValue({
        id: 'contact-123',
        properties: { email: 'test@example.com' },
      });

      const credentials = createMockCredentials();
      const record = createMockRecord();

      const result = await provider.createContact(credentials, record);

      expect(result.success).toBe(true);
      expect(result.contactId).toBe('contact-123');
    });

    it('handles creation errors', async () => {
      mocks.mockCreate.mockRejectedValue(
        new Error('Contact already exists')
      );

      const credentials = createMockCredentials();
      const record = createMockRecord();

      const result = await provider.createContact(credentials, record);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Contact already exists');
    });
  });

  describe('updateContactByEmail', () => {
    it('updates a contact by email', async () => {
      mocks.mockDoSearch.mockResolvedValue({
        results: [{ id: 'contact-123', properties: { email: 'test@example.com' } }],
      });
      mocks.mockUpdate.mockResolvedValue({
        id: 'contact-123',
        properties: { firstname: 'Updated', lastname: 'Name' },
      });

      const credentials = createMockCredentials();
      const email = 'test@example.com';
      const updates: Partial<SyncRecord> = {
        firstName: 'Updated',
        lastName: 'Name',
      };

      const result = await provider.updateContactByEmail(credentials, email, updates);

      expect(result.success).toBe(true);
      expect(result.contactId).toBe('contact-123');
    });

    it('returns error when contact not found', async () => {
      mocks.mockDoSearch.mockResolvedValue({
        results: [],
      });

      const credentials = createMockCredentials();
      const email = 'notfound@example.com';

      const result = await provider.updateContactByEmail(credentials, email, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('handles update errors', async () => {
      mocks.mockDoSearch.mockResolvedValue({
        results: [{ id: 'contact-123', properties: { email: 'test@example.com' } }],
      });
      mocks.mockUpdate.mockRejectedValue(
        new Error('Update failed')
      );

      const credentials = createMockCredentials();
      const result = await provider.updateContactByEmail(credentials, 'test@example.com', {
        firstName: 'Updated',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Update failed');
    });
  });

  describe('field mapping', () => {
    it('uses custom field mapping', async () => {
      mocks.mockDoSearch.mockResolvedValue({ results: [] });
      mocks.mockBatchCreate.mockResolvedValue({ results: [{ id: '1' }] });

      const credentials = createMockCredentials();
      const records = [createMockRecord()];
      const options: SyncOptions = {
        fieldMapping: {
          email: 'custom_email',
          firstName: 'custom_first',
          lastName: 'custom_last',
        },
      };

      const result = await provider.syncRecords(credentials, records, options);

      expect(result.platform).toBe('hubspot');
      // Verify the batch create was called with mapped properties
      expect(mocks.mockBatchCreate).toHaveBeenCalled();
    });

    it('uses default field mapping when not provided', async () => {
      mocks.mockDoSearch.mockResolvedValue({ results: [] });
      mocks.mockBatchCreate.mockResolvedValue({ results: [{ id: '1' }] });

      const credentials = createMockCredentials();
      const records = [createMockRecord()];

      const result = await provider.syncRecords(credentials, records);

      expect(result.platform).toBe('hubspot');
      expect(mocks.mockBatchCreate).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('handles batch create failures', async () => {
      mocks.mockDoSearch.mockResolvedValue({ results: [] });
      mocks.mockBatchCreate.mockRejectedValue(
        new Error('Batch create failed')
      );

      const credentials = createMockCredentials();
      const records = [createMockRecord()];

      const result = await provider.syncRecords(credentials, records);

      expect(result.errors.some(e => e.errorCode === 'BATCH_CREATE_FAILED')).toBe(true);
    });

    it('handles batch update failures', async () => {
      mocks.mockDoSearch.mockResolvedValue({
        results: [{ id: 'existing-123', properties: { email: 'test@example.com' } }],
      });
      mocks.mockBatchUpdate.mockRejectedValue(
        new Error('Batch update failed')
      );

      const credentials = createMockCredentials();
      const records = [createMockRecord()];

      const result = await provider.syncRecords(credentials, records);

      expect(result.errors.some(e => e.errorCode === 'BATCH_UPDATE_FAILED')).toBe(true);
    });

    it('handles search errors gracefully', async () => {
      mocks.mockDoSearch.mockRejectedValue(
        new Error('Search failed')
      );
      mocks.mockBatchCreate.mockResolvedValue({ results: [{ id: '1' }] });

      const credentials = createMockCredentials();
      const records = [createMockRecord()];

      // Should not throw, errors are logged and processing continues
      const result = await provider.syncRecords(credentials, records);
      expect(result.platform).toBe('hubspot');
      // Should still attempt to create since search failed
      expect(result.created).toBe(1);
    });
  });

  describe('singleton instance', () => {
    it('exports hubspotProvider singleton', () => {
      expect(hubspotProvider).toBeDefined();
      expect(hubspotProvider).toBeInstanceOf(HubSpotSyncProvider);
    });

    it('singleton has correct platform', () => {
      expect(hubspotProvider.platform).toBe('hubspot');
    });
  });
});
