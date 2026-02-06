/**
 * Tests for sync_to_platform tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { AuthorizationError } from '../../../../src/utils/errors.js';

// Mock the platform-sync module completely
vi.mock('../../../../src/services/platform-sync/index.js', () => ({
  syncToPlatform: vi.fn(),
  isPlatformSupported: vi.fn(),
  mailchimpProvider: { testConnection: vi.fn(), syncRecords: vi.fn() },
  hubspotProvider: { testConnection: vi.fn(), syncRecords: vi.fn() },
  zapierProvider: { testConnection: vi.fn(), syncRecords: vi.fn() },
}));

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    deliveryConfig: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    usageRecord: {
      create: vi.fn(),
    },
  },
}));

// Import after mocks
import { executeSyncToPlatform } from '../../../../src/tools/platforms/sync-to-platform.js';
import { syncToPlatform, isPlatformSupported } from '../../../../src/services/platform-sync/index.js';
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

// Create mock platform connection
function createMockConnection(platform: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'connection-123',
    tenantId: 'test-tenant-id',
    name: 'Test Connection',
    method: 'WEBHOOK',
    printApiSettings: {
      platform,
      credentials: {
        type: platform,
        apiKey: 'test-api-key',
        server: 'us1',
        webhookUrl: 'https://hooks.zapier.com/test',
        accessToken: 'test-token',
      },
      defaultSettings: {},
    },
    isActive: true,
    ...overrides,
  };
}

// Create mock records
function createMockRecords(count: number = 3) {
  return Array.from({ length: count }, (_, i) => ({
    firstName: `First${i + 1}`,
    lastName: `Last${i + 1}`,
    email: `user${i + 1}@example.com`,
    addressLine1: `${100 + i} Main Street`,
    city: 'Phoenix',
    state: 'AZ',
    zip: `8500${i + 1}`,
  }));
}

describe('sync_to_platform tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock responses
    vi.mocked(isPlatformSupported).mockReturnValue(true);
    vi.mocked(syncToPlatform).mockResolvedValue({
      success: true,
      platform: 'mailchimp',
      created: 2,
      updated: 1,
      skipped: 0,
      errors: [],
    });

    vi.mocked(prisma.deliveryConfig.findFirst).mockResolvedValue(
      createMockConnection('mailchimp') as any
    );
    vi.mocked(prisma.usageRecord.create).mockResolvedValue({
      id: 'usage-123',
    } as any);
  });

  describe('Mailchimp sync', () => {
    it('syncs to Mailchimp', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        connection_id: 'connection-123',
        records: createMockRecords(),
      };

      const result = await executeSyncToPlatform(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.platform).toBe('mailchimp');
      expect(syncToPlatform).toHaveBeenCalled();
    });

    it('uses configured audience ID', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        connection_id: 'connection-123',
        records: createMockRecords(),
        audience_id: 'specific-audience-456',
      };

      vi.mocked(prisma.deliveryConfig.findFirst).mockResolvedValue(
        createMockConnection('mailchimp') as any
      );

      await executeSyncToPlatform(input, context);

      expect(syncToPlatform).toHaveBeenCalledWith(
        'mailchimp',
        expect.any(Object),
        expect.any(Array),
        expect.objectContaining({
          audienceId: 'specific-audience-456',
        })
      );
    });
  });

  describe('HubSpot sync', () => {
    it('syncs to HubSpot', async () => {
      const context = createTestContext();
      const input = {
        platform: 'hubspot',
        connection_id: 'connection-123',
        records: createMockRecords(),
      };

      vi.mocked(prisma.deliveryConfig.findFirst).mockResolvedValue(
        createMockConnection('hubspot') as any
      );
      vi.mocked(syncToPlatform).mockResolvedValue({
        success: true,
        platform: 'hubspot',
        created: 2,
        updated: 1,
        skipped: 0,
        errors: [],
      });

      const result = await executeSyncToPlatform(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.platform).toBe('hubspot');
      expect(syncToPlatform).toHaveBeenCalled();
    });

    it('handles HubSpot contact creation and updates', async () => {
      const context = createTestContext();
      const input = {
        platform: 'hubspot',
        connection_id: 'connection-123',
        records: createMockRecords(10),
      };

      vi.mocked(prisma.deliveryConfig.findFirst).mockResolvedValue(
        createMockConnection('hubspot') as any
      );
      vi.mocked(syncToPlatform).mockResolvedValue({
        success: true,
        platform: 'hubspot',
        created: 5,
        updated: 3,
        skipped: 1,
        errors: [],
      });

      const result = await executeSyncToPlatform(input, context);

      expect(result.data?.created).toBe(5);
      expect(result.data?.updated).toBe(3);
      expect(result.data?.skipped).toBe(1);
    });
  });

  describe('Zapier webhook sync', () => {
    it('syncs to Zapier webhook', async () => {
      const context = createTestContext();
      const input = {
        platform: 'zapier',
        connection_id: 'connection-123',
        records: createMockRecords(),
      };

      vi.mocked(prisma.deliveryConfig.findFirst).mockResolvedValue(
        createMockConnection('zapier') as any
      );
      vi.mocked(syncToPlatform).mockResolvedValue({
        success: true,
        platform: 'zapier',
        created: 3,
        updated: 0,
        skipped: 0,
        errors: [],
      });

      const result = await executeSyncToPlatform(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.platform).toBe('zapier');
    });
  });

  describe('field mapping', () => {
    it('handles custom field mapping', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        connection_id: 'connection-123',
        records: createMockRecords(),
        field_mapping: {
          firstName: 'FIRST',
          lastName: 'LAST',
        },
      };

      await executeSyncToPlatform(input, context);

      expect(syncToPlatform).toHaveBeenCalledWith(
        'mailchimp',
        expect.any(Object),
        expect.any(Array),
        expect.objectContaining({
          fieldMapping: expect.objectContaining({
            firstName: 'FIRST',
          }),
        })
      );
    });
  });

  describe('sync counts', () => {
    it('reports created/updated/skipped counts', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        connection_id: 'connection-123',
        records: createMockRecords(18),
      };

      vi.mocked(syncToPlatform).mockResolvedValue({
        success: true,
        platform: 'mailchimp',
        created: 10,
        updated: 5,
        skipped: 2,
        errors: [{ email: 'bad@example.com', errorCode: 'INVALID', message: 'Invalid email' }],
      });

      const result = await executeSyncToPlatform(input, context);

      expect(result.data?.created).toBe(10);
      expect(result.data?.updated).toBe(5);
      expect(result.data?.skipped).toBe(2);
    });

    it('includes error details', async () => {
      const context = createTestContext();
      const input = {
        platform: 'hubspot',
        connection_id: 'connection-123',
        records: createMockRecords(10),
      };

      vi.mocked(prisma.deliveryConfig.findFirst).mockResolvedValue(
        createMockConnection('hubspot') as any
      );
      vi.mocked(syncToPlatform).mockResolvedValue({
        success: true,
        platform: 'hubspot',
        created: 8,
        updated: 0,
        skipped: 0,
        errors: [
          { email: 'user1@example.com', errorCode: 'DUPLICATE', message: 'Duplicate contact' },
          { email: 'user2@example.com', errorCode: 'INVALID', message: 'Invalid email format' },
        ],
      });

      const result = await executeSyncToPlatform(input, context);

      expect(result.data?.errors).toHaveLength(2);
      expect(result.data?.errors[0].email).toBe('user1@example.com');
    });
  });

  describe('sync errors', () => {
    it('handles Mailchimp sync errors', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        connection_id: 'connection-123',
        records: createMockRecords(),
      };

      vi.mocked(syncToPlatform).mockRejectedValue(
        new Error('Mailchimp API rate limit exceeded')
      );

      const result = await executeSyncToPlatform(input, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Mailchimp API rate limit exceeded');
    });

    it('handles HubSpot sync errors', async () => {
      const context = createTestContext();
      const input = {
        platform: 'hubspot',
        connection_id: 'connection-123',
        records: createMockRecords(),
      };

      vi.mocked(prisma.deliveryConfig.findFirst).mockResolvedValue(
        createMockConnection('hubspot') as any
      );
      vi.mocked(syncToPlatform).mockRejectedValue(
        new Error('HubSpot authentication failed')
      );

      const result = await executeSyncToPlatform(input, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('HubSpot authentication failed');
    });
  });

  describe('connection validation', () => {
    it('returns error when connection not found', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        connection_id: 'non-existent',
        records: createMockRecords(),
      };

      vi.mocked(prisma.deliveryConfig.findFirst).mockResolvedValue(null);

      const result = await executeSyncToPlatform(input, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns error when platform mismatch', async () => {
      const context = createTestContext();
      const input = {
        platform: 'hubspot',
        connection_id: 'connection-123',
        records: createMockRecords(),
      };

      // Connection is for mailchimp, but input requests hubspot
      vi.mocked(prisma.deliveryConfig.findFirst).mockResolvedValue(
        createMockConnection('mailchimp') as any
      );

      const result = await executeSyncToPlatform(input, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('mailchimp');
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing platform:sync permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {
        platform: 'mailchimp',
        connection_id: 'connection-123',
        records: createMockRecords(),
      };

      await expect(executeSyncToPlatform(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with platform:sync permission', async () => {
      const context = createTestContext({
        permissions: ['platform:sync'],
      });
      const input = {
        platform: 'mailchimp',
        connection_id: 'connection-123',
        records: createMockRecords(),
      };

      const result = await executeSyncToPlatform(input, context);
      expect(result.success).toBe(true);
    });
  });

  describe('input validation', () => {
    it('requires records array', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        connection_id: 'connection-123',
      };

      await expect(executeSyncToPlatform(input, context)).rejects.toThrow();
    });

    it('requires at least one record', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        connection_id: 'connection-123',
        records: [],
      };

      await expect(executeSyncToPlatform(input, context)).rejects.toThrow();
    });

    it('validates platform', async () => {
      const context = createTestContext();
      const input = {
        platform: 'invalid_platform',
        connection_id: 'connection-123',
        records: createMockRecords(),
      };

      await expect(executeSyncToPlatform(input, context)).rejects.toThrow();
    });
  });

  describe('duplicate handling', () => {
    it('supports update duplicate handling', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        connection_id: 'connection-123',
        records: createMockRecords(),
        duplicate_handling: 'update' as const,
      };

      await executeSyncToPlatform(input, context);

      expect(syncToPlatform).toHaveBeenCalledWith(
        'mailchimp',
        expect.any(Object),
        expect.any(Array),
        expect.objectContaining({
          duplicateHandling: 'update',
        })
      );
    });

    it('supports skip duplicate handling', async () => {
      const context = createTestContext();
      const input = {
        platform: 'hubspot',
        connection_id: 'connection-123',
        records: createMockRecords(),
        duplicate_handling: 'skip' as const,
      };

      vi.mocked(prisma.deliveryConfig.findFirst).mockResolvedValue(
        createMockConnection('hubspot') as any
      );

      await executeSyncToPlatform(input, context);

      expect(syncToPlatform).toHaveBeenCalledWith(
        'hubspot',
        expect.any(Object),
        expect.any(Array),
        expect.objectContaining({
          duplicateHandling: 'skip',
        })
      );
    });
  });

  describe('tags', () => {
    it('supports adding tags to synced records', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        connection_id: 'connection-123',
        records: createMockRecords(),
        tags: ['new-homeowner', 'q1-2026'],
      };

      await executeSyncToPlatform(input, context);

      expect(syncToPlatform).toHaveBeenCalledWith(
        'mailchimp',
        expect.any(Object),
        expect.any(Array),
        expect.objectContaining({
          tags: ['new-homeowner', 'q1-2026'],
        })
      );
    });
  });
});
