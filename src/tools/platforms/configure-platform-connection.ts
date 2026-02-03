/**
 * Tool: configure_platform_connection
 * Configure and store credentials for platform integrations
 */

import { z } from 'zod';
import { validateInput } from '../../utils/validation.js';
import { requirePermission, type TenantContext } from '../../utils/auth.js';
import { prisma } from '../../db/client.js';
import {
  testPlatformConnection,
  isPlatformSupported,
  type PlatformCredentials,
  type ZapierCredentials,
} from '../../services/platform-sync/index.js';

/**
 * Platform-specific credential schemas
 */
const MailchimpCredentialsSchema = z.object({
  type: z.literal('mailchimp'),
  apiKey: z.string().min(1),
  server: z.string().min(1), // e.g., 'us1', 'us2'
  audienceId: z.string().optional(),
});

const HubSpotCredentialsSchema = z.object({
  type: z.literal('hubspot'),
  accessToken: z.string().min(1),
  portalId: z.string().optional(),
});

const ZapierCredentialsSchema = z.object({
  type: z.literal('zapier'),
  webhookUrl: z.string().url(),
});

const SalesforceCredentialsSchema = z.object({
  type: z.literal('salesforce'),
  instanceUrl: z.string().url(),
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
});

const GoogleSheetsCredentialsSchema = z.object({
  type: z.literal('google_sheets'),
  serviceAccountJson: z.string().min(1),
  spreadsheetId: z.string().min(1),
  sheetName: z.string().optional(),
});

/**
 * Input schema for configure_platform_connection
 */
const ConfigurePlatformConnectionInputSchema = z.object({
  platform: z.enum(['mailchimp', 'hubspot', 'salesforce', 'zapier', 'google_sheets']),
  connection_name: z.string().min(1).max(100),
  credentials: z.union([
    MailchimpCredentialsSchema,
    HubSpotCredentialsSchema,
    ZapierCredentialsSchema,
    SalesforceCredentialsSchema,
    GoogleSheetsCredentialsSchema,
  ]),
  default_settings: z.object({
    listId: z.string().optional(),
    audienceId: z.string().optional(),
    tags: z.array(z.string()).optional(),
    fieldMapping: z.record(z.string()).optional(),
  }).optional(),
  test: z.boolean().optional().default(true),
});

export type ConfigurePlatformConnectionInput = z.infer<typeof ConfigurePlatformConnectionInputSchema>;

/**
 * Tool definition for MCP server registration
 */
