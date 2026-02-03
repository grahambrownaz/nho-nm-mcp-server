/**
 * Subscription Processor
 * Processes due subscriptions and handles fulfillment
 */

import { prisma } from '../db/client.js';
import { getPdfGenerator } from '../services/pdf-generator.js';
import { getJdfGenerator } from '../services/jdf-generator.js';
import { getSftpDeliveryService, type SftpConfig } from '../services/sftp-delivery.js';
import { getDeduplicationService, type DeduplicationRecord } from '../services/deduplication.js';
import { decrypt } from '../services/encryption.js';
import {
  configureAndRegisterProvider,
  getPrintApiProviderOptional,
  type PrintJob,
  type PrintRecipient,
} from '../services/print-api/index.js';
import * as fs from 'fs';
import * as path from 'path';
import type { DataSubscription, DeliveryConfig, Template, DatabaseType } from '@prisma/client';
import {
  syncToPlatform,
  type PlatformType,
  type PlatformCredentials,
  type SyncRecord,
} from '../services/platform-sync/index.js';

/**
 * Processing result for a single subscription
 */
export interface SubscriptionProcessingResult {
  subscriptionId: string;
  subscriptionName: string;
  success: boolean;
  deliveryId?: string;
  recordCount: number;
  newRecordCount: number;
  duplicatesRemoved: number;
  pdfGenerated: boolean;
  jdfGenerated: boolean;
  fulfillmentMethod?: string;
  fulfillmentSuccess: boolean;
  platformSyncResults?: Array<{
    platform: string;
    success: boolean;
    created: number;
    updated: number;
    errors: number;
  }>;
  error?: string;
  processingTimeMs: number;
}

/**
 * Subscription with related data
 */
interface SubscriptionWithRelations extends DataSubscription {
  template: Template | null;
}

/**
 * Mock data service (would be LeadsPlease API in production)
 */
async function fetchRecordsFromApi(
  _database: DatabaseType,
  geography: unknown,
  _filters: unknown
): Promise<DeduplicationRecord[]> {
  // In production, this would call the LeadsPlease API
  // For now, generate mock data based on the geography
  const geo = geography as { type: string; values?: string[] };
  const count = Math.floor(Math.random() * 50) + 10;

  const records: DeduplicationRecord[] = [];
  const cities = ['Phoenix', 'Scottsdale', 'Mesa', 'Tempe', 'Chandler', 'Gilbert'];
  const streets = ['Main', 'Oak', 'Maple', 'Cedar', 'Pine', 'Elm', 'First', 'Second'];

  for (let i = 0; i < count; i++) {
    const streetNum = Math.floor(Math.random() * 9000) + 1000;
    const streetName = streets[Math.floor(Math.random() * streets.length)];
    const city = cities[Math.floor(Math.random() * cities.length)];

    records.push({
      first_name: `FirstName${i}`,
      last_name: `LastName${Math.floor(Math.random() * 1000)}`,
      address: `${streetNum} ${streetName} St`,
      city,
      state: 'AZ',
      zip: geo.values?.[0] || '85001',
      move_date: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      income_range: '$50k-$75k',
      home_value: '$250k-$350k',
    });
  }

  return records;
}

/**
 * Calculate next delivery date based on frequency
 */
