/**
 * Tool 27: configure_intent_webhook
 * Configure webhook for real-time intent signal delivery
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { TenantContext } from '../../utils/auth.js';
import { prisma } from '../../db/client.js';
import { testWebhook } from '../../services/intent-push.js';

/**
 * Input schema for configure_intent_webhook
 */
const inputSchema = z.object({
  action: z.enum(['create', 'update', 'delete', 'test', 'list']),

  // For create/update
  webhookId: z.string().uuid().optional(), // Required for update/delete/test
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  secret: z.string().optional(), // If not provided, one will be generated
  headers: z.record(z.string()).optional(),

  // Retry configuration
  retryAttempts: z.number().min(0).max(10).optional(),
  retryDelayMs: z.number().min(100).max(60000).optional(),

  // Filtering
  minIntentScore: z.number().min(1).max(100).optional(),
  categoryFilter: z.array(z.string()).optional(),
});

// Type is inferred from inputSchema when parsing

/**
 * Tool definition for MCP
 */
export const configureIntentWebhookTool = {
  name: 'configure_intent_webhook',
  description: `Configure webhooks for real-time intent signal delivery. Webhooks receive POST requests with intent signals as they arrive.

Actions:
- create: Create a new webhook configuration
- update: Update an existing webhook
- delete: Delete a webhook
- test: Send a test payload to verify connectivity
- list: List all configured webhooks

Webhook payload format:
\`\`\`json
{
  "event": "intent_signals",
  "subscription_id": "sub_xxx",
  "timestamp": "2024-01-15T10:30:00Z",
  "signals": [
    {
      "id": "sig_xxx",
      "category": "auto_purchase",
      "intentScore": 85,
      "signalType": "form_submit",
      "email": "user@example.com",
      ...
    }
  ]
}
\`\`\`

A signature header (X-Intent-Signature) is included for verification.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'update', 'delete', 'test', 'list'],
        description: 'Action to perform',
      },
      webhookId: {
        type: 'string',
        description: 'Webhook ID (required for update/delete/test)',
      },
      name: {
        type: 'string',
        description: 'Webhook name for your reference',
      },
      url: {
        type: 'string',
        description: 'Webhook URL to receive POST requests',
      },
      secret: {
        type: 'string',
        description: 'Secret for signature verification (auto-generated if not provided)',
      },
      headers: {
        type: 'object',
        description: 'Custom headers to include in requests',
      },
      retryAttempts: {
        type: 'number',
        description: 'Number of retry attempts (0-10, default: 3)',
      },
      retryDelayMs: {
        type: 'number',
        description: 'Initial retry delay in milliseconds (100-60000, default: 1000)',
      },
      minIntentScore: {
        type: 'number',
        description: 'Only send signals above this score',
      },
      categoryFilter: {
        type: 'array',
        items: { type: 'string' },
        description: 'Only send signals from these categories',
      },
    },
    required: ['action'],
  },
};

/**
 * Execute the configure_intent_webhook tool
 */
export async function executeConfigureIntentWebhook(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  action: string;
  webhook?: {
    id: string;
    name: string;
    url: string;
    secret?: string;
    isActive: boolean;
    lastTestAt?: string;
    lastTestSuccess?: boolean;
    consecutiveFailures: number;
  };
  webhooks?: Array<{
    id: string;
    name: string;
    url: string;
    isActive: boolean;
    lastDeliveryAt?: string;
    consecutiveFailures: number;
  }>;
  test_result?: {
    success: boolean;
    statusCode?: number;
    responseTimeMs: number;
    error?: string;
  };
  error?: string;
}> {
  // Validate input
  const validatedInput = inputSchema.parse(input);
  const { action, webhookId } = validatedInput;

  switch (action) {
    case 'list': {
      const webhooks = await prisma.intentWebhook.findMany({
        where: { tenantId: context.tenant.id },
        orderBy: { createdAt: 'desc' },
      });

      return {
        success: true,
        action,
        webhooks: webhooks.map((w) => ({
          id: w.id,
          name: w.name,
          url: w.url,
          isActive: w.isActive,
          lastDeliveryAt: w.lastDeliveryAt?.toISOString(),
          consecutiveFailures: w.consecutiveFailures,
        })),
      };
    }

    case 'create': {
      if (!validatedInput.name || !validatedInput.url) {
        return {
          success: false,
          action,
          error: 'name and url are required for create action',
        };
      }

      // Generate secret if not provided
      const secret = validatedInput.secret || crypto.randomBytes(32).toString('hex');

      const webhook = await prisma.intentWebhook.create({
        data: {
          tenantId: context.tenant.id,
          name: validatedInput.name,
          url: validatedInput.url,
          secret,
          headers: validatedInput.headers ? JSON.parse(JSON.stringify(validatedInput.headers)) : undefined,
          retryAttempts: validatedInput.retryAttempts ?? 3,
          retryDelayMs: validatedInput.retryDelayMs ?? 1000,
          minIntentScore: validatedInput.minIntentScore,
          categoryFilter: validatedInput.categoryFilter || [],
          isActive: true,
        },
      });

      return {
        success: true,
        action,
        webhook: {
          id: webhook.id,
          name: webhook.name,
          url: webhook.url,
          secret, // Only returned on create
          isActive: webhook.isActive,
          consecutiveFailures: 0,
        },
      };
    }

    case 'update': {
      if (!webhookId) {
        return {
          success: false,
          action,
          error: 'webhookId is required for update action',
        };
      }

      // Verify webhook belongs to tenant
      const existing = await prisma.intentWebhook.findFirst({
        where: {
          id: webhookId,
          tenantId: context.tenant.id,
        },
      });

      if (!existing) {
        return {
          success: false,
          action,
          error: 'Webhook not found',
        };
      }

      const updateData: Record<string, unknown> = {};
      if (validatedInput.name) updateData.name = validatedInput.name;
      if (validatedInput.url) updateData.url = validatedInput.url;
      if (validatedInput.secret) updateData.secret = validatedInput.secret;
      if (validatedInput.headers !== undefined) updateData.headers = validatedInput.headers;
      if (validatedInput.retryAttempts !== undefined) updateData.retryAttempts = validatedInput.retryAttempts;
      if (validatedInput.retryDelayMs !== undefined) updateData.retryDelayMs = validatedInput.retryDelayMs;
      if (validatedInput.minIntentScore !== undefined) updateData.minIntentScore = validatedInput.minIntentScore;
      if (validatedInput.categoryFilter) updateData.categoryFilter = validatedInput.categoryFilter;

      // If URL changed, reset failure counter and reactivate
      if (validatedInput.url && validatedInput.url !== existing.url) {
        updateData.consecutiveFailures = 0;
        updateData.isActive = true;
      }

      const webhook = await prisma.intentWebhook.update({
        where: { id: webhookId },
        data: updateData,
      });

      return {
        success: true,
        action,
        webhook: {
          id: webhook.id,
          name: webhook.name,
          url: webhook.url,
          isActive: webhook.isActive,
          lastTestAt: webhook.lastTestAt?.toISOString(),
          lastTestSuccess: webhook.lastTestSuccess ?? undefined,
          consecutiveFailures: webhook.consecutiveFailures,
        },
      };
    }

    case 'delete': {
      if (!webhookId) {
        return {
          success: false,
          action,
          error: 'webhookId is required for delete action',
        };
      }

      // Verify webhook belongs to tenant
      const existing = await prisma.intentWebhook.findFirst({
        where: {
          id: webhookId,
          tenantId: context.tenant.id,
        },
      });

      if (!existing) {
        return {
          success: false,
          action,
          error: 'Webhook not found',
        };
      }

      // Check if webhook is used by any active subscriptions
      const activeSubscriptions = await prisma.intentSubscription.count({
        where: {
          webhookId,
          status: 'ACTIVE',
        },
      });

      if (activeSubscriptions > 0) {
        return {
          success: false,
          action,
          error: `Cannot delete webhook: ${activeSubscriptions} active subscription(s) are using it`,
        };
      }

      await prisma.intentWebhook.delete({
        where: { id: webhookId },
      });

      return {
        success: true,
        action,
      };
    }

    case 'test': {
      if (!webhookId) {
        return {
          success: false,
          action,
          error: 'webhookId is required for test action',
        };
      }

      // Verify webhook belongs to tenant
      const existing = await prisma.intentWebhook.findFirst({
        where: {
          id: webhookId,
          tenantId: context.tenant.id,
        },
      });

      if (!existing) {
        return {
          success: false,
          action,
          error: 'Webhook not found',
        };
      }

      // Test the webhook
      const testResult = await testWebhook(webhookId);

      // Get updated webhook status
      const webhook = await prisma.intentWebhook.findUnique({
        where: { id: webhookId },
      });

      return {
        success: true,
        action,
        webhook: webhook ? {
          id: webhook.id,
          name: webhook.name,
          url: webhook.url,
          isActive: webhook.isActive,
          lastTestAt: webhook.lastTestAt?.toISOString(),
          lastTestSuccess: webhook.lastTestSuccess ?? undefined,
          consecutiveFailures: webhook.consecutiveFailures,
        } : undefined,
        test_result: testResult,
      };
    }

    default:
      return {
        success: false,
        action,
        error: `Unknown action: ${action}`,
      };
  }
}
