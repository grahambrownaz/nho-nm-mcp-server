/**
 * Tests for delivery_report tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeDeliveryReport } from '../../../../src/tools/subscriptions/delivery-report.js';
import { prisma } from '../../../../src/db/client.js';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { ValidationError, AuthorizationError } from '../../../../src/utils/errors.js';

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    delivery: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
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

// Create mock deliveries
function createMockDeliveries() {
  const now = new Date();
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  return [
    {
      id: 'delivery-1',
      subscriptionId: 'sub-1',
      tenantId: 'test-tenant-id',
      recordCount: 150,
      status: 'COMPLETED',
      deliveredAt: now,
      fileUrl: 'https://example.com/delivery-1.csv',
      cost: mockDecimal(7.50),
      subscription: {
        id: 'sub-1',
        name: 'NHO Weekly',
        database: 'NHO',
      },
      createdAt: now,
    },
    {
      id: 'delivery-2',
      subscriptionId: 'sub-1',
      tenantId: 'test-tenant-id',
      recordCount: 145,
      status: 'COMPLETED',
      deliveredAt: lastWeek,
      fileUrl: 'https://example.com/delivery-2.csv',
      cost: mockDecimal(7.25),
      subscription: {
        id: 'sub-1',
        name: 'NHO Weekly',
        database: 'NHO',
      },
      createdAt: lastWeek,
    },
    {
      id: 'delivery-3',
      subscriptionId: 'sub-2',
      tenantId: 'test-tenant-id',
      recordCount: 500,
      status: 'COMPLETED',
      deliveredAt: twoWeeksAgo,
      fileUrl: 'https://example.com/delivery-3.csv',
      cost: mockDecimal(25.00),
      subscription: {
        id: 'sub-2',
        name: 'New Mover Monthly',
        database: 'NEW_MOVER',
      },
      createdAt: twoWeeksAgo,
    },
    {
      id: 'delivery-4',
      subscriptionId: 'sub-1',
      tenantId: 'test-tenant-id',
      recordCount: 0,
      status: 'FAILED',
      deliveredAt: null,
      fileUrl: null,
      cost: mockDecimal(0),
      errorMessage: 'API timeout',
      subscription: {
        id: 'sub-1',
        name: 'NHO Weekly',
        database: 'NHO',
      },
      createdAt: lastWeek,
    },
  ];
}

describe('delivery_report tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock responses
    vi.mocked(prisma.delivery.findMany).mockResolvedValue(createMockDeliveries());
    vi.mocked(prisma.delivery.count).mockResolvedValue(4);
  });

  describe('basic report generation', () => {
    it('returns delivery report with default period', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeDeliveryReport(input, context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.deliveries).toBeDefined();
      expect(result.data?.summary).toBeDefined();
    });

    it('returns deliveries with correct fields', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeDeliveryReport(input, context);

      const delivery = result.data?.deliveries[0];
      expect(delivery).toHaveProperty('id');
      expect(delivery).toHaveProperty('subscription_id');
      expect(delivery).toHaveProperty('subscription_name');
      expect(delivery).toHaveProperty('record_count');
      expect(delivery).toHaveProperty('status');
      expect(delivery).toHaveProperty('delivered_at');
      expect(delivery).toHaveProperty('cost');
    });
  });

  describe('period filtering', () => {
    it('filters by this_week period', async () => {
      const context = createTestContext();
      const input = { period: 'this_week' };

      const result = await executeDeliveryReport(input, context);

      expect(result.success).toBe(true);
      expect(prisma.delivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
            }),
          }),
        })
      );
    });

    it('filters by last_week period', async () => {
      const context = createTestContext();
      const input = { period: 'last_week' };

      const result = await executeDeliveryReport(input, context);

      expect(result.success).toBe(true);
      expect(prisma.delivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
              lt: expect.any(Date),
            }),
          }),
        })
      );
    });

    it('filters by this_month period', async () => {
      const context = createTestContext();
      const input = { period: 'this_month' };

      const result = await executeDeliveryReport(input, context);

      expect(result.success).toBe(true);
    });

    it('filters by last_month period', async () => {
      const context = createTestContext();
      const input = { period: 'last_month' };

      const result = await executeDeliveryReport(input, context);

      expect(result.success).toBe(true);
    });

    it('filters by custom date range', async () => {
      const context = createTestContext();
      const input = {
        period: 'custom',
        start_date: '2024-01-01',
        end_date: '2024-01-31',
      };

      const result = await executeDeliveryReport(input, context);

      expect(result.success).toBe(true);
      expect(prisma.delivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        })
      );
    });

    it('throws ValidationError for custom period without dates', async () => {
      const context = createTestContext();
      const input = {
        period: 'custom',
      };

      await expect(executeDeliveryReport(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for custom period with only start_date', async () => {
      const context = createTestContext();
      const input = {
        period: 'custom',
        start_date: '2024-01-01',
      };

      await expect(executeDeliveryReport(input, context)).rejects.toThrow();
    });
  });

  describe('subscription filtering', () => {
    it('filters by specific subscription_id', async () => {
      const context = createTestContext();
      const input = { subscription_id: 'sub-1' };

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        id: 'sub-1',
        tenantId: 'test-tenant-id',
      } as any);

      const filteredDeliveries = createMockDeliveries().filter(
        d => d.subscriptionId === 'sub-1'
      );
      vi.mocked(prisma.delivery.findMany).mockResolvedValue(filteredDeliveries);

      const result = await executeDeliveryReport(input, context);

      expect(result.success).toBe(true);
      expect(prisma.delivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            subscriptionId: 'sub-1',
          }),
        })
      );
    });

    it('throws AuthorizationError when subscription belongs to different tenant', async () => {
      const context = createTestContext();
      const input = { subscription_id: 'other-sub' };

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        id: 'other-sub',
        tenantId: 'other-tenant-id',
      } as any);

      await expect(executeDeliveryReport(input, context)).rejects.toThrow(AuthorizationError);
    });
  });

  describe('output formats', () => {
    it('returns JSON format by default', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeDeliveryReport(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.format).toBe('json');
      expect(result.data?.deliveries).toBeInstanceOf(Array);
    });

    it('returns JSON format when specified', async () => {
      const context = createTestContext();
      const input = { format: 'json' };

      const result = await executeDeliveryReport(input, context);

      expect(result.data?.format).toBe('json');
    });

    it('returns CSV format when specified', async () => {
      const context = createTestContext();
      const input = { format: 'csv' };

      const result = await executeDeliveryReport(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.format).toBe('csv');
      expect(result.data?.csv_content).toBeDefined();
      expect(typeof result.data?.csv_content).toBe('string');
    });

    it('includes CSV header row', async () => {
      const context = createTestContext();
      const input = { format: 'csv' };

      const result = await executeDeliveryReport(input, context);

      const csvLines = result.data?.csv_content?.split('\n');
      expect(csvLines?.[0]).toContain('id');
      expect(csvLines?.[0]).toContain('subscription_id');
      expect(csvLines?.[0]).toContain('record_count');
    });
  });

  describe('summary statistics', () => {
    it('calculates total deliveries', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeDeliveryReport(input, context);

      expect(result.data?.summary?.total_deliveries).toBe(4);
    });

    it('calculates successful deliveries', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeDeliveryReport(input, context);

      expect(result.data?.summary?.successful).toBe(3);
    });

    it('calculates failed deliveries', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeDeliveryReport(input, context);

      expect(result.data?.summary?.failed).toBe(1);
    });

    it('calculates total records delivered', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeDeliveryReport(input, context);

      expect(result.data?.summary?.total_records).toBe(795);
    });

    it('calculates total cost', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeDeliveryReport(input, context);

      expect(result.data?.summary?.total_cost).toBe(39.75);
    });

    it('calculates average records per delivery', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeDeliveryReport(input, context);

      expect(result.data?.summary?.average_records_per_delivery).toBeDefined();
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing subscription:read permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {};

      await expect(executeDeliveryReport(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with subscription:read permission', async () => {
      const context = createTestContext({
        permissions: ['subscription:read'],
      });
      const input = {};

      const result = await executeDeliveryReport(input, context);
      expect(result.success).toBe(true);
    });

    it('allows access with wildcard permission', async () => {
      const context = createTestContext({
        permissions: ['*'],
      });
      const input = {};

      const result = await executeDeliveryReport(input, context);
      expect(result.success).toBe(true);
    });
  });

  describe('tenant isolation', () => {
    it('only queries deliveries for current tenant', async () => {
      const context = createTestContext();
      const input = {};

      await executeDeliveryReport(input, context);

      expect(prisma.delivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'test-tenant-id',
          }),
        })
      );
    });
  });

  describe('date range display', () => {
    it('includes period info in response', async () => {
      const context = createTestContext();
      const input = { period: 'this_month' };

      const result = await executeDeliveryReport(input, context);

      expect(result.data?.period).toBe('this_month');
      expect(result.data?.date_range).toBeDefined();
      expect(result.data?.date_range?.start).toBeDefined();
      expect(result.data?.date_range?.end).toBeDefined();
    });
  });

  describe('null input handling', () => {
    it('handles null input', async () => {
      const context = createTestContext();

      const result = await executeDeliveryReport(null, context);

      expect(result.success).toBe(true);
    });

    it('handles undefined input', async () => {
      const context = createTestContext();

      const result = await executeDeliveryReport(undefined, context);

      expect(result.success).toBe(true);
    });

    it('handles empty object input', async () => {
      const context = createTestContext();

      const result = await executeDeliveryReport({}, context);

      expect(result.success).toBe(true);
    });
  });

  describe('empty results', () => {
    it('handles no deliveries in period', async () => {
      const context = createTestContext();
      const input = { period: 'this_week' };

      vi.mocked(prisma.delivery.findMany).mockResolvedValue([]);
      vi.mocked(prisma.delivery.count).mockResolvedValue(0);

      const result = await executeDeliveryReport(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.deliveries).toHaveLength(0);
      expect(result.data?.summary?.total_deliveries).toBe(0);
      expect(result.data?.summary?.total_records).toBe(0);
      expect(result.data?.summary?.total_cost).toBe(0);
    });
  });

  describe('error handling', () => {
    it('handles database errors gracefully', async () => {
      const context = createTestContext();
      const input = {};

      vi.mocked(prisma.delivery.findMany).mockRejectedValue(new Error('Database error'));

      await expect(executeDeliveryReport(input, context)).rejects.toThrow('Database error');
    });
  });
});
