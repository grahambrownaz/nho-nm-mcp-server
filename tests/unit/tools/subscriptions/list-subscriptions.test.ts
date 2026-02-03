/**
 * Tests for list_subscriptions tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeListSubscriptions } from '../../../../src/tools/subscriptions/list-subscriptions.js';
import { prisma } from '../../../../src/db/client.js';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { AuthorizationError } from '../../../../src/utils/errors.js';

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    subscription: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

// Mock Decimal type that matches Prisma's Decimal behavior
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
      stripeCustomerId: null,
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
      allowedDatabases: ['NHO', 'NEW_MOVER', 'CONSUMER', 'BUSINESS'],
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

// Create mock subscriptions
function createMockSubscriptions() {
  return [
    {
      id: 'sub-1',
      name: 'NHO Weekly',
      tenantId: 'test-tenant-id',
      database: 'NHO',
      geography: { type: 'zip', values: ['85001'] },
      filters: {},
      frequency: 'WEEKLY',
      status: 'ACTIVE',
      templateId: null,
      fulfillmentMethod: 'DOWNLOAD',
      fulfillmentConfig: {},
      syncChannels: [],
      clientInfo: { name: 'Client A', identifier: 'CA001' },
      nextDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      lastDelivery: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'sub-2',
      name: 'New Mover Monthly',
      tenantId: 'test-tenant-id',
      database: 'NEW_MOVER',
      geography: { type: 'state', values: ['AZ'] },
      filters: {},
      frequency: 'MONTHLY',
      status: 'ACTIVE',
      templateId: 'template-1',
      fulfillmentMethod: 'EMAIL',
      fulfillmentConfig: { email: 'test@example.com' },
      syncChannels: [],
      clientInfo: { name: 'Client B', identifier: 'CB001' },
      nextDelivery: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      lastDelivery: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'sub-3',
      name: 'Business Daily',
      tenantId: 'test-tenant-id',
      database: 'BUSINESS',
      geography: { type: 'nationwide' },
      filters: {},
      frequency: 'DAILY',
      status: 'PAUSED',
      templateId: null,
      fulfillmentMethod: 'FTP',
      fulfillmentConfig: {},
      syncChannels: [],
      clientInfo: null,
      nextDelivery: null,
      lastDelivery: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'sub-4',
      name: 'Consumer Weekly',
      tenantId: 'test-tenant-id',
      database: 'CONSUMER',
      geography: { type: 'city', values: ['Phoenix'] },
      filters: {},
      frequency: 'WEEKLY',
      status: 'CANCELLED',
      templateId: null,
      fulfillmentMethod: 'DOWNLOAD',
      fulfillmentConfig: {},
      syncChannels: [],
      clientInfo: { name: 'Client A', identifier: 'CA001' },
      nextDelivery: null,
      lastDelivery: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
}

describe('list_subscriptions tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock responses
    vi.mocked(prisma.subscription.findMany).mockResolvedValue(createMockSubscriptions());
    vi.mocked(prisma.subscription.count).mockResolvedValue(4);
  });

  describe('basic listing', () => {
    it('returns all subscriptions for tenant', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeListSubscriptions(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.subscriptions).toHaveLength(4);
      expect(result.data?.total).toBe(4);
    });

    it('returns subscriptions with correct fields', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeListSubscriptions(input, context);

      const sub = result.data?.subscriptions[0];
      expect(sub).toHaveProperty('id');
      expect(sub).toHaveProperty('name');
      expect(sub).toHaveProperty('database');
      expect(sub).toHaveProperty('status');
      expect(sub).toHaveProperty('frequency');
      expect(sub).toHaveProperty('next_delivery');
    });

    it('returns empty list when no subscriptions exist', async () => {
      const context = createTestContext();
      const input = {};

      vi.mocked(prisma.subscription.findMany).mockResolvedValue([]);
      vi.mocked(prisma.subscription.count).mockResolvedValue(0);

      const result = await executeListSubscriptions(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.subscriptions).toHaveLength(0);
      expect(result.data?.total).toBe(0);
    });
  });

  describe('status filtering', () => {
    it('filters by active status', async () => {
      const context = createTestContext();
      const input = { status_filter: 'active' };

      const activeSubscriptions = createMockSubscriptions().filter(s => s.status === 'ACTIVE');
      vi.mocked(prisma.subscription.findMany).mockResolvedValue(activeSubscriptions);
      vi.mocked(prisma.subscription.count).mockResolvedValue(activeSubscriptions.length);

      const result = await executeListSubscriptions(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.subscriptions.every(s => s.status === 'ACTIVE')).toBe(true);
    });

    it('filters by paused status', async () => {
      const context = createTestContext();
      const input = { status_filter: 'paused' };

      const pausedSubscriptions = createMockSubscriptions().filter(s => s.status === 'PAUSED');
      vi.mocked(prisma.subscription.findMany).mockResolvedValue(pausedSubscriptions);
      vi.mocked(prisma.subscription.count).mockResolvedValue(pausedSubscriptions.length);

      const result = await executeListSubscriptions(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.subscriptions.every(s => s.status === 'PAUSED')).toBe(true);
    });

    it('filters by cancelled status', async () => {
      const context = createTestContext();
      const input = { status_filter: 'cancelled' };

      const cancelledSubscriptions = createMockSubscriptions().filter(s => s.status === 'CANCELLED');
      vi.mocked(prisma.subscription.findMany).mockResolvedValue(cancelledSubscriptions);
      vi.mocked(prisma.subscription.count).mockResolvedValue(cancelledSubscriptions.length);

      const result = await executeListSubscriptions(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.subscriptions.every(s => s.status === 'CANCELLED')).toBe(true);
    });

    it('returns all statuses when filter is "all"', async () => {
      const context = createTestContext();
      const input = { status_filter: 'all' };

      const result = await executeListSubscriptions(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.subscriptions).toHaveLength(4);
    });
  });

  describe('database filtering', () => {
    it('filters by NHO database', async () => {
      const context = createTestContext();
      const input = { database_filter: 'nho' };

      const nhoSubscriptions = createMockSubscriptions().filter(s => s.database === 'NHO');
      vi.mocked(prisma.subscription.findMany).mockResolvedValue(nhoSubscriptions);
      vi.mocked(prisma.subscription.count).mockResolvedValue(nhoSubscriptions.length);

      const result = await executeListSubscriptions(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.subscriptions.every(s => s.database === 'NHO')).toBe(true);
    });

    it('filters by new_mover database', async () => {
      const context = createTestContext();
      const input = { database_filter: 'new_mover' };

      const nmSubscriptions = createMockSubscriptions().filter(s => s.database === 'NEW_MOVER');
      vi.mocked(prisma.subscription.findMany).mockResolvedValue(nmSubscriptions);
      vi.mocked(prisma.subscription.count).mockResolvedValue(nmSubscriptions.length);

      const result = await executeListSubscriptions(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.subscriptions.every(s => s.database === 'NEW_MOVER')).toBe(true);
    });
  });

  describe('client filtering', () => {
    it('filters by client identifier', async () => {
      const context = createTestContext();
      const input = { client_filter: 'CA001' };

      const clientSubscriptions = createMockSubscriptions().filter(
        s => s.clientInfo?.identifier === 'CA001'
      );
      vi.mocked(prisma.subscription.findMany).mockResolvedValue(clientSubscriptions);
      vi.mocked(prisma.subscription.count).mockResolvedValue(clientSubscriptions.length);

      const result = await executeListSubscriptions(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.subscriptions).toHaveLength(2);
    });

    it('filters by client name', async () => {
      const context = createTestContext();
      const input = { client_filter: 'Client A' };

      const clientSubscriptions = createMockSubscriptions().filter(
        s => s.clientInfo?.name === 'Client A'
      );
      vi.mocked(prisma.subscription.findMany).mockResolvedValue(clientSubscriptions);
      vi.mocked(prisma.subscription.count).mockResolvedValue(clientSubscriptions.length);

      const result = await executeListSubscriptions(input, context);

      expect(result.success).toBe(true);
    });
  });

  describe('pagination', () => {
    it('respects limit parameter', async () => {
      const context = createTestContext();
      const input = { limit: 2 };

      const result = await executeListSubscriptions(input, context);

      expect(prisma.subscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 2,
        })
      );
    });

    it('respects offset parameter', async () => {
      const context = createTestContext();
      const input = { offset: 10 };

      const result = await executeListSubscriptions(input, context);

      expect(prisma.subscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
        })
      );
    });

    it('returns pagination info', async () => {
      const context = createTestContext();
      const input = { limit: 2, offset: 0 };

      const result = await executeListSubscriptions(input, context);

      expect(result.data?.pagination).toBeDefined();
      expect(result.data?.pagination?.limit).toBe(2);
      expect(result.data?.pagination?.offset).toBe(0);
      expect(result.data?.pagination?.total).toBe(4);
      expect(result.data?.pagination?.has_more).toBe(true);
    });

    it('indicates no more results when at end', async () => {
      const context = createTestContext();
      const input = { limit: 50, offset: 0 };

      const result = await executeListSubscriptions(input, context);

      expect(result.data?.pagination?.has_more).toBe(false);
    });

    it('enforces maximum limit of 100', async () => {
      const context = createTestContext();
      const input = { limit: 150 };

      await expect(executeListSubscriptions(input, context)).rejects.toThrow();
    });

    it('uses default limit of 50', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeListSubscriptions(input, context);

      expect(prisma.subscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        })
      );
    });
  });

  describe('summary statistics', () => {
    it('returns summary counts', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeListSubscriptions(input, context);

      expect(result.data?.summary).toBeDefined();
      expect(result.data?.summary?.active).toBeDefined();
      expect(result.data?.summary?.paused).toBeDefined();
      expect(result.data?.summary?.cancelled).toBeDefined();
    });

    it('calculates correct active count', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeListSubscriptions(input, context);

      expect(result.data?.summary?.active).toBe(2);
    });

    it('calculates correct paused count', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeListSubscriptions(input, context);

      expect(result.data?.summary?.paused).toBe(1);
    });

    it('calculates correct cancelled count', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeListSubscriptions(input, context);

      expect(result.data?.summary?.cancelled).toBe(1);
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing subscription:read permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {};

      await expect(executeListSubscriptions(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with subscription:read permission', async () => {
      const context = createTestContext({
        permissions: ['subscription:read'],
      });
      const input = {};

      const result = await executeListSubscriptions(input, context);
      expect(result.success).toBe(true);
    });

    it('allows access with wildcard permission', async () => {
      const context = createTestContext({
        permissions: ['*'],
      });
      const input = {};

      const result = await executeListSubscriptions(input, context);
      expect(result.success).toBe(true);
    });
  });

  describe('tenant isolation', () => {
    it('only queries subscriptions for current tenant', async () => {
      const context = createTestContext();
      const input = {};

      await executeListSubscriptions(input, context);

      expect(prisma.subscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'test-tenant-id',
          }),
        })
      );
    });
  });

  describe('null input handling', () => {
    it('handles null input', async () => {
      const context = createTestContext();

      const result = await executeListSubscriptions(null, context);

      expect(result.success).toBe(true);
    });

    it('handles undefined input', async () => {
      const context = createTestContext();

      const result = await executeListSubscriptions(undefined, context);

      expect(result.success).toBe(true);
    });

    it('handles empty object input', async () => {
      const context = createTestContext();

      const result = await executeListSubscriptions({}, context);

      expect(result.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('handles database errors gracefully', async () => {
      const context = createTestContext();
      const input = {};

      vi.mocked(prisma.subscription.findMany).mockRejectedValue(new Error('Database error'));

      await expect(executeListSubscriptions(input, context)).rejects.toThrow('Database error');
    });
  });
});
