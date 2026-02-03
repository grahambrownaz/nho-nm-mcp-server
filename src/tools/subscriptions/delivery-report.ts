/**
 * Tool: delivery_report
 * Generate delivery reports for subscriptions
 */

import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { validateInput } from '../../utils/validation.js';
import { requirePermission, type TenantContext } from '../../utils/auth.js';

/**
 * Input schema for delivery_report
 */
const DeliveryReportInputSchema = z.object({
  period: z.enum(['this_week', 'last_week', 'this_month', 'last_month', 'custom']).default('this_month'),
  start_date: z.string().optional(), // Required for custom period
  end_date: z.string().optional(), // Required for custom period
  subscription_id: z.string().uuid().optional(),
  client_name: z.string().optional(),
  format: z.enum(['json', 'csv']).default('json'),
}).optional();

export type DeliveryReportInput = z.infer<typeof DeliveryReportInputSchema>;

/**
 * Tool definition for MCP server registration
 */
export const deliveryReportTool = {
  name: 'delivery_report',
  description: `Generate delivery reports for your subscriptions.

Parameters:
- period: Time period (this_week, last_week, this_month, last_month, custom)
- start_date/end_date: For custom period (ISO date strings)
- subscription_id: Filter to specific subscription
- client_name: Filter by client name
- format: Output format (json or csv)

Returns delivery statistics and details for the specified period.`,

  inputSchema: {
    type: 'object',
    properties: {
      period: {
        type: 'string',
        enum: ['this_week', 'last_week', 'this_month', 'last_month', 'custom'],
        description: 'Time period for the report',
        default: 'this_month',
      },
      start_date: {
        type: 'string',
        description: 'Start date for custom period (ISO format)',
      },
      end_date: {
        type: 'string',
        description: 'End date for custom period (ISO format)',
      },
      subscription_id: {
        type: 'string',
        description: 'Filter to specific subscription',
      },
      client_name: {
        type: 'string',
        description: 'Filter by client name',
      },
      format: {
        type: 'string',
        enum: ['json', 'csv'],
        description: 'Output format',
        default: 'json',
      },
    },
  },
};

/**
 * Calculate date range based on period
 */
