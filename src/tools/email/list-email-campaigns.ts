/**
 * List Email Campaigns Tool
 * Lists all email campaigns for the tenant
 */

import { z } from 'zod';
import { validateInput } from '../../utils/validation.js';
import { requirePermission, type TenantContext } from '../../utils/auth.js';
import { prisma } from '../../db/client.js';

/**
 * Input validation schema
 */
const ListEmailCampaignsSchema = z.object({
  status: z.enum(['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'PAUSED', 'CANCELLED', 'FAILED']).optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

export type ListEmailCampaignsInput = z.infer<typeof ListEmailCampaignsSchema>;

/**
 * Tool definition
 */
export const listEmailCampaignsTool = {
  name: 'list_email_campaigns',
  description: `List email campaigns for your account.

Returns campaigns with summary analytics. Filter by status and paginate results.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      status: {
        type: 'string',
        enum: ['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'PAUSED', 'CANCELLED', 'FAILED'],
        description: 'Filter by campaign status (optional)',
      },
      limit: {
        type: 'number',
        description: 'Number of results to return (default: 20, max: 100)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default: 0)',
      },
    },
  },
};

/**
 * Tool executor
 */
export async function executeListEmailCampaigns(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    campaigns: Array<{
      id: string;
      name: string;
      subject: string;
      status: string;
      recipient_count: number;
      sent: number;
      opens: number;
      clicks: number;
      bounces: number;
      open_rate: string;
      created_at: string;
      sent_at: string | null;
      scheduled_at: string | null;
    }>;
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
  error?: string;
}> {
  const params = validateInput(ListEmailCampaignsSchema, input);
  requirePermission(context, 'email:read');

  const limit = params.limit ?? 20;
  const offset = params.offset ?? 0;

  const where: Record<string, unknown> = {
    tenantId: context.tenant.id,
  };

  if (params.status) {
    where.status = params.status;
  }

  const [campaigns, total] = await Promise.all([
    prisma.emailCampaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.emailCampaign.count({ where }),
  ]);

  const formattedCampaigns = campaigns.map((c: {
    id: string;
    name: string;
    subject: string;
    status: string;
    recipientCount: number;
    sent: number;
    delivered: number;
    uniqueOpens: number;
    uniqueClicks: number;
    bounces: number;
    createdAt: Date;
    sentAt: Date | null;
    scheduledAt: Date | null;
  }) => {
    const openRate = c.delivered > 0
      ? ((c.uniqueOpens / c.delivered) * 100).toFixed(2) + '%'
      : '0.00%';

    return {
      id: c.id,
      name: c.name,
      subject: c.subject,
      status: c.status,
      recipient_count: c.recipientCount,
      sent: c.sent,
      opens: c.uniqueOpens,
      clicks: c.uniqueClicks,
      bounces: c.bounces,
      open_rate: openRate,
      created_at: c.createdAt.toISOString(),
      sent_at: c.sentAt?.toISOString() || null,
      scheduled_at: c.scheduledAt?.toISOString() || null,
    };
  });

  return {
    success: true,
    data: {
      campaigns: formattedCampaigns,
      total,
      limit,
      offset,
      has_more: offset + limit < total,
    },
  };
}
