/**
 * MCP Server Configuration
 * Main server setup using @modelcontextprotocol/sdk
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { validateApiKey, type TenantContext } from './utils/auth.js';
import { formatError, isMcpError } from './utils/errors.js';

// Import tool definitions and executors
import {
  searchDataTool,
  executeSearchData,
  previewCountTool,
  executePreviewCount,
  getSampleDataTool,
  executeGetSampleData,
  getPricingTool,
  executeGetPricing,
  getFilterOptionsTool,
  executeGetFilterOptions,
} from './tools/data/index.js';

// Subscription tools
import {
  createSubscriptionTool,
  executeCreateSubscription,
  manageSubscriptionTool,
  executeManageSubscription,
  listSubscriptionsTool,
  executeListSubscriptions,
  deliveryReportTool,
  executeDeliveryReport,
} from './tools/subscriptions/index.js';

// Template tools
import {
  uploadTemplateTool,
  executeUploadTemplate,
  browseTemplatesTool,
  executeBrowseTemplates,
  importDesignTool,
  executeImportDesign,
  generatePostcardPdfTool,
  executeGeneratePostcardPdf,
} from './tools/templates/index.js';

// Delivery tools (Week 3)
import {
  configureDeliveryTool,
  executeConfigureDelivery,
  getFulfillmentStatusTool,
  executeGetFulfillmentStatus,
} from './tools/delivery/index.js';

// Billing tools (Week 4)
import {
  createCheckoutSessionTool,
  executeCreateCheckoutSession,
  getBillingStatusTool,
  executeGetBillingStatus,
  getBillingPortalTool,
  executeGetBillingPortal,
  createPaymentLinkTool,
  executeCreatePaymentLink,
} from './tools/billing/index.js';

// Purchase tools (Week 6)
import {
  purchaseListTool,
  executePurchaseList,
} from './tools/purchases/index.js';

// Export tools (Week 6)
import {
  exportDataTool,
  executeExportData,
} from './tools/exports/index.js';

// Platform tools (Week 5)
import {
  syncToPlatformTool,
  executeSyncToPlatform,
  configurePlatformConnectionTool,
  executeConfigurePlatformConnection,
} from './tools/platforms/index.js';

// Intent tools (Week 6)
import {
  searchIntentDataTool,
  executeSearchIntentData,
  createIntentSubscriptionTool,
  executeCreateIntentSubscription,
  listIntentCategoriesTool,
  executeListIntentCategories,
  configureIntentWebhookTool,
  executeConfigureIntentWebhook,
} from './tools/intent/index.js';

// Email tools (ReachMail integration)
import {
  configureEmailAccountTool,
  executeConfigureEmailAccount,
  createEmailListTool,
  executeCreateEmailList,
  createEmailCampaignTool,
  executeCreateEmailCampaign,
  sendEmailCampaignTool,
  executeSendEmailCampaign,
  getEmailAnalyticsTool,
  executeGetEmailAnalytics,
  listEmailCampaignsTool,
  executeListEmailCampaigns,
} from './tools/email/index.js';

// Discovery tools (onboarding)
import {
  getRecommendationsTool,
  executeGetRecommendations,
} from './tools/discovery/index.js';

// SWOTSPOT tools (local business audit)
import {
  configureSwotspotTool,
  executeConfigureSwotspot,
  runLocalAuditTool,
  executeRunLocalAudit,
  listAuditsTool,
  executeListAudits,
  trackCompetitorTool,
  executeTrackCompetitor,
} from './tools/swotspot/index.js';

// Scheduler (Week 3 - updated)
import { startScheduler, stopScheduler } from './cron/scheduler.js';

// Print API initialization
import { initializePrintApiProviders } from './services/print-api/index.js';

/**
 * Server configuration
 */
const SERVER_NAME = process.env.MCP_SERVER_NAME || 'nho-nm-mcp-server';
const SERVER_VERSION = process.env.MCP_SERVER_VERSION || '1.2.0';

/**
 * All available tools
 */
