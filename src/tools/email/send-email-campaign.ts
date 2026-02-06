/**
 * Send Email Campaign Tool
 * Schedules or immediately sends an existing email campaign
 */

import { z } from 'zod';
import { validateInput } from '../../utils/validation.js';
import { requirePermission, type TenantContext } from '../../utils/auth.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { decrypt } from '../../services/encryption.js';
import { ReachMailClient } from '../../services/reachmail/client.js';
import { scheduleCampaign } from '../../services/reachmail/campaigns.js';
import { prisma } from '../../db/client.js';

/**
 * Input validation schema
 */
const SendEmailCampaignSchema = z.object({
  campaign_id: z.string().uuid('Valid campaign ID is required'),
  send_at: z.string().optional(),
});

export type SendEmailCampaignInput = z.infer<typeof SendEmailCampaignSchema>;

/**
 * Tool definition
 */
export const sendEmailCampaignTool = {
  name: 'send_email_campaign',
  description: `Schedule or immediately send an email campaign.

Takes a campaign_id from create_email_campaign and either sends it immediately
or schedules it for a specific date/time.

Usage is billed per email sent (EMAIL_SEND usage type).`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      campaign_id: {
        type: 'string',
        description: 'Local campaign ID (from create_email_campaign)',
      },
      send_at: {
        type: 'string',
        description: 'ISO date string to schedule delivery. Omit to send immediately.',
      },
    },
    required: ['campaign_id'],
  },
};

/**
 * Tool executor
 */
export async function executeSendEmailCampaign(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    campaign_id: string;
    status: string;
    scheduled_at: string | null;
    recipient_count: number;
    message: string;
  };
  error?: string;
}> {
  const params = validateInput(SendEmailCampaignSchema, input);
  requirePermission(context, 'email:write');

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

  if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
    throw new ValidationError(`Campaign cannot be sent: current status is ${campaign.status}`);
  }

  if (!campaign.reachmailCampaignId) {
    throw new ValidationError('Campaign has no ReachMail campaign ID');
  }

  // Get tenant's email config
  const emailConfig = await prisma.emailConfig.findUnique({
    where: { tenantId: context.tenant.id },
  });

  if (!emailConfig) {
    throw new NotFoundError('Email configuration');
  }

  // Decrypt token and create client
  const token = decrypt(emailConfig.reachmailToken);
  const client = new ReachMailClient({
    token,
    accountId: emailConfig.reachmailAccountId || undefined,
  });

  // Schedule the campaign in ReachMail
  await scheduleCampaign(client, campaign.reachmailCampaignId, params.send_at);

  // Update local campaign status
  const newStatus = params.send_at ? 'SCHEDULED' : 'SENDING';
  await prisma.emailCampaign.update({
    where: { id: campaign.id },
    data: {
      status: newStatus as any,
      scheduledAt: params.send_at ? new Date(params.send_at) : null,
      sentAt: params.send_at ? null : new Date(),
    },
  });

  // Record usage for billing
  if (campaign.recipientCount > 0) {
    const unitPrice = 0.003; // $3/1000 = $0.003 per email
    await prisma.usageRecord.create({
      data: {
        tenantId: context.tenant.id,
        usageType: 'EMAIL_SEND',
        quantity: campaign.recipientCount,
        unitPrice,
        totalCost: campaign.recipientCount * unitPrice,
        toolName: 'send_email_campaign',
        billingMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      },
    });
  }

  const message = params.send_at
    ? `Campaign scheduled for ${params.send_at}`
    : `Campaign is now sending to ${campaign.recipientCount} recipients`;

  return {
    success: true,
    data: {
      campaign_id: campaign.id,
      status: newStatus,
      scheduled_at: params.send_at || null,
      recipient_count: campaign.recipientCount,
      message,
    },
  };
}
