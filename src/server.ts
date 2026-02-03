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
} from './tools/data/index.js';

/**
 * Server configuration
 */
const SERVER_NAME = process.env.MCP_SERVER_NAME || 'nho-nm-mcp-server';
const SERVER_VERSION = process.env.MCP_SERVER_VERSION || '1.0.0';

/**
 * All available tools
 */
const TOOLS = [
  searchDataTool,
  previewCountTool,
  getSampleDataTool,
  getPricingTool,
];

/**
 * Tool executor mapping
 */
const TOOL_EXECUTORS: Record<
  string,
  (input: unknown, context: TenantContext) => Promise<unknown>
> = {
  search_data: executeSearchData,
  preview_count: executePreviewCount,
  get_sample_data: executeGetSampleData,
  get_pricing: executeGetPricing,
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
      monthlyRecordLimit: 10000,
      monthlyEmailAppends: 5000,
      monthlyPhoneAppends: 5000,
      allowedStates: [],
      allowedZipCodes: [],
      allowedDatabases: ['NHO', 'NEW_MOVER', 'CONSUMER', 'BUSINESS'],
      pricePerRecord: null,
      priceEmailAppend: null,
      pricePhoneAppend: null,
      pricePdfGeneration: null,
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

  await server.connect(transport);

  console.error('Server connected and ready');

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.error('Shutting down server...');
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error('Shutting down server...');
    await server.close();
    process.exit(0);
  });
}
