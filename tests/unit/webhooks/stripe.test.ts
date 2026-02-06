/**
 * Tests for Stripe Webhook Handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { handleStripeWebhook } from '../../../src/webhooks/stripe.js';
import { prisma } from '../../../src/db/client.js';

// Mock Stripe
const mockStripeInstance = {
  webhooks: {
    constructEvent: vi.fn(),
  },
  customers: {
    retrieve: vi.fn(),
  },
  paymentIntents: {
    retrieve: vi.fn(),
  },
};

vi.mock('stripe', () => {
  return {
    default: vi.fn(() => mockStripeInstance),
  };
});

// Mock Prisma client
vi.mock('../../../src/db/client.js', () => ({
  prisma: {
    tenant: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    subscription: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    dataSubscription: {
      updateMany: vi.fn(),
    },
    apiKey: {
      create: vi.fn(),
    },
    usageRecord: {
      create: vi.fn(),
    },
    listPurchase: {
      update: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn(prisma)),
  },
}));

// Mock purchase fulfillment
vi.mock('../../../src/services/purchase-fulfillment.js', () => ({
  fulfillListPurchase: vi.fn(),
}));

// Mock stripe-billing pauseSubscription
vi.mock('../../../src/services/stripe-billing.js', () => ({
  pauseSubscription: vi.fn(),
}));

// Create mock request helper
function createMockRequest(event: Stripe.Event, signature = 'sig_test'): Partial<Request> {
  return {
    headers: { 'stripe-signature': signature },
    body: Buffer.from(JSON.stringify(event)),
  };
}

// Create mock response helper
function createMockResponse(): Partial<Response> & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
}

// Create Stripe event helper
function createStripeEvent(type: string, data: Record<string, unknown> = {}): Stripe.Event {
  return {
    id: `evt_test_${Date.now()}`,
    type,
    data: {
      object: data,
    },
    object: 'event',
    api_version: '2026-01-28',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
  } as Stripe.Event;
}

describe('Stripe Webhook Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set environment variables for Stripe
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_456';

    // Default mock responses
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.tenant.create).mockResolvedValue({
      id: 'new-tenant-123',
      email: 'test@example.com',
      name: 'Test Tenant',
      status: 'ACTIVE',
    } as any);
    vi.mocked(prisma.tenant.update).mockResolvedValue({
      id: 'tenant-123',
    } as any);
    vi.mocked(prisma.subscription.upsert).mockResolvedValue({
      id: 'sub-123',
    } as any);
    vi.mocked(prisma.subscription.updateMany).mockResolvedValue({
      count: 1,
    } as any);
    vi.mocked(prisma.dataSubscription.updateMany).mockResolvedValue({
      count: 1,
    } as any);
    vi.mocked(prisma.apiKey.create).mockResolvedValue({
      id: 'api-key-123',
    } as any);
    vi.mocked(prisma.usageRecord.create).mockResolvedValue({
      id: 'usage-123',
    } as any);

    // Mock Stripe customer retrieval
    mockStripeInstance.customers.retrieve.mockResolvedValue({
      id: 'cus_test_123',
      email: 'test@example.com',
      metadata: { tenantId: 'tenant-123' },
      deleted: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  describe('signature validation', () => {
    it('rejects requests without stripe-signature header', async () => {
      const event = createStripeEvent('test.event');
      const req = {
        headers: {},
        body: Buffer.from(JSON.stringify(event)),
      } as Partial<Request>;
      const res = createMockResponse();

      await handleStripeWebhook(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing stripe-signature header' });
    });

    it('rejects invalid signatures', async () => {
      const event = createStripeEvent('test.event');
      const req = createMockRequest(event, 'invalid-signature');
      const res = createMockResponse();

      mockStripeInstance.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Webhook signature verification failed');
      });

      await handleStripeWebhook(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Webhook signature verification failed' });
    });

    it('accepts valid signatures', async () => {
      const event = createStripeEvent('unknown.event.type', {});
      const req = createMockRequest(event);
      const res = createMockResponse();

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);

      await handleStripeWebhook(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });
  });

  describe('checkout.session.completed', () => {
    it('creates tenant on checkout completion', async () => {
      const event = createStripeEvent('checkout.session.completed', {
        id: 'cs_test_123',
        customer: 'cus_test_456',
        subscription: 'sub_test_789',
        mode: 'subscription',
        customer_email: 'test@example.com',
        customer_details: { email: 'test@example.com', name: 'Test Company' },
        metadata: {
          tenantName: 'Test Tenant',
          planType: 'growth',
        },
      });

      const req = createMockRequest(event);
      const res = createMockResponse();

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null);

      await handleStripeWebhook(req as Request, res as Response);

      expect(prisma.tenant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'test@example.com',
          status: 'ACTIVE',
        }),
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('creates subscription record for new tenant', async () => {
      const event = createStripeEvent('checkout.session.completed', {
        id: 'cs_test_123',
        customer: 'cus_test_456',
        subscription: 'sub_test_789',
        mode: 'subscription',
        customer_email: 'test@example.com',
        metadata: {
          planType: 'growth',
        },
      });

      const req = createMockRequest(event);
      const res = createMockResponse();

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null);

      await handleStripeWebhook(req as Request, res as Response);

      expect(prisma.subscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            plan: 'GROWTH',
            status: 'ACTIVE',
          }),
        })
      );
    });

    it('updates existing tenant on checkout', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
        id: 'existing-tenant-123',
        email: 'test@example.com',
        name: 'Existing Tenant',
        status: 'PENDING',
      } as any);

      const event = createStripeEvent('checkout.session.completed', {
        id: 'cs_test_123',
        customer: 'cus_test_456',
        subscription: 'sub_test_789',
        mode: 'subscription',
        customer_email: 'test@example.com',
        metadata: {
          planType: 'starter',
        },
      });

      const req = createMockRequest(event);
      const res = createMockResponse();

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);

      await handleStripeWebhook(req as Request, res as Response);

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 'existing-tenant-123' },
        data: { status: 'ACTIVE' },
      });
    });

    it('generates API key for new tenant', async () => {
      const event = createStripeEvent('checkout.session.completed', {
        id: 'cs_test_123',
        customer: 'cus_test_456',
        subscription: 'sub_test_789',
        mode: 'subscription',
        customer_email: 'test@example.com',
        metadata: {
          planType: 'pro',
        },
      });

      const req = createMockRequest(event);
      const res = createMockResponse();

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null);

      await handleStripeWebhook(req as Request, res as Response);

      expect(prisma.apiKey.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Default API Key',
          permissions: ['*'],
          isActive: true,
        }),
      });
    });
  });

  describe('invoice.paid', () => {
    it('handles invoice payment', async () => {
      const event = createStripeEvent('invoice.paid', {
        id: 'in_test_123',
        customer: 'cus_test_456',
        subscription: 'sub_test_789',
        amount_paid: 9900,
        currency: 'usd',
        period_start: Math.floor(Date.now() / 1000),
      });

      const req = createMockRequest(event);
      const res = createMockResponse();

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);

      await handleStripeWebhook(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(prisma.usageRecord.create).toHaveBeenCalled();
    });

    it('handles deleted customer gracefully', async () => {
      mockStripeInstance.customers.retrieve.mockResolvedValue({
        deleted: true,
      });

      const event = createStripeEvent('invoice.paid', {
        id: 'in_test_123',
        customer: 'cus_deleted',
        amount_paid: 9900,
        period_start: Math.floor(Date.now() / 1000),
      });

      const req = createMockRequest(event);
      const res = createMockResponse();

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);

      await handleStripeWebhook(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      // Should not create usage record for deleted customer
    });
  });

  describe('invoice.payment_failed', () => {
    it('pauses subscriptions on payment failure', async () => {
      const event = createStripeEvent('invoice.payment_failed', {
        id: 'in_test_failed',
        customer: 'cus_test_456',
        subscription: 'sub_test_789',
        attempt_count: 1,
      });

      const req = createMockRequest(event);
      const res = createMockResponse();

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);

      await handleStripeWebhook(req as Request, res as Response);

      expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123' },
        data: { status: 'PAST_DUE' },
      });
      expect(prisma.dataSubscription.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-123',
          status: 'ACTIVE',
        },
        data: expect.objectContaining({
          status: 'PAUSED',
        }),
      });
    });

    it('handles missing tenant gracefully', async () => {
      mockStripeInstance.customers.retrieve.mockResolvedValue({
        id: 'cus_unknown',
        metadata: {},
        deleted: false,
      });

      const event = createStripeEvent('invoice.payment_failed', {
        customer: 'cus_unknown',
        attempt_count: 3,
      });

      const req = createMockRequest(event);
      const res = createMockResponse();

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);

      await handleStripeWebhook(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      // Should handle gracefully without error
    });
  });

  describe('customer.subscription.deleted', () => {
    it('handles subscription cancellation', async () => {
      const event = createStripeEvent('customer.subscription.deleted', {
        id: 'sub_test_789',
        customer: 'cus_test_456',
        status: 'canceled',
      });

      const req = createMockRequest(event);
      const res = createMockResponse();

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);

      await handleStripeWebhook(req as Request, res as Response);

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
        data: { status: 'CANCELLED' },
      });
      expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123' },
        data: { status: 'CANCELLED' },
      });
    });

    it('cancels data subscriptions on subscription deletion', async () => {
      const event = createStripeEvent('customer.subscription.deleted', {
        id: 'sub_test_789',
        customer: 'cus_test_456',
      });

      const req = createMockRequest(event);
      const res = createMockResponse();

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);

      await handleStripeWebhook(req as Request, res as Response);

      expect(prisma.dataSubscription.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123' },
        data: expect.objectContaining({
          status: 'CANCELLED',
        }),
      });
    });
  });

  describe('customer.subscription.updated', () => {
    it('handles subscription status change to active', async () => {
      const event = createStripeEvent('customer.subscription.updated', {
        id: 'sub_test_789',
        customer: 'cus_test_456',
        status: 'active',
      });

      const req = createMockRequest(event);
      const res = createMockResponse();

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);

      await handleStripeWebhook(req as Request, res as Response);

      expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123' },
        data: { status: 'ACTIVE' },
      });
    });

    it('handles subscription status change to past_due', async () => {
      const event = createStripeEvent('customer.subscription.updated', {
        id: 'sub_test_789',
        customer: 'cus_test_456',
        status: 'past_due',
      });

      const req = createMockRequest(event);
      const res = createMockResponse();

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);

      await handleStripeWebhook(req as Request, res as Response);

      expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123' },
        data: { status: 'PAST_DUE' },
      });
    });

    it('resumes paused data subscriptions when subscription becomes active', async () => {
      const event = createStripeEvent('customer.subscription.updated', {
        id: 'sub_test_789',
        customer: 'cus_test_456',
        status: 'active',
      });

      const req = createMockRequest(event);
      const res = createMockResponse();

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);

      await handleStripeWebhook(req as Request, res as Response);

      expect(prisma.dataSubscription.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-123',
          status: 'PAUSED',
        },
        data: expect.objectContaining({
          status: 'ACTIVE',
        }),
      });
    });
  });

  describe('unknown event types', () => {
    it('handles unknown event types gracefully', async () => {
      const event = createStripeEvent('unknown.event.type', {});

      const req = createMockRequest(event);
      const res = createMockResponse();

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);

      await handleStripeWebhook(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ received: true });
      expect(prisma.tenant.create).not.toHaveBeenCalled();
      expect(prisma.tenant.update).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('returns 500 on processing error', async () => {
      const event = createStripeEvent('checkout.session.completed', {
        id: 'cs_test_123',
        customer: 'cus_test_456',
        subscription: 'sub_test_789',
        mode: 'subscription',
        customer_email: 'test@example.com',
        metadata: { planType: 'starter' },
      });

      const req = createMockRequest(event);
      const res = createMockResponse();

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.tenant.create).mockRejectedValue(new Error('Database error'));

      await handleStripeWebhook(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Webhook processing failed' });
    });

    it('handles missing email in checkout session', async () => {
      const event = createStripeEvent('checkout.session.completed', {
        id: 'cs_test_123',
        customer: 'cus_test_456',
        subscription: 'sub_test_789',
        mode: 'subscription',
        customer_email: null,
        customer_details: null,
        metadata: { planType: 'starter' },
      });

      const req = createMockRequest(event);
      const res = createMockResponse();

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);

      await handleStripeWebhook(req as Request, res as Response);

      // Should complete without creating tenant
      expect(res.status).toHaveBeenCalledWith(200);
      expect(prisma.tenant.create).not.toHaveBeenCalled();
    });
  });

  describe('one-time payment (payment link)', () => {
    it('handles payment link completion for list purchase', async () => {
      const event = createStripeEvent('checkout.session.completed', {
        id: 'cs_test_123',
        customer: 'cus_test_456',
        mode: 'payment',
        payment_intent: 'pi_test_123',
        metadata: {
          purchase_id: 'purchase-123',
        },
      });

      const req = createMockRequest(event);
      const res = createMockResponse();

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);
      mockStripeInstance.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_test_123',
        latest_charge: {
          receipt_url: 'https://receipt.stripe.com/test',
        },
      });

      await handleStripeWebhook(req as Request, res as Response);

      expect(prisma.listPurchase.update).toHaveBeenCalledWith({
        where: { id: 'purchase-123' },
        data: expect.objectContaining({
          stripePaymentIntentId: 'pi_test_123',
          paymentStatus: 'PROCESSING',
        }),
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
