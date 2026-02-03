/**
 * Tool: manage_subscription
 * Update, pause, resume, or cancel a subscription
 */

import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { validateInput, GeographySchema, DemographicFiltersSchema } from '../../utils/validation.js';
import { requirePermission, type TenantContext } from '../../utils/auth.js';
import { NotFoundError, ValidationError, AuthorizationError } from '../../utils/errors.js';

/**
 * Input schema for manage_subscription
 */
const ManageSubscriptionInputSchema = z.object({
  subscription_id: z.string().uuid(),
  action: z.enum(['update', 'pause', 'resume', 'cancel']),
  updates: z.object({
    name: z.string().min(1).max(200).optional(),
    geography: GeographySchema.optional(),
    filters: DemographicFiltersSchema,
    frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly']).optional(),
    template_id: z.string().uuid().nullable().optional(),
    fulfillment_method: z.enum(['download', 'email', 'print_mail', 'webhook', 'ftp']).optional(),
    fulfillment_config: z.record(z.unknown()).optional(),
    sync_channels: z.array(z.object({
      type: z.enum(['webhook', 'email', 'sms']),
      target: z.string(),
      events: z.array(z.string()).optional(),
    })).optional(),
    client_info: z.object({
      name: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
    }).optional(),
  }).optional(),
});

export type ManageSubscriptionInput = z.infer<typeof ManageSubscriptionInputSchema>;

/**
 * Tool definition for MCP server registration
 */
export const manageSubscriptionTool = {
  name: 'manage_subscription',
  description: `Manage an existing data subscription.

Actions:
- update: Modify subscription settings (geography, filters, frequency, etc.)
- pause: Temporarily stop deliveries (can be resumed)
- resume: Resume a paused subscription
- cancel: Permanently cancel the subscription

Parameters:
- subscription_id: The ID of the subscription to manage
- action: The action to perform (update, pause, resume, cancel)
- updates: For 'update' action, the fields to change

Returns the updated subscription state.`,

  inputSchema: {
    type: 'object',
    properties: {
      subscription_id: { type: 'string', description: 'Subscription ID' },
      action: { type: 'string', enum: ['update', 'pause', 'resume', 'cancel'] },
      updates: {
        type: 'object',
        description: 'Fields to update (only for update action)',
        properties: {
          name: { type: 'string' },
          geography: { type: 'object' },
          filters: { type: 'object' },
          frequency: { type: 'string', enum: ['daily', 'weekly', 'biweekly', 'monthly'] },
          template_id: { type: 'string' },
          fulfillment_method: { type: 'string' },
          fulfillment_config: { type: 'object' },
          sync_channels: { type: 'array' },
          client_info: { type: 'object' },
        },
      },
    },
    required: ['subscription_id', 'action'],
  },
};

/**
 * Calculate next delivery date based on frequency
 */
function calculateNextDelivery(frequency: string): Date {
  const now = new Date();
  const next = new Date(now);
  next.setHours(6, 0, 0, 0);

  switch (frequency) {
    case 'DAILY':
      next.setDate(next.getDate() + 1);
      break;
    case 'WEEKLY':
      const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
      next.setDate(next.getDate() + daysUntilMonday);
      break;
    case 'BIWEEKLY':
      const daysUntilMondayBi = (8 - now.getDay()) % 7 || 7;
      next.setDate(next.getDate() + daysUntilMondayBi + 7);
      break;
    case 'MONTHLY':
      next.setMonth(next.getMonth() + 1, 1);
      break;
  }

  return next;
}

/**
 * Execute the manage_subscription tool
 */
