/**
 * Tool 21: purchase_list
 * One-time list purchase flow with Stripe Payment Links
 */

import { z } from 'zod';
import type { TenantContext } from '../../utils/auth.js';
import { prisma } from '../../db/client.js';
import type { Prisma } from '@prisma/client';
import { DatabaseTypeSchema, getFilterSchema } from '../../schemas/filters.js';
import { calculateListPrice } from '../../services/list-pricing.js';
import { executePreviewCount } from '../data/preview-count.js';
import { executeGetSampleData } from '../data/get-sample-data.js';
import Stripe from 'stripe';

/**
 * Geography schema
 */
const geographySchema = z.object({
  type: z.enum(['nationwide', 'state', 'zip', 'city', 'county', 'radius']),
  values: z.array(z.string()).optional(),
  center_address: z.string().optional(),
  radius_miles: z.number().optional(),
});

/**
 * Input schema for purchase_list
 */
const inputSchema = z.object({
  database: DatabaseTypeSchema,
  geography: geographySchema,
  filters: z.record(z.unknown()).optional(),
  quantity: z.number().min(1).optional(),
  export_format: z.enum(['csv', 'excel', 'json']),
  payment_method: z.enum(['payment_link', 'existing_card', 'invoice']).default('payment_link'),
  delivery_method: z.enum(['download', 'email', 'sftp', 'webhook']),
  delivery_config: z
    .object({
      email: z.string().email().optional(),
      webhook_url: z.string().url().optional(),
      sftp_config_id: z.string().uuid().optional(),
    })
    .optional(),
  create_subscription: z.boolean().optional(),
  include_email: z.boolean().default(false),
  include_phone: z.boolean().default(false),
});

// Type is inferred from inputSchema when parsing

/**
 * Tool definition for MCP
 */
export const purchaseListTool = {
  name: 'purchase_list',
  description: `One-time list purchase flow. Queries the specified database with geography and filters, calculates pricing with volume discounts, and generates a Stripe Payment Link for checkout. Returns a quote with payment URL. After payment, the list is exported and delivered via the specified method.

IMPORTANT - geography parameter format: MUST include "type" and "values" fields. Example: {"type": "zip", "values": ["85255"]} or {"type": "state", "values": ["AZ"]} or {"type": "nationwide"}`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      database: {
        type: 'string',
        enum: ['consumer', 'business', 'nho', 'new_mover'],
        description: 'Database to purchase from',
      },
      geography: {
        type: 'object',
        description: 'Geographic targeting',
        properties: {
          type: {
            type: 'string',
            enum: ['nationwide', 'state', 'zip', 'city', 'county', 'radius'],
          },
          values: {
            type: 'array',
            items: { type: 'string' },
            description: 'Values for state/zip/city/county types',
          },
          center_address: {
            type: 'string',
            description: 'Address for radius search',
          },
          radius_miles: {
            type: 'number',
            description: 'Radius in miles for radius search',
          },
        },
        required: ['type'],
      },
      filters: {
        type: 'object',
        description: 'Database-specific filters (use get_filter_options to see available filters)',
      },
      quantity: {
        type: 'number',
        description: 'Maximum records to return (default: all matching)',
      },
      export_format: {
        type: 'string',
        enum: ['csv', 'excel', 'json'],
        description: 'File format for the export',
      },
      payment_method: {
        type: 'string',
        enum: ['payment_link', 'existing_card', 'invoice'],
        description: 'Payment method (default: payment_link)',
      },
      delivery_method: {
        type: 'string',
        enum: ['download', 'email', 'sftp', 'webhook'],
        description: 'How to deliver the list',
      },
      delivery_config: {
        type: 'object',
        description: 'Delivery configuration',
        properties: {
          email: { type: 'string', description: 'Email address for email delivery' },
          webhook_url: { type: 'string', description: 'Webhook URL for webhook delivery' },
          sftp_config_id: { type: 'string', description: 'SFTP config ID for SFTP delivery' },
        },
      },
      create_subscription: {
        type: 'boolean',
        description: 'Also create a recurring subscription',
      },
      include_email: {
        type: 'boolean',
        description: 'Include email addresses (additional cost)',
      },
      include_phone: {
        type: 'boolean',
        description: 'Include phone numbers (additional cost)',
      },
    },
    required: ['database', 'geography', 'export_format', 'delivery_method'],
  },
};

/**
 * Execute the purchase_list tool
 */
