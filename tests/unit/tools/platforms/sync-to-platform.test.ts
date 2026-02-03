/**
 * Tests for sync_to_platform tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeSyncToPlatform } from '../../../../src/tools/platforms/sync-to-platform.js';
import { mailchimpService } from '../../../../src/services/platform-sync/mailchimp.js';
import { hubspotService } from '../../../../src/services/platform-sync/hubspot.js';
import { zapierService } from '../../../../src/services/platform-sync/zapier.js';
import { prisma } from '../../../../src/db/client.js';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { ValidationError, AuthorizationError, NotFoundError } from '../../../../src/utils/errors.js';

// Mock platform services
vi.mock('../../../../src/services/platform-sync/mailchimp.js', () => ({
  mailchimpService: {
    addToAudience: vi.fn(),
    syncContacts: vi.fn(),
  },
}));

vi.mock('../../../../src/services/platform-sync/hubspot.js', () => ({
  hubspotService: {
    createContacts: vi.fn(),
    syncContacts: vi.fn(),
  },
}));

vi.mock('../../../../src/services/platform-sync/zapier.js', () => ({
  zapierService: {
    sendWebhook: vi.fn(),
    sendBatch: vi.fn(),
  },
}));

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    platformConnection: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    delivery: {
      findUnique: vi.fn(),
    },
    syncLog: {
      create: vi.fn(),
    },
  },
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

// Create mock platform connection
function createMockConnection(platform: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'connection-123',
    tenantId: 'test-tenant-id',
    platform: platform.toUpperCase(),
    status: 'ACTIVE',
    encryptedCredentials: 'encrypted-credentials',
    fieldMapping: {
      firstName: platform === 'mailchimp' ? 'FNAME' : 'firstname',
      lastName: platform === 'mailchimp' ? 'LNAME' : 'lastname',
      email: platform === 'mailchimp' ? 'EMAIL' : 'email',
      address: platform === 'mailchimp' ? 'ADDRESS' : 'address',
    },
    settings: {
      audience_id: 'audience-123',
    },
    ...overrides,
  };
}

// Create mock records
function createMockRecords(count: number = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: `record-${i + 1}`,
    firstName: `First${i + 1}`,
    lastName: `Last${i + 1}`,
    email: `user${i + 1}@example.com`,
    address: `${100 + i} Main Street`,
    city: 'Phoenix',
    state: 'AZ',
    zip: `8500${i + 1}`,
  }));
}

describe('sync_to_platform tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock responses
    vi.mocked(prisma.platformConnection.findFirst).mockResolvedValue(
      createMockConnection('mailchimp')
    );
    vi.mocked(prisma.delivery.findUnique).mockResolvedValue({
      id: 'delivery-123',
      tenantId: 'test-tenant-id',
      records: createMockRecords(),
    } as any);
    vi.mocked(prisma.syncLog.create).mockResolvedValue({
      id: 'sync-log-123',
    } as any);

    vi.mocked(mailchimpService.syncContacts).mockResolvedValue({
      created: 2,
      updated: 1,
      skipped: 0,
      failed: 0,
      errors: [],
    });
    vi.mocked(hubspotService.syncContacts).mockResolvedValue({
      created: 2,
      updated: 1,
      skipped: 0,
      failed: 0,
      errors: [],
    });
    vi.mocked(zapierService.sendBatch).mockResolvedValue({
      sent: 3,
      failed: 0,
      errors: [],
    });
  });

  describe('Mailchimp sync', () => {
    it('syncs to Mailchimp', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        delivery_id: 'delivery-123',
      };

      vi.mocked(prisma.platformConnection.findFirst).mockResolvedValue(
        createMockConnection('mailchimp')
      );

      const result = await executeSyncToPlatform(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.platform).toBe('mailchimp');
      expect(mailchimpService.syncContacts).toHaveBeenCalled();
    });

    it('uses configured audience ID', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        delivery_id: 'delivery-123',
      };

      vi.mocked(prisma.platformConnection.findFirst).mockResolvedValue(
        createMockConnection('mailchimp', {
          settings: { audience_id: 'specific-audience-456' },
        })
      );

      await executeSyncToPlatform(input, context);

      expect(mailchimpService.syncContacts).toHaveBeenCalledWith(
        expect.objectContaining({
          audienceId: 'specific-audience-456',
        })
      );
    });

    it('applies field mapping for Mailchimp', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        delivery_id: 'delivery-123',
      };

      vi.mocked(prisma.platformConnection.findFirst).mockResolvedValue(
        createMockConnection('mailchimp', {
          fieldMapping: {
            firstName: 'FNAME',
            lastName: 'LNAME',
            address: 'ADDR',
          },
        })
      );

      await executeSyncToPlatform(input, context);

      expect(mailchimpService.syncContacts).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldMapping: expect.objectContaining({
            firstName: 'FNAME',
          }),
        })
      );
    });
  });

  describe('HubSpot sync', () => {
    it('syncs to HubSpot', async () => {
      const context = createTestContext();
      const input = {
        platform: 'hubspot',
        delivery_id: 'delivery-123',
      };

      vi.mocked(prisma.platformConnection.findFirst).mockResolvedValue(
        createMockConnection('hubspot')
      );

      const result = await executeSyncToPlatform(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.platform).toBe('hubspot');
      expect(hubspotService.syncContacts).toHaveBeenCalled();
    });

    it('applies field mapping for HubSpot', async () => {
      const context = createTestContext();
      const input = {
        platform: 'hubspot',
        delivery_id: 'delivery-123',
      };

      vi.mocked(prisma.platformConnection.findFirst).mockResolvedValue(
        createMockConnection('hubspot', {
          fieldMapping: {
            firstName: 'firstname',
            lastName: 'lastname',
            phone: 'phone',
          },
        })
      );

      await executeSyncToPlatform(input, context);

      expect(hubspotService.syncContacts).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldMapping: expect.objectContaining({
            firstName: 'firstname',
          }),
        })
      );
    });

    it('handles HubSpot contact creation and updates', async () => {
      const context = createTestContext();
      const input = {
        platform: 'hubspot',
        delivery_id: 'delivery-123',
      };

      vi.mocked(prisma.platformConnection.findFirst).mockResolvedValue(
        createMockConnection('hubspot')
      );
      vi.mocked(hubspotService.syncContacts).mockResolvedValue({
        created: 5,
        updated: 3,
        skipped: 1,
        failed: 0,
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
        delivery_id: 'delivery-123',
      };

      vi.mocked(prisma.platformConnection.findFirst).mockResolvedValue(
        createMockConnection('zapier', {
          settings: {
            webhook_url: 'https://hooks.zapier.com/hooks/catch/123/abc/',
          },
        })
      );

      const result = await executeSyncToPlatform(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.platform).toBe('zapier');
      expect(zapierService.sendBatch).toHaveBeenCalled();
    });

    it('includes all record data in webhook', async () => {
      const context = createTestContext();
      const input = {
        platform: 'zapier',
        delivery_id: 'delivery-123',
      };

      const records = createMockRecords(2);
      vi.mocked(prisma.delivery.findUnique).mockResolvedValue({
        id: 'delivery-123',
        tenantId: 'test-tenant-id',
        records,
      } as any);
      vi.mocked(prisma.platformConnection.findFirst).mockResolvedValue(
        createMockConnection('zapier')
      );

      await executeSyncToPlatform(input, context);

      expect(zapierService.sendBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          records: expect.arrayContaining([
            expect.objectContaining({
              firstName: 'First1',
              lastName: 'Last1',
            }),
          ]),
        })
      );
    });
  });

  describe('field mapping', () => {
    it('handles custom field mapping', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        delivery_id: 'delivery-123',
        field_mapping: {
          firstName: 'FIRST',
          lastName: 'LAST',
          custom_field: 'CUSTOM',
        },
      };

      vi.mocked(prisma.platformConnection.findFirst).mockResolvedValue(
        createMockConnection('mailchimp')
      );

      await executeSyncToPlatform(input, context);

      expect(mailchimpService.syncContacts).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldMapping: expect.objectContaining({
            firstName: 'FIRST',
          }),
        })
      );
    });

    it('merges input mapping with stored mapping', async () => {
      const context = createTestContext();
      const input = {
        platform: 'hubspot',
        delivery_id: 'delivery-123',
        field_mapping: {
          custom_field: 'custom_property',
        },
      };

      vi.mocked(prisma.platformConnection.findFirst).mockResolvedValue(
        createMockConnection('hubspot', {
          fieldMapping: {
            firstName: 'firstname',
            lastName: 'lastname',
          },
        })
      );

      await executeSyncToPlatform(input, context);

      expect(hubspotService.syncContacts).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldMapping: expect.objectContaining({
            firstName: 'firstname',
            custom_field: 'custom_property',
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
        delivery_id: 'delivery-123',
      };

      vi.mocked(prisma.platformConnection.findFirst).mockResolvedValue(
        createMockConnection('mailchimp')
      );
      vi.mocked(mailchimpService.syncContacts).mockResolvedValue({
        created: 10,
        updated: 5,
        skipped: 2,
        failed: 1,
        errors: [{ email: 'bad@example.com', error: 'Invalid email' }],
      });

      const result = await executeSyncToPlatform(input, context);

      expect(result.data?.created).toBe(10);
      expect(result.data?.updated).toBe(5);
      expect(result.data?.skipped).toBe(2);
      expect(result.data?.failed).toBe(1);
    });

    it('includes error details', async () => {
      const context = createTestContext();
      const input = {
        platform: 'hubspot',
        delivery_id: 'delivery-123',
      };

      vi.mocked(prisma.platformConnection.findFirst).mockResolvedValue(
        createMockConnection('hubspot')
      );
      vi.mocked(hubspotService.syncContacts).mockResolvedValue({
        created: 8,
        updated: 0,
        skipped: 0,
        failed: 2,
        errors: [
          { email: 'user1@example.com', error: 'Duplicate contact' },
          { email: 'user2@example.com', error: 'Invalid email format' },
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
        delivery_id: 'delivery-123',
      };

      vi.mocked(prisma.platformConnection.findFirst).mockResolvedValue(
        createMockConnection('mailchimp')
      );
      vi.mocked(mailchimpService.syncContacts).mockRejectedValue(
        new Error('Mailchimp API rate limit exceeded')
      );

      await expect(executeSyncToPlatform(input, context)).rejects.toThrow(
        'Mailchimp API rate limit exceeded'
      );
    });

    it('handles HubSpot sync errors', async () => {
      const context = createTestContext();
      const input = {
        platform: 'hubspot',
        delivery_id: 'delivery-123',
      };

      vi.mocked(prisma.platformConnection.findFirst).mockResolvedValue(
        createMockConnection('hubspot')
      );
      vi.mocked(hubspotService.syncContacts).mockRejectedValue(
        new Error('HubSpot authentication failed')
      );

      await expect(executeSyncToPlatform(input, context)).rejects.toThrow(
        'HubSpot authentication failed'
      );
    });

    it('handles Zapier webhook errors', async () => {
      const context = createTestContext();
      const input = {
        platform: 'zapier',
        delivery_id: 'delivery-123',
      };

      vi.mocked(prisma.platformConnection.findFirst).mockResolvedValue(
        createMockConnection('zapier')
      );
      vi.mocked(zapierService.sendBatch).mockRejectedValue(
        new Error('Webhook endpoint not responding')
      );

      await expect(executeSyncToPlatform(input, context)).rejects.toThrow(
        'Webhook endpoint not responding'
      );
    });
  });

  describe('connection validation', () => {
    it('throws NotFoundError when connection not found', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        delivery_id: 'delivery-123',
      };

      vi.mocked(prisma.platformConnection.findFirst).mockResolvedValue(null);

      await expect(executeSyncToPlatform(input, context)).rejects.toThrow(NotFoundError);
    });

    it('throws error when connection is disabled', async () => {
      const context = createTestContext();
      const input = {
        platform: 'hubspot',
        delivery_id: 'delivery-123',
      };

      vi.mocked(prisma.platformConnection.findFirst).mockResolvedValue(
        createMockConnection('hubspot', { status: 'DISABLED' })
      );

      await expect(executeSyncToPlatform(input, context)).rejects.toThrow();
    });

    it('throws NotFoundError when delivery not found', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        delivery_id: 'non-existent-delivery',
      };

      vi.mocked(prisma.platformConnection.findFirst).mockResolvedValue(
        createMockConnection('mailchimp')
      );
      vi.mocked(prisma.delivery.findUnique).mockResolvedValue(null);

      await expect(executeSyncToPlatform(input, context)).rejects.toThrow(NotFoundError);
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing platform:sync permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {
        platform: 'mailchimp',
        delivery_id: 'delivery-123',
      };

      await expect(executeSyncToPlatform(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with platform:sync permission', async () => {
      const context = createTestContext({
        permissions: ['platform:sync'],
      });
      const input = {
        platform: 'mailchimp',
        delivery_id: 'delivery-123',
      };

      vi.mocked(prisma.platformConnection.findFirst).mockResolvedValue(
        createMockConnection('mailchimp')
      );

      const result = await executeSyncToPlatform(input, context);
      expect(result.success).toBe(true);
    });
  });

  describe('sync logging', () => {
    it('creates sync log on success', async () => {
      const context = createTestContext();
      const input = {
        platform: 'mailchimp',
        delivery_id: 'delivery-123',
      };

      vi.mocked(prisma.platformConnection.findFirst).mockResolvedValue(
        createMockConnection('mailchimp')
      );

      await executeSyncToPlatform(input, context);

      expect(prisma.syncLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'test-tenant-id',
          platform: 'MAILCHIMP',
          deliveryId: 'delivery-123',
          status: 'SUCCESS',
        }),
      });
    });

    it('creates sync log on failure', async () => {
      const context = createTestContext();
      const input = {
        platform: 'hubspot',
        delivery_id: 'delivery-123',
      };

      vi.mocked(prisma.platformConnection.findFirst).mockResolvedValue(
        createMockConnection('hubspot')
      );
      vi.mocked(hubspotService.syncContacts).mockRejectedValue(new Error('Sync failed'));

      await expect(executeSyncToPlatform(input, context)).rejects.toThrow();

      expect(prisma.syncLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: expect.stringContaining('Sync failed'),
        }),
      });
    });
  });

  describe('sync with records directly', () => {
    it('syncs provided records instead of delivery', async () => {
      const context = createTestContext();
      const records = [
        { firstName: 'Direct', lastName: 'Record', email: 'direct@example.com' },
      ];
      const input = {
        platform: 'mailchimp',
        records,
      };

      vi.mocked(prisma.platformConnection.findFirst).mockResolvedValue(
        createMockConnection('mailchimp')
      );

      await executeSyncToPlatform(input, context);

      expect(mailchimpService.syncContacts).toHaveBeenCalledWith(
        expect.objectContaining({
          contacts: expect.arrayContaining([
            expect.objectContaining({
              firstName: 'Direct',
            }),
          ]),
        })
      );
    });
  });
});
