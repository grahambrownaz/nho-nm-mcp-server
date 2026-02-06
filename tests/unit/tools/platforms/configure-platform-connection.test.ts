/**
 * Tests for configure_platform_connection tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { AuthorizationError } from '../../../../src/utils/errors.js';

// Mock the platform-sync module completely
vi.mock('../../../../src/services/platform-sync/index.js', () => ({
  testPlatformConnection: vi.fn(),
  isPlatformSupported: vi.fn(),
  mailchimpProvider: { testConnection: vi.fn(), syncRecords: vi.fn() },
  hubspotProvider: { testConnection: vi.fn(), syncRecords: vi.fn() },
  zapierProvider: { testConnection: vi.fn(), syncRecords: vi.fn() },
}));

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    deliveryConfig: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

// Import after mocks
import { executeConfigurePlatformConnection } from '../../../../src/tools/platforms/configure-platform-connection.js';
import { testPlatformConnection, isPlatformSupported } from '../../../../src/services/platform-sync/index.js';
import { prisma } from '../../../../src/db/client.js';

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
    vi.mocked(isPlatformSupported).mockReturnValue(true);
    vi.mocked(testPlatformConnection).mockResolvedValue({
      success: true,
      message: 'Connection successful',
    });

    vi.mocked(prisma.deliveryConfig.create).mockResolvedValue({
      id: 'connection-123',
      tenantId: 'test-tenant-id',
      name: 'Test Connection',
      method: 'WEBHOOK',
      isActive: true,
    } as any);
    vi.mocked(prisma.deliveryConfig.update).mockResolvedValue({
      id: 'connection-123',
      name: 'Updated Connection',
    } as any);
    vi.mocked(prisma.deliveryConfig.findFirst).mockResolvedValue(null);
  });

  describe('Mailchimp connection', () => {
    it('configures Mailchimp connection', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        connection_name: 'My Mailchimp',
        credentials: {
          type: 'mailchimp',
          apiKey: 'mc-api-key-us1',
          server: 'us1',
        },
      };

      const result = await executeConfigurePlatformConnection(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.platform).toBe('mailchimp');
      expect(result.data?.connection_name).toBe('My Mailchimp');
    });

    it('validates Mailchimp credentials on save', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        connection_name: 'My Mailchimp',
        credentials: {
          type: 'mailchimp',
          apiKey: 'mc-api-key-us1',
          server: 'us1',
        },
      };

      await executeConfigurePlatformConnection(input, context);

      expect(testPlatformConnection).toHaveBeenCalledWith(
        'mailchimp',
        expect.objectContaining({
          type: 'mailchimp',
          apiKey: 'mc-api-key-us1',
        })
      );
    });

    it('rejects invalid Mailchimp credentials', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        connection_name: 'My Mailchimp',
        credentials: {
          type: 'mailchimp',
          apiKey: 'invalid-key',
          server: 'us1',
        },
      };

      vi.mocked(testPlatformConnection).mockResolvedValue({
        success: false,
        message: 'Invalid API key',
      });

      const result = await executeConfigurePlatformConnection(input, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection test failed');
    });
  });

  describe('HubSpot connection', () => {
    it('configures HubSpot connection', async () => {
      const context = createTestContext();
      const input = {
        platform: 'hubspot',
        connection_name: 'My HubSpot',
        credentials: {
          type: 'hubspot',
          accessToken: 'pat-na1-xxxxx',
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
        connection_name: 'My HubSpot',
        credentials: {
          type: 'hubspot',
          accessToken: 'pat-na1-xxxxx',
        },
      };

      await executeConfigurePlatformConnection(input, context);

      expect(testPlatformConnection).toHaveBeenCalledWith(
        'hubspot',
        expect.objectContaining({
          type: 'hubspot',
          accessToken: 'pat-na1-xxxxx',
        })
      );
    });

    it('rejects invalid HubSpot credentials', async () => {
      const context = createTestContext();
      const input = {
        platform: 'hubspot',
        connection_name: 'My HubSpot',
        credentials: {
          type: 'hubspot',
          accessToken: 'invalid-key',
        },
      };

      vi.mocked(testPlatformConnection).mockResolvedValue({
        success: false,
        message: 'Invalid access token',
      });

      const result = await executeConfigurePlatformConnection(input, context);

      expect(result.success).toBe(false);
    });
  });

  describe('Zapier webhook', () => {
    it('configures Zapier webhook', async () => {
      const context = createTestContext();
      const input = {
        platform: 'zapier',
        connection_name: 'My Zapier',
        credentials: {
          type: 'zapier',
          webhookUrl: 'https://hooks.zapier.com/hooks/catch/123456/abcdef/',
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
        connection_name: 'My Zapier',
        credentials: {
          type: 'zapier',
          webhookUrl: 'https://hooks.zapier.com/hooks/catch/123456/abcdef/',
        },
      };

      await executeConfigurePlatformConnection(input, context);

      expect(testPlatformConnection).toHaveBeenCalledWith(
        'zapier',
        expect.objectContaining({
          webhookUrl: 'https://hooks.zapier.com/hooks/catch/123456/abcdef/',
        })
      );
    });

    it('rejects invalid webhook URL', async () => {
      const context = createTestContext();
      const input = {
        platform: 'zapier',
        connection_name: 'My Zapier',
        credentials: {
          type: 'zapier',
          webhookUrl: 'not-a-valid-url',
        },
      };

      await expect(executeConfigurePlatformConnection(input, context)).rejects.toThrow();
    });
  });

  describe('update existing connection', () => {
    it('updates existing connection', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        connection_name: 'My Mailchimp',
        credentials: {
          type: 'mailchimp',
          apiKey: 'new-api-key-us1',
          server: 'us1',
        },
      };

      vi.mocked(prisma.deliveryConfig.findFirst).mockResolvedValue({
        id: 'existing-connection-123',
        tenantId: 'test-tenant-id',
        name: 'My Mailchimp',
        method: 'WEBHOOK',
      } as any);

      const result = await executeConfigurePlatformConnection(input, context);

      expect(prisma.deliveryConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'existing-connection-123' },
        })
      );
      expect(result.success).toBe(true);
    });
  });

  describe('input validation', () => {
    it('throws ValidationError for invalid platform', async () => {
      const context = createTestContext();
      const input = {
        platform: 'invalid_platform',
        connection_name: 'Test',
        credentials: {
          type: 'invalid_platform',
        },
      };

      await expect(executeConfigurePlatformConnection(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for missing connection_name', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        credentials: {
          type: 'mailchimp',
          apiKey: 'key',
          server: 'us1',
        },
      };

      await expect(executeConfigurePlatformConnection(input, context)).rejects.toThrow();
    });

    it('throws error when credentials type does not match platform', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        connection_name: 'Test',
        credentials: {
          type: 'hubspot',
          accessToken: 'token',
        },
      };

      const result = await executeConfigurePlatformConnection(input, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain("doesn't match");
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing platform:configure permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {
        platform: 'mailchimp',
        connection_name: 'Test',
        credentials: {
          type: 'mailchimp',
          apiKey: 'mc-api-key-us1',
          server: 'us1',
        },
      };

      await expect(executeConfigurePlatformConnection(input, context)).rejects.toThrow(
        AuthorizationError
      );
    });

    it('allows access with platform:configure permission', async () => {
      const context = createTestContext({
        permissions: ['platform:configure'],
      });
      const input = {
        platform: 'mailchimp',
        connection_name: 'Test',
        credentials: {
          type: 'mailchimp',
          apiKey: 'mc-api-key-us1',
          server: 'us1',
        },
      };

      const result = await executeConfigurePlatformConnection(input, context);
      expect(result.success).toBe(true);
    });
  });

  describe('test skip option', () => {
    it('skips connection test when test=false', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        connection_name: 'Test',
        credentials: {
          type: 'mailchimp',
          apiKey: 'mc-api-key-us1',
          server: 'us1',
        },
        test: false,
      };

      await executeConfigurePlatformConnection(input, context);

      expect(testPlatformConnection).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('handles API errors gracefully', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        connection_name: 'Test',
        credentials: {
          type: 'mailchimp',
          apiKey: 'mc-api-key-us1',
          server: 'us1',
        },
      };

      vi.mocked(testPlatformConnection).mockRejectedValue(
        new Error('API error')
      );

      await expect(executeConfigurePlatformConnection(input, context)).rejects.toThrow(
        'API error'
      );
    });

    it('handles database errors gracefully', async () => {
      const context = createTestContext();
      const input = {
        platform: 'hubspot',
        connection_name: 'Test',
        credentials: {
          type: 'hubspot',
          accessToken: 'valid-key',
        },
      };

      vi.mocked(prisma.deliveryConfig.create).mockRejectedValue(
        new Error('Database error')
      );

      const result = await executeConfigurePlatformConnection(input, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database error');
    });
  });
});
