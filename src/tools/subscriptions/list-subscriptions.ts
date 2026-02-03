/**
 * Tool: list_subscriptions
 * List all subscriptions for the tenant with optional filters
 */

import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { validateInput } from '../../utils/validation.js';
import { requirePermission, type TenantContext } from '../../utils/auth.js';

/**
 * Input schema for list_subscriptions
 */
const ListSubscriptionsInputSchema = z.object({
  status_filter: z.enum(['active', 'paused', 'cancelled', 'all']).default('all'),
  client_filter: z.string().optional(),
  database_filter: z.enum(['nho', 'new_mover', 'consumer', 'business']).optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
}).optional();

export type ListSubscriptionsInput = z.infer<typeof ListSubscriptionsInputSchema>;

/**
 * Tool definition for MCP server registration
 */
export const listSubscriptionsTool = {
  name: 'list_subscriptions',
  description: `List all data subscriptions for your account.

Filter options:
- status_filter: Filter by status (active, paused, cancelled, all)
- client_filter: Search by client name
- database_filter: Filter by database type
- limit/offset: Pagination

Returns subscription summaries with key metrics.`,

  inputSchema: {
    type: 'object',
    properties: {
      status_filter: {
        type: 'string',
        enum: ['active', 'paused', 'cancelled', 'all'],
        description: 'Filter by subscription status',
        default: 'all',
      },
      client_filter: {
        type: 'string',
        description: 'Search by client name',
      },
      database_filter: {
        type: 'string',
        enum: ['nho', 'new_mover', 'consumer', 'business'],
        description: 'Filter by database type',
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return (1-100)',
        default: 50,
      },
      offset: {
        type: 'number',
        description: 'Number of results to skip',
        default: 0,
      },
    },
  },
};

/**
 * Execute the list_subscriptions tool
 */
export async function executeListSubscriptions(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    subscriptions: Array<{
      id: string;
      name: string;
      clientName: string | null;
      database: string;
      frequency: string;
      status: string;
      nextDeliveryAt: string | null;
      lastDeliveryAt: string | null;
      totalDeliveries: number;
      totalRecords: number;
      createdAt: string;
      geography_summary: string;
    }>;
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
    summary: {
      active: number;
      paused: number;
      cancelled: number;
    };
  };
  error?: string;
}> {
  // Validate input
  const params = validateInput(ListSubscriptionsInputSchema, input) || {};

  // Check permissions
  requirePermission(context, 'subscription:read');

  // Build where clause
  const where: Record<string, unknown> = {
    tenantId: context.tenant.id,
  };

  // Status filter
  const statusFilter = params.status_filter || 'all';
  if (statusFilter !== 'all') {
    where.status = statusFilter.toUpperCase();
  }

  // Client name filter
  if (params.client_filter) {
    where.clientName = {
      contains: params.client_filter,
      mode: 'insensitive',
    };
  }

  // Database filter
  if (params.database_filter) {
    where.database = params.database_filter.toUpperCase().replace('_', '_');
    if (params.database_filter === 'new_mover') {
      where.database = 'NEW_MOVER';
    } else {
      where.database = params.database_filter.toUpperCase();
    }
  }

  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  // Fetch subscriptions
  const [subscriptions, total] = await Promise.all([
    prisma.dataSubscription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        template: {
          select: { name: true },
        },
      },
    }),
    prisma.dataSubscription.count({ where }),
  ]);

  // Get summary counts
  const [activeCount, pausedCount, cancelledCount] = await Promise.all([
    prisma.dataSubscription.count({
      where: { tenantId: context.tenant.id, status: 'ACTIVE' },
    }),
    prisma.dataSubscription.count({
      where: { tenantId: context.tenant.id, status: 'PAUSED' },
    }),
    prisma.dataSubscription.count({
      where: { tenantId: context.tenant.id, status: 'CANCELLED' },
    }),
  ]);

  // Format geography summary
  const formatGeographySummary = (geography: unknown): string => {
    if (!geography || typeof geography !== 'object') return 'Unknown';
    const geo = geography as { type: string; values?: string[] };

    switch (geo.type) {
      case 'nationwide':
        return 'Nationwide';
      case 'state':
        return `States: ${geo.values?.join(', ') || 'All'}`;
      case 'zip':
        const zips = geo.values || [];
        return zips.length <= 3 ? `ZIPs: ${zips.join(', ')}` : `${zips.length} ZIP codes`;
      case 'city':
        return `Cities: ${geo.values?.join(', ') || 'All'}`;
      case 'county':
        return `Counties: ${geo.values?.join(', ') || 'All'}`;
      case 'radius':
        return 'Radius search';
      default:
        return 'Custom geography';
    }
  };

  return {
    success: true,
    data: {
      subscriptions: subscriptions.map((sub) => ({
        id: sub.id,
        name: sub.name,
        clientName: sub.clientName,
        database: sub.database.toLowerCase(),
        frequency: sub.frequency.toLowerCase(),
        status: sub.status.toLowerCase(),
        nextDeliveryAt: sub.nextDeliveryAt?.toISOString() || null,
        lastDeliveryAt: sub.lastDeliveryAt?.toISOString() || null,
        totalDeliveries: sub.totalDeliveries,
        totalRecords: sub.totalRecords,
        createdAt: sub.createdAt.toISOString(),
        geography_summary: formatGeographySummary(sub.geography),
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + subscriptions.length < total,
      },
      summary: {
        active: activeCount,
        paused: pausedCount,
        cancelled: cancelledCount,
      },
    },
  };
}