export async function executeManageSubscription(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    subscription: {
      id: string;
      name: string;
      status: string;
      nextDeliveryAt: string | null;
      pausedAt: string | null;
      cancelledAt: string | null;
      totalDeliveries: number;
      totalRecords: number;
    };
    action_performed: string;
    message: string;
  };
  error?: string;
}> {
  // Validate input
  const params = validateInput(ManageSubscriptionInputSchema, input);

  // Check permissions
  requirePermission(context, 'subscription:write');

  // Fetch the subscription
  const subscription = await prisma.dataSubscription.findUnique({
    where: { id: params.subscription_id },
  });

  if (!subscription) {
    throw new NotFoundError('Subscription', params.subscription_id);
  }

  // Verify ownership
  if (subscription.tenantId !== context.tenant.id) {
    throw new AuthorizationError('You do not have access to this subscription');
  }

  let updatedSubscription;
  let message: string;

  switch (params.action) {
    case 'update': {
      if (!params.updates) {
        throw new ValidationError('Updates object required for update action');
      }

      // Build update data
      const updateData: Record<string, unknown> = {};

      if (params.updates.name) updateData.name = params.updates.name;
      if (params.updates.geography) updateData.geography = params.updates.geography;
      if (params.updates.filters !== undefined) updateData.filters = params.updates.filters;
      if (params.updates.frequency) {
        updateData.frequency = params.updates.frequency.toUpperCase();
        // Recalculate next delivery when frequency changes
        updateData.nextDeliveryAt = calculateNextDelivery(params.updates.frequency.toUpperCase());
      }
      if (params.updates.template_id !== undefined) {
        updateData.templateId = params.updates.template_id;
      }
      if (params.updates.fulfillment_method) {
        updateData.fulfillmentMethod = params.updates.fulfillment_method.toUpperCase();
      }
      if (params.updates.fulfillment_config) {
        updateData.fulfillmentConfig = params.updates.fulfillment_config;
      }
      if (params.updates.sync_channels) {
        updateData.syncChannels = params.updates.sync_channels;
      }
      if (params.updates.client_info) {
        if (params.updates.client_info.name) updateData.clientName = params.updates.client_info.name;
        if (params.updates.client_info.email) updateData.clientEmail = params.updates.client_info.email;
        if (params.updates.client_info.phone) updateData.clientPhone = params.updates.client_info.phone;
      }

      updatedSubscription = await prisma.dataSubscription.update({
        where: { id: params.subscription_id },
        data: updateData,
      });

      message = 'Subscription updated successfully';
      break;
    }

    case 'pause': {
      if (subscription.status !== 'ACTIVE') {
        throw new ValidationError(`Cannot pause subscription with status: ${subscription.status}`);
      }

      updatedSubscription = await prisma.dataSubscription.update({
        where: { id: params.subscription_id },
        data: {
          status: 'PAUSED',
          pausedAt: new Date(),
        },
      });

      message = 'Subscription paused. Deliveries will stop until resumed.';
      break;
    }

    case 'resume': {
      if (subscription.status !== 'PAUSED') {
        throw new ValidationError(`Cannot resume subscription with status: ${subscription.status}`);
      }

      // Calculate new next delivery date
      const nextDelivery = calculateNextDelivery(subscription.frequency);

      updatedSubscription = await prisma.dataSubscription.update({
        where: { id: params.subscription_id },
        data: {
          status: 'ACTIVE',
          pausedAt: null,
          nextDeliveryAt: nextDelivery,
        },
      });

      message = `Subscription resumed. Next delivery scheduled for ${nextDelivery.toISOString()}`;
      break;
    }

    case 'cancel': {
      if (subscription.status === 'CANCELLED') {
        throw new ValidationError('Subscription is already cancelled');
      }

      updatedSubscription = await prisma.dataSubscription.update({
        where: { id: params.subscription_id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
        },
      });

      message = 'Subscription cancelled. No further deliveries will be made.';
      break;
    }

    default:
      throw new ValidationError(`Unknown action: ${params.action}`);
  }

  return {
    success: true,
    data: {
      subscription: {
        id: updatedSubscription.id,
        name: updatedSubscription.name,
        status: updatedSubscription.status,
        nextDeliveryAt: updatedSubscription.nextDeliveryAt?.toISOString() || null,
        pausedAt: updatedSubscription.pausedAt?.toISOString() || null,
        cancelledAt: updatedSubscription.cancelledAt?.toISOString() || null,
        totalDeliveries: updatedSubscription.totalDeliveries,
        totalRecords: updatedSubscription.totalRecords,
      },
      action_performed: params.action,
      message,
    },
  };
}
