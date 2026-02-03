/**
 * Tests for create_checkout_session tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeCreateCheckoutSession } from '../../../../src/tools/billing/create-checkout-session.js';
import { stripeBillingService } from '../../../../src/services/stripe-billing.js';
import { prisma } from '../../../../src/db/client.js';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { ValidationError, AuthorizationError } from '../../../../src/utils/errors.js';

// Mock Stripe billing service
vi.mock('../../../../src/services/stripe-billing.js', () => ({
  stripeBillingService: {
    createCheckoutSession: vi.fn(),
    createCustomer: vi.fn(),
  },
}));

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    tenant: {
      findUnique: vi.fn(),
      update: vi.fn(),
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

// Price IDs for different plans
const PRICE_IDS = {
  starter_monthly: 'price_starter_monthly_123',
  starter_annual: 'price_starter_annual_123',
  growth_monthly: 'price_growth_monthly_456',
  growth_annual: 'price_growth_annual_456',
  pro_monthly: 'price_pro_monthly_789',
  pro_annual: 'price_pro_annual_789',
};

describe('create_checkout_session tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock responses
    vi.mocked(stripeBillingService.createCheckoutSession).mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/pay/cs_test_123',
    } as any);
    vi.mocked(stripeBillingService.createCustomer).mockResolvedValue({
      id: 'cus_new_123',
    } as any);
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      id: 'test-tenant-id',
      name: 'Test Tenant',
      email: 'test@example.com',
      stripeCustomerId: null,
    } as any);
    vi.mocked(prisma.tenant.update).mockResolvedValue({
      id: 'test-tenant-id',
      stripeCustomerId: 'cus_new_123',
    } as any);
  });

  describe('starter plan', () => {
    it('generates checkout URL for starter plan monthly', async () => {
      const context = createTestContext();
      const input = {
        plan: 'starter',
        billing_period: 'monthly',
        success_url: 'https://app.example.com/billing/success',
        cancel_url: 'https://app.example.com/billing/cancel',
      };

      const result = await executeCreateCheckoutSession(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.checkout_url).toContain('checkout.stripe.com');
      expect(stripeBillingService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          priceId: expect.stringContaining('starter'),
        })
      );
    });

    it('generates checkout URL for starter plan annual', async () => {
      const context = createTestContext();
      const input = {
        plan: 'starter',
        billing_period: 'annual',
        success_url: 'https://app.example.com/billing/success',
        cancel_url: 'https://app.example.com/billing/cancel',
      };

      const result = await executeCreateCheckoutSession(input, context);

      expect(result.success).toBe(true);
      expect(stripeBillingService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          priceId: expect.stringContaining('annual'),
        })
      );
    });
  });

  describe('growth plan', () => {
    it('generates checkout URL for growth plan monthly', async () => {
      const context = createTestContext();
      const input = {
        plan: 'growth',
        billing_period: 'monthly',
        success_url: 'https://app.example.com/billing/success',
        cancel_url: 'https://app.example.com/billing/cancel',
      };

      const result = await executeCreateCheckoutSession(input, context);

      expect(result.success).toBe(true);
      expect(stripeBillingService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          priceId: expect.stringContaining('growth'),
        })
      );
    });

    it('generates checkout URL for growth plan annual', async () => {
      const context = createTestContext();
      const input = {
        plan: 'growth',
        billing_period: 'annual',
        success_url: 'https://app.example.com/billing/success',
        cancel_url: 'https://app.example.com/billing/cancel',
      };

      const result = await executeCreateCheckoutSession(input, context);

      expect(result.success).toBe(true);
    });
  });

  describe('pro plan', () => {
    it('generates checkout URL for pro plan monthly', async () => {
      const context = createTestContext();
      const input = {
        plan: 'pro',
        billing_period: 'monthly',
        success_url: 'https://app.example.com/billing/success',
        cancel_url: 'https://app.example.com/billing/cancel',
      };

      const result = await executeCreateCheckoutSession(input, context);

      expect(result.success).toBe(true);
      expect(stripeBillingService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          priceId: expect.stringContaining('pro'),
        })
      );
    });

    it('generates checkout URL for pro plan annual', async () => {
      const context = createTestContext();
      const input = {
        plan: 'pro',
        billing_period: 'annual',
        success_url: 'https://app.example.com/billing/success',
        cancel_url: 'https://app.example.com/billing/cancel',
      };

      const result = await executeCreateCheckoutSession(input, context);

      expect(result.success).toBe(true);
    });
  });

  describe('price IDs', () => {
    it('includes correct price ID for starter monthly', async () => {
      const context = createTestContext();
      const input = {
        plan: 'starter',
        billing_period: 'monthly',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      };

      await executeCreateCheckoutSession(input, context);

      expect(stripeBillingService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          priceId: expect.any(String),
        })
      );
    });

    it('includes metered price IDs for usage-based billing', async () => {
      const context = createTestContext();
      const input = {
        plan: 'growth',
        billing_period: 'monthly',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      };

      await executeCreateCheckoutSession(input, context);

      // Growth plan should include metered pricing
      expect(stripeBillingService.createCheckoutSession).toHaveBeenCalled();
    });
  });

  describe('tenant metadata', () => {
    it('includes tenant metadata in session', async () => {
      const context = createTestContext();
      const input = {
        plan: 'starter',
        billing_period: 'monthly',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      };

      await executeCreateCheckoutSession(input, context);

      expect(stripeBillingService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'test-tenant-id',
          metadata: expect.objectContaining({
            plan: 'starter',
          }),
        })
      );
    });

    it('includes existing customer ID when available', async () => {
      const context = createTestContext({
        tenant: {
          id: 'test-tenant-id',
          name: 'Existing Tenant',
          email: 'existing@example.com',
          stripeCustomerId: 'cus_existing_123',
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

      vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
        id: 'test-tenant-id',
        stripeCustomerId: 'cus_existing_123',
      } as any);

      const input = {
        plan: 'growth',
        billing_period: 'monthly',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      };

      await executeCreateCheckoutSession(input, context);

      expect(stripeBillingService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'cus_existing_123',
        })
      );
    });

    it('creates new customer when none exists', async () => {
      const context = createTestContext();
      const input = {
        plan: 'starter',
        billing_period: 'monthly',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      };

      await executeCreateCheckoutSession(input, context);

      expect(stripeBillingService.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
          tenantId: 'test-tenant-id',
        })
      );
    });
  });

  describe('input validation', () => {
    it('throws ValidationError for invalid plan', async () => {
      const context = createTestContext();
      const input = {
        plan: 'invalid_plan',
        billing_period: 'monthly',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      };

      await expect(executeCreateCheckoutSession(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for invalid billing period', async () => {
      const context = createTestContext();
      const input = {
        plan: 'starter',
        billing_period: 'weekly',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      };

      await expect(executeCreateCheckoutSession(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for missing success_url', async () => {
      const context = createTestContext();
      const input = {
        plan: 'starter',
        billing_period: 'monthly',
        cancel_url: 'https://app.example.com/cancel',
      };

      await expect(executeCreateCheckoutSession(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for invalid URL format', async () => {
      const context = createTestContext();
      const input = {
        plan: 'starter',
        billing_period: 'monthly',
        success_url: 'not-a-valid-url',
        cancel_url: 'https://app.example.com/cancel',
      };

      await expect(executeCreateCheckoutSession(input, context)).rejects.toThrow();
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing billing:write permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {
        plan: 'starter',
        billing_period: 'monthly',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      };

      await expect(executeCreateCheckoutSession(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with billing:write permission', async () => {
      const context = createTestContext({
        permissions: ['billing:write'],
      });
      const input = {
        plan: 'starter',
        billing_period: 'monthly',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      };

      const result = await executeCreateCheckoutSession(input, context);
      expect(result.success).toBe(true);
    });

    it('allows access with wildcard permission', async () => {
      const context = createTestContext({
        permissions: ['*'],
      });
      const input = {
        plan: 'growth',
        billing_period: 'annual',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      };

      const result = await executeCreateCheckoutSession(input, context);
      expect(result.success).toBe(true);
    });
  });

  describe('trial period', () => {
    it('includes trial when specified', async () => {
      const context = createTestContext();
      const input = {
        plan: 'growth',
        billing_period: 'monthly',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
        trial_days: 14,
      };

      await executeCreateCheckoutSession(input, context);

      expect(stripeBillingService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          trialDays: 14,
        })
      );
    });
  });

  describe('error handling', () => {
    it('handles Stripe API errors', async () => {
      const context = createTestContext();
      const input = {
        plan: 'starter',
        billing_period: 'monthly',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      };

      vi.mocked(stripeBillingService.createCheckoutSession).mockRejectedValue(
        new Error('Stripe API error')
      );

      await expect(executeCreateCheckoutSession(input, context)).rejects.toThrow('Stripe API error');
    });
  });

  describe('response format', () => {
    it('returns checkout URL and session ID', async () => {
      const context = createTestContext();
      const input = {
        plan: 'starter',
        billing_period: 'monthly',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      };

      const result = await executeCreateCheckoutSession(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.checkout_url).toBeDefined();
      expect(result.data?.session_id).toBe('cs_test_123');
    });
  });
});
