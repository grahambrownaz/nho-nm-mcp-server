/**
 * Configure Email Account Tool
 * Stores ReachMail credentials and tests the connection
 */

import { z } from 'zod';
import { validateInput } from '../../utils/validation.js';
import { requirePermission, type TenantContext } from '../../utils/auth.js';
import { encrypt } from '../../services/encryption.js';
import { ReachMailClient } from '../../services/reachmail/client.js';
import { prisma } from '../../db/client.js';

/**
 * Input validation schema
 */
const ConfigureEmailAccountSchema = z.object({
  reachmail_token: z.string().min(1, 'ReachMail API token is required'),
  from_address: z.string().email('Valid from email address is required'),
  reply_to: z.string().email().optional(),
  physical_address: z.string().min(10, 'Physical mailing address is required for CAN-SPAM compliance'),
  dkim_domain: z.string().optional(),
  test_connection: z.boolean().default(true),
});

export type ConfigureEmailAccountInput = z.infer<typeof ConfigureEmailAccountSchema>;

/**
 * Tool definition
 */
export const configureEmailAccountTool = {
  name: 'configure_email_account',
  description: `Configure a ReachMail email sending account for campaign delivery.

Stores encrypted API credentials, default sending address, and CAN-SPAM required physical address.
Optionally tests the connection to verify credentials.

Required for all other email tools to function.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      reachmail_token: {
        type: 'string',
        description: 'ReachMail API bearer token (from Account > Tokens)',
      },
      from_address: {
        type: 'string',
        description: 'Default "from" email address for campaigns',
      },
      reply_to: {
        type: 'string',
        description: 'Default reply-to email address (optional)',
      },
      physical_address: {
        type: 'string',
        description: 'Physical mailing address (required by CAN-SPAM)',
      },
      dkim_domain: {
        type: 'string',
        description: 'Domain configured for DKIM authentication (optional)',
      },
      test_connection: {
        type: 'boolean',
        description: 'Test the connection before saving (default: true)',
      },
    },
    required: ['reachmail_token', 'from_address', 'physical_address'],
  },
};

/**
 * Tool executor
 */
export async function executeConfigureEmailAccount(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    config_id: string;
    account_id: string | null;
    from_address: string;
    connection_tested: boolean;
    connection_status?: string;
  };
  error?: string;
}> {
  const params = validateInput(ConfigureEmailAccountSchema, input);
  requirePermission(context, 'email:write');

  // Test connection if requested
  let accountId: string | null = null;
  let connectionMessage: string | undefined;

  if (params.test_connection) {
    const client = new ReachMailClient({ token: params.reachmail_token });
    const testResult = await client.testConnection();

    if (!testResult.success) {
      return {
        success: false,
        error: `Connection test failed: ${testResult.message}`,
      };
    }

    accountId = testResult.accountId || null;
    connectionMessage = testResult.message;
  }

  // Encrypt the token before storage
  const encryptedToken = encrypt(params.reachmail_token);

  // Upsert the email config (one per tenant)
  const config = await prisma.emailConfig.upsert({
    where: { tenantId: context.tenant.id },
    create: {
      tenantId: context.tenant.id,
      reachmailToken: encryptedToken,
      reachmailAccountId: accountId,
      defaultFromAddress: params.from_address,
      defaultReplyTo: params.reply_to || null,
      physicalAddress: params.physical_address,
      dkimDomain: params.dkim_domain || null,
      isVerified: params.test_connection ? true : false,
      lastTestAt: params.test_connection ? new Date() : null,
      lastTestSuccess: params.test_connection ? true : null,
    },
    update: {
      reachmailToken: encryptedToken,
      reachmailAccountId: accountId,
      defaultFromAddress: params.from_address,
      defaultReplyTo: params.reply_to || null,
      physicalAddress: params.physical_address,
      dkimDomain: params.dkim_domain || null,
      isVerified: params.test_connection ? true : false,
      lastTestAt: params.test_connection ? new Date() : null,
      lastTestSuccess: params.test_connection ? true : null,
    },
  });

  return {
    success: true,
    data: {
      config_id: config.id,
      account_id: accountId,
      from_address: params.from_address,
      connection_tested: params.test_connection ?? true,
      connection_status: connectionMessage,
    },
  };
}