function getDateRange(period: string, startDate?: string, endDate?: string): { start: Date; end: Date } {
  const now = new Date();
  let start: Date;
  let end: Date;

  switch (period) {
    case 'this_week': {
      const dayOfWeek = now.getDay();
      start = new Date(now);
      start.setDate(now.getDate() - dayOfWeek);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'last_week': {
      const dayOfWeek = now.getDay();
      start = new Date(now);
      start.setDate(now.getDate() - dayOfWeek - 7);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'this_month': {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'last_month': {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'custom': {
      if (!startDate || !endDate) {
        throw new Error('start_date and end_date required for custom period');
      }
      start = new Date(startDate);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      break;
    }
    default:
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now);
  }

  return { start, end };
}

/**
 * Format report as CSV
 */
function formatAsCsv(deliveries: Array<{
  id: string;
  subscriptionName: string;
  clientName: string | null;
  scheduledAt: string;
  completedAt: string | null;
  status: string;
  recordCount: number;
  newRecordsCount: number;
  dataCost: number;
  pdfCost: number;
  fulfillmentCost: number;
  totalCost: number;
}>): string {
  const headers = [
    'Delivery ID',
    'Subscription Name',
    'Client Name',
    'Scheduled At',
    'Completed At',
    'Status',
    'Record Count',
    'New Records',
    'Data Cost',
    'PDF Cost',
    'Fulfillment Cost',
    'Total Cost',
  ];

  const rows = deliveries.map((d) => [
    d.id,
    `"${d.subscriptionName}"`,
    `"${d.clientName || ''}"`,
    d.scheduledAt,
    d.completedAt || '',
    d.status,
    d.recordCount.toString(),
    d.newRecordsCount.toString(),
    d.dataCost.toFixed(2),
    d.pdfCost.toFixed(2),
    d.fulfillmentCost.toFixed(2),
    d.totalCost.toFixed(2),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * Execute the delivery_report tool
 */
export async function executeDeliveryReport(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    period: {
      name: string;
      start: string;
      end: string;
    };
    summary: {
      totalDeliveries: number;
      completedDeliveries: number;
      failedDeliveries: number;
      totalRecords: number;
      totalNewRecords: number;
      totalCost: number;
      averageRecordsPerDelivery: number;
    };
    bySubscription: Array<{
      subscriptionId: string;
      subscriptionName: string;
      clientName: string | null;
      deliveryCount: number;
      recordCount: number;
      totalCost: number;
    }>;
    deliveries?: Array<{
      id: string;
      subscriptionName: string;
      clientName: string | null;
      scheduledAt: string;
      completedAt: string | null;
      status: string;
      recordCount: number;
      newRecordsCount: number;
      dataCost: number;
      pdfCost: number;
      fulfillmentCost: number;
      totalCost: number;
    }>;
    csv?: string;
  };
  error?: string;
}> {
  // Validate input
  const params = validateInput(DeliveryReportInputSchema, input) || {};

  // Check permissions
  requirePermission(context, 'subscription:read');

  const period = params.period || 'this_month';
  const { start, end } = getDateRange(period, params.start_date, params.end_date);

  // Build where clause for deliveries
  const where: Record<string, unknown> = {
    tenantId: context.tenant.id,
    scheduledAt: {
      gte: start,
      lte: end,
    },
  };

  // Add subscription filter
  if (params.subscription_id) {
    where.dataSubscriptionId = params.subscription_id;
  }

  // Add client name filter (need to join through subscription)
  let subscriptionIds: string[] | undefined;
  if (params.client_name) {
    const matchingSubscriptions = await prisma.dataSubscription.findMany({
      where: {
        tenantId: context.tenant.id,
        clientName: {
          contains: params.client_name,
          mode: 'insensitive',
        },
      },
      select: { id: true },
    });
    subscriptionIds = matchingSubscriptions.map((s) => s.id);
    where.dataSubscriptionId = { in: subscriptionIds };
  }

  // Fetch deliveries with subscription info
  const deliveries = await prisma.delivery.findMany({
    where,
    orderBy: { scheduledAt: 'desc' },
    include: {
      dataSubscription: {
        select: {
          id: true,
          name: true,
          clientName: true,
        },
      },
    },
  });

  // Calculate summary stats
  const completedDeliveries = deliveries.filter((d) => d.status === 'COMPLETED');
  const failedDeliveries = deliveries.filter((d) => d.status === 'FAILED');

  const summary = {
    totalDeliveries: deliveries.length,
    completedDeliveries: completedDeliveries.length,
    failedDeliveries: failedDeliveries.length,
    totalRecords: deliveries.reduce((sum, d) => sum + d.recordCount, 0),
    totalNewRecords: deliveries.reduce((sum, d) => sum + d.newRecordsCount, 0),
    totalCost: deliveries.reduce((sum, d) => sum + Number(d.totalCost), 0),
    averageRecordsPerDelivery:
      deliveries.length > 0
        ? Math.round(deliveries.reduce((sum, d) => sum + d.recordCount, 0) / deliveries.length)
        : 0,
  };

  // Group by subscription
  const subscriptionMap = new Map<
    string,
    {
      subscriptionId: string;
      subscriptionName: string;
      clientName: string | null;
      deliveryCount: number;
      recordCount: number;
      totalCost: number;
    }
  >();

  for (const delivery of deliveries) {
    const subId = delivery.dataSubscription.id;
    const existing = subscriptionMap.get(subId);

    if (existing) {
      existing.deliveryCount++;
      existing.recordCount += delivery.recordCount;
      existing.totalCost += Number(delivery.totalCost);
    } else {
      subscriptionMap.set(subId, {
        subscriptionId: subId,
        subscriptionName: delivery.dataSubscription.name,
        clientName: delivery.dataSubscription.clientName,
        deliveryCount: 1,
        recordCount: delivery.recordCount,
        totalCost: Number(delivery.totalCost),
      });
    }
  }

  const bySubscription = Array.from(subscriptionMap.values()).sort(
    (a, b) => b.recordCount - a.recordCount
  );

  // Format deliveries
  const formattedDeliveries = deliveries.map((d) => ({
    id: d.id,
    subscriptionName: d.dataSubscription.name,
    clientName: d.dataSubscription.clientName,
    scheduledAt: d.scheduledAt.toISOString(),
    completedAt: d.completedAt?.toISOString() || null,
    status: d.status.toLowerCase(),
    recordCount: d.recordCount,
    newRecordsCount: d.newRecordsCount,
    dataCost: Number(d.dataCost),
    pdfCost: Number(d.pdfCost),
    fulfillmentCost: Number(d.fulfillmentCost),
    totalCost: Number(d.totalCost),
  }));

  // Build response
  const format = params.format || 'json';
  const response: {
    success: boolean;
    data: {
      period: { name: string; start: string; end: string };
      summary: typeof summary;
      bySubscription: typeof bySubscription;
      deliveries?: typeof formattedDeliveries;
      csv?: string;
    };
  } = {
    success: true,
    data: {
      period: {
        name: period,
        start: start.toISOString(),
        end: end.toISOString(),
      },
      summary,
      bySubscription,
    },
  };

  if (format === 'csv') {
    response.data.csv = formatAsCsv(formattedDeliveries);
  } else {
    response.data.deliveries = formattedDeliveries;
  }

  return response;
}