export async function executePurchaseList(
  input: unknown,
  context: TenantContext
): Promise<{
  quote_id: string;
  valid_until: string;
  record_count: number;
  with_email_count: number;
  with_phone_count: number;
  pricing: {
    base_records: number;
    email_append: number;
    phone_append: number;
    discount_percent: number;
    discount_amount: number;
    subtotal: number;
    total: number;
  };
  payment_link?: string;
  payment_status: string;
  sample_records: Record<string, unknown>[];
  delivery: {
    method: string;
    format: string;
  };
}> {
  // Validate input
  const validatedInput = inputSchema.parse(input);
  const {
    database,
    geography,
    filters,
    quantity,
    export_format,
    payment_method,
    delivery_method,
    delivery_config,
    include_email,
    include_phone,
  } = validatedInput;

  // Validate filters against schema
  if (filters) {
    const filterSchema = getFilterSchema(database);
    filterSchema.parse(filters);
  }

  // Get record count and email/phone availability
  const countResult = await executePreviewCount(
    {
      database,
      geography,
      filters,
    },
    context
  );

  // Determine actual record count (limited by quantity if specified)
  const totalAvailable = countResult.data?.total_available ?? 0;
  const recordCount = quantity ? Math.min(totalAvailable, quantity) : totalAvailable;

  if (recordCount === 0) {
    throw new Error('No records match the specified criteria');
  }

  // Estimate email/phone availability (typically 60-70%)
  const emailAvailability = 0.60;
  const phoneAvailability = 0.70;
  const withEmailCount = include_email ? Math.floor(recordCount * emailAvailability) : 0;
  const withPhoneCount = include_phone ? Math.floor(recordCount * phoneAvailability) : 0;

  // Calculate pricing
  const pricingResult = calculateListPrice({
    database,
    recordCount,
    withEmailCount,
    withPhoneCount,
    includeEmail: include_email,
    includePhone: include_phone,
  });

  // Check minimum order
  if (!pricingResult.meetsMinimum) {
    throw new Error(
      `Order total ($${pricingResult.total.toFixed(2)}) is below minimum order of $${pricingResult.minimumOrder.toFixed(2)}`
    );
  }

  // Get sample records
  const sampleResult = await executeGetSampleData(
    {
      database,
      geography,
      filters,
      sample_size: 5,
    },
    context
  );

  // Calculate quote validity (30 minutes)
  const quoteValidUntil = new Date();
  quoteValidUntil.setMinutes(quoteValidUntil.getMinutes() + 30);

  // Create list purchase record
  const purchase = await prisma.listPurchase.create({
    data: {
      tenantId: context.tenant.id,
      database,
      geography: geography as Prisma.InputJsonValue,
      filters: filters ? (filters as Prisma.InputJsonValue) : undefined,
      recordCount,
      withEmail: withEmailCount,
      withPhone: withPhoneCount,
      baseAmount: pricingResult.baseAmount,
      appendAmount: pricingResult.emailAppendAmount + pricingResult.phoneAppendAmount,
      discountPercent: pricingResult.discountPercent,
      totalAmount: pricingResult.total,
      exportFormat: export_format,
      deliveryMethod: delivery_method,
      deliveryConfig: delivery_config ? (delivery_config as Prisma.InputJsonValue) : undefined,
      paymentStatus: 'PENDING',
      quoteValidUntil,
    },
  });

  // Create Stripe Payment Link if requested
  let paymentLink: string | undefined;

  if (payment_method === 'payment_link') {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2026-01-28.clover',
    });

    // Create a price for this specific purchase
    const price = await stripe.prices.create({
      currency: 'usd',
      unit_amount: Math.round(pricingResult.total * 100), // Convert to cents
      product_data: {
        name: `${database.toUpperCase()} List Purchase - ${recordCount} records${include_email ? ' with email' : ''}${include_phone ? ' with phone' : ''}`,
        metadata: {
          purchase_id: purchase.id,
          database,
          record_count: recordCount.toString(),
        },
      },
    });

    // Create payment link
    const link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: {
        purchase_id: purchase.id,
        tenant_id: context.tenant.id,
        type: 'list_purchase',
      },
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `${process.env.APP_URL || 'http://localhost:3000'}/purchases/${purchase.id}/complete`,
        },
      },
    });

    paymentLink = link.url;

    // Update purchase with payment link ID
    await prisma.listPurchase.update({
      where: { id: purchase.id },
      data: {
        stripePaymentLinkId: link.id,
        paymentStatus: 'AWAITING_PAYMENT',
      },
    });
  }

  return {
    quote_id: purchase.id,
    valid_until: quoteValidUntil.toISOString(),
    record_count: recordCount,
    with_email_count: withEmailCount,
    with_phone_count: withPhoneCount,
    pricing: {
      base_records: pricingResult.baseAmount,
      email_append: pricingResult.emailAppendAmount,
      phone_append: pricingResult.phoneAppendAmount,
      discount_percent: pricingResult.discountPercent,
      discount_amount: pricingResult.discountAmount,
      subtotal: pricingResult.subtotal,
      total: pricingResult.total,
    },
    payment_link: paymentLink,
    payment_status: payment_method === 'payment_link' ? 'awaiting_payment' : 'pending',
    sample_records: sampleResult.data?.samples ?? [],
    delivery: {
      method: delivery_method,
      format: export_format,
    },
  };
}

/**
 * Get purchase status
 */
export async function getPurchaseStatus(
  purchaseId: string,
  tenantId: string
): Promise<{
  id: string;
  status: string;
  record_count: number;
  total_amount: number;
  download_url?: string;
  download_expires?: string;
  created_at: string;
} | null> {
  const purchase = await prisma.listPurchase.findFirst({
    where: {
      id: purchaseId,
      tenantId,
    },
  });

  if (!purchase) {
    return null;
  }

  return {
    id: purchase.id,
    status: purchase.paymentStatus,
    record_count: purchase.recordCount,
    total_amount: Number(purchase.totalAmount),
    download_url: purchase.downloadUrl || undefined,
    download_expires: purchase.downloadExpires?.toISOString(),
    created_at: purchase.createdAt.toISOString(),
  };
}
