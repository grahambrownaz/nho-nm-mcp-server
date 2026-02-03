/**
 * Stripe Billing Service
 * Handles all Stripe-related billing operations for Direct Mode
 */

import Stripe from 'stripe';
import { prisma } from '../db/client.js';

/**
 * Get Stripe client instance
 */
function getStripeClient(): Stripe {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not set');
  }
  return new Stripe(apiKey, {
    apiVersion: '2026-01-28.clover',
    typescript: true,
  });
}

/**
 * Stripe price IDs from environment
 */
export const STRIPE_PRICES = {
  // Metered usage prices
  DATA_RECORD: process.env.STRIPE_PRICE_DATA_RECORD || 'price_data_record',
  PDF_GENERATION: process.env.STRIPE_PRICE_PDF_GENERATION || 'price_pdf_generation',
  PRINT_4X6: process.env.STRIPE_PRICE_PRINT_4X6 || 'price_print_4x6',
  PRINT_6X9: process.env.STRIPE_PRICE_PRINT_6X9 || 'price_print_6x9',
  PRINT_6X11: process.env.STRIPE_PRICE_PRINT_6X11 || 'price_print_6x11',

  // Platform fees (recurring monthly)
  PLATFORM_STARTER: process.env.STRIPE_PRICE_PLATFORM_STARTER || 'price_platform_starter',
  PLATFORM_GROWTH: process.env.STRIPE_PRICE_PLATFORM_GROWTH || 'price_platform_growth',
  PLATFORM_PRO: process.env.STRIPE_PRICE_PLATFORM_PRO || 'price_platform_pro',
};

/**
 * Plan configuration
 */
export const PLANS = {
  starter: {
    name: 'Starter',
    platformPriceId: STRIPE_PRICES.PLATFORM_STARTER,
    monthlyFee: 29,
    features: ['Up to 500 records/month', 'Email support', '1 subscription'],
  },
  growth: {
    name: 'Growth',
    platformPriceId: STRIPE_PRICES.PLATFORM_GROWTH,
    monthlyFee: 49,
    features: ['Up to 2,500 records/month', 'Priority support', '5 subscriptions'],
  },
  pro: {
    name: 'Professional',
    platformPriceId: STRIPE_PRICES.PLATFORM_PRO,
    monthlyFee: 99,
    features: ['Unlimited records', 'Dedicated support', 'Unlimited subscriptions'],
  },
};

export type PlanType = keyof typeof PLANS;

/**
 * Create a Stripe customer for a tenant
 */
export async function createStripeCustomer(params: {
  tenantId: string;
  email: string;
  name: string;
  company?: string;
  metadata?: Record<string, string>;
}): Promise<string> {
  const stripe = getStripeClient();

  const customer = await stripe.customers.create({
    email: params.email,
    name: params.name,
    metadata: {
      tenantId: params.tenantId,
      company: params.company || '',
      ...params.metadata,
    },
  });

  // Store the Stripe customer ID in our database
  await prisma.tenant.update({
    where: { id: params.tenantId },
    data: {
      stripeCustomerId: customer.id,
    },
  });

  return customer.id;
}

/**
 * Create a Checkout session for Direct Mode signup
 */
export async function createCheckoutSession(params: {
  planType: PlanType;
  tenantEmail: string;
  tenantName: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}): Promise<{
  sessionId: string;
  url: string;
}> {
  const stripe = getStripeClient();
  const plan = PLANS[params.planType];

  if (!plan) {
    throw new Error(`Invalid plan type: ${params.planType}`);
  }

  // Create checkout session with metered subscription items
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: params.tenantEmail,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: {
      planType: params.planType,
      tenantName: params.tenantName,
      ...params.metadata,
    },
    line_items: [
      // Platform fee (recurring)
      {
        price: plan.platformPriceId,
        quantity: 1,
      },
      // Metered usage items
      {
        price: STRIPE_PRICES.DATA_RECORD,
      },
      {
        price: STRIPE_PRICES.PDF_GENERATION,
      },
      {
        price: STRIPE_PRICES.PRINT_4X6,
      },
    ],
    subscription_data: {
      metadata: {
        planType: params.planType,
        tenantName: params.tenantName,
        ...params.metadata,
      },
    },
    allow_promotion_codes: true,
    billing_address_collection: 'required',
  });

  return {
    sessionId: session.id,
    url: session.url || '',
  };
}

/**
 * Create a subscription for an existing customer
 */
