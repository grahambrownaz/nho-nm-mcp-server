/**
 * Tool 23: create_payment_link
 * Generate Stripe Payment Link for one-time purchases
 */

import { z } from 'zod';
import Stripe from 'stripe';
import type { TenantContext } from '../../utils/auth.js';
import { prisma } from '../../db/client.js';

/**
 * Line item schema for custom purchases
 */
const lineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().min(1),
  unit_price: z.number().min(0.01),
});

/**
 * Input schema for create_payment_link
 */
const inputSchema = z.object({
  product_type: z.enum(['list_purchase', 'postcard_batch', 'custom']),

  // For list_purchase
  quote_id: z.string().uuid().optional(),

  // For postcard_batch
  postcard_count: z.number().min(1).optional(),
  postcard_size: z.enum(['4x6', '6x9', '6x11']).optional(),

  // For custom
  line_items: z.array(lineItemSchema).optional(),

  // Common options
  expires_in_hours: z.number().min(1).max(168).default(24), // Max 7 days
  success_url: z.string().url().optional(),
  cancel_url: z.string().url().optional(),
  customer_email: z.string().email().optional(),
  metadata: z.record(z.string()).optional(),
});

// Type is inferred from inputSchema when parsing

/**
 * Postcard pricing
 */
const POSTCARD_PRICING = {
  '4x6': 0.85,
  '6x9': 1.15,
  '6x11': 1.35,
};

/**
 * Tool definition for MCP
 */
