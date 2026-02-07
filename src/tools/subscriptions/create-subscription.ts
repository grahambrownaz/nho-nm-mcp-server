/**
 * Tool: create_subscription
 * Create a new recurring data delivery subscription
 */

import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { validateInput, GeographySchema, DemographicFiltersSchema, DatabaseTypeSchema } from '../../utils/validation.js';
import { requirePermission, type TenantContext } from '../../utils/auth.js';
import { ValidationError } from '../../utils/errors.js';

/**
 * Input schema for create_subscription
 */
const CreateSubscriptionInputSchema = z.object({
  name: z.string().min(1).max(200),
  database: DatabaseTypeSchema,
  geography: GeographySchema,
  filters: DemographicFiltersSchema,
  frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly']),
  template_id: z.string().uuid().optional(),
  fulfillment_method: z.enum(['download', 'email', 'print_mail', 'webhook', 'ftp']).default('download'),
  fulfillment_config: z.object({
    email_address: z.string().email().optional(),
    webhook_url: z.string().url().optional(),
    ftp_host: z.string().optional(),
    ftp_path: z.string().optional(),
    printer_id: z.string().optional(),
    mail_class: z.enum(['first_class', 'standard']).optional(),
    return_address: z.object({
      name: z.string(),
      street: z.string(),
      city: z.string(),
      state: z.string(),
      zip: z.string(),
    }).optional(),
  }).optional(),
  sync_channels: z.array(z.object({
    type: z.enum(['webhook', 'email', 'sms']),
    target: z.string(),
    events: z.array(z.enum(['delivery_complete', 'delivery_failed', 'new_records'])).optional(),
  })).optional(),
  client_info: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }).optional(),
});

export type CreateSubscriptionInput = z.infer<typeof CreateSubscriptionInputSchema>;

/**
 * Tool definition for MCP server registration
 */
export const createSubscriptionTool = {
  name: 'create_subscription',
  description: `Create a new recurring data delivery subscription.

This sets up automatic delivery of NHO/NM data on a schedule.

Parameters:
- name: A friendly name for this subscription
- database: Which database to pull from (nho, new_mover, consumer, business)
- geography: Geographic filter. MUST include "type" and "values" fields. Example: {"type": "zip", "values": ["85255"]} or {"type": "state", "values": ["AZ"]} or {"type": "nationwide"}
- filters: Optional demographic filters
- frequency: How often to deliver (daily, weekly, biweekly, monthly)
- template_id: Optional postcard template to use for PDF generation
- fulfillment_method: How to deliver (download, email, print_mail, webhook, ftp)
- fulfillment_config: Configuration for the chosen fulfillment method
- sync_channels: Optional notification channels for delivery events
- client_info: Optional end-client information if reselling

Returns the created subscription with estimated costs.`,

  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Friendly name for the subscription' },
      database: { type: 'string', enum: ['nho', 'new_mover', 'consumer', 'business'] },
      geography: {
        type: 'object',
        description: 'Geographic filter',
        properties: {
          type: { type: 'string', enum: ['zip', 'city', 'county', 'state', 'radius', 'nationwide'] },
          values: { type: 'array', items: { type: 'string' } },
          center: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
          radiusMiles: { type: 'number' },
        },
        required: ['type'],
      },
      filters: { type: 'object', description: 'Optional demographic filters' },
      frequency: { type: 'string', enum: ['daily', 'weekly', 'biweekly', 'monthly'] },
      template_id: { type: 'string', description: 'Template ID for PDF generation' },
      fulfillment_method: { type: 'string', enum: ['download', 'email', 'print_mail', 'webhook', 'ftp'] },
      fulfillment_config: { type: 'object', description: 'Fulfillment configuration' },
      sync_channels: { type: 'array', description: 'Notification channels' },
      client_info: { type: 'object', description: 'End-client information' },
    },
    required: ['name', 'database', 'geography', 'frequency'],
  },
};

/**
 * Calculate next delivery date based on frequency
 */
function calculateNextDelivery(frequency: string): Date {
  const now = new Date();
  const next = new Date(now);

  // Set to next business day at 6 AM
  next.setHours(6, 0, 0, 0);

  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      // Next Monday
      const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
      next.setDate(next.getDate() + daysUntilMonday);
      break;
    case 'biweekly':
      // Two weeks from next Monday
      const daysUntilMondayBi = (8 - now.getDay()) % 7 || 7;
      next.setDate(next.getDate() + daysUntilMondayBi + 7);
      break;
    case 'monthly':
      // First of next month
      next.setMonth(next.getMonth() + 1, 1);
      break;
  }

  return next;
}

