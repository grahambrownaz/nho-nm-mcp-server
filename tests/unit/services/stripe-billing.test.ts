/**
 * Tests for Stripe Billing Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Stripe from 'stripe';
import {
  StripeBillingService,
  stripeBillingService,
} from '../../../src/services/stripe-billing.js';
import { prisma } from '../../../src/db/client.js';

// Mock Stripe SDK
vi.mock('stripe', () => {
  const mockStripe = {
    customers: {
      create: vi.fn(),
      retrieve: vi.fn(),
      update: vi.fn(),
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
    },
    subscriptionItems: {
      createUsageRecord: vi.fn(),
    },
    invoices: {
      retrieveUpcoming: vi.fn(),
      list: vi.fn(),
    },
    billingPortal: {
      sessions: {
        create: vi.fn(),
      },
    },
    paymentMethods: {
      list: vi.fn(),
    },
    prices: {
      list: vi.fn(),
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
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    subscription: {
      findFirst: vi.fn(),
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

describe('Stripe Billing Service', () => {
  let service: StripeBillingService;
  let mockStripeInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Get mock Stripe instance
    mockStripeInstance = new (Stripe as any)('sk_test_123');

    service = new StripeBillingService({
      secretKey: 'sk_test_123',
      webhookSecret: 'whsec_test_456',
    });

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
  });

  describe('createCustomer', () => {
    it('creates Stripe customer', async () => {
      mockStripeInstance.customers.create.mockResolvedValue({
        id: 'cus_new_123',
        email: 'new@example.com',
        name: 'New Customer',
        metadata: {},
      });

      const customer = await service.createCustomer({
        email: 'new@example.com',
        name: 'New Customer',
        tenantId: 'tenant-123',
      });

      expect(mockStripeInstance.customers.create).toHaveBeenCalledWith({
        email: 'new@example.com',
        name: 'New Customer',
        metadata: {
          tenantId: 'tenant-123',
        },
      });
      expect(customer.id).toBe('cus_new_123');
    });

    it('includes company name when provided', async () => {
      mockStripeInstance.customers.create.mockResolvedValue({
        id: 'cus_new_456',
        email: 'business@example.com',
        name: 'Business Name',
      });

      await service.createCustomer({
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
        service.createCustomer({
          email: 'test@example.com',
          name: 'Test',
          tenantId: 'tenant-123',
        })
      ).rejects.toThrow('Card declined');
    });
  });

  describe('createCheckoutSession', () => {
    it('generates valid checkout URL', async () => {
      mockStripeInstance.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/pay/cs_test_123',
      });

      const session = await service.createCheckoutSession({
        tenantId: 'tenant-123',
        priceId: 'price_starter_monthly',
        successUrl: 'https://app.example.com/billing/success',
        cancelUrl: 'https://app.example.com/billing/cancel',
      });

      expect(mockStripeInstance.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          line_items: expect.arrayContaining([
            expect.objectContaining({
              price: 'price_starter_monthly',
            }),
          ]),
          success_url: 'https://app.example.com/billing/success',
          cancel_url: 'https://app.example.com/billing/cancel',
        })
      );
      expect(session.url).toContain('checkout.stripe.com');
    });

    it('includes customer when existing', async () => {
      mockStripeInstance.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test_456',
        url: 'https://checkout.stripe.com/pay/cs_test_456',
      });

      await service.createCheckoutSession({
        tenantId: 'tenant-123',
        customerId: 'cus_existing_123',
        priceId: 'price_growth_monthly',
        successUrl: 'https://app.example.com/success',
        cancelUrl: 'https://app.example.com/cancel',
      });

      expect(mockStripeInstance.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_existing_123',
        })
      );
    });

    it('allows customer email for new customers', async () => {
      mockStripeInstance.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test_789',
        url: 'https://checkout.stripe.com/pay/cs_test_789',
      });

      await service.createCheckoutSession({
        tenantId: 'tenant-new',
        customerEmail: 'new@example.com',
        priceId: 'price_starter_monthly',
        successUrl: 'https://app.example.com/success',
        cancelUrl: 'https://app.example.com/cancel',
      });

      expect(mockStripeInstance.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_email: 'new@example.com',
        })
      );
    });

    it('includes tenant metadata', async () => {
      mockStripeInstance.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test_meta',
        url: 'https://checkout.stripe.com/pay/cs_test_meta',
      });

      await service.createCheckoutSession({
        tenantId: 'tenant-123',
        priceId: 'price_pro_monthly',
        successUrl: 'https://app.example.com/success',
        cancelUrl: 'https://app.example.com/cancel',
        metadata: {
          plan: 'pro',
          source: 'upgrade_modal',
        },
      });

      expect(mockStripeInstance.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            tenantId: 'tenant-123',
            plan: 'pro',
            source: 'upgrade_modal',
          }),
        })
      );
    });
  });

  describe('createSubscription', () => {
    it('creates subscription with metered pricing', async () => {
      mockStripeInstance.subscriptions.create.mockResolvedValue({
        id: 'sub_test_123',
        status: 'active',
        items: {
          data: [
            { id: 'si_records', price: { id: 'price_records_metered' } },
            { id: 'si_pdf', price: { id: 'price_pdf_metered' } },
            { id: 'si_print', price: { id: 'price_print_metered' } },
          ],
        },
      });

      const subscription = await service.createSubscription({
        customerId: 'cus_test_123',
        items: [
          { price: 'price_base_monthly' },
          { price: 'price_records_metered' },
          { price: 'price_pdf_metered' },
          { price: 'price_print_metered' },
        ],
      });

      expect(mockStripeInstance.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_test_123',
          items: expect.arrayContaining([
            expect.objectContaining({ price: 'price_records_metered' }),
            expect.objectContaining({ price: 'price_pdf_metered' }),
          ]),
        })
      );
      expect(subscription.id).toBe('sub_test_123');
      expect(subscription.status).toBe('active');
    });

    it('includes trial period when specified', async () => {
      mockStripeInstance.subscriptions.create.mockResolvedValue({
        id: 'sub_trial_123',
        status: 'trialing',
        trial_end: Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60,
      });

      await service.createSubscription({
        customerId: 'cus_test_123',
        items: [{ price: 'price_starter_monthly' }],
        trialDays: 14,
      });

      expect(mockStripeInstance.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          trial_period_days: 14,
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

      await service.reportUsage({
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
    });

    it('uses set action when specified', async () => {
      mockStripeInstance.subscriptionItems.createUsageRecord.mockResolvedValue({
        id: 'mbur_test_456',
        quantity: 1000,
      });

      await service.reportUsage({
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

      await service.reportUsage({
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

    it('handles idempotency key', async () => {
      mockStripeInstance.subscriptionItems.createUsageRecord.mockResolvedValue({
        id: 'mbur_test_idem',
        quantity: 250,
      });

      await service.reportUsage({
        subscriptionItemId: 'si_records_123',
        quantity: 250,
        idempotencyKey: 'delivery-123-records',
      });

      expect(mockStripeInstance.subscriptionItems.createUsageRecord).toHaveBeenCalledWith(
        'si_records_123',
        expect.objectContaining({
          quantity: 250,
        }),
        expect.objectContaining({
          idempotencyKey: 'delivery-123-records',
        })
      );
    });
  });

  describe('getUpcomingInvoice', () => {
    it('returns invoice preview', async () => {
      mockStripeInstance.invoices.retrieveUpcoming.mockResolvedValue({
        id: 'in_upcoming_123',
        customer: 'cus_test_123',
        amount_due: 5999,
        currency: 'usd',
        lines: {
          data: [
            { description: 'Starter Plan', amount: 4900 },
            { description: 'Data Records (500 @ $0.02)', amount: 1000 },
            { description: 'PDF Generation (10 @ $0.10)', amount: 100 },
          ],
        },
        period_start: Math.floor(Date.now() / 1000),
        period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      });

      const invoice = await service.getUpcomingInvoice('cus_test_123');

      expect(mockStripeInstance.invoices.retrieveUpcoming).toHaveBeenCalledWith({
        customer: 'cus_test_123',
      });
      expect(invoice.amount_due).toBe(5999);
      expect(invoice.lines.data).toHaveLength(3);
    });

    it('returns null when no upcoming invoice', async () => {
      mockStripeInstance.invoices.retrieveUpcoming.mockRejectedValue({
        type: 'StripeInvalidRequestError',
        code: 'invoice_upcoming_none',
      });

      const invoice = await service.getUpcomingInvoice('cus_no_sub_123');

      expect(invoice).toBeNull();
    });
  });

  describe('createPortalSession', () => {
    it('generates portal URL', async () => {
      mockStripeInstance.billingPortal.sessions.create.mockResolvedValue({
        id: 'bps_test_123',
        url: 'https://billing.stripe.com/session/bps_test_123',
      });

      const session = await service.createPortalSession({
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

  describe('error handling', () => {
    it('handles Stripe API errors gracefully', async () => {
      const stripeError = new Error('Invalid API Key provided');
      (stripeError as any).type = 'StripeAuthenticationError';
      mockStripeInstance.customers.create.mockRejectedValue(stripeError);

      await expect(
        service.createCustomer({
          email: 'test@example.com',
          name: 'Test',
          tenantId: 'tenant-123',
        })
      ).rejects.toThrow('Invalid API Key');
    });

    it('handles rate limiting', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).type = 'StripeRateLimitError';
      mockStripeInstance.subscriptionItems.createUsageRecord.mockRejectedValue(rateLimitError);

      await expect(
        service.reportUsage({
          subscriptionItemId: 'si_test',
          quantity: 100,
        })
      ).rejects.toThrow('Rate limit');
    });

    it('handles card errors', async () => {
      const cardError = new Error('Your card was declined');
      (cardError as any).type = 'StripeCardError';
      (cardError as any).code = 'card_declined';
      mockStripeInstance.checkout.sessions.create.mockRejectedValue(cardError);

      await expect(
        service.createCheckoutSession({
          tenantId: 'tenant-123',
          priceId: 'price_test',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        })
      ).rejects.toThrow('card was declined');
    });
  });

  describe('getPaymentMethods', () => {
    it('returns customer payment methods', async () => {
      mockStripeInstance.paymentMethods.list.mockResolvedValue({
        data: [
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
        ],
      });

      const methods = await service.getPaymentMethods('cus_test_123');

      expect(mockStripeInstance.paymentMethods.list).toHaveBeenCalledWith({
        customer: 'cus_test_123',
        type: 'card',
      });
      expect(methods).toHaveLength(1);
      expect(methods[0].card.last4).toBe('4242');
    });
  });

  describe('cancelSubscription', () => {
    it('cancels subscription immediately', async () => {
      mockStripeInstance.subscriptions.cancel.mockResolvedValue({
        id: 'sub_test_123',
        status: 'canceled',
      });

      await service.cancelSubscription('sub_test_123');

      expect(mockStripeInstance.subscriptions.cancel).toHaveBeenCalledWith('sub_test_123');
    });

    it('cancels at period end when specified', async () => {
      mockStripeInstance.subscriptions.update.mockResolvedValue({
        id: 'sub_test_123',
        status: 'active',
        cancel_at_period_end: true,
      });

      await service.cancelSubscription('sub_test_123', { atPeriodEnd: true });

      expect(mockStripeInstance.subscriptions.update).toHaveBeenCalledWith(
        'sub_test_123',
        { cancel_at_period_end: true }
      );
    });
  });

  describe('singleton instance', () => {
    it('exports singleton instance', () => {
      expect(stripeBillingService).toBeDefined();
      expect(stripeBillingService).toBeInstanceOf(StripeBillingService);
    });
  });
});