export const createPaymentLinkTool = {
  name: 'create_payment_link',
  description: `Generate a Stripe Payment Link for one-time purchases. Supports list purchases (using a quote_id from purchase_list), postcard batches, or custom line items. Returns a shareable payment URL that expires after the specified time.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      product_type: {
        type: 'string',
        enum: ['list_purchase', 'postcard_batch', 'custom'],
        description: 'Type of product being purchased',
      },
      quote_id: {
        type: 'string',
        description: 'Quote ID from purchase_list (for list_purchase type)',
      },
      postcard_count: {
        type: 'number',
        description: 'Number of postcards (for postcard_batch type)',
      },
      postcard_size: {
        type: 'string',
        enum: ['4x6', '6x9', '6x11'],
        description: 'Postcard size (for postcard_batch type)',
      },
      line_items: {
        type: 'array',
        description: 'Custom line items (for custom type)',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            quantity: { type: 'number' },
            unit_price: { type: 'number', description: 'Price in dollars' },
          },
          required: ['description', 'quantity', 'unit_price'],
        },
      },
      expires_in_hours: {
        type: 'number',
        description: 'Link expiration in hours (default: 24, max: 168)',
      },
      success_url: {
        type: 'string',
        description: 'URL to redirect after successful payment',
      },
      cancel_url: {
        type: 'string',
        description: 'URL to redirect if payment is cancelled',
      },
      customer_email: {
        type: 'string',
        description: 'Pre-fill customer email in checkout',
      },
      metadata: {
        type: 'object',
        description: 'Custom metadata for tracking',
      },
    },
    required: ['product_type'],
  },
};

/**
 * Execute the create_payment_link tool
 */
export async function executeCreatePaymentLink(
  input: unknown,
  context: TenantContext
): Promise<{
  payment_link_id: string;
  url: string;
  expires_at: string;
  amount: number;
  currency: string;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
  }>;
}> {
  // Validate input
  const validatedInput = inputSchema.parse(input);
  const {
    product_type,
    quote_id,
    postcard_count,
    postcard_size,
    line_items: customLineItems,
    expires_in_hours,
    success_url,
    cancel_url: _cancel_url,
    customer_email,
    metadata,
  } = validatedInput;

  // Initialize Stripe
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2026-01-28.clover',
  });

  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  // Build line items and metadata based on product type
  let stripeLineItems: Stripe.PaymentLinkCreateParams.LineItem[] = [];
  const productMetadata: Record<string, string> = {
    tenant_id: context.tenant.id,
    product_type,
    ...metadata,
  };
  let totalAmount = 0;
  const lineItemsResponse: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
  }> = [];

  if (product_type === 'list_purchase') {
    if (!quote_id) {
      throw new Error('quote_id is required for list_purchase type');
    }

    // Get the purchase record
    const purchase = await prisma.listPurchase.findFirst({
      where: {
        id: quote_id,
        tenantId: context.tenant.id,
        paymentStatus: { in: ['PENDING', 'AWAITING_PAYMENT'] },
      },
    });

    if (!purchase) {
      throw new Error('Quote not found or already paid');
    }

    // Check if quote is still valid
    if (purchase.quoteValidUntil && purchase.quoteValidUntil < new Date()) {
      throw new Error('Quote has expired. Please create a new quote.');
    }

    totalAmount = Number(purchase.totalAmount);
    productMetadata.purchase_id = purchase.id;
    productMetadata.database = purchase.database;
    productMetadata.record_count = purchase.recordCount.toString();

    // Create price for this purchase
    const price = await stripe.prices.create({
      currency: 'usd',
      unit_amount: Math.round(totalAmount * 100),
      product_data: {
        name: `${purchase.database.toUpperCase()} Data List - ${purchase.recordCount} records`,
        metadata: {
          purchase_id: purchase.id,
        },
      },
    });

    stripeLineItems = [{ price: price.id, quantity: 1 }];
    lineItemsResponse.push({
      description: `${purchase.database.toUpperCase()} Data List (${purchase.recordCount} records)`,
      quantity: 1,
      unit_price: totalAmount,
      total: totalAmount,
    });
  } else if (product_type === 'postcard_batch') {
    if (!postcard_count || !postcard_size) {
      throw new Error('postcard_count and postcard_size are required for postcard_batch type');
    }

    const unitPrice = POSTCARD_PRICING[postcard_size];
    totalAmount = postcard_count * unitPrice;

    const price = await stripe.prices.create({
      currency: 'usd',
      unit_amount: Math.round(unitPrice * 100),
      product_data: {
        name: `${postcard_size} Postcards (Full-color, double-sided)`,
      },
    });

    stripeLineItems = [{ price: price.id, quantity: postcard_count }];
    productMetadata.postcard_size = postcard_size;
    productMetadata.postcard_count = postcard_count.toString();

    lineItemsResponse.push({
      description: `${postcard_size} Postcards`,
      quantity: postcard_count,
      unit_price: unitPrice,
      total: totalAmount,
    });
  } else if (product_type === 'custom') {
    if (!customLineItems || customLineItems.length === 0) {
      throw new Error('line_items are required for custom type');
    }

    for (const item of customLineItems) {
      const price = await stripe.prices.create({
        currency: 'usd',
        unit_amount: Math.round(item.unit_price * 100),
        product_data: {
          name: item.description,
        },
      });

      stripeLineItems.push({ price: price.id, quantity: item.quantity });
      totalAmount += item.quantity * item.unit_price;

      lineItemsResponse.push({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.quantity * item.unit_price,
      });
    }
  }

  // Create payment link
  const paymentLinkParams: Stripe.PaymentLinkCreateParams = {
    line_items: stripeLineItems,
    metadata: productMetadata,
    after_completion: {
      type: 'redirect',
      redirect: {
        url: success_url || `${appUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      },
    },
  };

  // Add customer email if provided
  if (customer_email) {
    paymentLinkParams.custom_fields = [
      {
        key: 'email',
        label: { type: 'custom', custom: 'Email' },
        type: 'text',
      },
    ];
  }

  const paymentLink = await stripe.paymentLinks.create(paymentLinkParams);

  // Calculate expiration
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + expires_in_hours);

  // Update purchase record if this is a list purchase
  if (product_type === 'list_purchase' && quote_id) {
    await prisma.listPurchase.update({
      where: { id: quote_id },
      data: {
        stripePaymentLinkId: paymentLink.id,
        paymentStatus: 'AWAITING_PAYMENT',
      },
    });
  }

  return {
    payment_link_id: paymentLink.id,
    url: paymentLink.url,
    expires_at: expiresAt.toISOString(),
    amount: totalAmount,
    currency: 'usd',
    line_items: lineItemsResponse,
  };
}
