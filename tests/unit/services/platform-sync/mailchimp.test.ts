/**
 * Tests for Mailchimp Platform Sync Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import {
  MailchimpService,
  mailchimpService,
} from '../../../../src/services/platform-sync/mailchimp.js';

// Mock axios
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    })),
  },
}));

// Create mock contact
function createMockContact(overrides: Record<string, unknown> = {}) {
  return {
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Smith',
    address: '123 Main Street',
    city: 'Phoenix',
    state: 'AZ',
    zip: '85001',
    phone: '6025551234',
    ...overrides,
  };
}

describe('Mailchimp Service', () => {
  let service: MailchimpService;
  let mockAxiosInstance: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockAxiosInstance = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };

    vi.mocked(axios.create).mockReturnValue(mockAxiosInstance as any);

    service = new MailchimpService({
      apiKey: 'test-api-key-us1',
      serverPrefix: 'us1',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('testConnection', () => {
    it('validates API key with successful ping', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          account_id: 'test-account',
          account_name: 'Test Account',
        },
      });

      const result = await service.testConnection({
        apiKey: 'valid-api-key-us1',
        serverPrefix: 'us1',
      });

      expect(result).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/ping');
    });

    it('returns false for invalid API key', async () => {
      mockAxiosInstance.get.mockRejectedValue({
        response: {
          status: 401,
          data: {
            title: 'API Key Invalid',
          },
        },
      });

      const result = await service.testConnection({
        apiKey: 'invalid-key',
        serverPrefix: 'us1',
      });

      expect(result).toBe(false);
    });

    it('handles network errors', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Network Error'));

      const result = await service.testConnection({
        apiKey: 'test-key',
        serverPrefix: 'us1',
      });

      expect(result).toBe(false);
    });
  });

  describe('addToAudience', () => {
    it('adds contacts to audience', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: {
          id: 'member-123',
          email_address: 'test@example.com',
          status: 'subscribed',
        },
      });

      const contact = createMockContact();
      const result = await service.addToAudience('audience-123', [contact]);

      expect(result.created).toBe(1);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/lists/audience-123/members',
        expect.objectContaining({
          email_address: 'test@example.com',
          status: 'subscribed',
        })
      );
    });

    it('maps fields to merge tags', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { id: 'member-123', status: 'subscribed' },
      });

      const contact = createMockContact({
        firstName: 'Jane',
        lastName: 'Doe',
        address: '456 Oak Ave',
      });

      await service.addToAudience('audience-123', [contact], {
        fieldMapping: {
          firstName: 'FNAME',
          lastName: 'LNAME',
          address: 'ADDRESS',
        },
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/lists/audience-123/members',
        expect.objectContaining({
          merge_fields: expect.objectContaining({
            FNAME: 'Jane',
            LNAME: 'Doe',
            ADDRESS: '456 Oak Ave',
          }),
        })
      );
    });

    it('handles multiple contacts', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { id: 'member', status: 'subscribed' },
      });

      const contacts = [
        createMockContact({ email: 'user1@example.com' }),
        createMockContact({ email: 'user2@example.com' }),
        createMockContact({ email: 'user3@example.com' }),
      ];

      const result = await service.addToAudience('audience-123', contacts);

      expect(result.created).toBe(3);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3);
    });
  });

  describe('duplicate handling', () => {
    it('handles duplicate contacts by updating', async () => {
      // First call fails with duplicate error
      mockAxiosInstance.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            title: 'Member Exists',
            detail: 'test@example.com is already a list member',
          },
        },
      });

      // Update call succeeds
      mockAxiosInstance.patch.mockResolvedValueOnce({
        data: {
          id: 'member-123',
          email_address: 'test@example.com',
          status: 'subscribed',
        },
      });

      const contact = createMockContact();
      const result = await service.addToAudience('audience-123', [contact], {
        updateExisting: true,
      });

      expect(result.updated).toBe(1);
      expect(mockAxiosInstance.patch).toHaveBeenCalled();
    });

    it('skips duplicates when update disabled', async () => {
      mockAxiosInstance.post.mockRejectedValue({
        response: {
          status: 400,
          data: {
            title: 'Member Exists',
          },
        },
      });

      const contact = createMockContact();
      const result = await service.addToAudience('audience-123', [contact], {
        updateExisting: false,
      });

      expect(result.skipped).toBe(1);
      expect(mockAxiosInstance.patch).not.toHaveBeenCalled();
    });
  });

  describe('Mailchimp API errors', () => {
    it('handles rate limiting', async () => {
      mockAxiosInstance.post.mockRejectedValue({
        response: {
          status: 429,
          data: {
            title: 'Too Many Requests',
          },
        },
      });

      const contact = createMockContact();

      await expect(service.addToAudience('audience-123', [contact])).rejects.toThrow(
        'Too Many Requests'
      );
    });

    it('handles invalid email error', async () => {
      mockAxiosInstance.post.mockRejectedValue({
        response: {
          status: 400,
          data: {
            title: 'Invalid Resource',
            detail: 'Please provide a valid email address',
          },
        },
      });

      const contact = createMockContact({ email: 'invalid-email' });
      const result = await service.addToAudience('audience-123', [contact]);

      expect(result.failed).toBe(1);
      expect(result.errors[0].error).toContain('valid email');
    });

    it('handles audience not found error', async () => {
      mockAxiosInstance.post.mockRejectedValue({
        response: {
          status: 404,
          data: {
            title: 'Resource Not Found',
          },
        },
      });

      const contact = createMockContact();

      await expect(service.addToAudience('non-existent', [contact])).rejects.toThrow(
        'Resource Not Found'
      );
    });

    it('handles server errors', async () => {
      mockAxiosInstance.post.mockRejectedValue({
        response: {
          status: 500,
          data: {
            title: 'Internal Server Error',
          },
        },
      });

      const contact = createMockContact();

      await expect(service.addToAudience('audience-123', [contact])).rejects.toThrow();
    });
  });

  describe('getAudiences', () => {
    it('returns list of audiences', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          lists: [
            { id: 'list-1', name: 'Main List', stats: { member_count: 1000 } },
            { id: 'list-2', name: 'Newsletter', stats: { member_count: 500 } },
          ],
        },
      });

      const audiences = await service.getAudiences();

      expect(audiences).toHaveLength(2);
      expect(audiences[0].id).toBe('list-1');
      expect(audiences[0].memberCount).toBe(1000);
    });
  });

  describe('syncContacts', () => {
    it('syncs contacts with full flow', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { id: 'member', status: 'subscribed' },
      });

      const contacts = [
        createMockContact({ email: 'new@example.com' }),
        createMockContact({ email: 'existing@example.com' }),
      ];

      const result = await service.syncContacts({
        audienceId: 'audience-123',
        contacts,
        fieldMapping: {
          firstName: 'FNAME',
          lastName: 'LNAME',
        },
      });

      expect(result.created + result.updated + result.skipped + result.failed).toBe(2);
    });
  });

  describe('batch operations', () => {
    it('uses batch API for large lists', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: {
          id: 'batch-123',
          status: 'pending',
        },
      });

      const contacts = Array.from({ length: 100 }, (_, i) =>
        createMockContact({ email: `user${i}@example.com` })
      );

      await service.addToAudience('audience-123', contacts, { useBatch: true });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/batches',
        expect.objectContaining({
          operations: expect.any(Array),
        })
      );
    });
  });

  describe('singleton instance', () => {
    it('exports singleton instance', () => {
      expect(mailchimpService).toBeDefined();
      expect(mailchimpService).toBeInstanceOf(MailchimpService);
    });
  });
});
