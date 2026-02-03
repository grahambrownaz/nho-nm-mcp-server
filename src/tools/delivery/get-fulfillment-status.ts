/**
 * Tool: get_fulfillment_status
 * Get fulfillment status for a delivery
 */

import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { validateInput } from '../../utils/validation.js';
import { requirePermission, type TenantContext } from '../../utils/auth.js';
import { NotFoundError, AuthorizationError } from '../../utils/errors.js';

/**
 * Input schema for get_fulfillment_status
 */
const GetFulfillmentStatusInputSchema = z.object({
  delivery_id: z.string().uuid().optional(),
  subscription_id: z.string().uuid().optional(),
  include_records: z.boolean().default(false),
  limit: z.number().min(1).max(100).default(10),
});

export type GetFulfillmentStatusInput = z.infer<typeof GetFulfillmentStatusInputSchema>;

/**
 * Tool definition for MCP server registration
 */
export const getFulfillmentStatusTool = {
  name: 'get_fulfillment_status',
  description: `Get fulfillment status for deliveries.

Query by:
- delivery_id: Get status for a specific delivery
- subscription_id: Get recent deliveries for a subscription

Options:
- include_records: Include individual record details
- limit: Number of deliveries to return (default: 10)

For SFTP deliveries, returns:
- Upload timestamp
- Remote file path
- File size
- Connection status

For print API deliveries, returns:
- Job status
- Tracking information
- Print status`,

  inputSchema: {
    type: 'object',
    properties: {
      delivery_id: { type: 'string', description: 'Specific delivery ID' },
      subscription_id: { type: 'string', description: 'Subscription ID for recent deliveries' },
      include_records: { type: 'boolean', description: 'Include individual record details' },
      limit: { type: 'number', description: 'Number of deliveries to return' },
    },
  },
};

/**
 * Execute the get_fulfillment_status tool
 */
export async function executeGetFulfillmentStatus(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    deliveries: Array<{
      id: string;
      subscriptionId: string;
      subscriptionName: string;
      status: string;
      fulfillmentStatus: string;
      recordCount: number;
      newRecordsCount: number;
      scheduledAt: string;
      startedAt: string | null;
      completedAt: string | null;
      fulfillmentDetails: {
        method?: string;
        uploadedAt?: string;
        remotePath?: string;
        fileSize?: number;
        jdfGenerated?: boolean;
        jobStatus?: string;
        trackingNumber?: string;
        error?: string;
      } | null;
      costs: {
        dataCost: number;
        pdfCost: number;
        fulfillmentCost: number;
        totalCost: number;
      };
      files: {
        dataFileUrl: string | null;
        pdfFileUrl: string | null;
      };
      records?: Array<{
        firstName: string | null;
        lastName: string | null;
        address: string;
        city: string;
        state: string;
        zip: string;
        deliveredAt: string;
      }>;
    }>;
    summary?: {
      totalDeliveries: number;
      completed: number;
      failed: number;
      pending: number;
      totalRecords: number;
      totalCost: number;
    };
  };
  error?: string;
}> {
  // Validate input
  const params = validateInput(GetFulfillmentStatusInputSchema, input);

  // Check permissions
  requirePermission(context, 'subscription:read');

  // Get options with defaults
  const includeRecords = params.include_records ?? false;
  const limit = params.limit ?? 10;

  // Must provide either delivery_id or subscription_id
  if (!params.delivery_id && !params.subscription_id) {
    // Return recent deliveries for the tenant
    const deliveries = await prisma.delivery.findMany({
      where: { tenantId: context.tenant.id },
      orderBy: { scheduledAt: 'desc' },
      take: limit,
      include: {
        dataSubscription: {
          select: { id: true, name: true },
        },
      },
    });

    return formatDeliveriesResponse(deliveries, context, includeRecords);
  }

  // Query by delivery_id
  if (params.delivery_id) {
    const delivery = await prisma.delivery.findUnique({
      where: { id: params.delivery_id },
      include: {
        dataSubscription: {
          select: { id: true, name: true },
        },
      },
    });

    if (!delivery) {
      throw new NotFoundError('Delivery', params.delivery_id);
    }

    if (delivery.tenantId !== context.tenant.id) {
      throw new AuthorizationError('You do not have access to this delivery');
    }

    return formatDeliveriesResponse([delivery], context, includeRecords);
  }

  // Query by subscription_id
  if (params.subscription_id) {
    // Verify subscription ownership
    const subscription = await prisma.dataSubscription.findUnique({
      where: { id: params.subscription_id },
    });

    if (!subscription) {
      throw new NotFoundError('Subscription', params.subscription_id);
    }

    if (subscription.tenantId !== context.tenant.id) {
      throw new AuthorizationError('You do not have access to this subscription');
    }

    const deliveries = await prisma.delivery.findMany({
      where: {
        dataSubscriptionId: params.subscription_id,
        tenantId: context.tenant.id,
      },
      orderBy: { scheduledAt: 'desc' },
      take: limit,
      include: {
        dataSubscription: {
          select: { id: true, name: true },
        },
      },
    });

    return formatDeliveriesResponse(deliveries, context, includeRecords);
  }

  return { success: true, data: { deliveries: [] } };
}

/**
 * Format deliveries response
 */
