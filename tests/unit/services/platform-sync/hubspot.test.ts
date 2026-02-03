/**
 * Tests for HubSpot Platform Sync Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import {
  HubSpotService,
  hubspotService,
} from '../../../../src/services/platform-sync/hubspot.js';

// Mock axios
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
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
    company: 'Acme Corp',
    ...overrides,
  };
}

describe('HubSpot Service', () => {
  let service: HubSpotService;
  let mockAxiosInstance: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockAxiosInstance = {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };

    vi.mocked(axios.create).mockReturnValue(mockAxiosInstance as any);

    service = new HubSpotService({
      apiKey: 'pat-na1-test-api-key',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('testConnection', () => {
    it('validates API key with successful request', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          portalId: 12345,
          timeZone: 'America/New_York',
        },
      });

      const result = await service.testConnection({
        apiKey: 'pat-na1-valid-key',
      });

      expect(result).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/account-info/v3/details');
    });

    it('returns false for invalid API key', async () => {
      mockAxiosInstance.get.mockRejectedValue({
        response: {
          status: 401,
          data: {
            message: 'The API key is invalid',
          },
        },
      });

      const result = await service.testConnection({
        apiKey: 'invalid-key',
      });

      expect(result).toBe(false);
    });

    it('handles network errors', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Network Error'));

      const result = await service.testConnection({
        apiKey: 'test-key',
      });

      expect(result).toBe(false);
    });
  });

  describe('createContacts', () => {
    it('creates new contacts', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: {
          id: 'contact-123',
          properties: {
            email: 'test@example.com',
            firstname: 'John',
            lastname: 'Smith',
          },
        },
      });

      const contact = createMockContact();
      const result = await service.createContacts([contact]);

      expect(result.created).toBe(1);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/crm/v3/objects/contacts',
        expect.objectContaining({
          properties: expect.objectContaining({
            email: 'test@example.com',
          }),
        })
      );
    });

    it('maps fields to HubSpot properties', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { id: 'contact-123' },
      });

      const contact = createMockContact({
        firstName: 'Jane',
        lastName: 'Doe',
        phone: '4805551234',
      });

      await service.createContacts([contact], {
        fieldMapping: {
          firstName: 'firstname',
          lastName: 'lastname',
          phone: 'phone',
          address: 'address',
          city: 'city',
          state: 'state',
          zip: 'zip',
        },
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/crm/v3/objects/contacts',
        expect.objectContaining({
          properties: expect.objectContaining({
            firstname: 'Jane',
            lastname: 'Doe',
            phone: '4805551234',
          }),
        })
      );
    });

    it('handles multiple contacts', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { id: 'contact' },
      });

      const contacts = [
        createMockContact({ email: 'user1@example.com' }),
        createMockContact({ email: 'user2@example.com' }),
        createMockContact({ email: 'user3@example.com' }),
      ];

      const result = await service.createContacts(contacts);

      expect(result.created).toBe(3);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3);
    });
  });

  describe('updateContacts', () => {
    it('updates existing contacts', async () => {
      // Search returns existing contact
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          results: [
            {
              id: 'contact-123',
              properties: { email: 'test@example.com' },
            },
          ],
        },
      });

      // Update succeeds
      mockAxiosInstance.patch.mockResolvedValue({
        data: {
          id: 'contact-123',
          properties: { firstname: 'Updated' },
        },
      });

      const contact = createMockContact({ firstName: 'Updated' });
      const result = await service.updateContacts([contact]);

      expect(result.updated).toBe(1);
      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
        '/crm/v3/objects/contacts/contact-123',
        expect.objectContaining({
          properties: expect.objectContaining({
            firstname: 'Updated',
          }),
        })
      );
    });

    it('maps fields to HubSpot properties on update', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          results: [{ id: 'contact-123' }],
        },
      });
      mockAxiosInstance.patch.mockResolvedValue({
        data: { id: 'contact-123' },
      });

      const contact = createMockContact({
        address: '789 New Address',
        city: 'Scottsdale',
      });

      await service.updateContacts([contact], {
        fieldMapping: {
          address: 'address',
          city: 'city',
        },
      });

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          properties: expect.objectContaining({
            address: '789 New Address',
            city: 'Scottsdale',
          }),
        })
      );
    });

    it('creates contact if not found for update', async () => {
      // Search returns no results
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { results: [] },
      });

      // Create succeeds
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { id: 'new-contact-123' },
      });

      const contact = createMockContact();
      const result = await service.updateContacts([contact], { createIfNotFound: true });

      expect(result.created).toBe(1);
    });
  });

  describe('HubSpot API errors', () => {
    it('handles rate limiting', async () => {
      mockAxiosInstance.post.mockRejectedValue({
        response: {
          status: 429,
          data: {
            message: 'You have reached your secondly limit',
          },
        },
      });

      const contact = createMockContact();

      await expect(service.createContacts([contact])).rejects.toThrow('rate');
    });

    it('handles duplicate contact error', async () => {
      mockAxiosInstance.post.mockRejectedValue({
        response: {
          status: 409,
          data: {
            message: 'Contact already exists',
            category: 'CONFLICT',
          },
        },
      });

      const contact = createMockContact();
      const result = await service.createContacts([contact]);

      expect(result.skipped).toBe(1);
    });

    it('handles invalid property error', async () => {
      mockAxiosInstance.post.mockRejectedValue({
        response: {
          status: 400,
          data: {
            message: 'Property values were not valid',
            errors: [
              {
                message: 'Property "invalid_prop" does not exist',
              },
            ],
          },
        },
      });

      const contact = createMockContact();
      const result = await service.createContacts([contact], {
        fieldMapping: {
          custom: 'invalid_prop',
        },
      });

      expect(result.failed).toBe(1);
      expect(result.errors[0].error).toContain('Property');
    });

    it('handles authentication errors', async () => {
      mockAxiosInstance.post.mockRejectedValue({
        response: {
          status: 401,
          data: {
            message: 'Authentication credentials were invalid',
          },
        },
      });

      const contact = createMockContact();

      await expect(service.createContacts([contact])).rejects.toThrow('Authentication');
    });

    it('handles server errors', async () => {
      mockAxiosInstance.post.mockRejectedValue({
        response: {
          status: 500,
          data: {
            message: 'Internal server error',
          },
        },
      });

      const contact = createMockContact();

      await expect(service.createContacts([contact])).rejects.toThrow();
    });
  });

  describe('getContactProperties', () => {
    it('returns available contact properties', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          results: [
            { name: 'email', label: 'Email', type: 'string' },
            { name: 'firstname', label: 'First Name', type: 'string' },
            { name: 'lastname', label: 'Last Name', type: 'string' },
            { name: 'phone', label: 'Phone Number', type: 'string' },
          ],
        },
      });

      const properties = await service.getContactProperties();

      expect(properties).toHaveLength(4);
      expect(properties[0].name).toBe('email');
      expect(properties[0].label).toBe('Email');
    });
  });

  describe('syncContacts', () => {
    it('syncs contacts with create and update', async () => {
      // Search for existing
      mockAxiosInstance.post
        .mockResolvedValueOnce({
          data: { results: [{ id: 'existing-1' }] },
        })
        .mockResolvedValueOnce({
          data: { results: [] },
        });

      // Update existing
      mockAxiosInstance.patch.mockResolvedValue({
        data: { id: 'existing-1' },
      });

      // Create new
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { id: 'new-1' },
      });

      const contacts = [
        createMockContact({ email: 'existing@example.com' }),
        createMockContact({ email: 'new@example.com' }),
      ];

      const result = await service.syncContacts({
        contacts,
        fieldMapping: {
          firstName: 'firstname',
          lastName: 'lastname',
        },
        updateExisting: true,
      });

      expect(result.created + result.updated).toBeGreaterThan(0);
    });
  });

  describe('batch operations', () => {
    it('uses batch API for large contact lists', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: {
          status: 'COMPLETE',
          results: [],
        },
      });

      const contacts = Array.from({ length: 100 }, (_, i) =>
        createMockContact({ email: `user${i}@example.com` })
      );

      await service.createContacts(contacts, { useBatch: true });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/crm/v3/objects/contacts/batch/create',
        expect.objectContaining({
          inputs: expect.any(Array),
        })
      );
    });
  });

  describe('search contacts', () => {
    it('searches contacts by email', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: {
          results: [
            {
              id: 'contact-123',
              properties: {
                email: 'test@example.com',
                firstname: 'John',
              },
            },
          ],
        },
      });

      const results = await service.searchContacts({ email: 'test@example.com' });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('contact-123');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/crm/v3/objects/contacts/search',
        expect.objectContaining({
          filterGroups: expect.any(Array),
        })
      );
    });
  });

  describe('singleton instance', () => {
    it('exports singleton instance', () => {
      expect(hubspotService).toBeDefined();
      expect(hubspotService).toBeInstanceOf(HubSpotService);
    });
  });
});
