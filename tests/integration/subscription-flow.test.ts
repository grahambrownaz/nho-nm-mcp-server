/**
 * Integration tests for subscription flow
 * Tests the complete subscription lifecycle from creation to delivery
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeCreateSubscription } from '../../src/tools/subscriptions/create-subscription.js';
import { executeManageSubscription } from '../../src/tools/subscriptions/manage-subscription.js';
import { executeListSubscriptions } from '../../src/tools/subscriptions/list-subscriptions.js';
import { executeDeliveryReport } from '../../src/tools/subscriptions/delivery-report.js';
import { prisma } from '../../src/db/client.js';
import type { TenantContext } from '../../src/utils/auth.js';

// Mock Prisma client with connected behavior
vi.mock('../../src/db/client.js', () => {
  // In-memory store for subscriptions
  const subscriptions = new Map<string, any>();
  const deliveries = new Map<string, any>();

  return {
    prisma: {
      template: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'template-123',
          tenantId: 'test-tenant-id',
          name: 'Test Template',
        }),
      },
      subscription: {
        create: vi.fn((args: any) => {
          const sub = {
            id: `sub-${Date.now()}`,
            ...args.data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          subscriptions.set(sub.id, sub);
          return Promise.resolve(sub);
        }),
        findUnique: vi.fn((args: any) => {
          return Promise.resolve(subscriptions.get(args.where.id) || null);
        }),
        findMany: vi.fn((args: any) => {
          const tenantId = args.where.tenantId;
          const results = Array.from(subscriptions.values()).filter(
            (s: any) => s.tenantId === tenantId
          );
          return Promise.resolve(results);
        }),
        update: vi.fn((args: any) => {
          const sub = subscriptions.get(args.where.id);
          if (sub) {
            const updated = { ...sub, ...args.data, updatedAt: new Date() };
            subscriptions.set(sub.id, updated);
            return Promise.resolve(updated);
          }
          return Promise.resolve(null);
        }),
        count: vi.fn((args: any) => {
          const tenantId = args.where.tenantId;
          const count = Array.from(subscriptions.values()).filter(
            (s: any) => s.tenantId === tenantId
          ).length;
          return Promise.resolve(count);
        }),
      },
      delivery: {
        findMany: vi.fn((args: any) => {
          const tenantId = args.where.tenantId;
          const results = Array.from(deliveries.values()).filter(
            (d: any) => d.tenantId === tenantId
          );
          return Promise.resolve(results);
        }),
        count: vi.fn(() => Promise.resolve(0)),
      },
      // Helper to reset state between tests
      _reset: () => {
        subscriptions.clear();
        deliveries.clear();
      },
      _addDelivery: (delivery: any) => {
        deliveries.set(delivery.id, delivery);
      },
      _getSubscription: (id: string) => subscriptions.get(id),
    },
  };
});

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

describe('Subscription Flow Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma as any)._reset();
  });

  describe('complete subscription lifecycle', () => {
    it('creates, lists, pauses, resumes, and cancels a subscription', async () => {
      const context = createTestContext();

      // Step 1: Create subscription
      const createInput = {
        name: 'NHO Weekly Delivery',
        database: 'nho',
        geography: {
          type: 'zip',
          values: ['85001', '85002', '85003'],
        },
        frequency: 'weekly',
        fulfillment_method: 'email',
        fulfillment_config: {
          email: 'delivery@example.com',
        },
      };

      const createResult = await executeCreateSubscription(createInput, context);

      expect(createResult.success).toBe(true);
      expect(createResult.data?.subscription_id).toBeDefined();
      const subscriptionId = createResult.data?.subscription_id;

      // Step 2: List subscriptions and verify new subscription appears
      const listResult = await executeListSubscriptions({}, context);

      expect(listResult.success).toBe(true);
      expect(listResult.data?.subscriptions.length).toBeGreaterThan(0);
      expect(listResult.data?.subscriptions.some((s) => s.id === subscriptionId)).toBe(true);

      // Step 3: Pause subscription
      const pauseInput = {
        subscription_id: subscriptionId,
        action: 'pause',
      };

      const pauseResult = await executeManageSubscription(pauseInput, context);

      expect(pauseResult.success).toBe(true);
      expect(pauseResult.data?.status).toBe('PAUSED');

      // Step 4: Resume subscription
      const resumeInput = {
        subscription_id: subscriptionId,
        action: 'resume',
      };

      const resumeResult = await executeManageSubscription(resumeInput, context);

      expect(resumeResult.success).toBe(true);
      expect(resumeResult.data?.status).toBe('ACTIVE');

      // Step 5: Cancel subscription
      const cancelInput = {
        subscription_id: subscriptionId,
        action: 'cancel',
      };

      const cancelResult = await executeManageSubscription(cancelInput, context);

      expect(cancelResult.success).toBe(true);
      expect(cancelResult.data?.status).toBe('CANCELLED');

      // Step 6: Verify final state
      const finalListResult = await executeListSubscriptions(
        { status_filter: 'cancelled' },
        context
      );

      expect(finalListResult.success).toBe(true);
      expect(finalListResult.data?.subscriptions.some((s) => s.id === subscriptionId)).toBe(true);
    });

    it('creates multiple subscriptions and filters by status', async () => {
      const context = createTestContext();

      // Create first subscription (will stay active)
      const sub1Result = await executeCreateSubscription(
        {
          name: 'Active Subscription',
          database: 'nho',
          geography: { type: 'state', values: ['AZ'] },
          frequency: 'weekly',
        },
        context
      );

      expect(sub1Result.success).toBe(true);

      // Create second subscription (will be paused)
      const sub2Result = await executeCreateSubscription(
        {
          name: 'Paused Subscription',
          database: 'new_mover',
          geography: { type: 'state', values: ['CA'] },
          frequency: 'monthly',
        },
        context
      );

      expect(sub2Result.success).toBe(true);
      const sub2Id = sub2Result.data?.subscription_id;

      // Pause second subscription
      await executeManageSubscription(
        { subscription_id: sub2Id, action: 'pause' },
        context
      );

      // Create third subscription (will be cancelled)
      const sub3Result = await executeCreateSubscription(
        {
          name: 'Cancelled Subscription',
          database: 'consumer',
          geography: { type: 'nationwide' },
          frequency: 'daily',
        },
        context
      );

      expect(sub3Result.success).toBe(true);
      const sub3Id = sub3Result.data?.subscription_id;

      // Cancel third subscription
      await executeManageSubscription(
        { subscription_id: sub3Id, action: 'cancel' },
        context
      );

      // Verify counts
      const allResult = await executeListSubscriptions({ status_filter: 'all' }, context);
      expect(allResult.data?.subscriptions).toHaveLength(3);

      const activeResult = await executeListSubscriptions({ status_filter: 'active' }, context);
      expect(activeResult.data?.subscriptions).toHaveLength(1);

      const pausedResult = await executeListSubscriptions({ status_filter: 'paused' }, context);
      expect(pausedResult.data?.subscriptions).toHaveLength(1);

      const cancelledResult = await executeListSubscriptions({ status_filter: 'cancelled' }, context);
      expect(cancelledResult.data?.subscriptions).toHaveLength(1);
    });

    it('updates subscription and verifies changes', async () => {
      const context = createTestContext();

      // Create subscription
      const createResult = await executeCreateSubscription(
        {
          name: 'Original Name',
          database: 'nho',
          geography: { type: 'zip', values: ['85001'] },
          frequency: 'weekly',
        },
        context
      );

      const subscriptionId = createResult.data?.subscription_id;

      // Update subscription
      const updateResult = await executeManageSubscription(
        {
          subscription_id: subscriptionId,
          action: 'update',
          updates: {
            name: 'Updated Name',
            frequency: 'monthly',
            geography: { type: 'state', values: ['AZ', 'CA'] },
          },
        },
        context
      );

      expect(updateResult.success).toBe(true);
      expect(updateResult.data?.name).toBe('Updated Name');

      // Verify changes persisted
      const sub = (prisma as any)._getSubscription(subscriptionId);
      expect(sub.name).toBe('Updated Name');
      expect(sub.frequency).toBe('MONTHLY');
    });
  });

  describe('subscription with template', () => {
    it('creates subscription linked to a template', async () => {
      const context = createTestContext();

      const createResult = await executeCreateSubscription(
        {
          name: 'Postcard Subscription',
          database: 'nho',
          geography: { type: 'zip', values: ['85001'] },
          frequency: 'weekly',
          template_id: 'template-123',
          fulfillment_method: 'print_mail',
        },
        context
      );

      expect(createResult.success).toBe(true);
      expect(createResult.data?.template_id).toBe('template-123');
    });
  });

  describe('delivery report integration', () => {
    it('generates delivery report for subscriptions with deliveries', async () => {
      const context = createTestContext();

      // Create subscription
      const createResult = await executeCreateSubscription(
        {
          name: 'Delivery Test',
          database: 'nho',
          geography: { type: 'zip', values: ['85001'] },
          frequency: 'weekly',
        },
        context
      );

      const subscriptionId = createResult.data?.subscription_id;

      // Add mock deliveries
      (prisma as any)._addDelivery({
        id: 'delivery-1',
        subscriptionId,
        tenantId: 'test-tenant-id',
        recordCount: 100,
        status: 'COMPLETED',
        deliveredAt: new Date(),
        cost: mockDecimal(5.0),
        subscription: { id: subscriptionId, name: 'Delivery Test', database: 'NHO' },
        createdAt: new Date(),
      });

      (prisma as any)._addDelivery({
        id: 'delivery-2',
        subscriptionId,
        tenantId: 'test-tenant-id',
        recordCount: 95,
        status: 'COMPLETED',
        deliveredAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        cost: mockDecimal(4.75),
        subscription: { id: subscriptionId, name: 'Delivery Test', database: 'NHO' },
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      });

      // Generate report
      const reportResult = await executeDeliveryReport({ period: 'this_month' }, context);

      expect(reportResult.success).toBe(true);
      expect(reportResult.data?.deliveries.length).toBe(2);
      expect(reportResult.data?.summary?.total_records).toBe(195);
    });
  });

  describe('multi-database subscriptions', () => {
    it('creates subscriptions for different databases', async () => {
      const context = createTestContext();
      const databases = ['nho', 'new_mover', 'consumer', 'business'];

      for (const database of databases) {
        const result = await executeCreateSubscription(
          {
            name: `${database.toUpperCase()} Subscription`,
            database,
            geography: { type: 'nationwide' },
            frequency: 'weekly',
          },
          context
        );

        expect(result.success).toBe(true);
      }

      const listResult = await executeListSubscriptions({}, context);
      expect(listResult.data?.subscriptions).toHaveLength(4);
    });

    it('filters subscriptions by database', async () => {
      const context = createTestContext();

      // Create NHO subscription
      await executeCreateSubscription(
        {
          name: 'NHO Sub',
          database: 'nho',
          geography: { type: 'nationwide' },
          frequency: 'weekly',
        },
        context
      );

      // Create New Mover subscription
      await executeCreateSubscription(
        {
          name: 'New Mover Sub',
          database: 'new_mover',
          geography: { type: 'nationwide' },
          frequency: 'weekly',
        },
        context
      );

      // Filter by NHO
      const nhoResult = await executeListSubscriptions({ database_filter: 'nho' }, context);
      expect(nhoResult.data?.subscriptions.every((s) => s.database === 'NHO')).toBe(true);

      // Filter by New Mover
      const nmResult = await executeListSubscriptions({ database_filter: 'new_mover' }, context);
      expect(nmResult.data?.subscriptions.every((s) => s.database === 'NEW_MOVER')).toBe(true);
    });
  });

  describe('client-specific subscriptions', () => {
    it('creates and filters subscriptions by client', async () => {
      const context = createTestContext();

      // Create subscription for Client A
      await executeCreateSubscription(
        {
          name: 'Client A NHO',
          database: 'nho',
          geography: { type: 'state', values: ['AZ'] },
          frequency: 'weekly',
          client_info: { name: 'Client A', identifier: 'CA001' },
        },
        context
      );

      // Create subscription for Client B
      await executeCreateSubscription(
        {
          name: 'Client B NHO',
          database: 'nho',
          geography: { type: 'state', values: ['CA'] },
          frequency: 'weekly',
          client_info: { name: 'Client B', identifier: 'CB001' },
        },
        context
      );

      // Filter by Client A
      const clientAResult = await executeListSubscriptions({ client_filter: 'CA001' }, context);
      expect(clientAResult.data?.subscriptions.every(
        (s) => s.client_info?.identifier === 'CA001'
      )).toBe(true);

      // Filter by Client B
      const clientBResult = await executeListSubscriptions({ client_filter: 'CB001' }, context);
      expect(clientBResult.data?.subscriptions.every(
        (s) => s.client_info?.identifier === 'CB001'
      )).toBe(true);
    });
  });
});