/**
 * Map fulfillment method string to enum
 */
function mapFulfillmentMethod(method: string): 'DOWNLOAD' | 'EMAIL' | 'PRINT_MAIL' | 'WEBHOOK' | 'FTP' {
  const map: Record<string, 'DOWNLOAD' | 'EMAIL' | 'PRINT_MAIL' | 'WEBHOOK' | 'FTP'> = {
    download: 'DOWNLOAD',
    email: 'EMAIL',
    print_mail: 'PRINT_MAIL',
    webhook: 'WEBHOOK',
    ftp: 'FTP',
  };
  return map[method] || 'DOWNLOAD';
}

/**
 * Map frequency string to enum
 */
function mapFrequency(freq: string): 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' {
  const map: Record<string, 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'> = {
    daily: 'DAILY',
    weekly: 'WEEKLY',
    biweekly: 'BIWEEKLY',
    monthly: 'MONTHLY',
  };
  return map[freq] || 'WEEKLY';
}

/**
 * Map database string to enum
 */
function mapDatabase(db: string): 'NHO' | 'NEW_MOVER' | 'CONSUMER' | 'BUSINESS' {
  const map: Record<string, 'NHO' | 'NEW_MOVER' | 'CONSUMER' | 'BUSINESS'> = {
    nho: 'NHO',
    new_mover: 'NEW_MOVER',
    consumer: 'CONSUMER',
    business: 'BUSINESS',
  };
  return map[db] || 'NHO';
}

/**
 * Execute the create_subscription tool
 */
export async function executeCreateSubscription(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    subscription: {
      id: string;
      name: string;
      database: string;
      frequency: string;
      nextDeliveryAt: string;
      status: string;
      fulfillmentMethod: string;
    };
    estimates: {
      recordsPerDelivery: number;
      costPerDelivery: number;
      monthlyRecords: number;
      monthlyCost: number;
    };
  };
  error?: string;
}> {
  // Validate input
  const params = validateInput(CreateSubscriptionInputSchema, input);

  // Check permissions
  requirePermission(context, 'subscription:write');

  // Validate template exists if provided
  if (params.template_id) {
    const template = await prisma.template.findFirst({
      where: {
        id: params.template_id,
        OR: [
          { tenantId: context.tenant.id },
          { isPublic: true },
        ],
        isActive: true,
      },
    });

    if (!template) {
      throw new ValidationError('Template not found or not accessible', { template_id: params.template_id });
    }
  }

  // Calculate next delivery
  const nextDeliveryAt = calculateNextDelivery(params.frequency);

  // Create the subscription
  const fulfillmentMethod = params.fulfillment_method || 'download';
  const subscription = await prisma.dataSubscription.create({
    data: {
      tenantId: context.tenant.id,
      name: params.name,
      clientName: params.client_info?.name,
      clientEmail: params.client_info?.email,
      clientPhone: params.client_info?.phone,
      database: mapDatabase(params.database),
      geography: params.geography,
      filters: params.filters ?? undefined,
      frequency: mapFrequency(params.frequency),
      nextDeliveryAt,
      templateId: params.template_id || null,
      fulfillmentMethod: mapFulfillmentMethod(fulfillmentMethod),
      fulfillmentConfig: params.fulfillment_config ?? undefined,
      syncChannels: params.sync_channels ?? undefined,
      status: 'ACTIVE',
    },
  });

  // Estimate records and costs (simplified - would use preview_count in production)
  const estimatedRecordsPerDelivery = 100; // Placeholder
  const pricePerRecord = Number(context.subscription?.pricePerRecord) || 0.05;
  const costPerDelivery = estimatedRecordsPerDelivery * pricePerRecord;

  const deliveriesPerMonth = params.frequency === 'daily' ? 30 :
    params.frequency === 'weekly' ? 4 :
    params.frequency === 'biweekly' ? 2 : 1;

  return {
    success: true,
    data: {
      subscription: {
        id: subscription.id,
        name: subscription.name,
        database: params.database,
        frequency: params.frequency,
        nextDeliveryAt: subscription.nextDeliveryAt.toISOString(),
        status: subscription.status,
        fulfillmentMethod: fulfillmentMethod,
      },
      estimates: {
        recordsPerDelivery: estimatedRecordsPerDelivery,
        costPerDelivery: Math.round(costPerDelivery * 100) / 100,
        monthlyRecords: estimatedRecordsPerDelivery * deliveriesPerMonth,
        monthlyCost: Math.round(costPerDelivery * deliveriesPerMonth * 100) / 100,
      },
    },
  };
}
