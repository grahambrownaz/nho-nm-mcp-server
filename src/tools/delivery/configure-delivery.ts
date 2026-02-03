/**
 * Tool: configure_delivery
 * Configure delivery method for subscriptions (SFTP, print API, email, webhook, cloud storage)
 */

import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { validateInput } from '../../utils/validation.js';
import { requirePermission, type TenantContext } from '../../utils/auth.js';
import { ValidationError } from '../../utils/errors.js';
import { encrypt } from '../../services/encryption.js';
import { getSftpDeliveryService, type SftpConfig } from '../../services/sftp-delivery.js';
import { JDF_PRESETS } from '../../services/jdf-generator.js';
import {
  configureAndRegisterProvider,
  listPrintApiProviders,
} from '../../services/print-api/index.js';

/**
 * Input schema for configure_delivery
 */
const ConfigureDeliveryInputSchema = z.object({
  name: z.string().min(1).max(200),
  method: z.enum(['sftp_hot_folder', 'print_api', 'email', 'webhook', 'cloud_storage']),
  is_default: z.boolean().default(false),

  // SFTP configuration
  sftp: z.object({
    host: z.string().min(1),
    port: z.number().min(1).max(65535).default(22),
    username: z.string().min(1),
    password: z.string().optional(),
    private_key: z.string().optional(),
    folder_path: z.string().min(1),
    include_jdf: z.boolean().default(false),
    jdf_preset: z.string().optional(),
  }).optional(),

  // Email configuration
  email: z.object({
    address: z.string().email(),
  }).optional(),

  // Webhook configuration
  webhook: z.object({
    url: z.string().url(),
    headers: z.record(z.string()).optional(),
  }).optional(),

  // Cloud storage configuration
  cloud_storage: z.object({
    provider: z.enum(['s3', 'gcs', 'azure']),
    bucket: z.string().min(1),
    path: z.string().optional(),
    credentials: z.string(), // JSON credentials
  }).optional(),

  // Print API configuration
  print_api: z.object({
    provider: z.enum(['reminder_media', 'lob', 'stannp', 'postgrid']),
    api_key: z.string().min(1),
    api_url: z.string().url().optional(),
    settings: z.object({
      default_mail_class: z.enum(['first_class', 'standard', 'marketing']).optional(),
      default_paper_weight: z.string().optional(),
      default_finish: z.enum(['gloss', 'matte']).optional(),
      webhook_url: z.string().url().optional(),
      return_address: z.object({
        name: z.string(),
        company: z.string().optional(),
        address_line_1: z.string(),
        address_line_2: z.string().optional(),
        city: z.string(),
        state: z.string(),
        zip: z.string(),
      }).optional(),
    }).optional(),
  }).optional(),

  // Test connection after configuration
  test_connection: z.boolean().default(true),
});

export type ConfigureDeliveryInput = z.infer<typeof ConfigureDeliveryInputSchema>;

/**
 * Tool definition for MCP server registration
 */
