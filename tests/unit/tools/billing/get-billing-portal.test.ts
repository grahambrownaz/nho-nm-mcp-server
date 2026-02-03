/**
 * Tests for get_billing_portal tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeGetBillingPortal } from '../../../../src/tools/billing/get-billing-portal.js';
import { stripeBillingService } from '../../../../src/services/stripe-billing.js';
import { prisma } from '../../../../src/db/client.js';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { ValidationError, AuthorizationError, NotFoundError } from '../../../../src/utils/errors.js';

// Mock Stripe billing service
vi.mock('../../../../src/services/stripe-billing.js', () => ({
  stripeBillingService: {
    createPortalSession: vi.fn(),
  },
}));

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    tenant: {
      findUnique: vi.fn(),
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

describe('get_billing_portal tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock responses
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      id: 'test-tenant-id',
      stripeCustomerId: 'cus_test_123',
    } as any);

    vi.mocked(stripeBillingService.createPortalSession).mockResolvedValue({
      id: 'bps_test_123',
      url: 'https://billing.stripe.com/session/bps_test_123',
    } as any);
  });

  describe('portal URL generation', () => {
    it('generates portal URL', async () => {
      const context = createTestContext();
      const input = {
        return_url: 'https://app.example.com/billing',
      };

      const result = await executeGetBillingPortal(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.portal_url).toContain('billing.stripe.com');
    });

    it('includes return URL in request', async () => {
      const context = createTestContext();
      const input = {
        return_url: 'https://app.example.com/settings/billing',
      };

      await executeGetBillingPortal(input, context);

      expect(stripeBillingService.createPortalSession).toHaveBeenCalledWith({
        customerId: 'cus_test_123',
        returnUrl: 'https://app.example.com/settings/billing',
      });
    });

    it('uses default return URL when not provided', async () => {
      const context = createTestContext();
      const input = {};

      await executeGetBillingPortal(input, context);

      expect(stripeBillingService.createPortalSession).toHaveBeenCalledWith(
        expect.objectContaining({
          returnUrl: expect.any(String),
        })
      );
    });
  });

  describe('customer validation', () => {
    it('throws error when tenant has no Stripe customer', async () => {
      const context = createTestContext({
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

      vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
        id: 'test-tenant-id',
        stripeCustomerId: null,
      } as any);

      const input = {
        return_url: 'https://app.example.com/billing',
      };

      await expect(executeGetBillingPortal(input, context)).rejects.toThrow();
    });

    it('uses customer ID from tenant', async () => {
      const context = createTestContext({
        tenant: {
          id: 'test-tenant-id',
          name: 'Test Tenant',
          email: 'test@example.com',
          stripeCustomerId: 'cus_specific_123',
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
        stripeCustomerId: 'cus_specific_123',
      } as any);

      const input = {
        return_url: 'https://app.example.com/billing',
      };

      await executeGetBillingPortal(input, context);

      expect(stripeBillingService.createPortalSession).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'cus_specific_123',
        })
      );
    });
  });

  describe('input validation', () => {
    it('validates return URL format', async () => {
      const context = createTestContext();
      const input = {
        return_url: 'not-a-valid-url',
      };

      await expect(executeGetBillingPortal(input, context)).rejects.toThrow();
    });

    it('accepts valid HTTPS URLs', async () => {
      const context = createTestContext();
      const input = {
        return_url: 'https://app.example.com/billing',
      };

      const result = await executeGetBillingPortal(input, context);
      expect(result.success).toBe(true);
    });

    it('rejects HTTP URLs for security', async () => {
      const context = createTestContext();
      const input = {
        return_url: 'http://app.example.com/billing',
      };

      await expect(executeGetBillingPortal(input, context)).rejects.toThrow();
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing billing:write permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {
        return_url: 'https://app.example.com/billing',
      };

      await expect(executeGetBillingPortal(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with billing:write permission', async () => {
      const context = createTestContext({
        permissions: ['billing:write'],
      });
      const input = {
        return_url: 'https://app.example.com/billing',
      };

      const result = await executeGetBillingPortal(input, context);
      expect(result.success).toBe(true);
    });

    it('allows access with wildcard permission', async () => {
      const context = createTestContext({
        permissions: ['*'],
      });
      const input = {
        return_url: 'https://app.example.com/billing',
      };

      const result = await executeGetBillingPortal(input, context);
      expect(result.success).toBe(true);
    });
  });

  describe('portal session options', () => {
    it('allows configuration flow type', async () => {
      const context = createTestContext();
      const input = {
        return_url: 'https://app.example.com/billing',
        flow_type: 'subscription_cancel',
      };

      await executeGetBillingPortal(input, context);

      expect(stripeBillingService.createPortalSession).toHaveBeenCalledWith(
        expect.objectContaining({
          flowType: 'subscription_cancel',
        })
      );
    });

    it('allows payment method update flow', async () => {
      const context = createTestContext();
      const input = {
        return_url: 'https://app.example.com/billing',
        flow_type: 'payment_method_update',
      };

      await executeGetBillingPortal(input, context);

      expect(stripeBillingService.createPortalSession).toHaveBeenCalledWith(
        expect.objectContaining({
          flowType: 'payment_method_update',
        })
      );
    });
  });

  describe('response format', () => {
    it('returns portal URL and session ID', async () => {
      const context = createTestContext();
      const input = {
        return_url: 'https://app.example.com/billing',
      };

      const result = await executeGetBillingPortal(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.portal_url).toBeDefined();
      expect(result.data?.session_id).toBe('bps_test_123');
    });

    it('includes expiration info', async () => {
      const context = createTestContext();
      const input = {
        return_url: 'https://app.example.com/billing',
      };

      const result = await executeGetBillingPortal(input, context);

      expect(result.data?.expires_at).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('handles Stripe API errors gracefully', async () => {
      const context = createTestContext();
      const input = {
        return_url: 'https://app.example.com/billing',
      };

      vi.mocked(stripeBillingService.createPortalSession).mockRejectedValue(
        new Error('Stripe API error')
      );

      await expect(executeGetBillingPortal(input, context)).rejects.toThrow('Stripe API error');
    });

    it('handles customer not found error', async () => {
      const context = createTestContext();
      const input = {
        return_url: 'https://app.example.com/billing',
      };

      vi.mocked(stripeBillingService.createPortalSession).mockRejectedValue(
        new Error('No such customer: cus_test_123')
      );

      await expect(executeGetBillingPortal(input, context)).rejects.toThrow('No such customer');
    });
  });
});
