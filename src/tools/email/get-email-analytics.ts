/**
 * Get Email Analytics Tool
 * Retrieves campaign performance metrics from ReachMail
 */

import { z } from 'zod';
import { validateInput } from '../../utils/validation.js';
import { requirePermission, type TenantContext } from '../../utils/auth.js';
import { NotFoundError } from '../../utils/errors.js';
import { decrypt } from '../../services/encryption.js';
import { ReachMailClient } from '../../services/reachmail/client.js';
import { getCampaignSummary, formatAnalytics } from '../../services/reachmail/reports.js';
import { prisma } from '../../db/client.js';

/**
 * Input validation schema
 */
const GetEmailAnalyticsSchema = z.object({
  campaign_id: z.string().uuid('Valid campaign ID is required'),
  refresh: z.boolean().default(true),
});

export type GetEmailAnalyticsInput = z.infer<typeof GetEmailAnalyticsSchema>;

/**
 * Tool definition
 */
export const getEmailAnalyticsTool = {
  name: 'get_email_analytics',
  description: `Get performance analytics for an email campaign.

Returns delivery metrics (sent, delivered, bounced), engagement metrics
(opens, clicks, opt-outs), and calculated rates (open rate, click rate, etc.).

Data is fetched from ReachMail in real-time and cached locally.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      campaign_id: {
        type: 'string',
        description: 'Local campaign ID',
      },
      refresh: {
        type: 'boolean',
        description: 'Fetch fresh data from ReachMail (default: true). Set to false to use cached data.',
      },
    },
    required: ['campaign_id'],
  },
};

/**
 * Tool executor
 */
export async function executeGetEmailAnalytics(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    campaign_id: string;
    campaign_name: string;
    status: string;
    recipient_count: number;
    analytics: ReturnType<typeof formatAnalytics>;
    last_updated: string;
  };
  error?: string;
}> {
  const params = validateInput(GetEmailAnalyticsSchema, input);
  requirePermission(context, 'email:read');

  // Get the campaign from local DB
  const campaign = await prisma.emailCampaign.findFirst({
    where: {
      id: params.campaign_id,
      tenantId: context.tenant.id,
    },
  });

  if (!campaign) {
    throw new NotFoundError('Email campaign', params.campaign_id);
  }

  // If refresh requested and campaign has been sent, fetch from ReachMail
  if (params.refresh && campaign.reachmailMailingId && campaign.status !== 'DRAFT') {
    const emailConfig = await prisma.emailConfig.findUnique({
      where: { tenantId: context.tenant.id },
    });

    if (emailConfig) {
      const token = decrypt(emailConfig.reachmailToken);
      const client = new ReachMailClient({
        token,
        accountId: emailConfig.reachmailAccountId || undefined,
      });

      try {
        const summary = await getCampaignSummary(client, campaign.reachmailMailingId);

        // Update cached analytics
        await prisma.emailCampaign.update({
          where: { id: campaign.id },
          data: {
            sent: summary.Sent,
            delivered: summary.Delivered,
            opens: summary.Opens,
            uniqueOpens: summary.UniqueOpens,
            clicks: summary.Clicks,
            uniqueClicks: summary.UniqueClicks,
            bounces: summary.Bounces,
            optOuts: summary.OptOuts,
            lastStatsUpdate: new Date(),
            // Update status if campaign finished sending
            status: summary.Sent > 0 && campaign.status === 'SENDING' ? 'SENT' : campaign.status,
          },
        });

        const analytics = formatAnalytics(summary);

        return {
          success: true,
          data: {
            campaign_id: campaign.id,
            campaign_name: campaign.name,
            status: summary.Sent > 0 && campaign.status === 'SENDING' ? 'SENT' : campaign.status,
            recipient_count: campaign.recipientCount,
            analytics,
            last_updated: new Date().toISOString(),
          },
        };
      } catch {
        // Fall through to cached data if ReachMail API fails
      }
    }
  }

  // Return cached data
  const analytics = formatAnalytics({
    Sent: campaign.sent,
    Delivered: campaign.delivered,
    Opens: campaign.opens,
    UniqueOpens: campaign.uniqueOpens,
    Clicks: campaign.clicks,
    UniqueClicks: campaign.uniqueClicks,
    Bounces: campaign.bounces,
    HardBounces: 0,
    SoftBounces: 0,
    OptOuts: campaign.optOuts,
    SpamComplaints: 0,
    Forwards: 0,
  });

  return {
    success: true,
    data: {
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      status: campaign.status,
      recipient_count: campaign.recipientCount,
      analytics,
      last_updated: campaign.lastStatsUpdate?.toISOString() || campaign.createdAt.toISOString(),
    },
  };
}
