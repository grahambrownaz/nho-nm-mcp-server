/**
 * Tests for configure_platform_connection tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeConfigurePlatformConnection } from '../../../../src/tools/platforms/configure-platform-connection.js';
import { mailchimpService } from '../../../../src/services/platform-sync/mailchimp.js';
import { hubspotService } from '../../../../src/services/platform-sync/hubspot.js';
import { zapierService } from '../../../../src/services/platform-sync/zapier.js';
import { prisma } from '../../../../src/db/client.js';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { ValidationError, AuthorizationError } from '../../../../src/utils/errors.js';

// Mock platform services
vi.mock('../../../../src/services/platform-sync/mailchimp.js', () => ({
  mailchimpService: {
    testConnection: vi.fn(),
    getAudiences: vi.fn(),
  },
}));

vi.mock('../../../../src/services/platform-sync/hubspot.js', () => ({
  hubspotService: {
    testConnection: vi.fn(),
    getContactProperties: vi.fn(),
  },
}));

vi.mock('../../../../src/services/platform-sync/zapier.js', () => ({
  zapierService: {
    testWebhook: vi.fn(),
  },
}));

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    platformConnection: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

// Mock crypto for encryption
vi.mock('crypto', () => ({
  createCipheriv: vi.fn(() => ({
    update: vi.fn(() => Buffer.from('encrypted-part1')),
    final: vi.fn(() => Buffer.from('encrypted-part2')),
    getAuthTag: vi.fn(() => Buffer.from('auth-tag')),
  })),
  randomBytes: vi.fn(() => Buffer.from('0123456789abcdef')),
  scryptSync: vi.fn(() => Buffer.from('derived-key-32-bytes-long-here!')),
}));

// Mock Decimal type
function mockDecimal(value: number) {
  return {
    toNumber: () => value,
    toString: () => String(value),
    valueOf: () => value,
  } as any;
}

// Create a valid tenant context for tests
function createTestContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenant: {
      id: 'test-tenant-id',
      name: 'Test Tenant',
      email: 'test@example.com',
      company: 'Test Company',
      phone: null,
      status: 'ACTIVE',
      stripeCustomerId: 'cus_test_123',
      parentTenantId: null,
      isReseller: false,
      wholesalePricing: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    apiKey: {
      id: 'test-api-key-id',
      key: 'test-key',
      name: 'Test Key',
      tenantId: 'test-tenant-id',
      permissions: ['*'],
      isActive: true,
      lastUsedAt: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    subscription: {
      id: 'test-subscription-id',
      tenantId: 'test-tenant-id',
      plan: 'PROFESSIONAL',
      status: 'ACTIVE',
      monthlyRecordLimit: 10000,
      monthlyEmailAppends: 5000,
      monthlyPhoneAppends: 5000,
      allowedDatabases: ['NHO', 'NEW_MOVER'],
      allowedGeographies: null,
      allowedStates: [],
      allowedZipCodes: [],
      pricePerRecord: mockDecimal(0.05),
      priceEmailAppend: mockDecimal(0.02),
      pricePhoneAppend: mockDecimal(0.03),
      pricePdfGeneration: mockDecimal(0.10),
      pricePrintPerPiece: mockDecimal(0.65),
      billingCycleStart: new Date(),
      billingCycleEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    permissions: ['*'],
    ...overrides,
  };
}

describe('configure_platform_connection tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock responses
    vi.mocked(mailchimpService.testConnection).mockResolvedValue(true);
    vi.mocked(mailchimpService.getAudiences).mockResolvedValue([
      { id: 'audience-123', name: 'Main List', memberCount: 1500 },
    ]);
    vi.mocked(hubspotService.testConnection).mockResolvedValue(true);
    vi.mocked(hubspotService.getContactProperties).mockResolvedValue([
      { name: 'email', label: 'Email', type: 'string' },
      { name: 'firstname', label: 'First Name', type: 'string' },
    ]);
    vi.mocked(zapierService.testWebhook).mockResolvedValue(true);

    vi.mocked(prisma.platformConnection.create).mockResolvedValue({
      id: 'connection-123',
      tenantId: 'test-tenant-id',
      platform: 'MAILCHIMP',
      status: 'ACTIVE',
    } as any);
    vi.mocked(prisma.platformConnection.update).mockResolvedValue({
      id: 'connection-123',
      status: 'ACTIVE',
    } as any);
    vi.mocked(prisma.platformConnection.findFirst).mockResolvedValue(null);
  });

  describe('Mailchimp connection', () => {
    it('configures Mailchimp connection', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        credentials: {
          api_key: 'mc-api-key-us1',
          server_prefix: 'us1',
        },
        settings: {
          audience_id: 'audience-123',
        },
      };

      const result = await executeConfigurePlatformConnection(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.platform).toBe('mailchimp');
      expect(result.data?.status).toBe('ACTIVE');
    });

    it('validates Mailchimp credentials on save', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        credentials: {
          api_key: 'mc-api-key-us1',
          server_prefix: 'us1',
        },
      };

      await executeConfigurePlatformConnection(input, context);

      expect(mailchimpService.testConnection).toHaveBeenCalledWith({
        apiKey: 'mc-api-key-us1',
        serverPrefix: 'us1',
      });
    });

    it('rejects invalid Mailchimp credentials', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        credentials: {
          api_key: 'invalid-key',
          server_prefix: 'us1',
        },
      };

      vi.mocked(mailchimpService.testConnection).mockResolvedValue(false);

      await expect(executeConfigurePlatformConnection(input, context)).rejects.toThrow();
    });

    it('fetches available audiences on configuration', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        credentials: {
          api_key: 'mc-api-key-us1',
          server_prefix: 'us1',
        },
      };

      const result = await executeConfigurePlatformConnection(input, context);

      expect(mailchimpService.getAudiences).toHaveBeenCalled();
      expect(result.data?.available_audiences).toBeDefined();
    });
  });

  describe('HubSpot connection', () => {
    it('configures HubSpot connection', async () => {
      const context = createTestContext();
      const input = {
        platform: 'hubspot',
        credentials: {
          api_key: 'pat-na1-xxxxx',
        },
        settings: {
          create_contacts: true,
          update_existing: true,
        },
      };

      const result = await executeConfigurePlatformConnection(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.platform).toBe('hubspot');
    });

    it('validates HubSpot credentials on save', async () => {
      const context = createTestContext();
      const input = {
        platform: 'hubspot',
        credentials: {
          api_key: 'pat-na1-xxxxx',
        },
      };

      await executeConfigurePlatformConnection(input, context);

      expect(hubspotService.testConnection).toHaveBeenCalledWith({
        apiKey: 'pat-na1-xxxxx',
      });
    });

    it('rejects invalid HubSpot credentials', async () => {
      const context = createTestContext();
      const input = {
        platform: 'hubspot',
        credentials: {
          api_key: 'invalid-key',
        },
      };

      vi.mocked(hubspotService.testConnection).mockResolvedValue(false);

      await expect(executeConfigurePlatformConnection(input, context)).rejects.toThrow();
    });

    it('fetches HubSpot contact properties', async () => {
      const context = createTestContext();
      const input = {
        platform: 'hubspot',
        credentials: {
          api_key: 'pat-na1-xxxxx',
        },
      };

      const result = await executeConfigurePlatformConnection(input, context);

      expect(hubspotService.getContactProperties).toHaveBeenCalled();
      expect(result.data?.available_properties).toBeDefined();
    });
  });

  describe('Zapier webhook', () => {
    it('configures Zapier webhook', async () => {
      const context = createTestContext();
      const input = {
        platform: 'zapier',
        credentials: {
          webhook_url: 'https://hooks.zapier.com/hooks/catch/123456/abcdef/',
        },
      };

      const result = await executeConfigurePlatformConnection(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.platform).toBe('zapier');
    });

    it('validates Zapier webhook URL', async () => {
      const context = createTestContext();
      const input = {
        platform: 'zapier',
        credentials: {
          webhook_url: 'https://hooks.zapier.com/hooks/catch/123456/abcdef/',
        },
      };

      await executeConfigurePlatformConnection(input, context);

      expect(zapierService.testWebhook).toHaveBeenCalledWith(
        'https://hooks.zapier.com/hooks/catch/123456/abcdef/'
      );
    });

    it('rejects invalid webhook URL', async () => {
      const context = createTestContext();
      const input = {
        platform: 'zapier',
        credentials: {
          webhook_url: 'not-a-valid-url',
        },
      };

      await expect(executeConfigurePlatformConnection(input, context)).rejects.toThrow();
    });

    it('tests webhook connectivity', async () => {
      const context = createTestContext();
      const input = {
        platform: 'zapier',
        credentials: {
          webhook_url: 'https://hooks.zapier.com/hooks/catch/123456/abcdef/',
        },
      };

      vi.mocked(zapierService.testWebhook).mockResolvedValue(false);

      await expect(executeConfigurePlatformConnection(input, context)).rejects.toThrow();
    });
  });

  describe('credential encryption', () => {
    it('encrypts credentials before storage', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        credentials: {
          api_key: 'secret-api-key',
          server_prefix: 'us1',
        },
      };

      await executeConfigurePlatformConnection(input, context);

      expect(prisma.platformConnection.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          encryptedCredentials: expect.any(String),
        }),
      });

      // Verify the credentials are not stored in plain text
      const createCall = vi.mocked(prisma.platformConnection.create).mock.calls[0];
      expect(createCall[0].data.encryptedCredentials).not.toContain('secret-api-key');
    });

    it('does not store plain text credentials', async () => {
      const context = createTestContext();
      const input = {
        platform: 'hubspot',
        credentials: {
          api_key: 'pat-na1-super-secret',
        },
      };

      await executeConfigurePlatformConnection(input, context);

      const createCall = vi.mocked(prisma.platformConnection.create).mock.calls[0];
      expect(JSON.stringify(createCall[0].data)).not.toContain('pat-na1-super-secret');
    });
  });

  describe('field mapping', () => {
    it('allows custom field mapping for Mailchimp', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        credentials: {
          api_key: 'mc-api-key-us1',
          server_prefix: 'us1',
        },
        field_mapping: {
          firstName: 'FNAME',
          lastName: 'LNAME',
          address: 'ADDRESS',
          city: 'CITY',
          state: 'STATE',
          zip: 'ZIP',
        },
      };

      const result = await executeConfigurePlatformConnection(input, context);

      expect(result.success).toBe(true);
      expect(prisma.platformConnection.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fieldMapping: expect.objectContaining({
            firstName: 'FNAME',
          }),
        }),
      });
    });

    it('allows custom field mapping for HubSpot', async () => {
      const context = createTestContext();
      const input = {
        platform: 'hubspot',
        credentials: {
          api_key: 'pat-na1-xxxxx',
        },
        field_mapping: {
          firstName: 'firstname',
          lastName: 'lastname',
          address: 'address',
          email: 'email',
        },
      };

      const result = await executeConfigurePlatformConnection(input, context);

      expect(result.success).toBe(true);
    });
  });

  describe('update existing connection', () => {
    it('updates existing connection', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        credentials: {
          api_key: 'new-api-key-us1',
          server_prefix: 'us1',
        },
      };

      vi.mocked(prisma.platformConnection.findFirst).mockResolvedValue({
        id: 'existing-connection-123',
        tenantId: 'test-tenant-id',
        platform: 'MAILCHIMP',
      } as any);

      const result = await executeConfigurePlatformConnection(input, context);

      expect(prisma.platformConnection.update).toHaveBeenCalledWith({
        where: { id: 'existing-connection-123' },
        data: expect.objectContaining({
          encryptedCredentials: expect.any(String),
        }),
      });
    });
  });

  describe('input validation', () => {
    it('throws ValidationError for invalid platform', async () => {
      const context = createTestContext();
      const input = {
        platform: 'invalid_platform',
        credentials: {},
      };

      await expect(executeConfigurePlatformConnection(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for missing credentials', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        credentials: {},
      };

      await expect(executeConfigurePlatformConnection(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for missing Mailchimp server prefix', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        credentials: {
          api_key: 'mc-api-key',
        },
      };

      await expect(executeConfigurePlatformConnection(input, context)).rejects.toThrow();
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing platform:write permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {
        platform: 'mailchimp',
        credentials: {
          api_key: 'mc-api-key-us1',
          server_prefix: 'us1',
        },
      };

      await expect(executeConfigurePlatformConnection(input, context)).rejects.toThrow(
        AuthorizationError
      );
    });

    it('allows access with platform:write permission', async () => {
      const context = createTestContext({
        permissions: ['platform:write'],
      });
      const input = {
        platform: 'mailchimp',
        credentials: {
          api_key: 'mc-api-key-us1',
          server_prefix: 'us1',
        },
      };

      const result = await executeConfigurePlatformConnection(input, context);
      expect(result.success).toBe(true);
    });
  });

  describe('connection status', () => {
    it('sets status to ACTIVE on successful validation', async () => {
      const context = createTestContext();
      const input = {
        platform: 'hubspot',
        credentials: {
          api_key: 'valid-key',
        },
      };

      await executeConfigurePlatformConnection(input, context);

      expect(prisma.platformConnection.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'ACTIVE',
        }),
      });
    });

    it('allows disabling connection', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        credentials: {
          api_key: 'mc-api-key-us1',
          server_prefix: 'us1',
        },
        enabled: false,
      };

      vi.mocked(prisma.platformConnection.findFirst).mockResolvedValue({
        id: 'existing-123',
        tenantId: 'test-tenant-id',
        platform: 'MAILCHIMP',
      } as any);

      await executeConfigurePlatformConnection(input, context);

      expect(prisma.platformConnection.update).toHaveBeenCalledWith({
        where: { id: 'existing-123' },
        data: expect.objectContaining({
          status: 'DISABLED',
        }),
      });
    });
  });

  describe('error handling', () => {
    it('handles API errors gracefully', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        credentials: {
          api_key: 'mc-api-key-us1',
          server_prefix: 'us1',
        },
      };

      vi.mocked(mailchimpService.testConnection).mockRejectedValue(
        new Error('Mailchimp API error')
      );

      await expect(executeConfigurePlatformConnection(input, context)).rejects.toThrow(
        'Mailchimp API error'
      );
    });

    it('handles database errors gracefully', async () => {
      const context = createTestContext();
      const input = {
        platform: 'hubspot',
        credentials: {
          api_key: 'valid-key',
        },
      };

      vi.mocked(prisma.platformConnection.create).mockRejectedValue(
        new Error('Database error')
      );

      await expect(executeConfigurePlatformConnection(input, context)).rejects.toThrow(
        'Database error'
      );
    });
  });
});
