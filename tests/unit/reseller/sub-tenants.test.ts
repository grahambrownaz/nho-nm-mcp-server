/**
 * Tests for Reseller Mode - Sub-Tenant Management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ResellerService,
  resellerService,
} from '../../../src/reseller/sub-tenants.js';
import { prisma } from '../../../src/db/client.js';
import { stripeBillingService } from '../../../src/services/stripe-billing.js';
import type { TenantContext } from '../../../src/utils/auth.js';
import { ValidationError, AuthorizationError } from '../../../src/utils/errors.js';

// Mock Prisma client
vi.mock('../../../src/db/client.js', () => ({
  prisma: {
    tenant: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    subscription: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    apiKey: {
      create: vi.fn(),
    },
    delivery: {
      aggregate: vi.fn(),
    },
    usageRecord: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn(prisma)),
  },
}));

// Mock Stripe billing service
vi.mock('../../../src/services/stripe-billing.js', () => ({
  stripeBillingService: {
    reportUsage: vi.fn(),
    createCustomer: vi.fn(),
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

// Create reseller tenant context
function createResellerContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenant: {
      id: 'reseller-tenant-id',
      name: 'Reseller Company',
      email: 'reseller@example.com',
      company: 'Reseller Inc',
      phone: null,
      status: 'ACTIVE',
      stripeCustomerId: 'cus_reseller_123',
      parentTenantId: null,
      isReseller: true,
      wholesalePricing: {
        pricePerRecord: 0.03,
        pricePdfGeneration: 0.05,
        pricePrintPerPiece: 0.45,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    apiKey: {
      id: 'reseller-api-key-id',
      key: 'reseller-key',
      name: 'Reseller Key',
      tenantId: 'reseller-tenant-id',
      permissions: ['*'],
      isActive: true,
      lastUsedAt: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    subscription: {
      id: 'reseller-subscription-id',
      tenantId: 'reseller-tenant-id',
      plan: 'RESELLER',
      status: 'ACTIVE',
      monthlyRecordLimit: 100000,
      monthlyEmailAppends: 50000,
      monthlyPhoneAppends: 50000,
      allowedDatabases: ['NHO', 'NEW_MOVER', 'CONSUMER', 'BUSINESS'],
      allowedGeographies: null,
      allowedStates: [],
      allowedZipCodes: [],
      pricePerRecord: mockDecimal(0.03),
      priceEmailAppend: mockDecimal(0.015),
      pricePhoneAppend: mockDecimal(0.02),
      pricePdfGeneration: mockDecimal(0.05),
      pricePrintPerPiece: mockDecimal(0.45),
      billingCycleStart: new Date(),
      billingCycleEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    permissions: ['*'],
    ...overrides,
  };
}

// Create non-reseller tenant context
function createRegularContext(): TenantContext {
  return {
    tenant: {
      id: 'regular-tenant-id',
      name: 'Regular Tenant',
      email: 'regular@example.com',
      company: 'Regular Co',
      phone: null,
      status: 'ACTIVE',
      stripeCustomerId: 'cus_regular_123',
      parentTenantId: null,
      isReseller: false,
      wholesalePricing: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    apiKey: {
      id: 'regular-api-key-id',
      key: 'regular-key',
      name: 'Regular Key',
      tenantId: 'regular-tenant-id',
      permissions: ['*'],
      isActive: true,
      lastUsedAt: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    subscription: {
      id: 'regular-subscription-id',
      tenantId: 'regular-tenant-id',
      plan: 'GROWTH',
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
  };
}

// Create mock sub-tenant
function createMockSubTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-tenant-123',
    name: 'Sub Tenant',
    email: 'subtenant@example.com',
    company: 'Sub Tenant Co',
    status: 'ACTIVE',
    parentTenantId: 'reseller-tenant-id',
    isReseller: false,
    stripeCustomerId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Reseller Mode - Sub-Tenants', () => {
  let service: ResellerService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ResellerService();

    // Default mock responses
    vi.mocked(prisma.tenant.create).mockResolvedValue(createMockSubTenant());
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.tenant.findMany).mockResolvedValue([]);
    vi.mocked(prisma.subscription.create).mockResolvedValue({
      id: 'sub-tenant-subscription',
      tenantId: 'sub-tenant-123',
      plan: 'GROWTH',
    } as any);
    vi.mocked(prisma.apiKey.create).mockResolvedValue({
      id: 'sub-tenant-api-key',
      key: 'sub-key-xxx',
    } as any);
    vi.mocked(prisma.delivery.aggregate).mockResolvedValue({
      _sum: { recordCount: 0 },
    } as any);
    vi.mocked(prisma.usageRecord.aggregate).mockResolvedValue({
      _sum: { quantity: 0 },
    } as any);
    vi.mocked(stripeBillingService.reportUsage).mockResolvedValue({} as any);
  });

  describe('createSubTenant', () => {
    it('reseller can create sub-tenant', async () => {
      const context = createResellerContext();
      const input = {
        name: 'New Sub Tenant',
        email: 'newsub@example.com',
        company: 'New Sub Co',
      };

      const result = await service.createSubTenant(input, context);

      expect(result.success).toBe(true);
      expect(prisma.tenant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'New Sub Tenant',
          email: 'newsub@example.com',
          parentTenantId: 'reseller-tenant-id',
        }),
      });
    });

    it('sub-tenant linked to parent', async () => {
      const context = createResellerContext();
      const input = {
        name: 'Linked Sub Tenant',
        email: 'linked@example.com',
      };

      await service.createSubTenant(input, context);

      expect(prisma.tenant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          parentTenantId: 'reseller-tenant-id',
        }),
      });
    });

    it('sub-tenant uses parent Stripe customer', async () => {
      const context = createResellerContext();
      const input = {
        name: 'Billing Sub Tenant',
        email: 'billing@example.com',
      };

      await service.createSubTenant(input, context);

      // Sub-tenant should not have own Stripe customer ID
      expect(prisma.tenant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          stripeCustomerId: null,
        }),
      });

      // Should not create new Stripe customer
      expect(stripeBillingService.createCustomer).not.toHaveBeenCalled();
    });

    it('creates subscription for sub-tenant', async () => {
      const context = createResellerContext();
      const input = {
        name: 'Sub Tenant With Subscription',
        email: 'subwithsub@example.com',
        plan: 'GROWTH',
        limits: {
          monthlyRecordLimit: 5000,
        },
      };

      await service.createSubTenant(input, context);

      expect(prisma.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          plan: 'GROWTH',
          monthlyRecordLimit: 5000,
        }),
      });
    });

    it('creates API key for sub-tenant', async () => {
      const context = createResellerContext();
      const input = {
        name: 'Sub Tenant With API Key',
        email: 'subwithkey@example.com',
      };

      const result = await service.createSubTenant(input, context);

      expect(prisma.apiKey.create).toHaveBeenCalled();
      expect(result.data?.apiKey).toBeDefined();
    });

    it('non-reseller cannot create sub-tenant', async () => {
      const context = createRegularContext();
      const input = {
        name: 'Unauthorized Sub Tenant',
        email: 'unauthorized@example.com',
      };

      await expect(service.createSubTenant(input, context)).rejects.toThrow(
        AuthorizationError
      );
    });

    it('validates sub-tenant email uniqueness', async () => {
      const context = createResellerContext();
      const input = {
        name: 'Duplicate Email Sub',
        email: 'existing@example.com',
      };

      vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
        id: 'existing-tenant',
        email: 'existing@example.com',
      } as any);

      await expect(service.createSubTenant(input, context)).rejects.toThrow();
    });
  });

  describe('usage aggregation', () => {
    it('aggregates usage to reseller', async () => {
      const context = createResellerContext();

      vi.mocked(prisma.tenant.findMany).mockResolvedValue([
        createMockSubTenant({ id: 'sub-1' }),
        createMockSubTenant({ id: 'sub-2' }),
        createMockSubTenant({ id: 'sub-3' }),
      ]);

      vi.mocked(prisma.delivery.aggregate)
        .mockResolvedValueOnce({ _sum: { recordCount: 1000 } } as any)
        .mockResolvedValueOnce({ _sum: { recordCount: 500 } } as any)
        .mockResolvedValueOnce({ _sum: { recordCount: 750 } } as any);

      const usage = await service.getAggregatedUsage(context);

      expect(usage.totalRecords).toBe(2250);
      expect(usage.subTenantCount).toBe(3);
    });

    it('includes reseller own usage', async () => {
      const context = createResellerContext();

      vi.mocked(prisma.tenant.findMany).mockResolvedValue([
        createMockSubTenant({ id: 'sub-1' }),
      ]);

      vi.mocked(prisma.delivery.aggregate)
        .mockResolvedValueOnce({ _sum: { recordCount: 500 } } as any) // reseller's own
        .mockResolvedValueOnce({ _sum: { recordCount: 300 } } as any); // sub-tenant

      const usage = await service.getAggregatedUsage(context);

      expect(usage.resellerUsage).toBe(500);
      expect(usage.subTenantUsage).toBe(300);
      expect(usage.totalRecords).toBe(800);
    });

    it('reports aggregated usage to Stripe', async () => {
      const context = createResellerContext();

      vi.mocked(prisma.tenant.findMany).mockResolvedValue([
        createMockSubTenant({ id: 'sub-1' }),
      ]);

      vi.mocked(prisma.delivery.aggregate).mockResolvedValue({
        _sum: { recordCount: 1000 },
      } as any);

      await service.reportAggregatedUsage(context);

      expect(stripeBillingService.reportUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: expect.any(Number),
        })
      );
    });
  });

  describe('wholesale pricing', () => {
    it('applies wholesale pricing to sub-tenant', async () => {
      const context = createResellerContext();
      const input = {
        name: 'Wholesale Sub Tenant',
        email: 'wholesale@example.com',
      };

      await service.createSubTenant(input, context);

      // Sub-tenant should get wholesale pricing from reseller
      expect(prisma.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          pricePerRecord: 0.03, // Wholesale rate
          pricePdfGeneration: 0.05,
          pricePrintPerPiece: 0.45,
        }),
      });
    });

    it('allows custom pricing for sub-tenant', async () => {
      const context = createResellerContext();
      const input = {
        name: 'Custom Price Sub Tenant',
        email: 'custom@example.com',
        pricing: {
          pricePerRecord: 0.04,
          pricePdfGeneration: 0.08,
        },
      };

      await service.createSubTenant(input, context);

      expect(prisma.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          pricePerRecord: 0.04,
          pricePdfGeneration: 0.08,
        }),
      });
    });

    it('sub-tenant pricing cannot be lower than wholesale', async () => {
      const context = createResellerContext();
      const input = {
        name: 'Below Wholesale Sub',
        email: 'belowwholesale@example.com',
        pricing: {
          pricePerRecord: 0.01, // Below wholesale rate of 0.03
        },
      };

      await expect(service.createSubTenant(input, context)).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe('listSubTenants', () => {
    it('lists all sub-tenants for reseller', async () => {
      const context = createResellerContext();

      vi.mocked(prisma.tenant.findMany).mockResolvedValue([
        createMockSubTenant({ id: 'sub-1', name: 'Sub 1' }),
        createMockSubTenant({ id: 'sub-2', name: 'Sub 2' }),
      ]);

      const subTenants = await service.listSubTenants(context);

      expect(subTenants).toHaveLength(2);
      expect(prisma.tenant.findMany).toHaveBeenCalledWith({
        where: {
          parentTenantId: 'reseller-tenant-id',
        },
      });
    });

    it('includes usage stats for each sub-tenant', async () => {
      const context = createResellerContext();

      vi.mocked(prisma.tenant.findMany).mockResolvedValue([
        createMockSubTenant({ id: 'sub-1' }),
      ]);

      vi.mocked(prisma.delivery.aggregate).mockResolvedValue({
        _sum: { recordCount: 500 },
      } as any);

      const subTenants = await service.listSubTenants(context, {
        includeUsage: true,
      });

      expect(subTenants[0].usage).toBeDefined();
      expect(subTenants[0].usage.recordCount).toBe(500);
    });

    it('non-reseller cannot list sub-tenants', async () => {
      const context = createRegularContext();

      await expect(service.listSubTenants(context)).rejects.toThrow(
        AuthorizationError
      );
    });
  });

  describe('updateSubTenant', () => {
    it('reseller can update sub-tenant', async () => {
      const context = createResellerContext();

      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(
        createMockSubTenant({
          id: 'sub-123',
          parentTenantId: 'reseller-tenant-id',
        })
      );
      vi.mocked(prisma.tenant.update).mockResolvedValue(
        createMockSubTenant({
          id: 'sub-123',
          name: 'Updated Name',
        })
      );

      const result = await service.updateSubTenant(
        'sub-123',
        { name: 'Updated Name' },
        context
      );

      expect(result.success).toBe(true);
      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 'sub-123' },
        data: expect.objectContaining({
          name: 'Updated Name',
        }),
      });
    });

    it('cannot update sub-tenant of another reseller', async () => {
      const context = createResellerContext();

      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(
        createMockSubTenant({
          id: 'sub-other',
          parentTenantId: 'other-reseller-id',
        })
      );

      await expect(
        service.updateSubTenant('sub-other', { name: 'Hacked' }, context)
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe('suspendSubTenant', () => {
    it('reseller can suspend sub-tenant', async () => {
      const context = createResellerContext();

      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(
        createMockSubTenant({ parentTenantId: 'reseller-tenant-id' })
      );
      vi.mocked(prisma.tenant.update).mockResolvedValue(
        createMockSubTenant({ status: 'SUSPENDED' })
      );

      await service.suspendSubTenant('sub-123', context);

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 'sub-123' },
        data: { status: 'SUSPENDED' },
      });
    });

    it('also pauses subscriptions when suspended', async () => {
      const context = createResellerContext();

      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(
        createMockSubTenant({ parentTenantId: 'reseller-tenant-id' })
      );

      await service.suspendSubTenant('sub-123', context);

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: expect.any(Object),
        data: { status: 'PAUSED' },
      });
    });
  });

  describe('deleteSubTenant', () => {
    it('reseller can delete sub-tenant', async () => {
      const context = createResellerContext();

      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(
        createMockSubTenant({ parentTenantId: 'reseller-tenant-id' })
      );

      await service.deleteSubTenant('sub-123', context);

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 'sub-123' },
        data: { status: 'DELETED' },
      });
    });
  });

  describe('sub-tenant limits', () => {
    it('enforces reseller total limits across sub-tenants', async () => {
      const context = createResellerContext();

      // Mock existing sub-tenants using up limits
      vi.mocked(prisma.tenant.findMany).mockResolvedValue([
        createMockSubTenant({ id: 'sub-1' }),
        createMockSubTenant({ id: 'sub-2' }),
      ]);

      vi.mocked(prisma.subscription.findFirst)
        .mockResolvedValueOnce({ monthlyRecordLimit: 50000 } as any)
        .mockResolvedValueOnce({ monthlyRecordLimit: 50000 } as any);

      // Trying to create sub-tenant that would exceed reseller's 100k limit
      const input = {
        name: 'Over Limit Sub',
        email: 'overlimit@example.com',
        limits: {
          monthlyRecordLimit: 10000,
        },
      };

      await expect(service.createSubTenant(input, context)).rejects.toThrow();
    });
  });

  describe('singleton instance', () => {
    it('exports singleton instance', () => {
      expect(resellerService).toBeDefined();
      expect(resellerService).toBeInstanceOf(ResellerService);
    });
  });
});
