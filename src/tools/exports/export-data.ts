/**
 * Tool 22: export_data
 * Generate downloadable file from any data source
 */

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { TenantContext } from '../../utils/auth.js';
import { prisma } from '../../db/client.js';
import { DatabaseTypeSchema, getFilterSchema } from '../../schemas/filters.js';
import { generateExport, generateLocalExport, isS3Configured, type ExportFormat } from '../../services/export-generator.js';
import { executeSearchData } from '../data/search-data.js';

/**
 * Geography schema
 */
const geographySchema = z.object({
  type: z.enum(['nationwide', 'state', 'zip', 'city', 'county', 'radius']),
  values: z.array(z.string()).optional(),
  center_address: z.string().optional(),
  radius_miles: z.number().optional(),
});

/**
 * Query input for fresh data export
 */
const querySchema = z.object({
  database: DatabaseTypeSchema,
  geography: geographySchema,
  filters: z.record(z.unknown()).optional(),
  limit: z.number().min(1).max(100000).optional(),
});

/**
 * Input schema for export_data
 */
const inputSchema = z
  .object({
    // Source - one of these is required
    query: querySchema.optional(),
    delivery_id: z.string().uuid().optional(),
    subscription_id: z.string().uuid().optional(),
    purchase_id: z.string().uuid().optional(),

    // Export configuration
    format: z.enum(['csv', 'excel', 'json']),
    columns: z.array(z.string()).optional(),
    include_headers: z.boolean().default(true),

    // Delivery
    delivery: z.enum(['download_url', 'email', 'sftp', 'webhook']),
    delivery_config: z
      .object({
        email: z.string().email().optional(),
        filename: z.string().optional(),
        sftp_config_id: z.string().uuid().optional(),
        webhook_url: z.string().url().optional(),
      })
      .optional(),
  })
  .refine(
    (data) => data.query || data.delivery_id || data.subscription_id || data.purchase_id,
    {
      message: 'One of query, delivery_id, subscription_id, or purchase_id is required',
    }
  );

// Type is inferred from inputSchema when parsing

/**
 * Tool definition for MCP
 */