const TOOLS = [
  // Data tools (Week 1)
  searchDataTool,
  previewCountTool,
  getSampleDataTool,
  getPricingTool,
  // Subscription tools (Week 2)
  createSubscriptionTool,
  manageSubscriptionTool,
  listSubscriptionsTool,
  deliveryReportTool,
  // Template tools (Week 2)
  uploadTemplateTool,
  browseTemplatesTool,
  importDesignTool,
  generatePostcardPdfTool,
  // Delivery tools (Week 3)
  configureDeliveryTool,
  getFulfillmentStatusTool,
  // Billing tools (Week 4)
  createCheckoutSessionTool,
  getBillingStatusTool,
  getBillingPortalTool,
  // Platform tools (Week 5)
  syncToPlatformTool,
  configurePlatformConnectionTool,
  // Week 6 tools
  getFilterOptionsTool,
  purchaseListTool,
  exportDataTool,
  createPaymentLinkTool,
  // Intent tools (Week 6)
  searchIntentDataTool,
  createIntentSubscriptionTool,
  listIntentCategoriesTool,
  configureIntentWebhookTool,
  // Email tools (ReachMail integration)
  configureEmailAccountTool,
  createEmailListTool,
  createEmailCampaignTool,
  sendEmailCampaignTool,
  getEmailAnalyticsTool,
  listEmailCampaignsTool,
  // Discovery tools (onboarding)
  getRecommendationsTool,
  // SWOTSPOT tools (local business audit)
  configureSwotspotTool,
  runLocalAuditTool,
  listAuditsTool,
  trackCompetitorTool,
];

/**
 * Tool executor mapping
 */
const TOOL_EXECUTORS: Record<
  string,
  (input: unknown, context: TenantContext) => Promise<unknown>
> = {
  // Data tools (Week 1)
  search_data: executeSearchData,
  preview_count: executePreviewCount,
  get_sample_data: executeGetSampleData,
  get_pricing: executeGetPricing,
  // Subscription tools (Week 2)
  create_subscription: executeCreateSubscription,
  manage_subscription: executeManageSubscription,
  list_subscriptions: executeListSubscriptions,
  delivery_report: executeDeliveryReport,
  // Template tools (Week 2)
  upload_template: executeUploadTemplate,
  browse_templates: executeBrowseTemplates,
  import_design: executeImportDesign,
  generate_postcard_pdf: executeGeneratePostcardPdf,
  // Delivery tools (Week 3)
  configure_delivery: executeConfigureDelivery,
  get_fulfillment_status: executeGetFulfillmentStatus,
  // Billing tools (Week 4)
  create_checkout_session: executeCreateCheckoutSession,
  get_billing_status: executeGetBillingStatus,
  get_billing_portal: executeGetBillingPortal,
  // Platform tools (Week 5)
  sync_to_platform: executeSyncToPlatform,
  configure_platform_connection: executeConfigurePlatformConnection,
  // Week 6 tools
  get_filter_options: executeGetFilterOptions,
  purchase_list: executePurchaseList,
  export_data: executeExportData,
  create_payment_link: executeCreatePaymentLink,
  // Intent tools (Week 6)
  search_intent_data: executeSearchIntentData,
  create_intent_subscription: executeCreateIntentSubscription,
  list_intent_categories: executeListIntentCategories,
  configure_intent_webhook: executeConfigureIntentWebhook,
  // Email tools (ReachMail integration)
  configure_email_account: executeConfigureEmailAccount,
  create_email_list: executeCreateEmailList,
  create_email_campaign: executeCreateEmailCampaign,
  send_email_campaign: executeSendEmailCampaign,
  get_email_analytics: executeGetEmailAnalytics,
  list_email_campaigns: executeListEmailCampaigns,
  // Discovery tools (onboarding)
  get_recommendations: executeGetRecommendations,
  // SWOTSPOT tools (local business audit)
  configure_swotspot: executeConfigureSwotspot,
  run_local_audit: executeRunLocalAudit,
  list_audits: executeListAudits,
  track_competitor: executeTrackCompetitor,
};

