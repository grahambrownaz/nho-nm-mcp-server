/**
 * Tests for create_checkout_session tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeCreateCheckoutSession } from '../../../../src/tools/billing/create-checkout-session.js';
import * as stripeBilling from '../../../../src/services/stripe-billing.js';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { AuthorizationError } from '../../../../src/utils/errors.js';

// Mock Stripe billing service
vi.mock('../../../../src/services/stripe-billing.js', () => ({
  createCheckoutSession: vi.fn(),
  PLANS: {
    starter: {
      name: 'Starter',
      platformPriceId: 'price_starter_monthly',
      monthlyFee: 29,
      features: ['Up to 500 records/month', 'Email support', '1 subscription'],
    },
    growth: {
      name: 'Growth',
      platformPriceId: 'price_growth_monthly',
      monthlyFee: 49,
      features: ['Up to 2,500 records/month', 'Priority support', '5 subscriptions'],
    },
    pro: {
      name: 'Professional',
      platformPriceId: 'price_pro_monthly',
      monthlyFee: 99,
      features: ['Unlimited records', 'Dedicated support', 'Unlimited subscriptions'],
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

describe('create_checkout_session tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock response
    vi.mocked(stripeBilling.createCheckoutSession).mockResolvedValue({
      sessionId: 'cs_test_123',
      url: 'https://checkout.stripe.com/pay/cs_test_123',
    });
  });

  describe('starter plan', () => {
    it('generates checkout URL for starter plan', async () => {
      const context = createTestContext();
      const input = {
        plan_type: 'starter',
        success_url: 'https://app.example.com/billing/success',
        cancel_url: 'https://app.example.com/billing/cancel',
      };

      const result = await executeCreateCheckoutSession(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.checkout_url).toContain('checkout.stripe.com');
      expect(result.data?.plan.name).toBe('Starter');
      expect(result.data?.plan.monthly_fee).toBe(29);
    });
  });

  describe('growth plan', () => {
    it('generates checkout URL for growth plan', async () => {
      const context = createTestContext();
      const input = {
        plan_type: 'growth',
        success_url: 'https://app.example.com/billing/success',
        cancel_url: 'https://app.example.com/billing/cancel',
      };

      const result = await executeCreateCheckoutSession(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.plan.name).toBe('Growth');
      expect(result.data?.plan.monthly_fee).toBe(49);
    });
  });

  describe('pro plan', () => {
    it('generates checkout URL for pro plan', async () => {
      const context = createTestContext();
      const input = {
        plan_type: 'pro',
        success_url: 'https://app.example.com/billing/success',
        cancel_url: 'https://app.example.com/billing/cancel',
      };

      const result = await executeCreateCheckoutSession(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.plan.name).toBe('Professional');
      expect(result.data?.plan.monthly_fee).toBe(99);
    });
  });

  describe('checkout session parameters', () => {
    it('passes plan type to createCheckoutSession', async () => {
      const context = createTestContext();
      const input = {
        plan_type: 'starter',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      };

      await executeCreateCheckoutSession(input, context);

      expect(stripeBilling.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          planType: 'starter',
        })
      );
    });

    it('includes URLs in checkout session', async () => {
      const context = createTestContext();
      const input = {
        plan_type: 'growth',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      };

      await executeCreateCheckoutSession(input, context);

      expect(stripeBilling.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          successUrl: 'https://app.example.com/success',
          cancelUrl: 'https://app.example.com/cancel',
        })
      );
    });
  });

  describe('tenant metadata', () => {
    it('includes tenant ID in metadata', async () => {
      const context = createTestContext();
      const input = {
        plan_type: 'starter',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      };

      await executeCreateCheckoutSession(input, context);

      expect(stripeBilling.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            tenantId: 'test-tenant-id',
          }),
        })
      );
    });

    it('includes custom metadata when provided', async () => {
      const context = createTestContext();
      const input = {
        plan_type: 'starter',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
        metadata: {
          referrer: 'marketing_campaign',
        },
      };

      await executeCreateCheckoutSession(input, context);

      expect(stripeBilling.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            referrer: 'marketing_campaign',
          }),
        })
      );
    });

    it('uses tenant email and name', async () => {
      const context = createTestContext();
      const input = {
        plan_type: 'growth',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      };

      await executeCreateCheckoutSession(input, context);

      expect(stripeBilling.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantEmail: 'test@example.com',
          tenantName: 'Test Tenant',
        })
      );
    });

    it('allows overriding tenant email and name', async () => {
      const context = createTestContext();
      const input = {
        plan_type: 'starter',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
        tenant_email: 'custom@example.com',
        tenant_name: 'Custom Name',
      };

      await executeCreateCheckoutSession(input, context);

      expect(stripeBilling.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantEmail: 'custom@example.com',
          tenantName: 'Custom Name',
        })
      );
    });
  });

  describe('input validation', () => {
    it('throws error for invalid plan', async () => {
      const context = createTestContext();
      const input = {
        plan_type: 'invalid_plan',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      };

      await expect(executeCreateCheckoutSession(input, context)).rejects.toThrow();
    });

    it('throws error for missing success_url', async () => {
      const context = createTestContext();
      const input = {
        plan_type: 'starter',
        cancel_url: 'https://app.example.com/cancel',
      };

      await expect(executeCreateCheckoutSession(input, context)).rejects.toThrow();
    });

    it('throws error for missing cancel_url', async () => {
      const context = createTestContext();
      const input = {
        plan_type: 'starter',
        success_url: 'https://app.example.com/success',
      };

      await expect(executeCreateCheckoutSession(input, context)).rejects.toThrow();
    });

    it('throws error for invalid URL format', async () => {
      const context = createTestContext();
      const input = {
        plan_type: 'starter',
        success_url: 'not-a-valid-url',
        cancel_url: 'https://app.example.com/cancel',
      };

      await expect(executeCreateCheckoutSession(input, context)).rejects.toThrow();
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing subscription:write permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {
        plan_type: 'starter',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      };

      await expect(executeCreateCheckoutSession(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with subscription:write permission', async () => {
      const context = createTestContext({
        permissions: ['subscription:write'],
      });
      const input = {
        plan_type: 'starter',
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
        plan_type: 'growth',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      };

      const result = await executeCreateCheckoutSession(input, context);
      expect(result.success).toBe(true);
    });
  });

  describe('response format', () => {
    it('returns checkout URL and session ID', async () => {
      const context = createTestContext();
      const input = {
        plan_type: 'starter',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      };

      const result = await executeCreateCheckoutSession(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.checkout_url).toBeDefined();
      expect(result.data?.session_id).toBe('cs_test_123');
    });

    it('returns plan details', async () => {
      const context = createTestContext();
      const input = {
        plan_type: 'growth',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      };

      const result = await executeCreateCheckoutSession(input, context);

      expect(result.data?.plan).toBeDefined();
      expect(result.data?.plan.name).toBe('Growth');
      expect(result.data?.plan.monthly_fee).toBe(49);
      expect(result.data?.plan.features).toBeDefined();
    });

    it('returns expiration timestamp', async () => {
      const context = createTestContext();
      const input = {
        plan_type: 'starter',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      };

      const result = await executeCreateCheckoutSession(input, context);

      expect(result.data?.expires_at).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('returns error response on Stripe API errors', async () => {
      const context = createTestContext();
      const input = {
        plan_type: 'starter',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      };

      vi.mocked(stripeBilling.createCheckoutSession).mockRejectedValue(
        new Error('Stripe API error')
      );

      const result = await executeCreateCheckoutSession(input, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Stripe API error');
    });
  });
});
