/**
 * Configure SWOTSPOT Tool
 * Stores SWOTSPOT.ai API credentials for the tenant
 */

import { z } from 'zod';
import { validateInput } from '../../utils/validation.js';
import { requirePermission, type TenantContext } from '../../utils/auth.js';
import { encrypt } from '../../services/encryption.js';
import { SwotspotClient } from '../../services/swotspot/client.js';
import { prisma } from '../../db/client.js';

const ConfigureSwotspotSchema = z.object({
  api_key: z.string().min(1, 'API key is required'),
  test_connection: z.boolean().default(true),
});

export const configureSwotspotTool = {
  name: 'configure_swotspot',
  description: `Connect your SWOTSPOT.ai account for local business audits.

SWOTSPOT analyzes your local search presence including Google Business Profile,
citations, reviews, and local rankings — then provides a SWOT analysis with
actionable recommendations.

Provide your SWOTSPOT API key to get started.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      api_key: {
        type: 'string',
        description: 'Your SWOTSPOT.ai API key',
      },
      test_connection: {
        type: 'boolean',
        description: 'Test the connection before saving (default: true)',
      },
    },
    required: ['api_key'],
  },
};

export async function executeConfigureSwotspot(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    message: string;
    account_id: string | null;
    connection_tested: boolean;
  };
  error?: string;
}> {
  const params = validateInput(ConfigureSwotspotSchema, input);
  requirePermission(context, 'swotspot:write');

  const testConnection = params.test_connection ?? true;
  let accountId: string | null = null;

  if (testConnection) {
    const client = new SwotspotClient({ apiKey: params.api_key });
    const testResult = await client.testConnection();

    if (!testResult.success) {
      return {
        success: false,
        error: `Connection test failed: ${testResult.message}`,
      };
    }

    accountId = testResult.accountId || null;
  }

  const encryptedKey = encrypt(params.api_key);

  await prisma.swotspotConfig.upsert({
    where: { tenantId: context.tenant.id },
    create: {
      tenantId: context.tenant.id,
      apiKey: encryptedKey,
      accountId,
      lastTestAt: testConnection ? new Date() : null,
      lastTestSuccess: testConnection ? true : null,
    },
    update: {
      apiKey: encryptedKey,
      accountId: accountId || undefined,
      lastTestAt: testConnection ? new Date() : undefined,
      lastTestSuccess: testConnection ? true : undefined,
    },
  });

  return {
    success: true,
    data: {
      message: testConnection
        ? 'SWOTSPOT account connected and verified'
        : 'SWOTSPOT API key saved (not tested)',
      account_id: accountId,
      connection_tested: testConnection,
    },
  };
}
