/**
 * Tests for get_billing_status tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeGetBillingStatus } from '../../../../src/tools/billing/get-billing-status.js';
import * as stripeBilling from '../../../../src/services/stripe-billing.js';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { AuthorizationError } from '../../../../src/utils/errors.js';

// Mock Stripe billing service
vi.mock('../../../../src/services/stripe-billing.js', () => ({
  getOrCreateCustomer: vi.fn(),
  getBillingStatus: vi.fn(),
  getUpcomingInvoice: vi.fn(),
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
    subscription: null,
    permissions: ['*'],
    ...overrides,
  };
}

describe('get_billing_status tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock responses
    vi.mocked(stripeBilling.getOrCreateCustomer).mockResolvedValue('cus_test_123');

    vi.mocked(stripeBilling.getBillingStatus).mockResolvedValue({
      customer: {
        id: 'cus_test_123',
        email: 'test@example.com',
        name: 'Test Tenant',
      },
      subscription: {
        id: 'sub_test_123',
        status: 'active',
        plan: 'growth',
        currentPeriodStart: new Date('2026-02-01'),
        currentPeriodEnd: new Date('2026-02-28'),
      },
      paymentMethod: {
        type: 'card',
        last4: '4242',
        brand: 'visa',
        expMonth: 12,
        expYear: 2027,
      },
      usageThisPeriod: {
        dataRecords: 1500,
        pdfGeneration: 50,
        printJobs: 1000,
      },
      upcomingInvoice: {
        amountDue: 159.99,
        currency: 'usd',
      },
    });

    vi.mocked(stripeBilling.getUpcomingInvoice).mockResolvedValue({
      amountDue: 159.99,
      currency: 'usd',
      periodStart: new Date('2026-02-01'),
      periodEnd: new Date('2026-02-28'),
      lineItems: [
        { description: 'Growth Plan', amount: 49.00, quantity: 1 },
        { description: 'Data Records (1500)', amount: 60.00, quantity: 1500 },
        { description: 'PDF Generation (50)', amount: 2.00, quantity: 50 },
        { description: 'Print Jobs (1000)', amount: 750.00, quantity: 1000 },
      ],
    });
  });

  describe('current subscription', () => {
    it('returns current subscription details', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeGetBillingStatus(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.subscription).toBeDefined();
      expect(result.data?.subscription?.plan).toBe('growth');
      expect(result.data?.subscription?.status).toBe('active');
    });

    it('returns billing cycle dates', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeGetBillingStatus(input, context);

      expect(result.data?.subscription?.current_period.start).toBeDefined();
      expect(result.data?.subscription?.current_period.end).toBeDefined();
    });
  });

  describe('usage this period', () => {
    it('returns data records usage', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeGetBillingStatus(input, context);

      expect(result.data?.usage_this_period).toBeDefined();
      expect(result.data?.usage_this_period.data_records).toBe(1500);
    });

    it('returns PDF generation usage', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeGetBillingStatus(input, context);

      expect(result.data?.usage_this_period.pdf_generation).toBe(50);
    });

    it('returns print job usage', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeGetBillingStatus(input, context);

      expect(result.data?.usage_this_period.print_jobs).toBe(1000);
    });

    it('calculates estimated costs', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeGetBillingStatus(input, context);

      expect(result.data?.usage_this_period.estimated_cost).toBeDefined();
      expect(result.data?.usage_this_period.estimated_cost.data_records).toBeGreaterThan(0);
      expect(result.data?.usage_this_period.estimated_cost.total).toBeGreaterThan(0);
    });
  });

  describe('upcoming invoice', () => {
    it('returns upcoming invoice amount', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeGetBillingStatus(input, context);

      expect(result.data?.upcoming_invoice).toBeDefined();
      expect(result.data?.upcoming_invoice?.amount_due).toBe(159.99);
      expect(result.data?.upcoming_invoice?.currency).toBe('usd');
    });

    it('returns invoice line items when requested', async () => {
      const context = createTestContext();
      const input = { include_invoice_details: true };

      const result = await executeGetBillingStatus(input, context);

      expect(result.data?.upcoming_invoice?.line_items).toBeDefined();
      expect(result.data?.upcoming_invoice?.line_items?.length).toBeGreaterThan(0);
    });
  });

  describe('payment method info', () => {
    it('returns payment method details', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeGetBillingStatus(input, context);

      expect(result.data?.payment_method).toBeDefined();
      expect(result.data?.payment_method?.brand).toBe('visa');
      expect(result.data?.payment_method?.last4).toBe('4242');
    });

    it('returns expiration date', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeGetBillingStatus(input, context);

      expect(result.data?.payment_method?.expires).toBe('12/2027');
    });

    it('handles missing payment method', async () => {
      const context = createTestContext();
      const input = {};

      vi.mocked(stripeBilling.getBillingStatus).mockResolvedValue({
        customer: {
          id: 'cus_test_123',
          email: 'test@example.com',
          name: 'Test Tenant',
        },
        subscription: null,
        paymentMethod: null,
        usageThisPeriod: {
          dataRecords: 0,
          pdfGeneration: 0,
          printJobs: 0,
        },
        upcomingInvoice: null,
      });

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

      vi.mocked(stripeBilling.getBillingStatus).mockResolvedValue({
        customer: {
          id: 'cus_test_123',
          email: 'test@example.com',
          name: 'Test Tenant',
        },
        subscription: null,
        paymentMethod: null,
        usageThisPeriod: {
          dataRecords: 0,
          pdfGeneration: 0,
          printJobs: 0,
        },
        upcomingInvoice: null,
      });

      const result = await executeGetBillingStatus(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.subscription).toBeNull();
    });

    it('returns null for upcoming invoice when no subscription', async () => {
      const context = createTestContext({
        subscription: null,
      });
      const input = {};

      vi.mocked(stripeBilling.getBillingStatus).mockResolvedValue({
        customer: {
          id: 'cus_test_123',
          email: 'test@example.com',
          name: 'Test Tenant',
        },
        subscription: null,
        paymentMethod: null,
        usageThisPeriod: {
          dataRecords: 0,
          pdfGeneration: 0,
          printJobs: 0,
        },
        upcomingInvoice: null,
      });

      const result = await executeGetBillingStatus(input, context);

      expect(result.data?.upcoming_invoice).toBeNull();
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing subscription:read permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {};

      await expect(executeGetBillingStatus(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with subscription:read permission', async () => {
      const context = createTestContext({
        permissions: ['subscription:read'],
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

  describe('account info', () => {
    it('returns account email and name', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeGetBillingStatus(input, context);

      expect(result.data?.account).toBeDefined();
      expect(result.data?.account.email).toBe('test@example.com');
      expect(result.data?.account.name).toBe('Test Tenant');
    });
  });

  describe('error handling', () => {
    it('returns error response on Stripe API errors', async () => {
      const context = createTestContext();
      const input = {};

      vi.mocked(stripeBilling.getBillingStatus).mockRejectedValue(
        new Error('Stripe API error')
      );

      const result = await executeGetBillingStatus(input, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Stripe API error');
    });

    it('returns error response on database errors', async () => {
      const context = createTestContext();
      const input = {};

      vi.mocked(stripeBilling.getOrCreateCustomer).mockRejectedValue(
        new Error('Database error')
      );

      const result = await executeGetBillingStatus(input, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database error');
    });
  });
});
