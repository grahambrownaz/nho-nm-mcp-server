import { tool, jsonSchema, type CoreTool } from 'ai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'path';

// Singleton MCP client — spawns the NHO-NM MCP server as a child process
let mcpClient: Client | null = null;
let mcpToolsCache: Record<string, CoreTool> | null = null;

async function getClient(): Promise<Client> {
  if (mcpClient) return mcpClient;

  const serverPath = resolve(process.cwd(), '..', 'dist', 'index.js');

  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
    env: {
      ...process.env,
      DEMO_MODE: 'true',
      NODE_ENV: 'development',
    },
  });

  mcpClient = new Client(
    { name: 'leadsplease-web-chat', version: '1.0.0' },
    { capabilities: {} }
  );

  await mcpClient.connect(transport);

  console.log('[MCP] Connected to NHO-NM MCP Server');

  return mcpClient;
}

/**
 * Get all MCP tools converted to Vercel AI SDK tool format.
 * Tools are cached after first fetch since they don't change at runtime.
 */
export async function getMCPTools(): Promise<Record<string, CoreTool>> {
  if (mcpToolsCache) return mcpToolsCache;

  const client = await getClient();
  const { tools: mcpTools } = await client.listTools();

  console.log(`[MCP] Loaded ${mcpTools.length} tools`);

  const aiTools: Record<string, CoreTool> = {};

  for (const mcpTool of mcpTools) {
    aiTools[mcpTool.name] = tool({
      description: mcpTool.description || mcpTool.name,
      parameters: jsonSchema(mcpTool.inputSchema as Parameters<typeof jsonSchema>[0]),
      execute: async (args) => {
        console.log(`[MCP] Calling tool: ${mcpTool.name}`, JSON.stringify(args).slice(0, 200));

        try {
          const result = await client.callTool({
            name: mcpTool.name,
            arguments: args as Record<string, unknown>,
          });

          // MCP returns content as array of { type, text } objects
          // Extract text content for the AI to process
          if (Array.isArray(result.content)) {
            const textParts = result.content
              .filter((part): part is { type: string; text: string } => part.type === 'text')
              .map((part) => part.text);
            return textParts.join('\n');
          }

          return JSON.stringify(result.content);
        } catch (error) {
          console.error(`[MCP] Tool ${mcpTool.name} failed:`, error);
          return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      },
    });
  }

  mcpToolsCache = aiTools;
  return aiTools;
}

/**
 * Disconnect and clean up the MCP client.
 */
export async function disconnectMCP(): Promise<void> {
  if (mcpClient) {
    await mcpClient.close();
    mcpClient = null;
    mcpToolsCache = null;
    console.log('[MCP] Disconnected');
  }
}