export const configureDeliveryTool = {
  name: 'configure_delivery',
  description: `Configure a delivery method for subscriptions.

Supported methods:
- sftp_hot_folder: Upload to printer's SFTP hot folder with optional JDF job ticket
- print_api: Send to print fulfillment API (ReminderMedia, LOB, Stannp, PostGrid)
- email: Send delivery notification emails
- webhook: POST to webhook endpoint
- cloud_storage: Upload to S3, GCS, or Azure storage

For sftp_hot_folder, provide:
- host, port, username, password (or private_key)
- folder_path: Hot folder location
- include_jdf: Whether to generate JDF job ticket
- jdf_preset: Print specification preset (4x6_100lb_gloss_fc, 6x9_100lb_matte_fc, etc.)

Available JDF presets:
- 4x6_100lb_gloss_fc: 4x6 postcard, 100lb gloss, full color
- 4x6_100lb_matte_fc: 4x6 postcard, 100lb matte, full color
- 6x9_100lb_gloss_fc: 6x9 postcard, 100lb gloss, full color
- 6x9_100lb_matte_fc: 6x9 postcard, 100lb matte, full color
- 6x11_120lb_gloss_fc: 6x11 postcard, 120lb gloss, full color
- 6x11_120lb_matte_fc: 6x11 postcard, 120lb matte, full color

For print_api, provide:
- provider: 'reminder_media', 'lob', 'stannp', or 'postgrid'
- api_key: Your API key for the provider
- api_url: (optional) Custom API URL
- settings: (optional) Provider-specific settings like return address, mail class

Returns configuration ID and connection test result.`,

  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Configuration name' },
      method: {
        type: 'string',
        enum: ['sftp_hot_folder', 'print_api', 'email', 'webhook', 'cloud_storage'],
        description: 'Delivery method',
      },
      is_default: { type: 'boolean', description: 'Set as default delivery method' },
      sftp: {
        type: 'object',
        description: 'SFTP configuration',
        properties: {
          host: { type: 'string' },
          port: { type: 'number', default: 22 },
          username: { type: 'string' },
          password: { type: 'string' },
          private_key: { type: 'string' },
          folder_path: { type: 'string' },
          include_jdf: { type: 'boolean' },
          jdf_preset: { type: 'string' },
        },
      },
      email: { type: 'object', properties: { address: { type: 'string' } } },
      webhook: { type: 'object', properties: { url: { type: 'string' }, headers: { type: 'object' } } },
      cloud_storage: {
        type: 'object',
        properties: {
          provider: { type: 'string', enum: ['s3', 'gcs', 'azure'] },
          bucket: { type: 'string' },
          path: { type: 'string' },
          credentials: { type: 'string' },
        },
      },
      print_api: {
        type: 'object',
        description: 'Print API configuration',
        properties: {
          provider: {
            type: 'string',
            enum: ['reminder_media', 'lob', 'stannp', 'postgrid'],
            description: 'Print API provider',
          },
          api_key: { type: 'string', description: 'API key for the provider' },
          api_url: { type: 'string', description: 'Custom API URL (optional)' },
          settings: {
            type: 'object',
            description: 'Provider-specific settings',
            properties: {
              default_mail_class: { type: 'string', enum: ['first_class', 'standard', 'marketing'] },
              default_paper_weight: { type: 'string' },
              default_finish: { type: 'string', enum: ['gloss', 'matte'] },
              webhook_url: { type: 'string' },
              return_address: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  company: { type: 'string' },
                  address_line_1: { type: 'string' },
                  address_line_2: { type: 'string' },
                  city: { type: 'string' },
                  state: { type: 'string' },
                  zip: { type: 'string' },
                },
              },
            },
          },
        },
        required: ['provider', 'api_key'],
      },
      test_connection: { type: 'boolean', description: 'Test connection after configuration' },
    },
    required: ['name', 'method'],
  },
};

/**
 * Map method string to enum
 */
function mapMethod(method: string): 'SFTP_HOT_FOLDER' | 'PRINT_API' | 'EMAIL' | 'WEBHOOK' | 'CLOUD_STORAGE' {
  const map: Record<string, 'SFTP_HOT_FOLDER' | 'PRINT_API' | 'EMAIL' | 'WEBHOOK' | 'CLOUD_STORAGE'> = {
    sftp_hot_folder: 'SFTP_HOT_FOLDER',
    print_api: 'PRINT_API',
    email: 'EMAIL',
    webhook: 'WEBHOOK',
    cloud_storage: 'CLOUD_STORAGE',
  };
  return map[method] || 'EMAIL';
}

/**
 * Execute the configure_delivery tool
 */
