/**
 * Tests for get_fulfillment_status tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeGetFulfillmentStatus } from '../../../../src/tools/delivery/get-fulfillment-status.js';
import { prisma } from '../../../../src/db/client.js';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { AuthorizationError, NotFoundError } from '../../../../src/utils/errors.js';

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    delivery: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    dataSubscription: {
      findUnique: vi.fn(),
    },
    deliveryRecord: {
      findMany: vi.fn(),
    },
  },
}));

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
    subscription: null,
    permissions: ['*'],
    ...overrides,
  };
}

// Create mock delivery
function createMockDelivery(overrides: Record<string, unknown> = {}) {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    dataSubscriptionId: '550e8400-e29b-41d4-a716-446655440010',
    tenantId: 'test-tenant-id',
    status: 'COMPLETED',
    fulfillmentStatus: 'DELIVERED',
    recordCount: 150,
    newRecordsCount: 120,
    dataFileUrl: 'https://storage.example.com/deliveries/delivery-123.csv',
    pdfFileUrl: null,
    dataCost: 7.50,
    pdfCost: 0,
    fulfillmentCost: 0,
    totalCost: 7.50,
    fulfillmentDetails: {
      method: 'SFTP',
      remotePath: '/incoming/delivery-123.csv',
      uploadedAt: new Date().toISOString(),
    },
    scheduledAt: new Date(),
    startedAt: new Date(),
    completedAt: new Date(),
    errorMessage: null,
    dataSubscription: {
      id: '550e8400-e29b-41d4-a716-446655440010',
      name: 'NHO Weekly',
    },
    ...overrides,
  };
}

describe('get_fulfillment_status tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock responses
    vi.mocked(prisma.delivery.findUnique).mockResolvedValue(createMockDelivery() as never);
    vi.mocked(prisma.delivery.findMany).mockResolvedValue([createMockDelivery()] as never);
    vi.mocked(prisma.dataSubscription.findUnique).mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440010',
      tenantId: 'test-tenant-id',
      name: 'NHO Weekly',
    } as never);
    vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([]);
  });

  describe('single delivery status', () => {
    it('returns status for a delivery', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.deliveries).toHaveLength(1);
      expect(result.data?.deliveries[0].status).toBe('completed');
    });

    it('returns fulfillment status', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.data?.deliveries[0].fulfillmentStatus).toBe('delivered');
    });

    it('returns record count', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.data?.deliveries[0].recordCount).toBe(150);
      expect(result.data?.deliveries[0].newRecordsCount).toBe(120);
    });

    it('returns fulfillment details', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.data?.deliveries[0].fulfillmentDetails).toBeDefined();
      expect(result.data?.deliveries[0].fulfillmentDetails?.method).toBe('SFTP');
      expect(result.data?.deliveries[0].fulfillmentDetails?.remotePath).toBe('/incoming/delivery-123.csv');
    });

    it('returns cost breakdown', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.data?.deliveries[0].costs).toBeDefined();
      expect(result.data?.deliveries[0].costs.totalCost).toBe(7.5);
    });

    it('returns timestamps', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.data?.deliveries[0].scheduledAt).toBeDefined();
      expect(result.data?.deliveries[0].completedAt).toBeDefined();
    });
  });

  describe('pending deliveries', () => {
    it('handles pending deliveries', async () => {
      vi.mocked(prisma.delivery.findUnique).mockResolvedValue(
        createMockDelivery({
          id: '550e8400-e29b-41d4-a716-446655440001',
          status: 'PENDING',
          fulfillmentStatus: 'PENDING',
          completedAt: null,
          fulfillmentDetails: null,
        }) as never
      );

      const context = createTestContext();
      const input = {
        delivery_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.deliveries[0].status).toBe('pending');
      expect(result.data?.deliveries[0].completedAt).toBeNull();
    });

    it('returns processing status', async () => {
      vi.mocked(prisma.delivery.findUnique).mockResolvedValue(
        createMockDelivery({
          id: '550e8400-e29b-41d4-a716-446655440002',
          status: 'PROCESSING',
          fulfillmentStatus: 'PENDING',
          completedAt: null,
        }) as never
      );

      const context = createTestContext();
      const input = {
        delivery_id: '550e8400-e29b-41d4-a716-446655440002',
      };

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.data?.deliveries[0].status).toBe('processing');
    });
  });

  describe('failed deliveries', () => {
    it('handles failed deliveries', async () => {
      vi.mocked(prisma.delivery.findUnique).mockResolvedValue(
        createMockDelivery({
          id: '550e8400-e29b-41d4-a716-446655440003',
          status: 'FAILED',
          fulfillmentStatus: 'FAILED',
          completedAt: null,
          errorMessage: 'SFTP connection timeout',
          fulfillmentDetails: {
            error: 'SFTP connection timeout',
          },
        }) as never
      );

      const context = createTestContext();
      const input = {
        delivery_id: '550e8400-e29b-41d4-a716-446655440003',
      };

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.deliveries[0].status).toBe('failed');
      expect(result.data?.deliveries[0].fulfillmentDetails?.error).toBe('SFTP connection timeout');
    });
  });

  describe('list deliveries by subscription', () => {
    it('lists all deliveries for a subscription', async () => {
      vi.mocked(prisma.delivery.findMany).mockResolvedValue([
        createMockDelivery({ id: 'delivery-1' }),
        createMockDelivery({ id: 'delivery-2' }),
        createMockDelivery({ id: 'delivery-3' }),
      ] as never);

      const context = createTestContext();
      const input = {
        subscription_id: '550e8400-e29b-41d4-a716-446655440010',
      };

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.deliveries).toHaveLength(3);
    });

    it('validates subscription ownership', async () => {
      vi.mocked(prisma.dataSubscription.findUnique).mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440011',
        tenantId: 'other-tenant-id',
        name: 'Other Subscription',
      } as never);

      const context = createTestContext();
      const input = {
        subscription_id: '550e8400-e29b-41d4-a716-446655440011',
      };

      await expect(executeGetFulfillmentStatus(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('returns summary statistics', async () => {
      vi.mocked(prisma.delivery.findMany).mockResolvedValue([
        createMockDelivery({ id: 'delivery-1', status: 'COMPLETED' }),
        createMockDelivery({ id: 'delivery-2', status: 'COMPLETED' }),
        createMockDelivery({ id: 'delivery-3', status: 'FAILED' }),
      ] as never);

      const context = createTestContext();
      const input = {
        subscription_id: '550e8400-e29b-41d4-a716-446655440010',
      };

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.data?.summary).toBeDefined();
      expect(result.data?.summary?.totalDeliveries).toBe(3);
      expect(result.data?.summary?.completed).toBe(2);
      expect(result.data?.summary?.failed).toBe(1);
    });
  });

  describe('recent deliveries', () => {
    it('returns recent deliveries when no filters provided', async () => {
      vi.mocked(prisma.delivery.findMany).mockResolvedValue([
        createMockDelivery({ id: 'delivery-1' }),
        createMockDelivery({ id: 'delivery-2' }),
      ] as never);

      const context = createTestContext();
      const input = {};

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.success).toBe(true);
      expect(prisma.delivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'test-tenant-id' },
        })
      );
    });

    it('respects limit parameter', async () => {
      const context = createTestContext();
      const input = {
        limit: 5,
      };

      await executeGetFulfillmentStatus(input, context);

      expect(prisma.delivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
        })
      );
    });
  });

  describe('include records option', () => {
    it('includes individual records when requested', async () => {
      vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([
        {
          firstName: 'John',
          lastName: 'Doe',
          address: '123 Main St',
          city: 'Phoenix',
          state: 'AZ',
          zip: '85001',
          deliveredAt: new Date(),
        },
      ] as never);

      const context = createTestContext();
      const input = {
        delivery_id: '550e8400-e29b-41d4-a716-446655440000',
        include_records: true,
      };

      const result = await executeGetFulfillmentStatus(input, context);

      expect(prisma.deliveryRecord.findMany).toHaveBeenCalled();
      expect(result.data?.deliveries[0].records).toBeDefined();
      expect(result.data?.deliveries[0].records?.length).toBeGreaterThan(0);
    });

    it('does not include records by default', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.data?.deliveries[0].records).toBeUndefined();
    });
  });

  describe('delivery lookup', () => {
    it('throws NotFoundError for non-existent delivery', async () => {
      vi.mocked(prisma.delivery.findUnique).mockResolvedValue(null);

      const context = createTestContext();
      const input = {
        delivery_id: '00000000-0000-0000-0000-000000000000',
      };

      await expect(executeGetFulfillmentStatus(input, context)).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError for non-existent subscription', async () => {
      vi.mocked(prisma.dataSubscription.findUnique).mockResolvedValue(null);

      const context = createTestContext();
      const input = {
        subscription_id: '00000000-0000-0000-0000-000000000000',
      };

      await expect(executeGetFulfillmentStatus(input, context)).rejects.toThrow(NotFoundError);
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when delivery belongs to different tenant', async () => {
      vi.mocked(prisma.delivery.findUnique).mockResolvedValue(
        createMockDelivery({ tenantId: 'other-tenant-id' }) as never
      );

      const context = createTestContext();
      const input = {
        delivery_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      await expect(executeGetFulfillmentStatus(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('throws AuthorizationError when missing subscription:read permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {
        delivery_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      await expect(executeGetFulfillmentStatus(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with subscription:read permission', async () => {
      const context = createTestContext({
        permissions: ['subscription:read'],
      });
      const input = {
        delivery_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = await executeGetFulfillmentStatus(input, context);
      expect(result.success).toBe(true);
    });

    it('allows access with wildcard permission', async () => {
      const context = createTestContext({
        permissions: ['*'],
      });
      const input = {
        delivery_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = await executeGetFulfillmentStatus(input, context);
      expect(result.success).toBe(true);
    });
  });

  describe('file URLs', () => {
    it('returns data file URL for completed delivery', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.data?.deliveries[0].files.dataFileUrl).toBeDefined();
    });

    it('returns null for file URLs when not available', async () => {
      vi.mocked(prisma.delivery.findUnique).mockResolvedValue(
        createMockDelivery({
          dataFileUrl: null,
          pdfFileUrl: null,
        }) as never
      );

      const context = createTestContext();
      const input = {
        delivery_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.data?.deliveries[0].files.dataFileUrl).toBeNull();
      expect(result.data?.deliveries[0].files.pdfFileUrl).toBeNull();
    });
  });

  describe('error handling', () => {
    it('handles database errors gracefully', async () => {
      vi.mocked(prisma.delivery.findUnique).mockRejectedValue(new Error('Database error'));

      const context = createTestContext();
      const input = {
        delivery_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      await expect(executeGetFulfillmentStatus(input, context)).rejects.toThrow('Database error');
    });
  });
});
