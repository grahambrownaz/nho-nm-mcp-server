/**
 * Stripe Webhook Handler
 * Processes Stripe webhook events for subscription management and one-time purchases
 */

import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { prisma } from '../db/client.js';
import { pauseSubscription } from '../services/stripe-billing.js';
import { fulfillListPurchase } from '../services/purchase-fulfillment.js';
import crypto from 'crypto';

/**
 * Get Stripe client
 */
function getStripeClient(): Stripe {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error('STRIPE_SECRET_KEY not configured');
  }
  return new Stripe(apiKey, {
    apiVersion: '2026-01-28.clover',
    typescript: true,
  });
}

/**
 * Verify Stripe webhook signature
 */
function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET not configured');
  }

  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

/**
 * Handle checkout.session.completed event
 * Creates a new tenant and activates their subscription, or fulfills a one-time purchase
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  console.log(`[Stripe Webhook] Processing checkout.session.completed: ${session.id}`);

  const metadata = session.metadata || {};

  // Check if this is a one-time payment (Payment Link for list purchase)
  if (session.mode === 'payment' && metadata.purchase_id) {
    await handlePaymentLinkCompleted(session);
    return;
  }

  // Otherwise, handle as subscription checkout
  // Note: session.customer and session.subscription contain Stripe IDs
  // These can be stored when linking Stripe subscriptions to tenant records
  const customerEmail = session.customer_email || session.customer_details?.email;

  if (!customerEmail) {
    console.error('[Stripe Webhook] No email found in checkout session');
    return;
  }

  // Check if tenant already exists
  let tenant = await prisma.tenant.findUnique({
    where: { email: customerEmail },
  });

  if (!tenant) {
    // Create new tenant
    tenant = await prisma.tenant.create({
      data: {
        name: metadata.tenantName || customerEmail.split('@')[0],
        email: customerEmail,
        company: session.customer_details?.name || null,
        status: 'ACTIVE',
      },
    });

    // Create API key for the new tenant
    const apiKeyValue = `nho_${crypto.randomBytes(24).toString('hex')}`;
    await prisma.apiKey.create({
      data: {
        key: apiKeyValue,
        name: 'Default API Key',
        tenantId: tenant.id,
        permissions: ['*'],
        isActive: true,
      },
    });

    console.log(`[Stripe Webhook] Created new tenant: ${tenant.id} with email ${customerEmail}`);
  } else {
    // Activate existing tenant
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { status: 'ACTIVE' },
    });
    console.log(`[Stripe Webhook] Activated existing tenant: ${tenant.id}`);
  }

  // Create or update subscription record
  const planType = metadata.planType || 'starter';

  await prisma.subscription.upsert({
    where: {
      id: `sub_${tenant.id}`, // Use a deterministic ID
    },
    update: {
      plan: planType.toUpperCase() as 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE',
      status: 'ACTIVE',
      billingCycleStart: new Date(),
      billingCycleEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    create: {
      id: `sub_${tenant.id}`,
      tenantId: tenant.id,
      plan: planType.toUpperCase() as 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE',
      status: 'ACTIVE',
      monthlyRecordLimit: planType === 'pro' ? 999999 : planType === 'growth' ? 2500 : 500,
      monthlyEmailAppends: 1000,
      monthlyPhoneAppends: 1000,
      allowedDatabases: ['NHO', 'NEW_MOVER'],
      billingCycleStart: new Date(),
      billingCycleEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  console.log(`[Stripe Webhook] Subscription activated for tenant ${tenant.id}, plan: ${planType}`);
}

/**
 * Handle Payment Link completed event (one-time list purchases)
 */
async function handlePaymentLinkCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const metadata = session.metadata || {};
  const purchaseId = metadata.purchase_id;

  if (!purchaseId) {
    console.error('[Stripe Webhook] Payment Link completed but no purchase_id in metadata');
    return;
  }

  console.log(`[Stripe Webhook] Processing Payment Link for purchase: ${purchaseId}`);

  try {
    // Get payment intent details for receipt URL
    const stripe = getStripeClient();
    let receiptUrl: string | null = null;

    if (session.payment_intent) {
      const paymentIntent = await stripe.paymentIntents.retrieve(
        session.payment_intent as string,
        { expand: ['latest_charge'] }
      );

      const charge = paymentIntent.latest_charge as Stripe.Charge | null;
      receiptUrl = charge?.receipt_url || null;
    }

    // Update purchase with payment details
    await prisma.listPurchase.update({
      where: { id: purchaseId },
      data: {
        stripePaymentIntentId: session.payment_intent as string,
        stripeReceiptUrl: receiptUrl,
        paymentStatus: 'PROCESSING',
      },
    });

    // Fulfill the purchase (generate export, send to customer)
    await fulfillListPurchase(purchaseId);

    console.log(`[Stripe Webhook] Payment Link purchase fulfilled: ${purchaseId}`);
  } catch (error) {
    console.error(`[Stripe Webhook] Error processing Payment Link purchase ${purchaseId}:`, error);

    // Mark as failed
    await prisma.listPurchase.update({
      where: { id: purchaseId },
      data: { paymentStatus: 'FAILED' },
    }).catch(() => {});

    throw error;
  }
}

/**
 * Handle invoice.paid event
 * Logs successful payment
 */