export async function executeConfigureDelivery(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    config: {
      id: string;
      name: string;
      method: string;
      isDefault: boolean;
      createdAt: string;
    };
    test_result?: {
      success: boolean;
      message: string;
      details?: Record<string, unknown>;
    };
    jdf_presets?: string[];
    print_api_providers?: Array<{
      name: string;
      displayName: string;
      isDefault: boolean;
      isConfigured: boolean;
    }>;
  };
  error?: string;
}> {
  // Validate input
  const params = validateInput(ConfigureDeliveryInputSchema, input);

  // Check permissions
  requirePermission(context, 'subscription:write');

  // Validate method-specific configuration
  switch (params.method) {
    case 'sftp_hot_folder':
      if (!params.sftp) {
        throw new ValidationError('SFTP configuration required for sftp_hot_folder method');
      }
      if (!params.sftp.password && !params.sftp.private_key) {
        throw new ValidationError('Either password or private_key required for SFTP');
      }
      if (params.sftp.include_jdf && params.sftp.jdf_preset && !JDF_PRESETS[params.sftp.jdf_preset]) {
        throw new ValidationError(
          `Invalid JDF preset: ${params.sftp.jdf_preset}. Available: ${Object.keys(JDF_PRESETS).join(', ')}`
        );
      }
      break;

    case 'email':
      if (!params.email) {
        throw new ValidationError('Email configuration required for email method');
      }
      break;

    case 'webhook':
      if (!params.webhook) {
        throw new ValidationError('Webhook configuration required for webhook method');
      }
      break;

    case 'cloud_storage':
      if (!params.cloud_storage) {
        throw new ValidationError('Cloud storage configuration required for cloud_storage method');
      }
      break;

    case 'print_api':
      if (!params.print_api) {
        throw new ValidationError('Print API configuration required for print_api method');
      }
      break;
  }

  // If setting as default, unset any existing defaults
  if (params.is_default) {
    await prisma.deliveryConfig.updateMany({
      where: {
        tenantId: context.tenant.id,
        isDefault: true,
      },
      data: { isDefault: false },
    });
  }

  // Build configuration data
  const configData: Record<string, unknown> = {
    tenantId: context.tenant.id,
    name: params.name,
    method: mapMethod(params.method),
    isDefault: params.is_default,
    isActive: true,
  };

  // Add method-specific configuration
  if (params.sftp) {
    configData.sftpHost = params.sftp.host;
    configData.sftpPort = params.sftp.port || 22;
    configData.sftpUsername = params.sftp.username;
    configData.sftpPassword = params.sftp.password ? encrypt(params.sftp.password) : null;
    configData.sftpPrivateKey = params.sftp.private_key ? encrypt(params.sftp.private_key) : null;
    configData.sftpFolderPath = params.sftp.folder_path;
    configData.includeJdf = params.sftp.include_jdf || false;
    configData.jdfPreset = params.sftp.jdf_preset || null;
  }

  if (params.email) {
    configData.emailAddress = params.email.address;
  }

  if (params.webhook) {
    configData.webhookUrl = params.webhook.url;
    configData.webhookHeaders = params.webhook.headers || null;
  }

  if (params.cloud_storage) {
    configData.cloudProvider = params.cloud_storage.provider;
    configData.cloudBucket = params.cloud_storage.bucket;
    configData.cloudPath = params.cloud_storage.path || null;
    configData.cloudCredentials = encrypt(params.cloud_storage.credentials);
  }

  if (params.print_api) {
    configData.printApiProvider = params.print_api.provider;
    configData.printApiKey = encrypt(params.print_api.api_key);
    configData.printApiSettings = params.print_api.settings || null;
  }

  // Test connection if requested
  let testResult: { success: boolean; message: string; details?: Record<string, unknown> } | undefined;

  if (params.test_connection && params.method === 'sftp_hot_folder' && params.sftp) {
    const sftpService = getSftpDeliveryService();
    const sftpConfig: SftpConfig = {
      host: params.sftp.host,
      port: params.sftp.port || 22,
      username: params.sftp.username,
      password: params.sftp.password,
      privateKey: params.sftp.private_key,
      folderPath: params.sftp.folder_path,
    };

    const connectionResult = await sftpService.testConnection(sftpConfig);

    testResult = {
      success: connectionResult.success && (connectionResult.folderWritable ?? false),
      message: connectionResult.message,
      details: {
        folderExists: connectionResult.folderExists,
        folderWritable: connectionResult.folderWritable,
        latencyMs: connectionResult.latencyMs,
        error: connectionResult.error,
      },
    };

    // Update test results in config data
    configData.lastTestAt = new Date();
    configData.lastTestSuccess = testResult.success;
    configData.lastTestError = testResult.success ? null : testResult.message;
  }

  // Test Print API connection
  if (params.test_connection && params.method === 'print_api' && params.print_api) {
    try {
      // Configure and register the provider temporarily
      const provider = configureAndRegisterProvider(
        params.print_api.provider,
        {
          apiKey: params.print_api.api_key,
          apiUrl: params.print_api.api_url,
        },
        false // Don't set as default
      );

      // Test the connection
      const connectionResult = await provider.testConnection();

      testResult = {
        success: connectionResult.success,
        message: connectionResult.success
          ? `Successfully connected to ${provider.displayName}`
          : connectionResult.error || 'Connection failed',
        details: {
          provider: provider.name,
          displayName: provider.displayName,
          ...connectionResult.details,
        },
      };

      // Update test results in config data
      configData.lastTestAt = new Date();
      configData.lastTestSuccess = testResult.success;
      configData.lastTestError = testResult.success ? null : testResult.message;
    } catch (error) {
      testResult = {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to test print API connection',
        details: {
          provider: params.print_api.provider,
        },
      };

      configData.lastTestAt = new Date();
      configData.lastTestSuccess = false;
      configData.lastTestError = testResult.message;
    }
  }

  // Create the configuration
  const config = await prisma.deliveryConfig.create({
    data: configData as Parameters<typeof prisma.deliveryConfig.create>[0]['data'],
  });

  return {
    success: true,
    data: {
      config: {
        id: config.id,
        name: config.name,
        method: params.method,
        isDefault: config.isDefault,
        createdAt: config.createdAt.toISOString(),
      },
      test_result: testResult,
      jdf_presets: params.method === 'sftp_hot_folder' ? Object.keys(JDF_PRESETS) : undefined,
      print_api_providers: params.method === 'print_api' ? listPrintApiProviders() : undefined,
    },
  };
}