/**
 * Create and configure the MCP server
 */
export function createServer(): Server {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: TOOLS,
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Get the executor for this tool
    const executor = TOOL_EXECUTORS[name];
    if (!executor) {
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${name}`
      );
    }

    try {
      // Get API key from environment or request metadata
      // In production, this would come from the MCP client's authentication
      const apiKey = process.env.TEST_API_KEY || process.env.API_KEY;

      // For development/testing, create a mock context if no API key
      let context: TenantContext;

      if (apiKey) {
        context = await validateApiKey(apiKey);
      } else {
        // Development mode: create a test context
        context = createTestContext();
      }

      // Execute the tool
      const result = await executor(args, context);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      // Format error for MCP response
      const formattedError = formatError(error);

      // Determine MCP error code based on our error type
      let errorCode = ErrorCode.InternalError;
      if (isMcpError(error)) {
        switch (error.statusCode) {
          case 400:
            errorCode = ErrorCode.InvalidParams;
            break;
          case 401:
          case 403:
            errorCode = ErrorCode.InvalidRequest;
            break;
          case 404:
            errorCode = ErrorCode.MethodNotFound;
            break;
          default:
            errorCode = ErrorCode.InternalError;
        }
      }

      throw new McpError(
        errorCode,
        formattedError.message,
        formattedError.details
      );
    }
  });

  return server;
}

/**
 * Create a test context for development mode
 */
function createTestContext(): TenantContext {
  return {
    tenant: {
      id: 'test-tenant-id',
      name: 'Test Tenant',
      email: 'test@example.com',
      company: 'Test Company',
      phone: null,
      status: 'ACTIVE',
      stripeCustomerId: null,
      parentTenantId: null,
      isReseller: false,
      wholesalePricing: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    apiKey: {
      id: 'test-api-key-id',
      key: 'test-key',
      name: 'Development Key',
      tenantId: 'test-tenant-id',
      permissions: ['*'], // All permissions for testing
      isActive: true,
      lastUsedAt: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    subscription: {
      id: 'test-subscription-id',
      tenantId: 'test-tenant-id',
      plan: 'PROFESSIONAL',
      status: 'ACTIVE',
      stripeSubscriptionId: null,
      monthlyRecordLimit: 10000,
      monthlyEmailAppends: 5000,
      monthlyPhoneAppends: 5000,
      allowedStates: [],
      allowedZipCodes: [],
      allowedDatabases: ['NHO', 'NEW_MOVER', 'CONSUMER', 'BUSINESS', 'INTENT'],
      pricePerRecord: { toNumber: () => 0.05 } as unknown as import('@prisma/client').Prisma.Decimal,
      priceEmailAppend: { toNumber: () => 0.02 } as unknown as import('@prisma/client').Prisma.Decimal,
      pricePhoneAppend: { toNumber: () => 0.03 } as unknown as import('@prisma/client').Prisma.Decimal,
      pricePdfGeneration: { toNumber: () => 0.02 } as unknown as import('@prisma/client').Prisma.Decimal,
      billingCycleStart: new Date(),
      billingCycleEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    permissions: ['*'],
  };
}

/**
 * Start the server with stdio transport
 */
export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  console.error(`Starting ${SERVER_NAME} v${SERVER_VERSION}...`);

  // Initialize print API providers
  initializePrintApiProviders();

  // Start the delivery scheduler (if enabled)
  const enableScheduler = process.env.ENABLE_SCHEDULER !== 'false';
  if (enableScheduler) {
    startScheduler({
      enabled: true,
      timezone: process.env.SCHEDULER_TIMEZONE || 'America/New_York',
      deliveryHour: parseInt(process.env.SCHEDULER_HOUR || '6', 10),
    });
    console.error('Delivery scheduler started');
  }

  await server.connect(transport);

  console.error('Server connected and ready');

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.error('Shutting down server...');
    stopScheduler();
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error('Shutting down server...');
    stopScheduler();
    await server.close();
    process.exit(0);
  });
}
