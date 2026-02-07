/**
 * Tool 25: create_intent_subscription
 * Create a recurring subscription for intent data
 */

import { z } from 'zod';
import Stripe from 'stripe';
import type { TenantContext } from '../../utils/auth.js';
import { prisma } from '../../db/client.js';
import type { Prisma } from '@prisma/client';
import { intentApi } from '../../services/intent-api.js';
import {
  IntentGeographySchema,
  IntentFiltersSchema,
  calculateIntentPrice,
} from '../../schemas/intent.js';

/**
 * Input schema for create_intent_subscription
 */
const inputSchema = z.object({
  name: z.string().min(1).max(100),
  categories: z.array(z.string()).min(1),
  geography: IntentGeographySchema.optional(),
  filters: IntentFiltersSchema.optional(),

  // Subscription tier
  tier: z.enum(['standard', 'professional', 'enterprise']).default('standard'),

  // Delivery method
  deliveryMethod: z.enum(['webhook', 'batch_email', 'batch_sftp', 'api_poll']),

  // Webhook ID (required for webhook delivery)
  webhookId: z.string().uuid().optional(),

  // Batch settings
  batchFrequency: z.enum(['hourly', 'every_4_hours', 'daily', 'weekly']).optional(),

  // Volume cap
  monthlySignalCap: z.number().min(100).optional(),

  // Auto-start
  startImmediately: z.boolean().default(true),
});

// Type is inferred from inputSchema when parsing

/**
 * Tool definition for MCP
 */
export const createIntentSubscriptionTool = {
  name: 'create_intent_subscription',
  description: `Create a recurring subscription for intent data delivery. Intent data is subscription-only (no one-time purchases) to ensure you receive signals in real-time as they occur.

Subscription tiers:
- standard: $299/month, 500 signals included, $0.50 per additional signal
- professional: $799/month, 2000 signals included, $0.35 per additional signal
- enterprise: $1999/month, 10000 signals included, $0.25 per additional signal

Delivery methods:
- webhook: Real-time push to your endpoint as signals arrive
- batch_email: Periodic email delivery
- batch_sftp: Periodic SFTP upload
- api_poll: You poll the API for new signals

For webhook delivery, first configure a webhook using configure_intent_webhook.

IMPORTANT - geography parameter format: MUST include "type" and "values" fields. Example: {"type": "zip", "values": ["85255"]} or {"type": "state", "values": ["AZ"]} or {"type": "nationwide"}`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'Subscription name for your reference',
      },
      categories: {
        type: 'array',
        items: { type: 'string' },
        description: 'Intent categories to subscribe to',
      },
      geography: {
        type: 'object',
        description: 'Geographic targeting',
        properties: {
          type: { type: 'string', enum: ['nationwide', 'state', 'zip', 'dma'] },
          values: { type: 'array', items: { type: 'string' } },
        },
      },
      filters: {
        type: 'object',
        description: 'Signal filters',
        properties: {
          minIntentScore: { type: 'number' },
          maxAgeHours: { type: 'number' },
          requireEmail: { type: 'boolean' },
          requirePhone: { type: 'boolean' },
        },
      },
      tier: {
        type: 'string',
        enum: ['standard', 'professional', 'enterprise'],
        description: 'Subscription tier (default: standard)',
      },
      deliveryMethod: {
        type: 'string',
        enum: ['webhook', 'batch_email', 'batch_sftp', 'api_poll'],
        description: 'How to deliver intent signals',
      },
      webhookId: {
        type: 'string',
        description: 'Webhook ID (required for webhook delivery)',
      },
      batchFrequency: {
        type: 'string',
        enum: ['hourly', 'every_4_hours', 'daily', 'weekly'],
        description: 'Batch delivery frequency (for batch methods)',
      },
      monthlySignalCap: {
        type: 'number',
        description: 'Optional monthly signal limit',
      },
      startImmediately: {
        type: 'boolean',
        description: 'Start subscription immediately (default: true)',
      },
    },
    required: ['name', 'categories', 'deliveryMethod'],
  },
};

/**
 * Execute the create_intent_subscription tool
 */
