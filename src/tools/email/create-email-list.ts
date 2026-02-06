/**
 * Create Email List Tool
 * Pushes purchased data records into a ReachMail recipient list
 */

import { z } from 'zod';
import { validateInput } from '../../utils/validation.js';
import { requirePermission, type TenantContext } from '../../utils/auth.js';
import { NotFoundError } from '../../utils/errors.js';
import { decrypt } from '../../services/encryption.js';
import { ReachMailClient } from '../../services/reachmail/client.js';
import { createList, importRecipients, toReachMailRecipients } from '../../services/reachmail/lists.js';
import { prisma } from '../../db/client.js';

/**
 * Input validation schema
 */
const CreateEmailListSchema = z.object({
  name: z.string().min(1, 'List name is required').max(100),
  records: z.array(z.object({
    email: z.string().email('Valid email is required'),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    phone: z.string().optional(),
    company: z.string().optional(),
  })).min(1, 'At least one record is required').max(50000),
});

export type CreateEmailListInput = z.infer<typeof CreateEmailListSchema>;

/**
 * Tool definition
 */
export const createEmailListTool = {
  name: 'create_email_list',
  description: `Create a recipient list in ReachMail from purchased data records.

Pushes records with email addresses and merge fields (name, address, etc.) into a
new ReachMail list that can be used for email campaigns.

Requires email account to be configured first (configure_email_account).
Maximum 50,000 records per list.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'Name for the recipient list',
      },
      records: {
        type: 'array',
        description: 'Array of data records with email and optional merge fields',
        items: {
          type: 'object',
          properties: {
            email: { type: 'string', description: 'Email address (required)' },
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
    },
    required: ['name', 'records'],
  },
};

/**
 * Tool executor
 */
export async function executeCreateEmailList(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    list_id: string;
    list_name: string;
    total_records: number;
    imported: number;
    duplicates: number;
    invalid: number;
  };
  error?: string;
}> {
  const params = validateInput(CreateEmailListSchema, input);
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

  // Create list in ReachMail
  const list = await createList(client, params.name);

  // Convert and import recipients
  const recipients = toReachMailRecipients(params.records);
  const importResult = await importRecipients(client, list.Id, recipients);

  return {
    success: true,
    data: {
      list_id: list.Id,
      list_name: params.name,
      total_records: params.records.length,
      imported: importResult.ImportedCount,
      duplicates: importResult.DuplicateCount,
      invalid: importResult.InvalidCount,
    },
  };
}
