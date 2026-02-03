/**
 * Tests for get_billing_status tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeGetBillingStatus } from '../../../../src/tools/billing/get-billing-status.js';
import { stripeBillingService } from '../../../../src/services/stripe-billing.js';
import { prisma } from '../../../../src/db/client.js';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { AuthorizationError } from '../../../../src/utils/errors.js';

// Mock Stripe billing service
vi.mock('../../../../src/services/stripe-billing.js', () => ({
  stripeBillingService: {
    getUpcomingInvoice: vi.fn(),
    getPaymentMethods: vi.fn(),
  },
}));

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    tenant: {
      findUnique: vi.fn(),
    },
    subscription: {
      findFirst: vi.fn(),
    },
    delivery: {
      aggregate: vi.fn(),
    },
    usageRecord: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
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
      plan: 'GROWTH',
      status: 'ACTIVE',
      monthlyRecordLimit: 10000,
      monthlyEmailAppends: 5000,
      monthlyPhoneAppends: 5000,
      allowedDatabases: ['NHO', 'NEW_MOVER'],
      allowedGeographies: null,
      allowedStates: [],
      allowedZipCodes: [],
      pricePerRecord: mockDecimal(0.02),
      priceEmailAppend: mockDecimal(0.02),
      pricePhoneAppend: mockDecimal(0.03),
      pricePdfGeneration: mockDecimal(0.10),
      pricePrintPerPiece: mockDecimal(0.65),
      billingCycleStart: new Date('2026-02-01'),
      billingCycleEnd: new Date('2026-02-28'),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    permissions: ['*'],
    ...overrides,
  };
}

describe('get_billing_status tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock responses
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      id: 'test-tenant-id',
      stripeCustomerId: 'cus_test_123',
      stripeSubscriptionId: 'sub_test_123',
    } as any);

    vi.mocked(prisma.subscription.findFirst).mockResolvedValue({
      id: 'sub-123',
      tenantId: 'test-tenant-id',
      plan: 'GROWTH',
      status: 'ACTIVE',
      billingCycleStart: new Date('2026-02-01'),
      billingCycleEnd: new Date('2026-02-28'),
    } as any);

    vi.mocked(prisma.delivery.aggregate).mockResolvedValue({
      _sum: { recordCount: 1500 },
      _count: { id: 10 },
    } as any);

    vi.mocked(prisma.usageRecord.aggregate).mockResolvedValue({
      _sum: { quantity: 50 },
    } as any);

    vi.mocked(prisma.usageRecord.findMany).mockResolvedValue([
      { type: 'DATA_RECORDS', quantity: 1500 },
      { type: 'PDF_GENERATION', quantity: 50 },
      { type: 'PRINT_JOBS', quantity: 1000 },
    ] as any);

    vi.mocked(stripeBillingService.getUpcomingInvoice).mockResolvedValue({
      amount_due: 15999,
      currency: 'usd',
      period_start: Math.floor(new Date('2026-02-01').getTime() / 1000),
      period_end: Math.floor(new Date('2026-02-28').getTime() / 1000),
      lines: {
        data: [
          { description: 'Growth Plan', amount: 9900 },
          { description: 'Data Records (1500 @ $0.02)', amount: 3000 },
          { description: 'PDF Generation (50 @ $0.10)', amount: 500 },
          { description: 'Print Jobs (1000 @ $0.65)', amount: 65000 },
        ],
      },
    } as any);

    vi.mocked(stripeBillingService.getPaymentMethods).mockResolvedValue([
      {
        id: 'pm_test_123',
        type: 'card',
        card: {
          brand: 'visa',
          last4: '4242',
          exp_month: 12,
          exp_year: 2027,
        },
      },
    ] as any);
  });

  describe('current subscription', () => {
    it('returns current subscription details', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeGetBillingStatus(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.subscription).toBeDefined();
      expect(result.data?.subscription.plan).toBe('GROWTH');
      expect(result.data?.subscription.status).toBe('ACTIVE');
    });

    it('returns billing cycle dates', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeGetBillingStatus(input, context);

      expect(result.data?.subscription.billing_cycle_start).toBeDefined();
      expect(result.data?.subscription.billing_cycle_end).toBeDefined();
    });
  });

  describe('usage this period', () => {
    it('returns data records usage', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeGetBillingStatus(input, context);

      expect(result.data?.usage).toBeDefined();
      expect(result.data?.usage.data_records).toBe(1500);
    });

    it('returns PDF generation usage', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeGetBillingStatus(input, context);

      expect(result.data?.usage.pdf_generation).toBe(50);
    });

    it('returns print job usage', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeGetBillingStatus(input, context);

      expect(result.data?.usage.print_jobs).toBe(1000);
    });

    it('returns usage limits', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeGetBillingStatus(input, context);

      expect(result.data?.limits).toBeDefined();
      expect(result.data?.limits.monthly_record_limit).toBe(10000);
    });

    it('calculates usage percentage', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeGetBillingStatus(input, context);

      expect(result.data?.usage.percentage_used).toBeDefined();
      expect(result.data?.usage.percentage_used).toBe(15); // 1500/10000 * 100
    });
  });

  describe('upcoming invoice', () => {
    it('returns upcoming invoice total', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeGetBillingStatus(input, context);

      expect(result.data?.upcoming_invoice).toBeDefined();
      expect(result.data?.upcoming_invoice.amount_due).toBe(15999);
      expect(result.data?.upcoming_invoice.currency).toBe('usd');
    });

    it('returns invoice line items', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeGetBillingStatus(input, context);

      expect(result.data?.upcoming_invoice.line_items).toBeDefined();
      expect(result.data?.upcoming_invoice.line_items.length).toBeGreaterThan(0);
    });

    it('formats amount as currency', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeGetBillingStatus(input, context);

      expect(result.data?.upcoming_invoice.amount_due_formatted).toBe('$159.99');
    });
  });

  describe('payment method info', () => {
    it('returns payment method details', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeGetBillingStatus(input, context);

      expect(result.data?.payment_method).toBeDefined();
      expect(result.data?.payment_method.brand).toBe('visa');
      expect(result.data?.payment_method.last4).toBe('4242');
    });

    it('returns expiration date', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeGetBillingStatus(input, context);

      expect(result.data?.payment_method.exp_month).toBe(12);
      expect(result.data?.payment_method.exp_year).toBe(2027);
    });

    it('handles missing payment method', async () => {
      const context = createTestContext();
      const input = {};

      vi.mocked(stripeBillingService.getPaymentMethods).mockResolvedValue([]);

      const result = await executeGetBillingStatus(input, context);

      expect(result.data?.payment_method).toBeNull();
    });
  });

  describe('no subscription', () => {
    it('handles tenant with no subscription', async () => {
      const context = createTestContext({
        subscription: null,
      });
      const input = {};

      vi.mocked(prisma.subscription.findFirst).mockResolvedValue(null);

      const result = await executeGetBillingStatus(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.subscription).toBeNull();
      expect(result.data?.usage).toEqual({
        data_records: 0,
        pdf_generation: 0,
        print_jobs: 0,
        percentage_used: 0,
      });
    });

    it('returns null for upcoming invoice when no subscription', async () => {
      const context = createTestContext({
        subscription: null,
        tenant: {
          id: 'test-tenant-id',
          name: 'Test Tenant',
          email: 'test@example.com',
          stripeCustomerId: null,
          company: null,
          phone: null,
          status: 'ACTIVE',
          parentTenantId: null,
          isReseller: false,
          wholesalePricing: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      vi.mocked(prisma.subscription.findFirst).mockResolvedValue(null);
      vi.mocked(stripeBillingService.getUpcomingInvoice).mockResolvedValue(null);

      const result = await executeGetBillingStatus(input, context);

      expect(result.data?.upcoming_invoice).toBeNull();
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing billing:read permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {};

      await expect(executeGetBillingStatus(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with billing:read permission', async () => {
      const context = createTestContext({
        permissions: ['billing:read'],
      });
      const input = {};

      const result = await executeGetBillingStatus(input, context);
      expect(result.success).toBe(true);
    });

    it('allows access with wildcard permission', async () => {
      const context = createTestContext({
        permissions: ['*'],
      });
      const input = {};

      const result = await executeGetBillingStatus(input, context);
      expect(result.success).toBe(true);
    });
  });

  describe('cost breakdown', () => {
    it('returns cost breakdown by category', async () => {
      const context = createTestContext();
      const input = { include_breakdown: true };

      const result = await executeGetBillingStatus(input, context);

      expect(result.data?.cost_breakdown).toBeDefined();
      expect(result.data?.cost_breakdown.base_plan).toBeDefined();
      expect(result.data?.cost_breakdown.data_records).toBeDefined();
      expect(result.data?.cost_breakdown.pdf_generation).toBeDefined();
      expect(result.data?.cost_breakdown.print_jobs).toBeDefined();
    });
  });

  describe('subscription history', () => {
    it('returns recent invoices when requested', async () => {
      const context = createTestContext();
      const input = { include_history: true };

      vi.mocked(prisma.usageRecord.findMany).mockResolvedValue([
        {
          id: 'ur-1',
          type: 'DATA_RECORDS',
          quantity: 1500,
          createdAt: new Date('2026-02-03'),
        },
      ] as any);

      const result = await executeGetBillingStatus(input, context);

      expect(result.data?.recent_usage).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('handles Stripe API errors gracefully', async () => {
      const context = createTestContext();
      const input = {};

      vi.mocked(stripeBillingService.getUpcomingInvoice).mockRejectedValue(
        new Error('Stripe API error')
      );

      await expect(executeGetBillingStatus(input, context)).rejects.toThrow('Stripe API error');
    });

    it('handles database errors gracefully', async () => {
      const context = createTestContext();
      const input = {};

      vi.mocked(prisma.subscription.findFirst).mockRejectedValue(new Error('Database error'));

      await expect(executeGetBillingStatus(input, context)).rejects.toThrow('Database error');
    });
  });
});