export async function executeCreateIntentSubscription(
  input: unknown,
  context: TenantContext
): Promise<{
  subscription_id: string;
  name: string;
  categories: string[];
  status: string;
  delivery_method: string;
  pricing: {
    tier: string;
    monthly_base: number;
    included_signals: number;
    per_signal_rate: number;
    estimated_monthly: number;
  };
  payment_link?: string;
  next_steps: string[];
}> {
  // Validate input
  const validatedInput = inputSchema.parse(input);
  const {
    name,
    categories,
    geography,
    filters,
    tier,
    deliveryMethod,
    webhookId,
    batchFrequency,
    monthlySignalCap,
    startImmediately,
  } = validatedInput;

  // Validate webhook requirement
  if (deliveryMethod === 'webhook' && !webhookId) {
    throw new Error('webhookId is required for webhook delivery method');
  }

  // Validate batch frequency
  if (['batch_email', 'batch_sftp'].includes(deliveryMethod) && !batchFrequency) {
    throw new Error('batchFrequency is required for batch delivery methods');
  }

  // Verify webhook exists and belongs to tenant
  if (webhookId) {
    const webhook = await prisma.intentWebhook.findFirst({
      where: {
        id: webhookId,
        tenantId: context.tenant.id,
      },
    });

    if (!webhook) {
      throw new Error('Webhook not found or does not belong to your account');
    }

    if (!webhook.isActive) {
      throw new Error('Webhook is inactive. Please activate it first.');
    }
  }

  // Get estimated signal volume
  const signalCount = await intentApi.getSignalCount({
    categories,
    geography,
    filters,
  });

  // Calculate pricing
  const pricing = calculateIntentPrice({
    tier,
    categories,
    estimatedMonthlySignals: signalCount.estimatedMonthly,
  });

  // Map delivery method to Prisma enum
  const deliveryMethodMap: Record<string, 'WEBHOOK' | 'BATCH_EMAIL' | 'BATCH_SFTP' | 'API_POLL'> = {
    webhook: 'WEBHOOK',
    batch_email: 'BATCH_EMAIL',
    batch_sftp: 'BATCH_SFTP',
    api_poll: 'API_POLL',
  };

  const batchFrequencyMap: Record<string, 'HOURLY' | 'EVERY_4_HOURS' | 'DAILY' | 'WEEKLY'> = {
    hourly: 'HOURLY',
    every_4_hours: 'EVERY_4_HOURS',
    daily: 'DAILY',
    weekly: 'WEEKLY',
  };

  // Calculate next batch time if applicable
  let nextBatchAt: Date | null = null;
  if (batchFrequency && startImmediately) {
    const now = new Date();
    switch (batchFrequency) {
      case 'hourly':
        nextBatchAt = new Date(now.getTime() + 60 * 60 * 1000);
        break;
      case 'every_4_hours':
        nextBatchAt = new Date(now.getTime() + 4 * 60 * 60 * 1000);
        break;
      case 'daily':
        nextBatchAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        break;
      case 'weekly':
        nextBatchAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
    }
  }

  // Create the subscription
  const subscription = await prisma.intentSubscription.create({
    data: {
      tenantId: context.tenant.id,
      name,
      categoryIds: categories,
      geography: geography ? (geography as Prisma.InputJsonValue) : undefined,
      minIntentScore: filters?.minIntentScore,
      maxAgeHours: filters?.maxAgeHours,
      deliveryMethod: deliveryMethodMap[deliveryMethod],
      webhookId,
      batchFrequency: batchFrequency ? batchFrequencyMap[batchFrequency] : null,
      nextBatchAt,
      monthlyPrice: pricing.monthlyBase,
      signalCap: monthlySignalCap,
      status: startImmediately ? 'ACTIVE' : 'PAUSED',
    },
  });

  // Create Stripe subscription if starting immediately
  let paymentLink: string | undefined;

  if (startImmediately && process.env.STRIPE_SECRET_KEY) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-01-28.clover',
    });

    // Create a price for this subscription
    const price = await stripe.prices.create({
      currency: 'usd',
      unit_amount: Math.round(pricing.monthlyBase * 100),
      recurring: { interval: 'month' },
      product_data: {
        name: `Intent Data - ${tier.charAt(0).toUpperCase() + tier.slice(1)}`,
        metadata: {
          subscription_id: subscription.id,
          tier,
          categories: categories.join(','),
        },
      },
    });

    // Create payment link
    const link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: {
        type: 'intent_subscription',
        subscription_id: subscription.id,
        tenant_id: context.tenant.id,
      },
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `${process.env.APP_URL || 'http://localhost:3000'}/intent/subscriptions/${subscription.id}/activated`,
        },
      },
    });

    paymentLink = link.url;

    // Update subscription with Stripe info
    await prisma.intentSubscription.update({
      where: { id: subscription.id },
      data: {
        status: 'PAUSED', // Will be activated after payment
      },
    });
  }

  // Build next steps
  const nextSteps: string[] = [];

  if (paymentLink) {
    nextSteps.push(`Complete payment at: ${paymentLink}`);
  }

  if (deliveryMethod === 'webhook' && webhookId) {
    nextSteps.push('Your webhook will start receiving signals once payment is complete');
  } else if (deliveryMethod === 'api_poll') {
    nextSteps.push('Use search_intent_data with your subscription ID to poll for new signals');
  } else if (batchFrequency) {
    nextSteps.push(`Batch delivery will occur ${batchFrequency.replace('_', ' ')}`);
  }

  return {
    subscription_id: subscription.id,
    name: subscription.name,
    categories,
    status: subscription.status,
    delivery_method: deliveryMethod,
    pricing: {
      tier,
      monthly_base: pricing.monthlyBase,
      included_signals: pricing.includedSignals,
      per_signal_rate: pricing.perSignalRate,
      estimated_monthly: pricing.estimatedTotal,
    },
    payment_link: paymentLink,
    next_steps: nextSteps,
  };
}
