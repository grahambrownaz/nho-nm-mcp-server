/**
 * Integration tests for subscription flow
 * Tests the complete subscription lifecycle from creation to delivery
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeCreateSubscription } from '../../src/tools/subscriptions/create-subscription.js';
import { executeManageSubscription } from '../../src/tools/subscriptions/manage-subscription.js';
import { executeListSubscriptions } from '../../src/tools/subscriptions/list-subscriptions.js';
import { executeDeliveryReport } from '../../src/tools/subscriptions/delivery-report.js';
import { prisma } from '../../src/db/client.js';
import type { TenantContext } from '../../src/utils/auth.js';

// In-memory store for subscriptions and deliveries
const subscriptions = new Map<string, any>();
const deliveries = new Map<string, any>();

// Valid UUIDs for testing
const TEST_TEMPLATE_ID = '550e8400-e29b-41d4-a716-446655440000';

// Mock Prisma client with connected behavior
// Helper to generate UUID
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

vi.mock('../../src/db/client.js', () => ({
  prisma: {
    template: {
      findFirst: vi.fn().mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: 'test-tenant-id',
        name: 'Test Template',
        isPublic: false,
        isActive: true,
      }),
      findUnique: vi.fn().mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: 'test-tenant-id',
        name: 'Test Template',
        isPublic: false,
        isActive: true,
      }),
    },
    dataSubscription: {
      create: vi.fn((args: any) => {
        // Generate a proper UUID for the subscription ID
        const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
        const sub = {
          id,
          ...args.data,
          totalDeliveries: 0,
          totalRecords: 0,
          lastDeliveryAt: null,
          pausedAt: null,
          cancelledAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        subscriptions.set(sub.id, sub);
        return Promise.resolve(sub);
      }),
      findUnique: vi.fn((args: any) => {
        const sub = subscriptions.get(args.where.id);
        return Promise.resolve(sub || null);
      }),
      findFirst: vi.fn((args: any) => {
        const sub = subscriptions.get(args.where?.id);
        return Promise.resolve(sub || null);
      }),
      findMany: vi.fn((args: any) => {
        let results = Array.from(subscriptions.values());

        // Filter by tenant
        if (args.where?.tenantId) {
          results = results.filter((s: any) => s.tenantId === args.where.tenantId);
        }

        // Filter by status
        if (args.where?.status) {
          results = results.filter((s: any) => s.status === args.where.status);
        }

        // Filter by database
        if (args.where?.database) {
          results = results.filter((s: any) => s.database === args.where.database);
        }

        // Filter by client name (contains, case-insensitive)
        if (args.where?.clientName?.contains) {
          const searchTerm = args.where.clientName.contains.toLowerCase();
          results = results.filter(
            (s: any) => s.clientName && s.clientName.toLowerCase().includes(searchTerm)
          );
        }

        // Apply ordering
        if (args.orderBy?.createdAt === 'desc') {
          results.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime());
        }

        // Apply pagination
        const skip = args.skip || 0;
        const take = args.take || results.length;
        results = results.slice(skip, skip + take);

        // Add template relation if requested
        if (args.include?.template) {
          results = results.map((s: any) => ({
            ...s,
            template: s.templateId ? { name: 'Test Template' } : null,
          }));
        }

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
        let results = Array.from(subscriptions.values());

        if (args.where?.tenantId) {
          results = results.filter((s: any) => s.tenantId === args.where.tenantId);
        }
        if (args.where?.status) {
          results = results.filter((s: any) => s.status === args.where.status);
        }

        return Promise.resolve(results.length);
      }),
    },
    delivery: {
      findMany: vi.fn((args: any) => {
        let results = Array.from(deliveries.values());

        if (args.where?.tenantId) {
          results = results.filter((d: any) => d.tenantId === args.where.tenantId);
        }

        if (args.where?.dataSubscriptionId) {
          if (typeof args.where.dataSubscriptionId === 'string') {
            results = results.filter(
              (d: any) => d.dataSubscriptionId === args.where.dataSubscriptionId
            );
          } else if (args.where.dataSubscriptionId?.in) {
            results = results.filter((d: any) =>
              args.where.dataSubscriptionId.in.includes(d.dataSubscriptionId)
            );
          }
        }

        // Filter by scheduledAt date range
        if (args.where?.scheduledAt?.gte || args.where?.scheduledAt?.lte) {
          const start = args.where.scheduledAt.gte;
          const end = args.where.scheduledAt.lte;
          results = results.filter((d: any) => {
            const scheduled = new Date(d.scheduledAt);
            if (start && scheduled < start) return false;
            if (end && scheduled > end) return false;
            return true;
          });
        }

        // Add dataSubscription relation if requested
        if (args.include?.dataSubscription) {
          results = results.map((d: any) => {
            const sub = subscriptions.get(d.dataSubscriptionId);
            return {
              ...d,
              dataSubscription: sub
                ? { id: sub.id, name: sub.name, clientName: sub.clientName }
                : { id: d.dataSubscriptionId, name: 'Unknown', clientName: null },
            };
          });
        }

        return Promise.resolve(results);
      }),
      count: vi.fn(() => Promise.resolve(deliveries.size)),
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
      pricePdfGeneration: mockDecimal(0.1),
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

// Helper to add delivery to mock store
function addDelivery(delivery: any) {
  deliveries.set(delivery.id, delivery);
}

// Helper to get subscription from mock store
function getSubscription(id: string) {
  return subscriptions.get(id);
}

describe('Subscription Flow Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subscriptions.clear();
    deliveries.clear();
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
          email_address: 'delivery@example.com',
        },
      };

      const createResult = await executeCreateSubscription(createInput, context);

      expect(createResult.success).toBe(true);
      expect(createResult.data?.subscription.id).toBeDefined();
      const subscriptionId = createResult.data?.subscription.id;

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
      expect(pauseResult.data?.subscription.status).toBe('PAUSED');

      // Step 4: Resume subscription
      const resumeInput = {
        subscription_id: subscriptionId,
        action: 'resume',
      };

      const resumeResult = await executeManageSubscription(resumeInput, context);

      expect(resumeResult.success).toBe(true);
      expect(resumeResult.data?.subscription.status).toBe('ACTIVE');

      // Step 5: Cancel subscription
      const cancelInput = {
        subscription_id: subscriptionId,
        action: 'cancel',
      };

      const cancelResult = await executeManageSubscription(cancelInput, context);

      expect(cancelResult.success).toBe(true);
      expect(cancelResult.data?.subscription.status).toBe('CANCELLED');

      // Step 6: Verify final state
      const finalListResult = await executeListSubscriptions({ status_filter: 'cancelled' }, context);

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
      const sub2Id = sub2Result.data?.subscription.id;

      // Pause second subscription
      await executeManageSubscription({ subscription_id: sub2Id, action: 'pause' }, context);

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
      const sub3Id = sub3Result.data?.subscription.id;

      // Cancel third subscription
      await executeManageSubscription({ subscription_id: sub3Id, action: 'cancel' }, context);

      // Verify counts
      const allResult = await executeListSubscriptions({ status_filter: 'all' }, context);
      expect(allResult.data?.subscriptions).toHaveLength(3);

      const activeResult = await executeListSubscriptions({ status_filter: 'active' }, context);
      expect(activeResult.data?.subscriptions).toHaveLength(1);

      const pausedResult = await executeListSubscriptions({ status_filter: 'paused' }, context);
      expect(pausedResult.data?.subscriptions).toHaveLength(1);

      const cancelledResult = await executeListSubscriptions(
        { status_filter: 'cancelled' },
        context
      );
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

      const subscriptionId = createResult.data?.subscription.id;

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
      expect(updateResult.data?.subscription.name).toBe('Updated Name');

      // Verify changes persisted
      const sub = getSubscription(subscriptionId);
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
          template_id: TEST_TEMPLATE_ID,
          fulfillment_method: 'print_mail',
        },
        context
      );

      expect(createResult.success).toBe(true);

      // Verify the subscription was created with template
      const sub = getSubscription(createResult.data?.subscription.id);
      expect(sub.templateId).toBe(TEST_TEMPLATE_ID);
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

      const subscriptionId = createResult.data?.subscription.id;

      // Add mock deliveries - both within this month
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      addDelivery({
        id: 'delivery-1',
        dataSubscriptionId: subscriptionId,
        tenantId: 'test-tenant-id',
        recordCount: 100,
        newRecordsCount: 100,
        status: 'COMPLETED',
        scheduledAt: now,
        completedAt: now,
        dataCost: mockDecimal(5.0),
        pdfCost: mockDecimal(0),
        fulfillmentCost: mockDecimal(0),
        totalCost: mockDecimal(5.0),
        createdAt: now,
      });

      addDelivery({
        id: 'delivery-2',
        dataSubscriptionId: subscriptionId,
        tenantId: 'test-tenant-id',
        recordCount: 95,
        newRecordsCount: 95,
        status: 'COMPLETED',
        scheduledAt: twoDaysAgo,
        completedAt: twoDaysAgo,
        dataCost: mockDecimal(4.75),
        pdfCost: mockDecimal(0),
        fulfillmentCost: mockDecimal(0),
        totalCost: mockDecimal(4.75),
        createdAt: twoDaysAgo,
      });

      // Generate report
      const reportResult = await executeDeliveryReport({ period: 'this_month' }, context);

      expect(reportResult.success).toBe(true);
      expect(reportResult.data?.deliveries?.length).toBe(2);
      expect(reportResult.data?.summary?.totalRecords).toBe(195);
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
      expect(nhoResult.data?.subscriptions.length).toBe(1);
      expect(nhoResult.data?.subscriptions[0].database).toBe('nho');

      // Filter by New Mover
      const nmResult = await executeListSubscriptions({ database_filter: 'new_mover' }, context);
      expect(nmResult.data?.subscriptions.length).toBe(1);
      expect(nmResult.data?.subscriptions[0].database).toBe('new_mover');
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
          client_info: { name: 'Client A' },
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
          client_info: { name: 'Client B' },
        },
        context
      );

      // Filter by Client A
      const clientAResult = await executeListSubscriptions({ client_filter: 'Client A' }, context);
      expect(clientAResult.data?.subscriptions.length).toBe(1);
      expect(clientAResult.data?.subscriptions[0].clientName).toBe('Client A');

      // Filter by Client B
      const clientBResult = await executeListSubscriptions({ client_filter: 'Client B' }, context);
      expect(clientBResult.data?.subscriptions.length).toBe(1);
      expect(clientBResult.data?.subscriptions[0].clientName).toBe('Client B');
    });
  });
});
