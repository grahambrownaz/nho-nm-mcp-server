/**
 * Tests for Stripe Webhook Handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Stripe from 'stripe';
import {
  handleStripeWebhook,
  validateStripeSignature,
} from '../../../src/webhooks/stripe.js';
import { prisma } from '../../../src/db/client.js';
import { logger } from '../../../src/utils/logger.js';

// Mock Stripe
vi.mock('stripe', () => {
  const mockStripe = {
    webhooks: {
      constructEvent: vi.fn(),
    },
  };
  return {
    default: vi.fn(() => mockStripe),
  };
});

// Mock Prisma client
vi.mock('../../../src/db/client.js', () => ({
  prisma: {
    tenant: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    subscription: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
    },
    apiKey: {
      create: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn(prisma)),
  },
}));

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
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

// Create Stripe event helper
function createStripeEvent(type: string, data: Record<string, unknown> = {}) {
  return {
    id: `evt_test_${Date.now()}`,
    type,
    data: {
      object: data,
    },
    created: Math.floor(Date.now() / 1000),
  };
}

describe('Stripe Webhook Handler', () => {
  let mockStripeInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStripeInstance = new (Stripe as any)('sk_test_123');

    // Default mock responses
    vi.mocked(prisma.tenant.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.tenant.create).mockResolvedValue({
      id: 'new-tenant-123',
      email: 'test@example.com',
      stripeCustomerId: 'cus_test_123',
    } as any);
    vi.mocked(prisma.tenant.update).mockResolvedValue({
      id: 'tenant-123',
    } as any);
    vi.mocked(prisma.subscription.create).mockResolvedValue({
      id: 'sub-123',
    } as any);
    vi.mocked(prisma.subscription.update).mockResolvedValue({
      id: 'sub-123',
    } as any);
    vi.mocked(prisma.subscription.updateMany).mockResolvedValue({
      count: 1,
    } as any);
    vi.mocked(prisma.subscription.findFirst).mockResolvedValue({
      id: 'sub-123',
      tenantId: 'tenant-123',
      status: 'ACTIVE',
    } as any);
    vi.mocked(prisma.apiKey.create).mockResolvedValue({
      id: 'api-key-123',
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('signature validation', () => {
    it('validates webhook signature', async () => {
      const payload = JSON.stringify({ type: 'test.event' });
      const signature = 'valid-signature';
      const secret = 'whsec_test_secret';

      mockStripeInstance.webhooks.constructEvent.mockReturnValue({
        type: 'test.event',
        data: { object: {} },
      });

      const result = await validateStripeSignature(payload, signature, secret);

      expect(mockStripeInstance.webhooks.constructEvent).toHaveBeenCalledWith(
        payload,
        signature,
        secret
      );
      expect(result).toBeDefined();
    });

    it('rejects invalid signatures', async () => {
      const payload = JSON.stringify({ type: 'test.event' });
      const signature = 'invalid-signature';
      const secret = 'whsec_test_secret';

      mockStripeInstance.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Webhook signature verification failed');
      });

      await expect(validateStripeSignature(payload, signature, secret)).rejects.toThrow(
        'signature verification failed'
      );
    });

    it('handles malformed payloads', async () => {
      const payload = 'not-json';
      const signature = 'some-signature';
      const secret = 'whsec_test_secret';

      mockStripeInstance.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid payload');
      });

      await expect(validateStripeSignature(payload, signature, secret)).rejects.toThrow();
    });
  });

  describe('checkout.session.completed', () => {
    it('creates tenant on checkout completion', async () => {
      const event = createStripeEvent('checkout.session.completed', {
        id: 'cs_test_123',
        customer: 'cus_test_456',
        subscription: 'sub_test_789',
        metadata: {
          email: 'test@example.com',
          plan: 'growth',
          company: 'Test Company',
        },
        customer_email: 'test@example.com',
      });

      await handleStripeWebhook(event);

      expect(prisma.tenant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'test@example.com',
          stripeCustomerId: 'cus_test_456',
          stripeSubscriptionId: 'sub_test_789',
        }),
      });
    });

    it('creates subscription record for new tenant', async () => {
      const event = createStripeEvent('checkout.session.completed', {
        id: 'cs_test_123',
        customer: 'cus_test_456',
        subscription: 'sub_test_789',
        metadata: {
          email: 'test@example.com',
          plan: 'growth',
        },
      });

      await handleStripeWebhook(event);

      expect(prisma.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          plan: 'GROWTH',
          status: 'ACTIVE',
        }),
      });
    });

    it('updates existing tenant on checkout', async () => {
      vi.mocked(prisma.tenant.findFirst).mockResolvedValue({
        id: 'existing-tenant-123',
        email: 'test@example.com',
        stripeCustomerId: null,
      } as any);

      const event = createStripeEvent('checkout.session.completed', {
        id: 'cs_test_123',
        customer: 'cus_test_456',
        subscription: 'sub_test_789',
        metadata: {
          email: 'test@example.com',
          plan: 'starter',
          tenantId: 'existing-tenant-123',
        },
      });

      await handleStripeWebhook(event);

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 'existing-tenant-123' },
        data: expect.objectContaining({
          stripeCustomerId: 'cus_test_456',
          stripeSubscriptionId: 'sub_test_789',
        }),
      });
    });

    it('generates API key for new tenant', async () => {
      const event = createStripeEvent('checkout.session.completed', {
        id: 'cs_test_123',
        customer: 'cus_test_456',
        subscription: 'sub_test_789',
        metadata: {
          email: 'test@example.com',
          plan: 'pro',
        },
      });

      await handleStripeWebhook(event);

      expect(prisma.apiKey.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Default API Key',
          permissions: expect.arrayContaining(['*']),
          isActive: true,
        }),
      });
    });
  });

  describe('invoice.paid', () => {
    it('handles invoice payment', async () => {
      vi.mocked(prisma.tenant.findFirst).mockResolvedValue({
        id: 'tenant-123',
        stripeCustomerId: 'cus_test_456',
      } as any);

      const event = createStripeEvent('invoice.paid', {
        id: 'in_test_123',
        customer: 'cus_test_456',
        subscription: 'sub_test_789',
        amount_paid: 9900,
        currency: 'usd',
      });

      await handleStripeWebhook(event);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'invoice.paid',
        }),
        expect.any(String)
      );
    });

    it('reactivates paused subscriptions on payment', async () => {
      vi.mocked(prisma.tenant.findFirst).mockResolvedValue({
        id: 'tenant-123',
        stripeCustomerId: 'cus_test_456',
      } as any);

      vi.mocked(prisma.subscription.findFirst).mockResolvedValue({
        id: 'sub-123',
        tenantId: 'tenant-123',
        status: 'PAUSED',
      } as any);

      const event = createStripeEvent('invoice.paid', {
        customer: 'cus_test_456',
        subscription: 'sub_test_789',
      });

      await handleStripeWebhook(event);

      expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123' },
        data: { status: 'ACTIVE' },
      });
    });
  });

  describe('invoice.payment_failed', () => {
    it('pauses deliveries on payment failure', async () => {
      vi.mocked(prisma.tenant.findFirst).mockResolvedValue({
        id: 'tenant-123',
        stripeCustomerId: 'cus_test_456',
      } as any);

      vi.mocked(prisma.subscription.findFirst).mockResolvedValue({
        id: 'sub-123',
        tenantId: 'tenant-123',
        status: 'ACTIVE',
      } as any);

      const event = createStripeEvent('invoice.payment_failed', {
        id: 'in_test_failed',
        customer: 'cus_test_456',
        subscription: 'sub_test_789',
        attempt_count: 1,
      });

      await handleStripeWebhook(event);

      expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123' },
        data: { status: 'PAUSED' },
      });
    });

    it('logs payment failure details', async () => {
      vi.mocked(prisma.tenant.findFirst).mockResolvedValue({
        id: 'tenant-123',
        stripeCustomerId: 'cus_test_456',
      } as any);

      const event = createStripeEvent('invoice.payment_failed', {
        customer: 'cus_test_456',
        attempt_count: 3,
        next_payment_attempt: Math.floor(Date.now() / 1000) + 86400,
      });

      await handleStripeWebhook(event);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'invoice.payment_failed',
          attemptCount: 3,
        }),
        expect.any(String)
      );
    });
  });

  describe('customer.subscription.deleted', () => {
    it('handles subscription cancellation', async () => {
      vi.mocked(prisma.tenant.findFirst).mockResolvedValue({
        id: 'tenant-123',
        stripeCustomerId: 'cus_test_456',
        stripeSubscriptionId: 'sub_test_789',
      } as any);

      const event = createStripeEvent('customer.subscription.deleted', {
        id: 'sub_test_789',
        customer: 'cus_test_456',
        status: 'canceled',
      });

      await handleStripeWebhook(event);

      expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123' },
        data: { status: 'CANCELLED' },
      });
    });

    it('updates tenant subscription ID to null', async () => {
      vi.mocked(prisma.tenant.findFirst).mockResolvedValue({
        id: 'tenant-123',
        stripeCustomerId: 'cus_test_456',
        stripeSubscriptionId: 'sub_test_789',
      } as any);

      const event = createStripeEvent('customer.subscription.deleted', {
        id: 'sub_test_789',
        customer: 'cus_test_456',
      });

      await handleStripeWebhook(event);

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
        data: { stripeSubscriptionId: null },
      });
    });
  });

  describe('customer.subscription.updated', () => {
    it('handles subscription plan change', async () => {
      vi.mocked(prisma.tenant.findFirst).mockResolvedValue({
        id: 'tenant-123',
        stripeCustomerId: 'cus_test_456',
      } as any);

      const event = createStripeEvent('customer.subscription.updated', {
        id: 'sub_test_789',
        customer: 'cus_test_456',
        items: {
          data: [
            {
              price: {
                id: 'price_pro_monthly',
                product: 'prod_pro',
                metadata: { plan: 'pro' },
              },
            },
          ],
        },
      });

      await handleStripeWebhook(event);

      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            plan: 'PRO',
          }),
        })
      );
    });

    it('handles subscription status change', async () => {
      vi.mocked(prisma.tenant.findFirst).mockResolvedValue({
        id: 'tenant-123',
        stripeCustomerId: 'cus_test_456',
      } as any);

      const event = createStripeEvent('customer.subscription.updated', {
        id: 'sub_test_789',
        customer: 'cus_test_456',
        status: 'past_due',
      });

      await handleStripeWebhook(event);

      expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123' },
        data: expect.objectContaining({
          status: expect.any(String),
        }),
      });
    });
  });

  describe('unknown event types', () => {
    it('ignores unknown event types', async () => {
      const event = createStripeEvent('unknown.event.type', {});

      await handleStripeWebhook(event);

      expect(prisma.tenant.create).not.toHaveBeenCalled();
      expect(prisma.tenant.update).not.toHaveBeenCalled();
      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });

    it('logs unknown events', async () => {
      const event = createStripeEvent('some.new.event', {});

      await handleStripeWebhook(event);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'some.new.event',
        }),
        expect.stringContaining('Unhandled')
      );
    });
  });

  describe('error handling', () => {
    it('handles missing customer gracefully', async () => {
      vi.mocked(prisma.tenant.findFirst).mockResolvedValue(null);

      const event = createStripeEvent('invoice.paid', {
        customer: 'cus_unknown',
      });

      await handleStripeWebhook(event);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'cus_unknown',
        }),
        expect.stringContaining('not found')
      );
    });

    it('handles database errors', async () => {
      vi.mocked(prisma.tenant.create).mockRejectedValue(new Error('Database error'));

      const event = createStripeEvent('checkout.session.completed', {
        customer: 'cus_test_456',
        subscription: 'sub_test_789',
        metadata: {
          email: 'test@example.com',
          plan: 'starter',
        },
      });

      await expect(handleStripeWebhook(event)).rejects.toThrow('Database error');
    });
  });

  describe('trial events', () => {
    it('handles trial will end event', async () => {
      vi.mocked(prisma.tenant.findFirst).mockResolvedValue({
        id: 'tenant-123',
        stripeCustomerId: 'cus_test_456',
      } as any);

      const event = createStripeEvent('customer.subscription.trial_will_end', {
        id: 'sub_test_789',
        customer: 'cus_test_456',
        trial_end: Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60,
      });

      await handleStripeWebhook(event);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'customer.subscription.trial_will_end',
        }),
        expect.any(String)
      );
    });
  });

  describe('payment method events', () => {
    it('handles payment method attached', async () => {
      vi.mocked(prisma.tenant.findFirst).mockResolvedValue({
        id: 'tenant-123',
        stripeCustomerId: 'cus_test_456',
      } as any);

      const event = createStripeEvent('payment_method.attached', {
        id: 'pm_test_123',
        customer: 'cus_test_456',
        type: 'card',
        card: {
          brand: 'visa',
          last4: '4242',
        },
      });

      await handleStripeWebhook(event);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'payment_method.attached',
        }),
        expect.any(String)
      );
    });
  });

  describe('idempotency', () => {
    it('handles duplicate events gracefully', async () => {
      const event = createStripeEvent('checkout.session.completed', {
        id: 'cs_test_duplicate',
        customer: 'cus_test_456',
        subscription: 'sub_test_789',
        metadata: {
          email: 'test@example.com',
          plan: 'starter',
        },
      });

      // First call creates tenant
      await handleStripeWebhook(event);

      // Second call should find existing tenant
      vi.mocked(prisma.tenant.findFirst).mockResolvedValue({
        id: 'tenant-123',
        stripeCustomerId: 'cus_test_456',
      } as any);

      await handleStripeWebhook(event);

      // Should update instead of create
      expect(prisma.tenant.update).toHaveBeenCalled();
    });
  });
});
