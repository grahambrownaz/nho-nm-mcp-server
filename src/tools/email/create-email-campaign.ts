/**
 * Create Email Campaign Tool
 * Creates a complete email campaign: list + mailing + campaign in ReachMail
 */

import { z } from 'zod';
import { validateInput } from '../../utils/validation.js';
import { requirePermission, type TenantContext } from '../../utils/auth.js';
import { NotFoundError } from '../../utils/errors.js';
import { decrypt } from '../../services/encryption.js';
import { ReachMailClient } from '../../services/reachmail/client.js';
import { createList, importRecipients, toReachMailRecipients } from '../../services/reachmail/lists.js';
import { createMailing } from '../../services/reachmail/mailings.js';
import { createCampaign } from '../../services/reachmail/campaigns.js';
import { prisma } from '../../db/client.js';

/**
 * Input validation schema
 */
const CreateEmailCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().min(1).max(500),
  html_body: z.string().min(1, 'Email HTML body is required'),
  from_address: z.string().email().optional(),
  from_name: z.string().optional(),
  reply_to: z.string().email().optional(),
  // Provide either records OR an existing list_id
  records: z.array(z.object({
    email: z.string().email(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    phone: z.string().optional(),
    company: z.string().optional(),
  })).optional(),
  list_id: z.string().optional(),
  schedule_at: z.string().optional(),
}).refine(
  (data) => data.records || data.list_id,
  { message: 'Either records or list_id must be provided' }
);

export type CreateEmailCampaignInput = z.infer<typeof CreateEmailCampaignSchema>;

/**
 * Tool definition
 */
export const createEmailCampaignTool = {
  name: 'create_email_campaign',
  description: `Create an email campaign for sending to purchased email lists.

Provide either:
- records: Array of data records with email addresses (creates a new list automatically)
- list_id: ID of an existing ReachMail list (from create_email_list)

The campaign is created in DRAFT status. Use send_email_campaign to schedule or send it.

Requires email account to be configured first (configure_email_account).`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'Campaign name',
      },
      subject: {
        type: 'string',
        description: 'Email subject line',
      },
      html_body: {
        type: 'string',
        description: 'Email HTML body. Use merge fields like {{FirstName}}, {{LastName}}, {{City}} etc.',
      },
      from_address: {
        type: 'string',
        description: 'From email address (uses default if not specified)',
      },
      from_name: {
        type: 'string',
        description: 'From display name (optional)',
      },
      reply_to: {
        type: 'string',
        description: 'Reply-to email address (optional)',
      },
      records: {
        type: 'array',
        description: 'Array of data records to send to (alternative to list_id)',
        items: {
          type: 'object',
          properties: {
            email: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            address: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            zip: { type: 'string' },
            phone: { type: 'string' },
            company: { type: 'string' },
          },
          required: ['email'],
        },
      },
      list_id: {
        type: 'string',
        description: 'Existing ReachMail list ID (alternative to records)',
      },
      schedule_at: {
        type: 'string',
        description: 'ISO date string to schedule delivery (optional, creates as DRAFT if omitted)',
      },
    },
    required: ['name', 'subject', 'html_body'],
  },
};

/**
 * Tool executor
 */
export async function executeCreateEmailCampaign(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    campaign_id: string;
    reachmail_campaign_id: string;
    reachmail_mailing_id: string;
    reachmail_list_id: string;
    name: string;
    subject: string;
    recipient_count: number;
    status: string;
    scheduled_at: string | null;
  };
  error?: string;
}> {
  const params = validateInput(CreateEmailCampaignSchema, input);
  requirePermission(context, 'email:write');

  // Get tenant's email config
  const emailConfig = await prisma.emailConfig.findUnique({
    where: { tenantId: context.tenant.id },
  });

  if (!emailConfig) {
    throw new NotFoundError('Email configuration', 'Please run configure_email_account first');
  }

  // Decrypt token and create client
  const token = decrypt(emailConfig.reachmailToken);
  const client = new ReachMailClient({
    token,
    accountId: emailConfig.reachmailAccountId || undefined,
  });

  const fromAddress = params.from_address || emailConfig.defaultFromAddress;
  const replyTo = params.reply_to || emailConfig.defaultReplyTo;

  // Step 1: Create or use existing list
  let listId = params.list_id;
  let recipientCount = 0;

  if (params.records && !listId) {
    const list = await createList(client, `${params.name} - Recipients`);
    listId = list.Id;

    const recipients = toReachMailRecipients(params.records);
    const importResult = await importRecipients(client, listId, recipients);
    recipientCount = importResult.ImportedCount;
  }

  if (!listId) {
    return { success: false, error: 'No list_id or records provided' };
  }

  // Step 2: Create mailing (email content)
  const mailing = await createMailing(client, {
    subject: params.subject,
    fromAddress,
    fromName: params.from_name,
    replyTo: replyTo || undefined,
    htmlBody: params.html_body,
  });

  // Step 3: Create campaign (ties list + mailing)
  const campaign = await createCampaign(client, {
    name: params.name,
    mailingId: mailing.Id,
    listIds: [listId],
    scheduledDelivery: params.schedule_at,
  });

  // Step 4: Store in local database
  const status = params.schedule_at ? 'SCHEDULED' : 'DRAFT';
  const dbCampaign = await prisma.emailCampaign.create({
    data: {
      tenantId: context.tenant.id,
      name: params.name,
      subject: params.subject,
      fromAddress,
      replyTo: replyTo || null,
      htmlBody: params.html_body,
      reachmailCampaignId: campaign.Id,
      reachmailMailingId: mailing.Id,
      reachmailListId: listId,
      recipientCount,
      status: status as any,
      scheduledAt: params.schedule_at ? new Date(params.schedule_at) : null,
    },
  });

  return {
    success: true,
    data: {
      campaign_id: dbCampaign.id,
      reachmail_campaign_id: campaign.Id,
      reachmail_mailing_id: mailing.Id,
      reachmail_list_id: listId,
      name: params.name,
      subject: params.subject,
      recipient_count: recipientCount,
      status,
      scheduled_at: params.schedule_at || null,
    },
  };
}
