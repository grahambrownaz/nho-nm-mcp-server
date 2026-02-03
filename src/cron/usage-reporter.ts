/**
 * Usage Reporter
 * Reports metered usage to Stripe after deliveries
 */

import { prisma } from '../db/client.js';
import { Prisma } from '@prisma/client';
import {
  reportUsage,
  getSubscriptionItems,
  getOrCreateCustomer,
  STRIPE_PRICES,
} from '../services/stripe-billing.js';

/**
 * Usage report result
 */
export interface UsageReportResult {
  tenantId: string;
  deliveryId: string;
  success: boolean;
  reported: {
    dataRecords?: number;
    pdfGeneration?: number;
    printJobs?: number;
  };
  error?: string;
}

/**
 * Find Stripe subscription item ID by price ID
 */
async function findSubscriptionItemId(
  subscriptionId: string,
  priceId: string
): Promise<string | null> {
  const items = await getSubscriptionItems(subscriptionId);
  const item = items.find((i) => i.priceId === priceId);
  return item?.id || null;
}

/**
 * Report usage for a single delivery to Stripe
 */
export async function reportDeliveryUsage(
  deliveryId: string
): Promise<UsageReportResult> {
  // Get delivery with subscription info
  const delivery = await prisma.delivery.findUnique({
    where: { id: deliveryId },
    include: {
      dataSubscription: true,
    },
  });

  if (!delivery) {
    return {
      tenantId: '',
      deliveryId,
      success: false,
      reported: {},
      error: 'Delivery not found',
    };
  }

  const result: UsageReportResult = {
    tenantId: delivery.tenantId,
    deliveryId,
    success: true,
    reported: {},
  };

  try {
    // Get Stripe customer and subscription
    const customerId = await getOrCreateCustomer(delivery.tenantId);

    // Get tenant's active Stripe subscription
    // In production, this would be stored on the tenant record
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2026-01-28.clover',
    });

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      // No active subscription - might be on free tier or trial
      console.log(`[UsageReporter] No active subscription for tenant ${delivery.tenantId}`);
      return {
        ...result,
        success: true,
        reported: {},
      };
    }

    const subscription = subscriptions.data[0];

    // Report data records usage
    if (delivery.newRecordsCount > 0) {
      const dataRecordItemId = await findSubscriptionItemId(
        subscription.id,
        STRIPE_PRICES.DATA_RECORD
      );

      if (dataRecordItemId) {
        await reportUsage({
          subscriptionItemId: dataRecordItemId,
          quantity: delivery.newRecordsCount,
        });
        result.reported.dataRecords = delivery.newRecordsCount;
        console.log(
          `[UsageReporter] Reported ${delivery.newRecordsCount} data records for delivery ${deliveryId}`
        );
      }
    }

    // Report PDF generation usage
    if (delivery.pdfFileUrl) {
      const pdfItemId = await findSubscriptionItemId(
        subscription.id,
        STRIPE_PRICES.PDF_GENERATION
      );

      if (pdfItemId) {
        await reportUsage({
          subscriptionItemId: pdfItemId,
          quantity: delivery.newRecordsCount, // One PDF per record
        });
        result.reported.pdfGeneration = delivery.newRecordsCount;
        console.log(
          `[UsageReporter] Reported ${delivery.newRecordsCount} PDF generations for delivery ${deliveryId}`
        );
      }
    }

    // Report print job usage (if fulfillment was via print API)
    const fulfillmentDetails = delivery.fulfillmentDetails as {
      method?: string;
      provider?: string;
      recipientCount?: number;
    } | null;

    if (
      fulfillmentDetails?.method === 'PRINT_API' &&
      fulfillmentDetails.recipientCount
    ) {
      // Determine which print price to use based on subscription config
      // Default to 4x6
      const printPriceId = STRIPE_PRICES.PRINT_4X6;

      const printItemId = await findSubscriptionItemId(subscription.id, printPriceId);

      if (printItemId) {
        await reportUsage({
          subscriptionItemId: printItemId,
          quantity: fulfillmentDetails.recipientCount,
        });
        result.reported.printJobs = fulfillmentDetails.recipientCount;
        console.log(
          `[UsageReporter] Reported ${fulfillmentDetails.recipientCount} print jobs for delivery ${deliveryId}`
        );
      }
    }

    // Mark delivery as usage-reported
    await prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        fulfillmentDetails: {
          ...(delivery.fulfillmentDetails as Record<string, unknown> || {}),
          usageReported: true,
          usageReportedAt: new Date().toISOString(),
          usageReportedItems: result.reported,
        },
      },
    });

    return result;
  } catch (error) {
    console.error(`[UsageReporter] Error reporting usage for delivery ${deliveryId}:`, error);
    return {
      ...result,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Report usage for all unreported completed deliveries
 */
export async function reportPendingUsage(): Promise<{
  processed: number;
  successful: number;
  failed: number;
  results: UsageReportResult[];
}> {
  // Find completed deliveries that haven't had usage reported
  const deliveries = await prisma.delivery.findMany({
    where: {
      status: 'COMPLETED',
      OR: [
        { fulfillmentDetails: { equals: Prisma.DbNull } },
        {
          NOT: {
            fulfillmentDetails: {
              path: ['usageReported'],
              equals: true,
            },
          },
        },
      ],
    },
    orderBy: { completedAt: 'asc' },
    take: 100, // Process in batches
  });

  console.log(`[UsageReporter] Found ${deliveries.length} deliveries to report`);

  const results: UsageReportResult[] = [];
  let successful = 0;
  let failed = 0;

  for (const delivery of deliveries) {
    const result = await reportDeliveryUsage(delivery.id);
    results.push(result);

    if (result.success) {
      successful++;
    } else {
      failed++;
    }
  }

  return {
    processed: deliveries.length,
    successful,
    failed,
    results,
  };
}

/**
 * Get usage summary for a tenant for the current billing period
 */
export async function getUsageSummary(tenantId: string): Promise<{
  periodStart: Date;
  periodEnd: Date;
  dataRecords: number;
  pdfGeneration: number;
  printJobs: number;
  estimatedCost: number;
}> {
  // Get current billing period (assume monthly from 1st)
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Sum up deliveries in this period
  const deliveries = await prisma.delivery.findMany({
    where: {
      tenantId,
      status: 'COMPLETED',
      completedAt: {
        gte: periodStart,
        lte: periodEnd,
      },
    },
  });

  let dataRecords = 0;
  let pdfGeneration = 0;
  let printJobs = 0;

  for (const delivery of deliveries) {
    dataRecords += delivery.newRecordsCount;

    if (delivery.pdfFileUrl) {
      pdfGeneration += delivery.newRecordsCount;
    }

    const details = delivery.fulfillmentDetails as { method?: string; recipientCount?: number } | null;
    if (details?.method === 'PRINT_API' && details.recipientCount) {
      printJobs += details.recipientCount;
    }
  }

  // Calculate estimated cost
  const DATA_RECORD_PRICE = 0.04;
  const PDF_PRICE = 0.04;
  const PRINT_PRICE = 0.75;

  const estimatedCost =
    dataRecords * DATA_RECORD_PRICE +
    pdfGeneration * PDF_PRICE +
    printJobs * PRINT_PRICE;

  return {
    periodStart,
    periodEnd,
    dataRecords,
    pdfGeneration,
    printJobs,
    estimatedCost,
  };
}