async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  console.log(`[Stripe Webhook] Invoice paid: ${invoice.id}, amount: ${invoice.amount_paid / 100}`);

  const customerId = invoice.customer as string;

  // Find tenant by searching Stripe customer metadata
  const stripe = getStripeClient();
  const customer = await stripe.customers.retrieve(customerId);

  if (customer.deleted) {
    console.warn(`[Stripe Webhook] Customer ${customerId} was deleted`);
    return;
  }

  const tenantId = customer.metadata?.tenantId;
  if (tenantId) {
    // Log usage record for billing tracking
    await prisma.usageRecord.create({
      data: {
        tenantId,
        usageType: 'DATA_RECORD',
        quantity: 0,
        unitPrice: 0,
        totalCost: invoice.amount_paid / 100,
        toolName: 'stripe_invoice',
        billingMonth: new Date(invoice.period_start * 1000),
      },
    });
  }
}

/**
 * Handle invoice.payment_failed event
 * Marks account as past due and pauses deliveries
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  console.log(`[Stripe Webhook] Invoice payment failed: ${invoice.id}`);

  const customerId = invoice.customer as string;
  const subscriptionId = (invoice as unknown as { subscription: string | null }).subscription;

  // Find tenant
  const stripe = getStripeClient();
  const customer = await stripe.customers.retrieve(customerId);

  if (customer.deleted) {
    return;
  }

  const tenantId = customer.metadata?.tenantId;
  if (!tenantId) {
    console.warn(`[Stripe Webhook] No tenantId found for customer ${customerId}`);
    return;
  }

  // Mark tenant subscription as past due
  await prisma.subscription.updateMany({
    where: { tenantId },
    data: { status: 'PAST_DUE' },
  });

  // Pause all active data subscriptions
  await prisma.dataSubscription.updateMany({
    where: {
      tenantId,
      status: 'ACTIVE',
    },
    data: {
      status: 'PAUSED',
      pausedAt: new Date(),
    },
  });

  // Pause the Stripe subscription
  if (subscriptionId) {
    await pauseSubscription(subscriptionId);
  }

  console.log(`[Stripe Webhook] Paused deliveries for tenant ${tenantId} due to payment failure`);
}

/**
 * Handle customer.subscription.deleted event
 * Deactivates tenant account
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  console.log(`[Stripe Webhook] Subscription deleted: ${subscription.id}`);

  const customerId = subscription.customer as string;

  // Find tenant
  const stripe = getStripeClient();
  const customer = await stripe.customers.retrieve(customerId);

  if (customer.deleted) {
    return;
  }

  const tenantId = customer.metadata?.tenantId;
  if (!tenantId) {
    console.warn(`[Stripe Webhook] No tenantId found for customer ${customerId}`);
    return;
  }

  // Mark tenant as cancelled
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { status: 'CANCELLED' },
  });

  // Cancel all subscriptions
  await prisma.subscription.updateMany({
    where: { tenantId },
    data: { status: 'CANCELLED' },
  });

  // Cancel all data subscriptions
  await prisma.dataSubscription.updateMany({
    where: { tenantId },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
    },
  });

  console.log(`[Stripe Webhook] Deactivated tenant ${tenantId} due to subscription cancellation`);
}

/**
 * Handle customer.subscription.updated event
 * Handles plan changes, resumptions, etc.
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  console.log(`[Stripe Webhook] Subscription updated: ${subscription.id}, status: ${subscription.status}`);

  const customerId = subscription.customer as string;

  // Find tenant
  const stripe = getStripeClient();
  const customer = await stripe.customers.retrieve(customerId);

  if (customer.deleted) {
    return;
  }

  const tenantId = customer.metadata?.tenantId;
  if (!tenantId) {
    return;
  }

  // Update subscription status
  let ourStatus: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'PAUSED' | 'TRIAL' = 'ACTIVE';

  switch (subscription.status) {
    case 'active':
      ourStatus = 'ACTIVE';
      break;
    case 'past_due':
      ourStatus = 'PAST_DUE';
      break;
    case 'canceled':
    case 'unpaid':
      ourStatus = 'CANCELLED';
      break;
    case 'paused':
      ourStatus = 'PAUSED';
      break;
    case 'trialing':
      ourStatus = 'TRIAL';
      break;
  }

  await prisma.subscription.updateMany({
    where: { tenantId },
    data: { status: ourStatus },
  });

  // If subscription became active, resume data subscriptions
  if (subscription.status === 'active') {
    await prisma.dataSubscription.updateMany({
      where: {
        tenantId,
        status: 'PAUSED',
      },
      data: {
        status: 'ACTIVE',
        pausedAt: null,
      },
    });
    console.log(`[Stripe Webhook] Resumed data subscriptions for tenant ${tenantId}`);
  }
}

/**
 * Main webhook handler
 */
export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  const signature = req.headers['stripe-signature'] as string;

  if (!signature) {
    res.status(400).json({ error: 'Missing stripe-signature header' });
    return;
  }

  let event: Stripe.Event;

  try {
    // req.body should be raw buffer for webhook signature verification
    event = verifyWebhookSignature(req.body, signature);
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err);
    res.status(400).json({ error: 'Webhook signature verification failed' });
    return;
  }

  console.log(`[Stripe Webhook] Received event: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error(`[Stripe Webhook] Error processing ${event.type}:`, error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

/**
 * Express middleware for raw body parsing (required for Stripe webhooks)
 */
export function stripeWebhookMiddleware(
  req: Request,
  _res: Response,
  next: () => void
): void {
  if (req.path === '/webhooks/stripe') {
    // Keep body as raw buffer for signature verification
    next();
  } else {
    next();
  }
}
