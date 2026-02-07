import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { getMCPTools } from '@/lib/mcp-client';
import { SYSTEM_PROMPT } from '@/lib/system-prompt';

export const maxDuration = 60; // Allow up to 60s for tool-heavy responses

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Get all MCP tools converted to AI SDK format (cached after first call)
  const tools = await getMCPTools();

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    system: SYSTEM_PROMPT,
    messages,
    tools,
    maxSteps: 10, // Allow multi-turn tool calling (e.g., get_recommendations → preview_count → get_sample_data)
  });

  return result.toDataStreamResponse();
}