export async function createSubscription(params: {
  customerId: string;
  planType: PlanType;
  metadata?: Record<string, string>;
}): Promise<{
  subscriptionId: string;
  status: string;
  currentPeriodEnd: Date;
}> {
  const stripe = getStripeClient();
  const plan = PLANS[params.planType];

  if (!plan) {
    throw new Error(`Invalid plan type: ${params.planType}`);
  }

  const subscription = await stripe.subscriptions.create({
    customer: params.customerId,
    items: [
      { price: plan.platformPriceId },
      { price: STRIPE_PRICES.DATA_RECORD },
      { price: STRIPE_PRICES.PDF_GENERATION },
      { price: STRIPE_PRICES.PRINT_4X6 },
    ],
    metadata: {
      planType: params.planType,
      ...params.metadata,
    },
    payment_behavior: 'default_incomplete',
    expand: ['latest_invoice.payment_intent'],
  });

  return {
    subscriptionId: subscription.id,
    status: subscription.status,
    currentPeriodEnd: new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000),
  };
}

/**
 * Report metered usage to Stripe
 */
export async function reportUsage(params: {
  subscriptionItemId: string;
  quantity: number;
  timestamp?: number;
  action?: 'increment' | 'set';
}): Promise<{
  usageRecordId: string;
  quantity: number;
}> {
  const stripe = getStripeClient();

  // Use the subscription items usage records API
  const usageRecord = await (stripe.subscriptionItems as unknown as {
    createUsageRecord: (
      id: string,
      params: { quantity: number; timestamp?: number; action?: string }
    ) => Promise<{ id: string; quantity: number }>;
  }).createUsageRecord(params.subscriptionItemId, {
    quantity: params.quantity,
    timestamp: params.timestamp || Math.floor(Date.now() / 1000),
    action: params.action || 'increment',
  });

  return {
    usageRecordId: usageRecord.id,
    quantity: usageRecord.quantity,
  };
}

/**
 * Get subscription items for a subscription (to find metered item IDs)
 */
export async function getSubscriptionItems(
  subscriptionId: string
): Promise<Array<{
  id: string;
  priceId: string;
  priceName: string;
}>> {
  const stripe = getStripeClient();

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price'],
  });

  return subscription.items.data.map((item) => ({
    id: item.id,
    priceId: item.price.id,
    priceName: item.price.nickname || item.price.id,
  }));
}

/**
 * Get upcoming invoice for a customer
 */
export async function getUpcomingInvoice(customerId: string): Promise<{
  amountDue: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  lineItems: Array<{
    description: string;
    amount: number;
    quantity: number;
  }>;
}> {
  const stripe = getStripeClient();

  // Use createPreview for upcoming invoice in newer SDK versions
  const invoice = await (stripe.invoices as unknown as {
    createPreview: (params: { customer: string }) => Promise<{
      amount_due: number;
      currency: string;
      period_start: number;
      period_end: number;
      lines: { data: Array<{ description: string | null; amount: number; quantity: number | null }> };
    }>;
  }).createPreview({ customer: customerId });

  return {
    amountDue: invoice.amount_due / 100, // Convert from cents
    currency: invoice.currency,
    periodStart: new Date(invoice.period_start * 1000),
    periodEnd: new Date(invoice.period_end * 1000),
    lineItems: invoice.lines.data.map((line) => ({
      description: line.description || '',
      amount: line.amount / 100,
      quantity: line.quantity || 0,
    })),
  };
}

/**
 * Create a billing portal session
 */
export async function createPortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<{
  url: string;
}> {
  const stripe = getStripeClient();

  const session = await stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });

  return {
    url: session.url,
  };
}

/**
 * Get customer billing status
 */