async function formatDeliveriesResponse(
  deliveries: Array<{
    id: string;
    dataSubscriptionId: string;
    tenantId: string;
    recordCount: number;
    newRecordsCount: number;
    status: string;
    fulfillmentStatus: string;
    fulfillmentDetails: unknown;
    dataCost: unknown;
    pdfCost: unknown;
    fulfillmentCost: unknown;
    totalCost: unknown;
    dataFileUrl: string | null;
    pdfFileUrl: string | null;
    scheduledAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    errorMessage: string | null;
    dataSubscription: {
      id: string;
      name: string;
    };
  }>,
  _context: TenantContext,
  includeRecords: boolean
): Promise<{
  success: boolean;
  data: {
    deliveries: Array<{
      id: string;
      subscriptionId: string;
      subscriptionName: string;
      status: string;
      fulfillmentStatus: string;
      recordCount: number;
      newRecordsCount: number;
      scheduledAt: string;
      startedAt: string | null;
      completedAt: string | null;
      fulfillmentDetails: {
        method?: string;
        uploadedAt?: string;
        remotePath?: string;
        fileSize?: number;
        jdfGenerated?: boolean;
        jobStatus?: string;
        trackingNumber?: string;
        error?: string;
      } | null;
      costs: {
        dataCost: number;
        pdfCost: number;
        fulfillmentCost: number;
        totalCost: number;
      };
      files: {
        dataFileUrl: string | null;
        pdfFileUrl: string | null;
      };
      records?: Array<{
        firstName: string | null;
        lastName: string | null;
        address: string;
        city: string;
        state: string;
        zip: string;
        deliveredAt: string;
      }>;
    }>;
    summary: {
      totalDeliveries: number;
      completed: number;
      failed: number;
      pending: number;
      totalRecords: number;
      totalCost: number;
    };
  };
}> {
  const formattedDeliveries = await Promise.all(
    deliveries.map(async (delivery) => {
      const formatted: {
        id: string;
        subscriptionId: string;
        subscriptionName: string;
        status: string;
        fulfillmentStatus: string;
        recordCount: number;
        newRecordsCount: number;
        scheduledAt: string;
        startedAt: string | null;
        completedAt: string | null;
        fulfillmentDetails: {
          method?: string;
          uploadedAt?: string;
          remotePath?: string;
          fileSize?: number;
          jdfGenerated?: boolean;
          jobStatus?: string;
          trackingNumber?: string;
          error?: string;
        } | null;
        costs: {
          dataCost: number;
          pdfCost: number;
          fulfillmentCost: number;
          totalCost: number;
        };
        files: {
          dataFileUrl: string | null;
          pdfFileUrl: string | null;
        };
        records?: Array<{
          firstName: string | null;
          lastName: string | null;
          address: string;
          city: string;
          state: string;
          zip: string;
          deliveredAt: string;
        }>;
      } = {
        id: delivery.id,
        subscriptionId: delivery.dataSubscription.id,
        subscriptionName: delivery.dataSubscription.name,
        status: delivery.status.toLowerCase(),
        fulfillmentStatus: delivery.fulfillmentStatus.toLowerCase(),
        recordCount: delivery.recordCount,
        newRecordsCount: delivery.newRecordsCount,
        scheduledAt: delivery.scheduledAt.toISOString(),
        startedAt: delivery.startedAt?.toISOString() || null,
        completedAt: delivery.completedAt?.toISOString() || null,
        fulfillmentDetails: delivery.fulfillmentDetails as {
          method?: string;
          uploadedAt?: string;
          remotePath?: string;
          fileSize?: number;
          jdfGenerated?: boolean;
          jobStatus?: string;
          trackingNumber?: string;
          error?: string;
        } | null,
        costs: {
          dataCost: Number(delivery.dataCost),
          pdfCost: Number(delivery.pdfCost),
          fulfillmentCost: Number(delivery.fulfillmentCost),
          totalCost: Number(delivery.totalCost),
        },
        files: {
          dataFileUrl: delivery.dataFileUrl,
          pdfFileUrl: delivery.pdfFileUrl,
        },
      };

      // Include records if requested
      if (includeRecords) {
        const records = await prisma.deliveryRecord.findMany({
          where: { deliveryId: delivery.id },
          take: 100,
          orderBy: { deliveredAt: 'desc' },
        });

        formatted.records = records.map((r) => ({
          firstName: r.firstName,
          lastName: r.lastName,
          address: r.address,
          city: r.city,
          state: r.state,
          zip: r.zip,
          deliveredAt: r.deliveredAt.toISOString(),
        }));
      }

      return formatted;
    })
  );

  // Calculate summary
  const summary = {
    totalDeliveries: deliveries.length,
    completed: deliveries.filter((d) => d.status === 'COMPLETED').length,
    failed: deliveries.filter((d) => d.status === 'FAILED').length,
    pending: deliveries.filter((d) => ['PENDING', 'PROCESSING', 'GENERATING_PDF', 'FULFILLING'].includes(d.status)).length,
    totalRecords: deliveries.reduce((sum, d) => sum + d.recordCount, 0),
    totalCost: deliveries.reduce((sum, d) => sum + Number(d.totalCost), 0),
  };

  return {
    success: true,
    data: {
      deliveries: formattedDeliveries,
      summary,
    },
  };
}
