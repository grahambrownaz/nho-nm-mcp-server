/**
 * Tests for get_billing_portal tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeGetBillingPortal } from '../../../../src/tools/billing/get-billing-portal.js';
import * as stripeBilling from '../../../../src/services/stripe-billing.js';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { AuthorizationError } from '../../../../src/utils/errors.js';

// Mock Stripe billing service
vi.mock('../../../../src/services/stripe-billing.js', () => ({
  createPortalSession: vi.fn(),
  getOrCreateCustomer: vi.fn(),
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

describe('get_billing_portal tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock responses
    vi.mocked(stripeBilling.getOrCreateCustomer).mockResolvedValue('cus_test_123');

    vi.mocked(stripeBilling.createPortalSession).mockResolvedValue({
      url: 'https://billing.stripe.com/session/bps_test_123',
    });
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

      expect(stripeBilling.createPortalSession).toHaveBeenCalledWith({
        customerId: 'cus_test_123',
        returnUrl: 'https://app.example.com/settings/billing',
      });
    });

    it('includes expiration info', async () => {
      const context = createTestContext();
      const input = {
        return_url: 'https://app.example.com/billing',
      };

      const result = await executeGetBillingPortal(input, context);

      expect(result.data?.expires_in).toBeDefined();
      expect(result.data?.expires_in).toBe('1 hour');
    });
  });

  describe('customer handling', () => {
    it('gets or creates Stripe customer', async () => {
      const context = createTestContext();
      const input = {
        return_url: 'https://app.example.com/billing',
      };

      await executeGetBillingPortal(input, context);

      expect(stripeBilling.getOrCreateCustomer).toHaveBeenCalledWith('test-tenant-id');
    });

    it('uses existing customer ID', async () => {
      const context = createTestContext();

      vi.mocked(stripeBilling.getOrCreateCustomer).mockResolvedValue('cus_existing_456');

      const input = {
        return_url: 'https://app.example.com/billing',
      };

      await executeGetBillingPortal(input, context);

      expect(stripeBilling.createPortalSession).toHaveBeenCalledWith({
        customerId: 'cus_existing_456',
        returnUrl: 'https://app.example.com/billing',
      });
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

    it('requires return_url parameter', async () => {
      const context = createTestContext();
      const input = {};

      await expect(executeGetBillingPortal(input, context)).rejects.toThrow();
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing subscription:read permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {
        return_url: 'https://app.example.com/billing',
      };

      await expect(executeGetBillingPortal(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with subscription:read permission', async () => {
      const context = createTestContext({
        permissions: ['subscription:read'],
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

  describe('response format', () => {
    it('returns portal URL', async () => {
      const context = createTestContext();
      const input = {
        return_url: 'https://app.example.com/billing',
      };

      const result = await executeGetBillingPortal(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.portal_url).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('returns error response on Stripe API errors', async () => {
      const context = createTestContext();
      const input = {
        return_url: 'https://app.example.com/billing',
      };

      vi.mocked(stripeBilling.createPortalSession).mockRejectedValue(
        new Error('Stripe API error')
      );

      const result = await executeGetBillingPortal(input, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Stripe API error');
    });

    it('returns error response when customer not found', async () => {
      const context = createTestContext();
      const input = {
        return_url: 'https://app.example.com/billing',
      };

      vi.mocked(stripeBilling.createPortalSession).mockRejectedValue(
        new Error('No such customer: cus_test_123')
      );

      const result = await executeGetBillingPortal(input, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No such customer');
    });

    it('returns error response when customer creation fails', async () => {
      const context = createTestContext();
      const input = {
        return_url: 'https://app.example.com/billing',
      };

      vi.mocked(stripeBilling.getOrCreateCustomer).mockRejectedValue(
        new Error('Failed to create customer')
      );

      const result = await executeGetBillingPortal(input, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create customer');
    });
  });
});