function calculateNextDelivery(frequency: string, deliveryHour: number): Date {
  const now = new Date();
  const next = new Date(now);
  next.setHours(deliveryHour, 0, 0, 0);

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
 * Get delivery configuration for a subscription
 */
async function getDeliveryConfig(tenantId: string, _subscriptionId: string): Promise<DeliveryConfig | null> {
  // First check if subscription has specific delivery config
  // For now, just get the default or first active config
  const config = await prisma.deliveryConfig.findFirst({
    where: {
      tenantId,
      isActive: true,
    },
    orderBy: [
      { isDefault: 'desc' },
      { createdAt: 'desc' },
    ],
  });

  return config;
}

/**
 * Process SFTP fulfillment
 */
async function processSftpFulfillment(
  config: DeliveryConfig,
  _deliveryId: string,
  pdfPath: string | null,
  jdfXml: string | null,
  jobName: string
): Promise<{
  success: boolean;
  details: Record<string, unknown>;
  error?: string;
}> {
  const sftpService = getSftpDeliveryService();

  const sftpConfig: SftpConfig = {
    host: config.sftpHost!,
    port: config.sftpPort || 22,
    username: config.sftpUsername!,
    password: config.sftpPassword ? decrypt(config.sftpPassword) : undefined,
    privateKey: config.sftpPrivateKey ? decrypt(config.sftpPrivateKey) : undefined,
    folderPath: config.sftpFolderPath!,
  };

  const uploadResults: Array<{ file: string; success: boolean; remotePath?: string; error?: string }> = [];
  let overallSuccess = true;

  // Upload PDF if available
  if (pdfPath && fs.existsSync(pdfPath)) {
    const pdfFileName = `${jobName}.pdf`;
    const result = await sftpService.uploadFile(sftpConfig, pdfPath, pdfFileName);
    uploadResults.push({
      file: 'pdf',
      success: result.success,
      remotePath: result.remotePath,
      error: result.error,
    });
    if (!result.success) overallSuccess = false;
  }

  // Upload JDF if available
  if (jdfXml && config.includeJdf) {
    const jdfFileName = `${jobName}.jdf`;
    const jdfBuffer = Buffer.from(jdfXml, 'utf8');
    const result = await sftpService.uploadBuffer(sftpConfig, jdfBuffer, jdfFileName);
    uploadResults.push({
      file: 'jdf',
      success: result.success,
      remotePath: result.remotePath,
      error: result.error,
    });
    if (!result.success) overallSuccess = false;
  }

  return {
    success: overallSuccess,
    details: {
      method: 'SFTP_HOT_FOLDER',
      uploadedAt: new Date().toISOString(),
      uploads: uploadResults,
      remotePath: sftpConfig.folderPath,
    },
    error: overallSuccess ? undefined : uploadResults.find((r) => !r.success)?.error,
  };
}

/**
 * Process Print API fulfillment
 */
async function processPrintApiFulfillment(
  config: DeliveryConfig,
  deliveryId: string,
  records: DeduplicationRecord[],
  subscription: SubscriptionWithRelations,
  pdfUrl: string | null
): Promise<{
  success: boolean;
  details: Record<string, unknown>;
  error?: string;
}> {
  try {
    if (!config.printApiProvider) {
      return {
        success: false,
        details: { method: 'PRINT_API' },
        error: 'Print API provider not configured',
      };
    }

    // Get or configure the provider
    let provider = getPrintApiProviderOptional(config.printApiProvider);

    if (!provider || !provider.isConfigured()) {
      // Configure the provider with stored credentials
      if (!config.printApiKey) {
        return {
          success: false,
          details: { method: 'PRINT_API', provider: config.printApiProvider },
          error: 'Print API key not configured',
        };
      }

      const settings = config.printApiSettings as Record<string, unknown> | null;
      provider = configureAndRegisterProvider(
        config.printApiProvider,
        {
          apiKey: decrypt(config.printApiKey),
          apiUrl: settings?.api_url as string | undefined,
        },
        false
      );
    }

    // Build recipients list
    const recipients: PrintRecipient[] = records.map((r) => ({
      name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Current Resident',
      addressLine1: r.address,
      city: r.city,
      state: r.state,
      zip: r.zip,
    }));

    // Get settings
    const settings = config.printApiSettings as {
      default_mail_class?: string;
      default_finish?: string;
      return_address?: {
        name: string;
        company?: string;
        address_line_1: string;
        address_line_2?: string;
        city: string;
        state: string;
        zip: string;
      };
    } | null;

    // Build print job
    const printJob: PrintJob = {
      id: deliveryId,
      template: {
        frontUrl: pdfUrl || undefined,
      },
      recipients,
      product: {
        size: '4x6', // Default, could be configurable
        mailClass: (settings?.default_mail_class as 'first_class' | 'standard' | 'marketing') || 'standard',
        finish: (settings?.default_finish as 'gloss' | 'matte') || 'gloss',
        doubleSided: true,
      },
      returnAddress: settings?.return_address
        ? {
            name: settings.return_address.name,
            company: settings.return_address.company,
            addressLine1: settings.return_address.address_line_1,
            addressLine2: settings.return_address.address_line_2,
            city: settings.return_address.city,
            state: settings.return_address.state,
            zip: settings.return_address.zip,
          }
        : undefined,
      metadata: {
        subscriptionId: subscription.id,
        subscriptionName: subscription.name,
        tenantId: subscription.tenantId,
      },
    };

    // Submit the job
    const result = await provider.submitJob(printJob);

    if (!result.success) {
      return {
        success: false,
        details: {
          method: 'PRINT_API',
          provider: provider.name,
          providerDisplayName: provider.displayName,
          error: result.error,
          errorCode: result.errorCode,
        },
        error: result.error,
      };
    }

    return {
      success: true,
      details: {
        method: 'PRINT_API',
        provider: provider.name,
        providerDisplayName: provider.displayName,
        externalJobId: result.externalJobId,
        estimatedDelivery: result.estimatedDelivery,
        cost: result.cost,
        costPerPiece: result.costPerPiece,
        recipientCount: result.recipientCount,
        submittedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      details: {
        method: 'PRINT_API',
        provider: config.printApiProvider,
      },
      error: error instanceof Error ? error.message : 'Print API fulfillment failed',
    };
  }
}

/**
 * Process a single subscription
 */
export async function processSubscription(
  subscription: SubscriptionWithRelations,
  deliveryHour: number = 6
): Promise<SubscriptionProcessingResult> {
  const startTime = Date.now();
  const result: SubscriptionProcessingResult = {
    subscriptionId: subscription.id,
    subscriptionName: subscription.name,
    success: false,
    recordCount: 0,
    newRecordCount: 0,
    duplicatesRemoved: 0,
    pdfGenerated: false,
    jdfGenerated: false,
    fulfillmentSuccess: false,
    processingTimeMs: 0,
  };

  try {
    console.log(`[Processor] Processing subscription: ${subscription.name} (${subscription.id})`);

    // Step 1: Fetch records from API
    const rawRecords = await fetchRecordsFromApi(
      subscription.database,
      subscription.geography,
      subscription.filters
    );
    result.recordCount = rawRecords.length;

    if (rawRecords.length === 0) {
      console.log(`[Processor] No records found for ${subscription.name}`);
      result.success = true;
      result.processingTimeMs = Date.now() - startTime;
      return result;
    }

    // Step 2: Deduplicate against history
    const dedupeService = getDeduplicationService();
    const dedupeResult = await dedupeService.deduplicateRecords(
      subscription.tenantId,
      subscription.id,
      rawRecords,
      90 // 90-day window
    );

    result.newRecordCount = dedupeResult.uniqueCount;
    result.duplicatesRemoved = dedupeResult.duplicateCount;

    if (dedupeResult.uniqueCount === 0) {
      console.log(`[Processor] All ${rawRecords.length} records are duplicates for ${subscription.name}`);
      result.success = true;
      result.processingTimeMs = Date.now() - startTime;
      return result;
    }

    console.log(
      `[Processor] Found ${dedupeResult.uniqueCount} new records (${dedupeResult.duplicateCount} duplicates removed)`
    );

    // Step 3: Create delivery record
    const delivery = await prisma.delivery.create({
      data: {
        dataSubscriptionId: subscription.id,
        tenantId: subscription.tenantId,
        recordCount: dedupeResult.uniqueCount,
        newRecordsCount: dedupeResult.uniqueCount,
        duplicatesRemoved: dedupeResult.duplicateCount,
        dataCost: dedupeResult.uniqueCount * 0.05,
        pdfCost: 0,
        fulfillmentCost: 0,
        totalCost: dedupeResult.uniqueCount * 0.05,
        scheduledAt: new Date(),
        startedAt: new Date(),
        status: 'PROCESSING',
        fulfillmentStatus: 'PENDING',
      },
    });

    result.deliveryId = delivery.id;

    // Step 4: Generate PDF if template is configured
    let pdfPath: string | null = null;

    if (subscription.templateId && subscription.template) {
      try {
        const pdfGenerator = getPdfGenerator();
        const pdfResult = await pdfGenerator.generate({
          templateId: subscription.templateId,
          records: dedupeResult.uniqueRecords,
          outputFormat: 'single_pdf',
          includeBack: true,
          quality: 'standard',
          bleed: false,
        });

        if (pdfResult.success && pdfResult.files.length > 0) {
          pdfPath = pdfResult.files[0];
          result.pdfGenerated = true;

          // Update delivery with PDF cost
          await prisma.delivery.update({
            where: { id: delivery.id },
            data: {
              pdfFileUrl: pdfPath,
              pdfCost: dedupeResult.uniqueCount * 0.02,
              totalCost: dedupeResult.uniqueCount * 0.07,
              status: 'GENERATING_PDF',
            },
          });
        }
      } catch (error) {
        console.error(`[Processor] PDF generation failed: ${error}`);
      }
    }

    // Step 5: Get delivery configuration
    const deliveryConfig = await getDeliveryConfig(subscription.tenantId, subscription.id);

    // Step 6: Generate JDF if configured
    let jdfXml: string | null = null;

    if (deliveryConfig?.includeJdf && deliveryConfig.jdfPreset) {
      const jdfGenerator = getJdfGenerator();
      const jobName = `${subscription.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}`;
      const jdfResult = jdfGenerator.generate({
        jobId: delivery.id,
        jobName,
        quantity: dedupeResult.uniqueCount,
        preset: deliveryConfig.jdfPreset,
        pdfFileName: pdfPath ? path.basename(pdfPath) : 'postcards.pdf',
        customerName: subscription.clientName || undefined,
      });

      if (jdfResult.success) {
        jdfXml = jdfResult.xml;
        result.jdfGenerated = true;
      }
    }

    // Step 7: Process fulfillment
    if (deliveryConfig) {
      result.fulfillmentMethod = deliveryConfig.method;

      await prisma.delivery.update({
        where: { id: delivery.id },
        data: { status: 'FULFILLING' },
      });

      let fulfillmentResult: { success: boolean; details: Record<string, unknown>; error?: string };

      switch (deliveryConfig.method) {
        case 'SFTP_HOT_FOLDER':
          const jobName = `${subscription.name.replace(/[^a-zA-Z0-9]/g, '_')}_${delivery.id.substring(0, 8)}`;
          fulfillmentResult = await processSftpFulfillment(
            deliveryConfig,
            delivery.id,
            pdfPath,
            jdfXml,
            jobName
          );
          break;

        case 'PRINT_API':
          fulfillmentResult = await processPrintApiFulfillment(
            deliveryConfig,
            delivery.id,
            dedupeResult.uniqueRecords,
            subscription,
            pdfPath
          );
          break;

        default:
          // Other methods not implemented yet
          fulfillmentResult = {
            success: true,
            details: { method: deliveryConfig.method, note: 'Fulfillment method not fully implemented' },
          };
      }

      result.fulfillmentSuccess = fulfillmentResult.success;

      // Update delivery with fulfillment results
      await prisma.delivery.update({
        where: { id: delivery.id },
        data: {
          fulfillmentStatus: fulfillmentResult.success ? 'COMPLETED' : 'FAILED',
          fulfillmentDetails: fulfillmentResult.details as Parameters<typeof prisma.delivery.update>[0]['data']['fulfillmentDetails'],
          status: fulfillmentResult.success ? 'COMPLETED' : 'FAILED',
          completedAt: new Date(),
          errorMessage: fulfillmentResult.error || null,
        },
      });
    } else {
      // No delivery config - mark as completed for download
      await prisma.delivery.update({
        where: { id: delivery.id },
        data: {
          fulfillmentStatus: 'NOT_APPLICABLE',
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
      result.fulfillmentSuccess = true;
    }

    // Step 8: Record individual delivered records
    await dedupeService.recordDeliveries(
      delivery.id,
      subscription.tenantId,
      subscription.id,
      dedupeResult.uniqueRecords,
      subscription.database
    );

    // Step 9: Process platform sync (if configured)
    const syncChannels = subscription.syncChannels as Array<{
      type: string;
      connectionId?: string;
      platform?: PlatformType;
      credentials?: PlatformCredentials;
    }> | null;

    if (syncChannels && syncChannels.length > 0) {
      result.platformSyncResults = [];

      // Convert records to SyncRecord format
      const syncRecords: SyncRecord[] = dedupeResult.uniqueRecords.map((r) => ({
        email: r.email as string | undefined,
        phone: r.phone as string | undefined,
        firstName: r.first_name,
        lastName: r.last_name,
        fullName: r.first_name && r.last_name ? `${r.first_name} ${r.last_name}` : undefined,
        addressLine1: r.address,
        city: r.city,
        state: r.state,
        zip: r.zip,
        moveDate: r.move_date as string | undefined,
        propertyType: r.property_type as string | undefined,
        income: r.income_range as string | undefined,
        source: 'subscription_delivery',
        subscriptionId: subscription.id,
        deliveryId: delivery.id,
      }));

      for (const channel of syncChannels) {
        if (channel.platform && channel.credentials) {
          try {
            const syncResult = await syncToPlatform(
              channel.platform,
              channel.credentials,
              syncRecords
            );

            result.platformSyncResults.push({
              platform: channel.platform,
              success: syncResult.success,
              created: syncResult.created,
              updated: syncResult.updated,
              errors: syncResult.errors.length,
            });

            console.log(
              `[Processor] Platform sync to ${channel.platform}: ` +
                `created=${syncResult.created}, updated=${syncResult.updated}, ` +
                `errors=${syncResult.errors.length}`
            );
          } catch (error) {
            console.error(`[Processor] Platform sync failed for ${channel.platform}:`, error);
            result.platformSyncResults.push({
              platform: channel.platform,
              success: false,
              created: 0,
              updated: 0,
              errors: 1,
            });
          }
        }
      }

      // Update delivery with sync results
      await prisma.delivery.update({
        where: { id: delivery.id },
        data: {
          fulfillmentDetails: {
            ...((delivery as unknown as { fulfillmentDetails?: Record<string, unknown> }).fulfillmentDetails || {}),
            platformSync: result.platformSyncResults,
          } as Parameters<typeof prisma.delivery.update>[0]['data']['fulfillmentDetails'],
        },
      });
    }

    // Step 10: Update subscription stats
    const nextDeliveryAt = calculateNextDelivery(subscription.frequency, deliveryHour);

    await prisma.dataSubscription.update({
      where: { id: subscription.id },
      data: {
        lastDeliveryAt: new Date(),
        nextDeliveryAt,
        totalDeliveries: { increment: 1 },
        totalRecords: { increment: dedupeResult.uniqueCount },
      },
    });

    result.success = true;
    console.log(
      `[Processor] Completed ${subscription.name}: ${dedupeResult.uniqueCount} records, ` +
        `PDF: ${result.pdfGenerated}, JDF: ${result.jdfGenerated}, ` +
        `Fulfillment: ${result.fulfillmentSuccess}`
    );
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Processor] Error processing ${subscription.name}: ${result.error}`);

    // Update delivery status if created
    if (result.deliveryId) {
      await prisma.delivery.update({
        where: { id: result.deliveryId },
        data: {
          status: 'FAILED',
          fulfillmentStatus: 'FAILED',
          errorMessage: result.error,
          completedAt: new Date(),
        },
      });
    }
  }

  result.processingTimeMs = Date.now() - startTime;
  return result;
}

/**
 * Process all due subscriptions
 */
export async function processAllDueSubscriptions(
  deliveryHour: number = 6,
  batchSize: number = 10
): Promise<{
  processed: number;
  successful: number;
  failed: number;
  results: SubscriptionProcessingResult[];
}> {
  const now = new Date();

  // Find all active subscriptions due for delivery
  const dueSubscriptions = await prisma.dataSubscription.findMany({
    where: {
      status: 'ACTIVE',
      nextDeliveryAt: { lte: now },
    },
    take: batchSize,
    orderBy: { nextDeliveryAt: 'asc' },
    include: {
      template: true,
    },
  });

  console.log(`[Processor] Found ${dueSubscriptions.length} subscriptions due for delivery`);

  const results: SubscriptionProcessingResult[] = [];
  let successful = 0;
  let failed = 0;

  for (const subscription of dueSubscriptions) {
    const result = await processSubscription(subscription, deliveryHour);
    results.push(result);

    if (result.success) {
      successful++;
    } else {
      failed++;
    }
  }

  return {
    processed: dueSubscriptions.length,
    successful,
    failed,
    results,
  };
}
