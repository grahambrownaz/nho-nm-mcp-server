/**
 * Tests for Stripe Billing Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Stripe from 'stripe';
import {
  createStripeCustomer,
  createCheckoutSession,
  createSubscription,
  reportUsage,
  getUpcomingInvoice,
  createPortalSession,
  getBillingStatus,
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
  getOrCreateCustomer,
  getSubscriptionItems,
  STRIPE_PRICES,
  PLANS,
} from '../../../src/services/stripe-billing.js';
import { prisma } from '../../../src/db/client.js';

// Mock Stripe SDK
const mockStripeInstance = {
  customers: {
    create: vi.fn(),
    retrieve: vi.fn(),
    update: vi.fn(),
    list: vi.fn(),
  },
  checkout: {
    sessions: {
      create: vi.fn(),
    },
  },
  subscriptions: {
    create: vi.fn(),
    retrieve: vi.fn(),
    update: vi.fn(),
    cancel: vi.fn(),
    list: vi.fn(),
  },
  subscriptionItems: {
    createUsageRecord: vi.fn(),
    listUsageRecordSummaries: vi.fn(),
  },
  invoices: {
    createPreview: vi.fn(),
    list: vi.fn(),
  },
  billingPortal: {
    sessions: {
      create: vi.fn(),
    },
  },
  paymentMethods: {
    list: vi.fn(),
    retrieve: vi.fn(),
  },
  prices: {
    list: vi.fn(),
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
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    subscription: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('Stripe Billing Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set environment variables
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_456';
    // Ensure demo mode is disabled for tests
    delete process.env.DEMO_MODE;

    // Default mock responses
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      id: 'tenant-123',
      name: 'Test Tenant',
      email: 'test@example.com',
      stripeCustomerId: 'cus_test_123',
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  describe('createStripeCustomer', () => {
    it('creates Stripe customer', async () => {
      mockStripeInstance.customers.create.mockResolvedValue({
        id: 'cus_new_123',
        email: 'new@example.com',
        name: 'New Customer',
        metadata: {},
      });

      const customerId = await createStripeCustomer({
        email: 'new@example.com',
        name: 'New Customer',
        tenantId: 'tenant-123',
      });

      expect(mockStripeInstance.customers.create).toHaveBeenCalledWith({
        email: 'new@example.com',
        name: 'New Customer',
        metadata: expect.objectContaining({
          tenantId: 'tenant-123',
        }),
      });
      expect(customerId).toBe('cus_new_123');
    });

    it('includes company name in metadata when provided', async () => {
      mockStripeInstance.customers.create.mockResolvedValue({
        id: 'cus_new_456',
        email: 'business@example.com',
        name: 'Contact Person',
      });

      await createStripeCustomer({
        email: 'business@example.com',
        name: 'Contact Person',
        company: 'Business Name',
        tenantId: 'tenant-456',
      });

      expect(mockStripeInstance.customers.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Contact Person',
          metadata: expect.objectContaining({
            company: 'Business Name',
          }),
        })
      );
    });

    it('handles Stripe API error', async () => {
      mockStripeInstance.customers.create.mockRejectedValue(
        new Error('Card declined')
      );

      await expect(
        createStripeCustomer({
          email: 'test@example.com',
          name: 'Test',
          tenantId: 'tenant-123',
        })
      ).rejects.toThrow('Card declined');
    });

    it('updates tenant with Stripe customer ID', async () => {
      mockStripeInstance.customers.create.mockResolvedValue({
        id: 'cus_new_789',
        email: 'test@example.com',
        name: 'Test',
      });

      await createStripeCustomer({
        email: 'test@example.com',
        name: 'Test',
        tenantId: 'tenant-123',
      });

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
        data: { stripeCustomerId: 'cus_new_789' },
      });
    });
  });

  describe('createCheckoutSession', () => {
    it('generates valid checkout URL', async () => {
      mockStripeInstance.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/pay/cs_test_123',
      });

      const session = await createCheckoutSession({
        planType: 'starter',
        tenantEmail: 'test@example.com',
        tenantName: 'Test Tenant',
        successUrl: 'https://app.example.com/billing/success',
        cancelUrl: 'https://app.example.com/billing/cancel',
      });

      expect(mockStripeInstance.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          customer_email: 'test@example.com',
          success_url: 'https://app.example.com/billing/success',
          cancel_url: 'https://app.example.com/billing/cancel',
        })
      );
      expect(session.url).toContain('checkout.stripe.com');
    });

    it('includes plan-specific line items', async () => {
      mockStripeInstance.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test_456',
        url: 'https://checkout.stripe.com/pay/cs_test_456',
      });

      await createCheckoutSession({
        planType: 'growth',
        tenantEmail: 'test@example.com',
        tenantName: 'Test Tenant',
        successUrl: 'https://app.example.com/success',
        cancelUrl: 'https://app.example.com/cancel',
      });

      expect(mockStripeInstance.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: expect.arrayContaining([
            expect.objectContaining({
              price: PLANS.growth.platformPriceId,
            }),
          ]),
        })
      );
    });

    it('includes tenant metadata in checkout session', async () => {
      mockStripeInstance.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test_meta',
        url: 'https://checkout.stripe.com/pay/cs_test_meta',
      });

      await createCheckoutSession({
        planType: 'pro',
        tenantEmail: 'test@example.com',
        tenantName: 'Test Tenant',
        successUrl: 'https://app.example.com/success',
        cancelUrl: 'https://app.example.com/cancel',
        metadata: {
          source: 'upgrade_modal',
        },
      });

      expect(mockStripeInstance.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            planType: 'pro',
            tenantName: 'Test Tenant',
            source: 'upgrade_modal',
          }),
        })
      );
    });

    it('throws error for invalid plan type', async () => {
      await expect(
        createCheckoutSession({
          planType: 'invalid' as any,
          tenantEmail: 'test@example.com',
          tenantName: 'Test Tenant',
          successUrl: 'https://app.example.com/success',
          cancelUrl: 'https://app.example.com/cancel',
        })
      ).rejects.toThrow('Invalid plan type');
    });
  });

  describe('createSubscription', () => {
    it('creates subscription with metered pricing', async () => {
      mockStripeInstance.subscriptions.create.mockResolvedValue({
        id: 'sub_test_123',
        status: 'active',
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        items: {
          data: [
            { id: 'si_records', price: { id: 'price_records_metered' } },
            { id: 'si_pdf', price: { id: 'price_pdf_metered' } },
          ],
        },
      });

      const subscription = await createSubscription({
        customerId: 'cus_test_123',
        planType: 'starter',
      });

      expect(mockStripeInstance.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_test_123',
          items: expect.arrayContaining([
            expect.objectContaining({ price: PLANS.starter.platformPriceId }),
          ]),
        })
      );
      expect(subscription.subscriptionId).toBe('sub_test_123');
      expect(subscription.status).toBe('active');
    });

    it('includes metadata in subscription', async () => {
      mockStripeInstance.subscriptions.create.mockResolvedValue({
        id: 'sub_test_456',
        status: 'active',
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        items: { data: [] },
      });

      await createSubscription({
        customerId: 'cus_test_123',
        planType: 'growth',
        metadata: {
          source: 'api',
        },
      });

      expect(mockStripeInstance.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            planType: 'growth',
            source: 'api',
          }),
        })
      );
    });
  });

  describe('reportUsage', () => {
    it('sends usage record to Stripe', async () => {
      mockStripeInstance.subscriptionItems.createUsageRecord.mockResolvedValue({
        id: 'mbur_test_123',
        quantity: 500,
        timestamp: Math.floor(Date.now() / 1000),
      });

      const result = await reportUsage({
        subscriptionItemId: 'si_records_123',
        quantity: 500,
      });

      expect(mockStripeInstance.subscriptionItems.createUsageRecord).toHaveBeenCalledWith(
        'si_records_123',
        expect.objectContaining({
          quantity: 500,
          action: 'increment',
        })
      );
      expect(result.usageRecordId).toBe('mbur_test_123');
      expect(result.quantity).toBe(500);
    });

    it('uses set action when specified', async () => {
      mockStripeInstance.subscriptionItems.createUsageRecord.mockResolvedValue({
        id: 'mbur_test_456',
        quantity: 1000,
      });

      await reportUsage({
        subscriptionItemId: 'si_records_123',
        quantity: 1000,
        action: 'set',
      });

      expect(mockStripeInstance.subscriptionItems.createUsageRecord).toHaveBeenCalledWith(
        'si_records_123',
        expect.objectContaining({
          quantity: 1000,
          action: 'set',
        })
      );
    });

    it('includes timestamp when provided', async () => {
      const timestamp = Math.floor(Date.now() / 1000) - 3600;
      mockStripeInstance.subscriptionItems.createUsageRecord.mockResolvedValue({
        id: 'mbur_test_789',
        quantity: 100,
        timestamp,
      });

      await reportUsage({
        subscriptionItemId: 'si_pdf_123',
        quantity: 100,
        timestamp,
      });

      expect(mockStripeInstance.subscriptionItems.createUsageRecord).toHaveBeenCalledWith(
        'si_pdf_123',
        expect.objectContaining({
          timestamp,
        })
      );
    });
  });

  describe('getUpcomingInvoice', () => {
    it('returns invoice preview', async () => {
      mockStripeInstance.invoices.createPreview.mockResolvedValue({
        id: 'in_upcoming_123',
        customer: 'cus_test_123',
        amount_due: 5999,
        currency: 'usd',
        period_start: Math.floor(Date.now() / 1000),
        period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        lines: {
          data: [
            { description: 'Starter Plan', amount: 4900, quantity: 1 },
            { description: 'Data Records (500 @ $0.02)', amount: 1000, quantity: 500 },
            { description: 'PDF Generation (10 @ $0.10)', amount: 100, quantity: 10 },
          ],
        },
      });

      const invoice = await getUpcomingInvoice('cus_test_123');

      expect(mockStripeInstance.invoices.createPreview).toHaveBeenCalledWith({
        customer: 'cus_test_123',
      });
      expect(invoice.amountDue).toBe(59.99);
      expect(invoice.lineItems).toHaveLength(3);
    });
  });

  describe('createPortalSession', () => {
    it('generates portal URL', async () => {
      mockStripeInstance.billingPortal.sessions.create.mockResolvedValue({
        id: 'bps_test_123',
        url: 'https://billing.stripe.com/session/bps_test_123',
      });

      const session = await createPortalSession({
        customerId: 'cus_test_123',
        returnUrl: 'https://app.example.com/billing',
      });

      expect(mockStripeInstance.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: 'cus_test_123',
        return_url: 'https://app.example.com/billing',
      });
      expect(session.url).toContain('billing.stripe.com');
    });
  });

  describe('cancelSubscription', () => {
    it('cancels subscription immediately', async () => {
      mockStripeInstance.subscriptions.cancel.mockResolvedValue({
        id: 'sub_test_123',
        status: 'canceled',
      });

      const result = await cancelSubscription('sub_test_123', true);

      expect(mockStripeInstance.subscriptions.cancel).toHaveBeenCalledWith('sub_test_123');
      expect(result.status).toBe('canceled');
      expect(result.cancelAt).toBeNull();
    });

    it('cancels at period end when specified', async () => {
      const cancelAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
      mockStripeInstance.subscriptions.update.mockResolvedValue({
        id: 'sub_test_123',
        status: 'active',
        cancel_at_period_end: true,
        cancel_at: cancelAt,
      });

      const result = await cancelSubscription('sub_test_123', false);

      expect(mockStripeInstance.subscriptions.update).toHaveBeenCalledWith(
        'sub_test_123',
        { cancel_at_period_end: true }
      );
      expect(result.status).toBe('active');
      expect(result.cancelAt).toBeInstanceOf(Date);
    });
  });

  describe('pauseSubscription', () => {
    it('pauses subscription collection', async () => {
      mockStripeInstance.subscriptions.update.mockResolvedValue({
        id: 'sub_test_123',
        status: 'active',
        pause_collection: { behavior: 'mark_uncollectible' },
      });

      await pauseSubscription('sub_test_123');

      expect(mockStripeInstance.subscriptions.update).toHaveBeenCalledWith(
        'sub_test_123',
        {
          pause_collection: {
            behavior: 'mark_uncollectible',
          },
        }
      );
    });
  });

  describe('resumeSubscription', () => {
    it('resumes paused subscription', async () => {
      mockStripeInstance.subscriptions.update.mockResolvedValue({
        id: 'sub_test_123',
        status: 'active',
        pause_collection: null,
      });

      await resumeSubscription('sub_test_123');

      expect(mockStripeInstance.subscriptions.update).toHaveBeenCalledWith(
        'sub_test_123',
        { pause_collection: '' }
      );
    });
  });

  describe('getOrCreateCustomer', () => {
    it('returns existing customer ID from tenant', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
        id: 'tenant-123',
        email: 'test@example.com',
        name: 'Test Tenant',
        stripeCustomerId: 'cus_existing_123',
      } as any);

      const customerId = await getOrCreateCustomer('tenant-123');

      expect(customerId).toBe('cus_existing_123');
      expect(mockStripeInstance.customers.create).not.toHaveBeenCalled();
    });

    it('searches for customer by email if not stored', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
        id: 'tenant-123',
        email: 'test@example.com',
        name: 'Test Tenant',
        stripeCustomerId: null,
      } as any);

      mockStripeInstance.customers.list.mockResolvedValue({
        data: [{ id: 'cus_found_123' }],
      });

      const customerId = await getOrCreateCustomer('tenant-123');

      expect(mockStripeInstance.customers.list).toHaveBeenCalledWith({
        email: 'test@example.com',
        limit: 1,
      });
      expect(customerId).toBe('cus_found_123');
    });

    it('creates new customer if not found', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
        id: 'tenant-123',
        email: 'test@example.com',
        name: 'Test Tenant',
        company: 'Test Co',
        stripeCustomerId: null,
      } as any);

      mockStripeInstance.customers.list.mockResolvedValue({
        data: [],
      });

      mockStripeInstance.customers.create.mockResolvedValue({
        id: 'cus_new_123',
      });

      const customerId = await getOrCreateCustomer('tenant-123');

      expect(mockStripeInstance.customers.create).toHaveBeenCalled();
      expect(customerId).toBe('cus_new_123');
    });

    it('throws error if tenant not found', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null);

      await expect(getOrCreateCustomer('tenant-invalid')).rejects.toThrow(
        'Tenant tenant-invalid not found'
      );
    });
  });

  describe('getSubscriptionItems', () => {
    it('returns subscription items with price info', async () => {
      mockStripeInstance.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_test_123',
        items: {
          data: [
            { id: 'si_1', price: { id: 'price_platform', nickname: 'Platform Fee' } },
            { id: 'si_2', price: { id: 'price_records', nickname: 'Data Records' } },
          ],
        },
      });

      const items = await getSubscriptionItems('sub_test_123');

      expect(items).toHaveLength(2);
      expect(items[0].id).toBe('si_1');
      expect(items[0].priceId).toBe('price_platform');
      expect(items[0].priceName).toBe('Platform Fee');
    });
  });

  describe('getBillingStatus', () => {
    it('returns complete billing status', async () => {
      mockStripeInstance.customers.retrieve.mockResolvedValue({
        id: 'cus_test_123',
        email: 'test@example.com',
        name: 'Test Customer',
        deleted: false,
        invoice_settings: {
          default_payment_method: 'pm_test_123',
        },
      });

      mockStripeInstance.subscriptions.list.mockResolvedValue({
        data: [{
          id: 'sub_test_123',
          status: 'active',
          metadata: { planType: 'growth' },
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          items: { data: [] },
        }],
      });

      mockStripeInstance.paymentMethods.retrieve.mockResolvedValue({
        type: 'card',
        card: {
          brand: 'visa',
          last4: '4242',
          exp_month: 12,
          exp_year: 2027,
        },
      });

      mockStripeInstance.invoices.createPreview.mockResolvedValue({
        amount_due: 4900,
        currency: 'usd',
      });

      const status = await getBillingStatus('cus_test_123');

      expect(status.customer.email).toBe('test@example.com');
      expect(status.subscription).not.toBeNull();
      expect(status.subscription?.status).toBe('active');
      expect(status.paymentMethod?.type).toBe('card');
      expect(status.upcomingInvoice?.amountDue).toBe(49);
    });

    it('throws error for deleted customer', async () => {
      mockStripeInstance.customers.retrieve.mockResolvedValue({
        deleted: true,
      });

      await expect(getBillingStatus('cus_deleted')).rejects.toThrow(
        'Customer has been deleted'
      );
    });
  });

  describe('STRIPE_PRICES', () => {
    it('exports price constants', () => {
      expect(STRIPE_PRICES.DATA_RECORD).toBeDefined();
      expect(STRIPE_PRICES.PDF_GENERATION).toBeDefined();
      expect(STRIPE_PRICES.PRINT_4X6).toBeDefined();
    });
  });

  describe('PLANS', () => {
    it('exports plan configurations', () => {
      expect(PLANS.starter).toBeDefined();
      expect(PLANS.growth).toBeDefined();
      expect(PLANS.pro).toBeDefined();
      expect(PLANS.starter.monthlyFee).toBe(29);
      expect(PLANS.growth.monthlyFee).toBe(49);
      expect(PLANS.pro.monthlyFee).toBe(99);
    });
  });
});