export const exportDataTool = {
  name: 'export_data',
  description: `Generate a downloadable file (CSV, Excel, or JSON) from any data source. You can export from a fresh query, a past delivery, a subscription's latest data, or a previous purchase. The export can be delivered as a download URL, emailed, sent to SFTP, or posted to a webhook.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'object',
        description: 'Fresh query to export (mutually exclusive with other sources)',
        properties: {
          database: {
            type: 'string',
            enum: ['consumer', 'business', 'nho', 'new_mover'],
          },
          geography: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['nationwide', 'state', 'zip', 'city', 'county', 'radius'] },
              values: { type: 'array', items: { type: 'string' } },
              center_address: { type: 'string' },
              radius_miles: { type: 'number' },
            },
          },
          filters: { type: 'object' },
          limit: { type: 'number', description: 'Max records (default: all)' },
        },
      },
      delivery_id: {
        type: 'string',
        description: 'Export from a past delivery',
      },
      subscription_id: {
        type: 'string',
        description: 'Export latest from a subscription',
      },
      purchase_id: {
        type: 'string',
        description: 'Re-export from a past purchase',
      },
      format: {
        type: 'string',
        enum: ['csv', 'excel', 'json'],
        description: 'Export file format',
      },
      columns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific columns to include (default: all)',
      },
      include_headers: {
        type: 'boolean',
        description: 'Include header row (default: true)',
      },
      delivery: {
        type: 'string',
        enum: ['download_url', 'email', 'sftp', 'webhook'],
        description: 'How to deliver the export',
      },
      delivery_config: {
        type: 'object',
        description: 'Delivery configuration',
        properties: {
          email: { type: 'string', description: 'Email address for email delivery' },
          filename: { type: 'string', description: 'Custom filename (without extension)' },
          sftp_config_id: { type: 'string', description: 'SFTP config ID for SFTP delivery' },
          webhook_url: { type: 'string', description: 'Webhook URL for webhook delivery' },
        },
      },
    },
    required: ['format', 'delivery'],
  },
};

/**
 * Execute the export_data tool
 */
export async function executeExportData(
  input: unknown,
  context: TenantContext
): Promise<{
  export_id: string;
  status: string;
  record_count: number;
  file_size_bytes: number;
  format: ExportFormat;
  columns: string[];
  download_url?: string;
  download_expires?: string;
  delivery_status: string;
}> {
  // Validate input
  const validatedInput = inputSchema.parse(input);
  const { query, delivery_id, subscription_id, purchase_id, format, columns, include_headers, delivery, delivery_config } =
    validatedInput;

  let records: Record<string, unknown>[] = [];
  let sourceType: string;
  let sourceId: string;

  // Get records from the appropriate source
  if (query) {
    // Fresh query
    sourceType = 'query';
    sourceId = uuidv4();

    // Validate filters
    if (query.filters) {
      const filterSchema = getFilterSchema(query.database);
      filterSchema.parse(query.filters);
    }

    const searchResult = await executeSearchData(
      {
        database: query.database,
        geography: query.geography,
        filters: query.filters,
        limit: query.limit || 10000,
      },
      context
    );

    records = searchResult.data?.records ?? [];
  } else if (delivery_id) {
    // Export from past delivery
    sourceType = 'delivery';
    sourceId = delivery_id;

    const delivery = await prisma.delivery.findFirst({
      where: {
        id: delivery_id,
        tenantId: context.tenant.id,
      },
    });

    if (!delivery) {
      throw new Error('Delivery not found');
    }

    // Get delivery records
    const deliveryRecords = await prisma.deliveryRecord.findMany({
      where: { deliveryId: delivery_id },
    });

    records = deliveryRecords.map((r) => ({
      first_name: r.firstName,
      last_name: r.lastName,
      address: r.address,
      city: r.city,
      state: r.state,
      zip: r.zip,
      move_date: r.moveDate?.toISOString(),
    }));
  } else if (subscription_id) {
    // Export from subscription's latest delivery
    sourceType = 'subscription';
    sourceId = subscription_id;

    const latestDelivery = await prisma.delivery.findFirst({
      where: {
        dataSubscriptionId: subscription_id,
        tenantId: context.tenant.id,
        status: 'COMPLETED',
      },
      orderBy: { completedAt: 'desc' },
    });

    if (!latestDelivery) {
      throw new Error('No completed deliveries found for this subscription');
    }

    // Get delivery records
    const deliveryRecords = await prisma.deliveryRecord.findMany({
      where: { deliveryId: latestDelivery.id },
    });

    records = deliveryRecords.map((r) => ({
      first_name: r.firstName,
      last_name: r.lastName,
      address: r.address,
      city: r.city,
      state: r.state,
      zip: r.zip,
      move_date: r.moveDate?.toISOString(),
    }));
  } else if (purchase_id) {
    // Re-export from past purchase
    sourceType = 'list_purchase';
    sourceId = purchase_id;

    const purchase = await prisma.listPurchase.findFirst({
      where: {
        id: purchase_id,
        tenantId: context.tenant.id,
        paymentStatus: 'COMPLETED',
      },
    });

    if (!purchase) {
      throw new Error('Purchase not found or not completed');
    }

    // Check for existing export
    const existingExport = await prisma.exportFile.findFirst({
      where: {
        listPurchaseId: purchase_id,
        format,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingExport && existingExport.downloadUrl && existingExport.downloadExpires) {
      if (existingExport.downloadExpires > new Date()) {
        // Return existing export
        return {
          export_id: existingExport.id,
          status: 'completed',
          record_count: existingExport.recordCount,
          file_size_bytes: existingExport.fileSizeBytes,
          format: existingExport.format as ExportFormat,
          columns: (existingExport.columns as string[]) || [],
          download_url: existingExport.downloadUrl,
          download_expires: existingExport.downloadExpires.toISOString(),
          delivery_status: 'delivered',
        };
      }
    }

    // Re-query the data (this would need the original query stored)
    // For now, throw an error
    throw new Error('Re-export from purchase requires the original data to be stored');
  } else {
    throw new Error('No data source specified');
  }

  if (records.length === 0) {
    throw new Error('No records to export');
  }

  // Generate filename
  const filename = delivery_config?.filename || `export_${sourceType}_${Date.now()}`;

  // Generate export
  let exportResult: {
    s3Key?: string;
    fileSizeBytes: number;
    downloadUrl?: string;
    downloadExpires?: Date;
    recordCount: number;
    format: ExportFormat;
    columns: string[];
  };

  if (isS3Configured()) {
    // Use S3
    const result = await generateExport({
      records,
      format,
      columns,
      filename,
      includeHeaders: include_headers,
    });
    exportResult = {
      s3Key: result.s3Key,
      fileSizeBytes: result.fileSizeBytes,
      downloadUrl: result.downloadUrl,
      downloadExpires: result.downloadExpires,
      recordCount: result.recordCount,
      format: result.format,
      columns: result.columns,
    };
  } else {
    // Generate locally (return base64 or file path)
    const localResult = await generateLocalExport({
      records,
      format,
      columns,
      filename,
      includeHeaders: include_headers,
    });

    // For local dev, create a data URL (limited to small files)
    const base64 = localResult.buffer.toString('base64');
    const dataUrl = `data:${localResult.contentType};base64,${base64}`;

    exportResult = {
      fileSizeBytes: localResult.buffer.length,
      downloadUrl: dataUrl,
      downloadExpires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      recordCount: records.length,
      format,
      columns: columns || Object.keys(records[0] || {}),
    };
  }

  // Create export file record
  const exportFile = await prisma.exportFile.create({
    data: {
      tenantId: context.tenant.id,
      sourceType,
      sourceId,
      format,
      s3Key: exportResult.s3Key || '',
      fileSizeBytes: exportResult.fileSizeBytes,
      recordCount: exportResult.recordCount,
      columns: exportResult.columns,
      downloadUrl: exportResult.downloadUrl,
      downloadExpires: exportResult.downloadExpires,
      listPurchaseId: purchase_id,
    },
  });

  // Handle delivery
  let deliveryStatus = 'pending';

  if (delivery === 'download_url') {
    deliveryStatus = 'delivered';
  } else if (delivery === 'email' && delivery_config?.email) {
    // TODO: Implement email delivery
    deliveryStatus = 'queued';
  } else if (delivery === 'sftp' && delivery_config?.sftp_config_id) {
    // TODO: Implement SFTP delivery
    deliveryStatus = 'queued';
  } else if (delivery === 'webhook' && delivery_config?.webhook_url) {
    // TODO: Implement webhook delivery
    deliveryStatus = 'queued';
  }

  return {
    export_id: exportFile.id,
    status: 'completed',
    record_count: exportResult.recordCount,
    file_size_bytes: exportResult.fileSizeBytes,
    format,
    columns: exportResult.columns,
    download_url: exportResult.downloadUrl,
    download_expires: exportResult.downloadExpires?.toISOString(),
    delivery_status: deliveryStatus,
  };
}