export async function getBillingStatus(customerId: string): Promise<{
  customer: {
    id: string;
    email: string;
    name: string;
  };
  subscription: {
    id: string;
    status: string;
    plan: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
  } | null;
  paymentMethod: {
    type: string;
    last4?: string;
    brand?: string;
    expMonth?: number;
    expYear?: number;
  } | null;
  usageThisPeriod: {
    dataRecords: number;
    pdfGeneration: number;
    printJobs: number;
  };
  upcomingInvoice: {
    amountDue: number;
    currency: string;
  } | null;
}> {
  const stripe = getStripeClient();

  // Get customer
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) {
    throw new Error('Customer has been deleted');
  }

  // Get subscriptions
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'active',
    limit: 1,
  });

  const subscription = subscriptions.data[0];

  // Get payment method
  let paymentMethod: {
    type: string;
    last4?: string;
    brand?: string;
    expMonth?: number;
    expYear?: number;
  } | null = null;

  if (customer.invoice_settings?.default_payment_method) {
    const pm = await stripe.paymentMethods.retrieve(
      customer.invoice_settings.default_payment_method as string
    );
    if (pm.type === 'card' && pm.card) {
      paymentMethod = {
        type: 'card',
        last4: pm.card.last4,
        brand: pm.card.brand,
        expMonth: pm.card.exp_month,
        expYear: pm.card.exp_year,
      };
    }
  }

  // Get usage this period
  const usageThisPeriod = {
    dataRecords: 0,
    pdfGeneration: 0,
    printJobs: 0,
  };

  if (subscription) {
    // Get usage summaries for each metered item
    const listUsageSummaries = (stripe.subscriptionItems as unknown as {
      listUsageRecordSummaries: (
        id: string,
        params: { limit: number }
      ) => Promise<{ data: Array<{ total_usage: number }> }>;
    }).listUsageRecordSummaries;

    for (const item of subscription.items.data) {
      try {
        const summaries = await listUsageSummaries.call(
          stripe.subscriptionItems,
          item.id,
          { limit: 1 }
        );
        const total = summaries.data[0]?.total_usage || 0;

        if (item.price.id === STRIPE_PRICES.DATA_RECORD) {
          usageThisPeriod.dataRecords = total;
        } else if (item.price.id === STRIPE_PRICES.PDF_GENERATION) {
          usageThisPeriod.pdfGeneration = total;
        } else if (
          item.price.id === STRIPE_PRICES.PRINT_4X6 ||
          item.price.id === STRIPE_PRICES.PRINT_6X9 ||
          item.price.id === STRIPE_PRICES.PRINT_6X11
        ) {
          usageThisPeriod.printJobs += total;
        }
      } catch {
        // Usage summaries not available for this item
      }
    }
  }

  // Get upcoming invoice
  let upcomingInvoice: { amountDue: number; currency: string } | null = null;
  try {
    const invoice = await (stripe.invoices as unknown as {
      createPreview: (params: { customer: string }) => Promise<{
        amount_due: number;
        currency: string;
      }>;
    }).createPreview({ customer: customerId });
    upcomingInvoice = {
      amountDue: invoice.amount_due / 100,
      currency: invoice.currency,
    };
  } catch {
    // No upcoming invoice
  }

  // Cast subscription to access period properties
  const subData = subscription as unknown as {
    current_period_start: number;
    current_period_end: number;
  } | null;

  return {
    customer: {
      id: customer.id,
      email: customer.email || '',
      name: customer.name || '',
    },
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          plan: subscription.metadata?.planType || 'unknown',
          currentPeriodStart: new Date((subData?.current_period_start || 0) * 1000),
          currentPeriodEnd: new Date((subData?.current_period_end || 0) * 1000),
        }
      : null,
    paymentMethod,
    usageThisPeriod,
    upcomingInvoice,
  };
}

/**
 * Cancel a subscription
 */
export async function cancelSubscription(
  subscriptionId: string,
  immediately: boolean = false
): Promise<{ status: string; cancelAt: Date | null }> {
  const stripe = getStripeClient();

  if (immediately) {
    const subscription = await stripe.subscriptions.cancel(subscriptionId);
    return {
      status: subscription.status,
      cancelAt: null,
    };
  }

  // Cancel at period end
  const subscription = await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });

  return {
    status: subscription.status,
    cancelAt: subscription.cancel_at
      ? new Date(subscription.cancel_at * 1000)
      : null,
  };
}

/**
 * Pause a subscription (for past_due accounts)
 */
export async function pauseSubscription(subscriptionId: string): Promise<void> {
  const stripe = getStripeClient();

  await stripe.subscriptions.update(subscriptionId, {
    pause_collection: {
      behavior: 'mark_uncollectible',
    },
  });
}

/**
 * Resume a paused subscription
 */
export async function resumeSubscription(subscriptionId: string): Promise<void> {
  const stripe = getStripeClient();

  await stripe.subscriptions.update(subscriptionId, {
    pause_collection: '',
  });
}

/**
 * Get or create Stripe customer for a tenant
 */
export async function getOrCreateCustomer(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    throw new Error(`Tenant ${tenantId} not found`);
  }

  // Check if we have a stored Stripe customer ID
  if (tenant.stripeCustomerId) {
    return tenant.stripeCustomerId;
  }

  // Search by email as fallback
  const stripe = getStripeClient();

  const customers = await stripe.customers.list({
    email: tenant.email,
    limit: 1,
  });

  if (customers.data.length > 0) {
    // Store the customer ID for future lookups
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { stripeCustomerId: customers.data[0].id },
    });
    return customers.data[0].id;
  }

  // Create new customer
  return createStripeCustomer({
    tenantId: tenant.id,
    email: tenant.email,
    name: tenant.name,
    company: tenant.company || undefined,
  });
}

/**
 * Export types
 */
export type { Stripe };
