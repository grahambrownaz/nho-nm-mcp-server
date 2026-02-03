/**
 * Tests for manage_subscription tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeManageSubscription } from '../../../../src/tools/subscriptions/manage-subscription.js';
import { prisma } from '../../../../src/db/client.js';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { ValidationError, AuthorizationError, NotFoundError } from '../../../../src/utils/errors.js';

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    subscription: {
      findUnique: vi.fn(),
      update: vi.fn(),
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

// Create a mock data subscription
function createMockDataSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'data-subscription-id',
    name: 'Test Data Subscription',
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
    clientInfo: null,
    nextDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    lastDelivery: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('manage_subscription tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock response
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(createMockDataSubscription());
    vi.mocked(prisma.subscription.update).mockResolvedValue(createMockDataSubscription());
  });

  describe('pause action', () => {
    it('pauses an active subscription', async () => {
      const context = createTestContext();
      const input = {
        subscription_id: 'data-subscription-id',
        action: 'pause',
      };

      vi.mocked(prisma.subscription.update).mockResolvedValue(
        createMockDataSubscription({ status: 'PAUSED' })
      );

      const result = await executeManageSubscription(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('PAUSED');
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'data-subscription-id' },
          data: expect.objectContaining({ status: 'PAUSED' }),
        })
      );
    });

    it('throws error when pausing already paused subscription', async () => {
      const context = createTestContext();
      const input = {
        subscription_id: 'data-subscription-id',
        action: 'pause',
      };

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(
        createMockDataSubscription({ status: 'PAUSED' })
      );

      await expect(executeManageSubscription(input, context)).rejects.toThrow();
    });
  });

  describe('resume action', () => {
    it('resumes a paused subscription', async () => {
      const context = createTestContext();
      const input = {
        subscription_id: 'data-subscription-id',
        action: 'resume',
      };

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(
        createMockDataSubscription({ status: 'PAUSED' })
      );
      vi.mocked(prisma.subscription.update).mockResolvedValue(
        createMockDataSubscription({ status: 'ACTIVE' })
      );

      const result = await executeManageSubscription(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('ACTIVE');
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'data-subscription-id' },
          data: expect.objectContaining({ status: 'ACTIVE' }),
        })
      );
    });

    it('throws error when resuming active subscription', async () => {
      const context = createTestContext();
      const input = {
        subscription_id: 'data-subscription-id',
        action: 'resume',
      };

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(
        createMockDataSubscription({ status: 'ACTIVE' })
      );

      await expect(executeManageSubscription(input, context)).rejects.toThrow();
    });

    it('throws error when resuming cancelled subscription', async () => {
      const context = createTestContext();
      const input = {
        subscription_id: 'data-subscription-id',
        action: 'resume',
      };

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(
        createMockDataSubscription({ status: 'CANCELLED' })
      );

      await expect(executeManageSubscription(input, context)).rejects.toThrow();
    });
  });

  describe('cancel action', () => {
    it('cancels an active subscription', async () => {
      const context = createTestContext();
      const input = {
        subscription_id: 'data-subscription-id',
        action: 'cancel',
      };

      vi.mocked(prisma.subscription.update).mockResolvedValue(
        createMockDataSubscription({ status: 'CANCELLED' })
      );

      const result = await executeManageSubscription(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('CANCELLED');
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'data-subscription-id' },
          data: expect.objectContaining({ status: 'CANCELLED' }),
        })
      );
    });

    it('cancels a paused subscription', async () => {
      const context = createTestContext();
      const input = {
        subscription_id: 'data-subscription-id',
        action: 'cancel',
      };

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(
        createMockDataSubscription({ status: 'PAUSED' })
      );
      vi.mocked(prisma.subscription.update).mockResolvedValue(
        createMockDataSubscription({ status: 'CANCELLED' })
      );

      const result = await executeManageSubscription(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('CANCELLED');
    });

    it('throws error when cancelling already cancelled subscription', async () => {
      const context = createTestContext();
      const input = {
        subscription_id: 'data-subscription-id',
        action: 'cancel',
      };

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(
        createMockDataSubscription({ status: 'CANCELLED' })
      );

      await expect(executeManageSubscription(input, context)).rejects.toThrow();
    });
  });

  describe('update action', () => {
    it('updates subscription name', async () => {
      const context = createTestContext();
      const input = {
        subscription_id: 'data-subscription-id',
        action: 'update',
        updates: {
          name: 'Updated Subscription Name',
        },
      };

      vi.mocked(prisma.subscription.update).mockResolvedValue(
        createMockDataSubscription({ name: 'Updated Subscription Name' })
      );

      const result = await executeManageSubscription(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('Updated Subscription Name');
    });

    it('updates subscription frequency', async () => {
      const context = createTestContext();
      const input = {
        subscription_id: 'data-subscription-id',
        action: 'update',
        updates: {
          frequency: 'monthly',
        },
      };

      vi.mocked(prisma.subscription.update).mockResolvedValue(
        createMockDataSubscription({ frequency: 'MONTHLY' })
      );

      const result = await executeManageSubscription(input, context);

      expect(result.success).toBe(true);
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ frequency: 'MONTHLY' }),
        })
      );
    });

    it('updates subscription geography', async () => {
      const context = createTestContext();
      const input = {
        subscription_id: 'data-subscription-id',
        action: 'update',
        updates: {
          geography: {
            type: 'state',
            values: ['AZ', 'CA'],
          },
        },
      };

      vi.mocked(prisma.subscription.update).mockResolvedValue(
        createMockDataSubscription({ geography: { type: 'state', values: ['AZ', 'CA'] } })
      );

      const result = await executeManageSubscription(input, context);

      expect(result.success).toBe(true);
    });

    it('updates subscription filters', async () => {
      const context = createTestContext();
      const input = {
        subscription_id: 'data-subscription-id',
        action: 'update',
        updates: {
          filters: {
            income: { min: 75000, max: 200000 },
          },
        },
      };

      const result = await executeManageSubscription(input, context);

      expect(result.success).toBe(true);
    });

    it('updates fulfillment method', async () => {
      const context = createTestContext();
      const input = {
        subscription_id: 'data-subscription-id',
        action: 'update',
        updates: {
          fulfillment_method: 'email',
          fulfillment_config: {
            email: 'new@example.com',
          },
        },
      };

      vi.mocked(prisma.subscription.update).mockResolvedValue(
        createMockDataSubscription({ fulfillmentMethod: 'EMAIL' })
      );

      const result = await executeManageSubscription(input, context);

      expect(result.success).toBe(true);
    });

    it('throws error when updating with no updates provided', async () => {
      const context = createTestContext();
      const input = {
        subscription_id: 'data-subscription-id',
        action: 'update',
        updates: {},
      };

      await expect(executeManageSubscription(input, context)).rejects.toThrow();
    });
  });

  describe('input validation', () => {
    it('throws ValidationError for missing subscription_id', async () => {
      const context = createTestContext();
      const input = {
        action: 'pause',
      };

      await expect(executeManageSubscription(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for invalid subscription_id format', async () => {
      const context = createTestContext();
      const input = {
        subscription_id: 'not-a-uuid',
        action: 'pause',
      };

      await expect(executeManageSubscription(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for invalid action', async () => {
      const context = createTestContext();
      const input = {
        subscription_id: 'data-subscription-id',
        action: 'invalid_action',
      };

      await expect(executeManageSubscription(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for missing action', async () => {
      const context = createTestContext();
      const input = {
        subscription_id: 'data-subscription-id',
      };

      await expect(executeManageSubscription(input, context)).rejects.toThrow();
    });
  });

  describe('subscription lookup', () => {
    it('throws NotFoundError for non-existent subscription', async () => {
      const context = createTestContext();
      const input = {
        subscription_id: '00000000-0000-0000-0000-000000000000',
        action: 'pause',
      };

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null);

      await expect(executeManageSubscription(input, context)).rejects.toThrow(NotFoundError);
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when subscription belongs to different tenant', async () => {
      const context = createTestContext();
      const input = {
        subscription_id: 'data-subscription-id',
        action: 'pause',
      };

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(
        createMockDataSubscription({ tenantId: 'other-tenant-id' })
      );

      await expect(executeManageSubscription(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('throws AuthorizationError when missing subscription:update permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {
        subscription_id: 'data-subscription-id',
        action: 'pause',
      };

      await expect(executeManageSubscription(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with subscription:update permission', async () => {
      const context = createTestContext({
        permissions: ['subscription:update'],
      });
      const input = {
        subscription_id: 'data-subscription-id',
        action: 'pause',
      };

      vi.mocked(prisma.subscription.update).mockResolvedValue(
        createMockDataSubscription({ status: 'PAUSED' })
      );

      const result = await executeManageSubscription(input, context);
      expect(result.success).toBe(true);
    });

    it('allows access with wildcard permission', async () => {
      const context = createTestContext({
        permissions: ['*'],
      });
      const input = {
        subscription_id: 'data-subscription-id',
        action: 'pause',
      };

      vi.mocked(prisma.subscription.update).mockResolvedValue(
        createMockDataSubscription({ status: 'PAUSED' })
      );

      const result = await executeManageSubscription(input, context);
      expect(result.success).toBe(true);
    });
  });

  describe('response format', () => {
    it('returns subscription details after pause', async () => {
      const context = createTestContext();
      const input = {
        subscription_id: 'data-subscription-id',
        action: 'pause',
      };

      vi.mocked(prisma.subscription.update).mockResolvedValue(
        createMockDataSubscription({ status: 'PAUSED' })
      );

      const result = await executeManageSubscription(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.subscription_id).toBe('data-subscription-id');
      expect(result.data?.status).toBe('PAUSED');
      expect(result.data?.action_performed).toBe('pause');
    });

    it('returns subscription details after update', async () => {
      const context = createTestContext();
      const input = {
        subscription_id: 'data-subscription-id',
        action: 'update',
        updates: {
          name: 'New Name',
        },
      };

      vi.mocked(prisma.subscription.update).mockResolvedValue(
        createMockDataSubscription({ name: 'New Name' })
      );

      const result = await executeManageSubscription(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.action_performed).toBe('update');
      expect(result.data?.name).toBe('New Name');
    });
  });

  describe('error handling', () => {
    it('handles database errors gracefully', async () => {
      const context = createTestContext();
      const input = {
        subscription_id: 'data-subscription-id',
        action: 'pause',
      };

      vi.mocked(prisma.subscription.update).mockRejectedValue(new Error('Database error'));

      await expect(executeManageSubscription(input, context)).rejects.toThrow('Database error');
    });
  });
});