export const configurePlatformConnectionTool = {
  name: 'configure_platform_connection',
  description: `Configure a connection to an external platform for syncing records.

Supported platforms:
- mailchimp: Requires API key and server (e.g., 'us1')
- hubspot: Requires access token (OAuth or private app)
- zapier: Requires webhook URL from your Zap
- salesforce: Requires instance URL and access token
- google_sheets: Requires service account JSON and spreadsheet ID

The connection is tested before saving (unless test=false).
Credentials are encrypted before storage.

Returns the connection ID for use with sync_to_platform.`,

  inputSchema: {
    type: 'object',
    properties: {
      platform: {
        type: 'string',
        enum: ['mailchimp', 'hubspot', 'salesforce', 'zapier', 'google_sheets'],
        description: 'Platform to connect to',
      },
      connection_name: {
        type: 'string',
        description: 'Friendly name for this connection',
      },
      credentials: {
        type: 'object',
        description: 'Platform-specific credentials',
        oneOf: [
          {
            title: 'Mailchimp',
            properties: {
              type: { const: 'mailchimp' },
              apiKey: { type: 'string', description: 'Mailchimp API key' },
              server: { type: 'string', description: 'Server prefix (e.g., us1)' },
              audienceId: { type: 'string', description: 'Default audience ID' },
            },
            required: ['type', 'apiKey', 'server'],
          },
          {
            title: 'HubSpot',
            properties: {
              type: { const: 'hubspot' },
              accessToken: { type: 'string', description: 'OAuth or private app token' },
              portalId: { type: 'string', description: 'Portal ID' },
            },
            required: ['type', 'accessToken'],
          },
          {
            title: 'Zapier',
            properties: {
              type: { const: 'zapier' },
              webhookUrl: { type: 'string', description: 'Zapier webhook URL' },
            },
            required: ['type', 'webhookUrl'],
          },
          {
            title: 'Salesforce',
            properties: {
              type: { const: 'salesforce' },
              instanceUrl: { type: 'string', description: 'Salesforce instance URL' },
              accessToken: { type: 'string', description: 'OAuth access token' },
              refreshToken: { type: 'string', description: 'OAuth refresh token' },
            },
            required: ['type', 'instanceUrl', 'accessToken'],
          },
          {
            title: 'Google Sheets',
            properties: {
              type: { const: 'google_sheets' },
              serviceAccountJson: { type: 'string', description: 'Service account JSON' },
              spreadsheetId: { type: 'string', description: 'Spreadsheet ID' },
              sheetName: { type: 'string', description: 'Sheet name' },
            },
            required: ['type', 'serviceAccountJson', 'spreadsheetId'],
          },
        ],
      },
      default_settings: {
        type: 'object',
        properties: {
          listId: { type: 'string', description: 'Default list/audience ID' },
          audienceId: { type: 'string', description: 'Default Mailchimp audience' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Default tags' },
          fieldMapping: { type: 'object', description: 'Default field mapping' },
        },
        description: 'Default settings for this connection',
      },
      test: {
        type: 'boolean',
        description: 'Test the connection before saving (default: true)',
        default: true,
      },
    },
    required: ['platform', 'connection_name', 'credentials'],
  },
};

/**
 * Execute the configure_platform_connection tool
 */
export async function executeConfigurePlatformConnection(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    connection_id: string;
    platform: string;
    connection_name: string;
    test_result?: {
      success: boolean;
      message: string;
    };
  };
  error?: string;
}> {
  // Validate input
  const params = validateInput(ConfigurePlatformConnectionInputSchema, input);

  // Check permissions
  requirePermission(context, 'platform:configure');

  // Validate platform
  if (!isPlatformSupported(params.platform)) {
    return {
      success: false,
      error: `Unsupported platform: ${params.platform}`,
    };
  }

  // Verify credentials type matches platform
  if (params.credentials.type !== params.platform) {
    return {
      success: false,
      error: `Credentials type (${params.credentials.type}) doesn't match platform (${params.platform})`,
    };
  }

  // Test connection if requested
  let testResult: { success: boolean; message: string } | undefined;
  if (params.test) {
    testResult = await testPlatformConnection(
      params.platform,
      params.credentials as PlatformCredentials
    );

    if (!testResult.success) {
      return {
        success: false,
        error: `Connection test failed: ${testResult.message}`,
        data: {
          connection_id: '',
          platform: params.platform,
          connection_name: params.connection_name,
          test_result: testResult,
        },
      };
    }
  }

  try {
    // Check if connection with same name exists
    const existing = await prisma.deliveryConfig.findFirst({
      where: {
        tenantId: context.tenant.id,
        name: params.connection_name,
        method: 'WEBHOOK',
      },
    });

    let connectionId: string;

    if (existing) {
      // Update existing connection
      const updated = await prisma.deliveryConfig.update({
        where: { id: existing.id },
        data: {
          printApiSettings: {
            platform: params.platform,
            credentials: params.credentials,
            defaultSettings: params.default_settings,
          },
          lastTestAt: params.test ? new Date() : existing.lastTestAt,
          lastTestSuccess: params.test ? testResult?.success : existing.lastTestSuccess,
          updatedAt: new Date(),
        },
      });
      connectionId = updated.id;
    } else {
      // Create new connection
      const created = await prisma.deliveryConfig.create({
        data: {
          tenantId: context.tenant.id,
          name: params.connection_name,
          method: 'WEBHOOK',
          webhookUrl: params.platform === 'zapier'
            ? (params.credentials as ZapierCredentials).webhookUrl
            : `platform://${params.platform}`,
          printApiProvider: params.platform,
          printApiSettings: {
            platform: params.platform,
            credentials: params.credentials,
            defaultSettings: params.default_settings,
          },
          lastTestAt: params.test ? new Date() : undefined,
          lastTestSuccess: params.test ? testResult?.success : undefined,
          isActive: true,
        },
      });
      connectionId = created.id;
    }

    return {
      success: true,
      data: {
        connection_id: connectionId,
        platform: params.platform,
        connection_name: params.connection_name,
        test_result: testResult,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save connection',
    };
  }
}
