/**
 * Purchase Fulfillment Service
 * Handles fulfillment of list purchases after payment completion
 */

import { prisma } from '../db/client.js';
import { generateExport, generateLocalExport, isS3Configured, type ExportFormat } from './export-generator.js';
import type { DatabaseType } from '../schemas/filters.js';

/**
 * Fulfill a list purchase after payment is received
 */
export async function fulfillListPurchase(purchaseId: string): Promise<void> {
  // Get the purchase
  const purchase = await prisma.listPurchase.findUnique({
    where: { id: purchaseId },
    include: { tenant: true },
  });

  if (!purchase) {
    console.error(`[Fulfillment] Purchase not found: ${purchaseId}`);
    return;
  }

  if (purchase.paymentStatus === 'COMPLETED') {
    console.log(`[Fulfillment] Purchase already fulfilled: ${purchaseId}`);
    return;
  }

  console.log(`[Fulfillment] Starting fulfillment for purchase: ${purchaseId}`);

  try {
    // Update status to processing
    await prisma.listPurchase.update({
      where: { id: purchaseId },
      data: { paymentStatus: 'PROCESSING' },
    });

    // Query the data
    const records = await queryPurchaseData(purchase);

    if (records.length === 0) {
      throw new Error('No records returned from query');
    }

    console.log(`[Fulfillment] Retrieved ${records.length} records`);

    // Generate export file
    const filename = `${purchase.database}_${purchaseId}`;
    const format = purchase.exportFormat as ExportFormat;

    let exportResult: {
      s3Key?: string;
      downloadUrl?: string;
      downloadExpires?: Date;
      fileSizeBytes: number;
    };

    if (isS3Configured()) {
      const result = await generateExport({
        records,
        format,
        filename,
      });
      exportResult = result;
    } else {
      // Local development - generate locally
      const localResult = await generateLocalExport({
        records,
        format,
        filename,
      });

      // Create data URL for local dev
      const base64 = localResult.buffer.toString('base64');
      const dataUrl = `data:${localResult.contentType};base64,${base64}`;

      exportResult = {
        downloadUrl: dataUrl,
        downloadExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        fileSizeBytes: localResult.buffer.length,
      };
    }

    // Create export file record
    await prisma.exportFile.create({
      data: {
        tenantId: purchase.tenantId,
        sourceType: 'list_purchase',
        sourceId: purchase.id,
        format,
        s3Key: exportResult.s3Key || '',
        fileSizeBytes: exportResult.fileSizeBytes,
        recordCount: records.length,
        downloadUrl: exportResult.downloadUrl,
        downloadExpires: exportResult.downloadExpires,
        listPurchaseId: purchase.id,
      },
    });

    // Update purchase with download info
    await prisma.listPurchase.update({
      where: { id: purchaseId },
      data: {
        paymentStatus: 'COMPLETED',
        downloadUrl: exportResult.downloadUrl,
        downloadExpires: exportResult.downloadExpires,
        deliveredAt: new Date(),
      },
    });

    console.log(`[Fulfillment] Purchase fulfilled successfully: ${purchaseId}`);

    // Handle delivery based on method
    const deliveryConfig = purchase.deliveryConfig as Record<string, unknown> | null;

    if (purchase.deliveryMethod === 'email' && deliveryConfig?.email) {
      await deliverViaEmail(
        deliveryConfig.email as string,
        exportResult.downloadUrl!,
        purchase.database,
        records.length
      );
    } else if (purchase.deliveryMethod === 'webhook' && deliveryConfig?.webhook_url) {
      await deliverViaWebhook(
        deliveryConfig.webhook_url as string,
        {
          purchase_id: purchase.id,
          download_url: exportResult.downloadUrl,
          record_count: records.length,
          format,
        }
      );
    } else if (purchase.deliveryMethod === 'sftp' && deliveryConfig?.sftp_config_id) {
      // TODO: Implement SFTP delivery
      console.log(`[Fulfillment] SFTP delivery not yet implemented`);
    }
  } catch (error) {
    console.error(`[Fulfillment] Error fulfilling purchase ${purchaseId}:`, error);

    // Update status to failed
    await prisma.listPurchase.update({
      where: { id: purchaseId },
      data: { paymentStatus: 'FAILED' },
    });

    throw error;
  }
}

/**
 * Query data for a purchase
 */
async function queryPurchaseData(purchase: {
  database: string;
  geography: unknown;
  filters: unknown;
  recordCount: number;
  withEmail: number;
  withPhone: number;
}): Promise<Record<string, unknown>[]> {
  // In production, this would call the LeadsPlease API
  // For now, generate mock data that matches the purchase criteria

  const mockRecords: Record<string, unknown>[] = [];
  const database = purchase.database as DatabaseType;
  const cities = ['Phoenix', 'Scottsdale', 'Mesa', 'Tempe', 'Chandler', 'Gilbert', 'Glendale'];
  const streets = ['Main', 'Oak', 'Maple', 'Cedar', 'Pine', 'Elm', 'Birch', 'Walnut'];
  const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'Chris', 'Lisa', 'Mark', 'Amy'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];

  for (let i = 0; i < purchase.recordCount; i++) {
    const record: Record<string, unknown> = {
      first_name: firstNames[Math.floor(Math.random() * firstNames.length)],
      last_name: lastNames[Math.floor(Math.random() * lastNames.length)],
      address: `${Math.floor(Math.random() * 9000) + 1000} ${streets[Math.floor(Math.random() * streets.length)]} St`,
      city: cities[Math.floor(Math.random() * cities.length)],
      state: 'AZ',
      zip: `8500${Math.floor(Math.random() * 10)}`,
    };

    // Add email if this purchase includes email
    if (purchase.withEmail > 0 && i < purchase.withEmail) {
      record.email = `${record.first_name?.toString().toLowerCase()}.${record.last_name?.toString().toLowerCase()}${i}@example.com`;
    }

    // Add phone if this purchase includes phone
    if (purchase.withPhone > 0 && i < purchase.withPhone) {
      record.phone = `602-555-${String(i).padStart(4, '0')}`;
    }

    // Add database-specific fields
    if (database === 'nho' || database === 'new_mover') {
      record.move_date = new Date(Date.now() - Math.floor(Math.random() * 90) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    }

    if (database === 'business') {
      record.company_name = `${record.last_name} ${['LLC', 'Inc', 'Corp', 'Co'][Math.floor(Math.random() * 4)]}`;
      record.title = ['Owner', 'CEO', 'Manager', 'Director'][Math.floor(Math.random() * 4)];
    }

    mockRecords.push(record);
  }

  return mockRecords;
}

/**
 * Deliver export via email
 */
async function deliverViaEmail(
  email: string,
  downloadUrl: string,
  database: string,
  recordCount: number
): Promise<void> {
  // TODO: Implement email delivery using Resend or similar
  console.log(`[Fulfillment] Email delivery to ${email}:`);
  console.log(`  - Database: ${database}`);
  console.log(`  - Records: ${recordCount}`);
  console.log(`  - Download URL: ${downloadUrl.substring(0, 50)}...`);
}

/**
 * Deliver export via webhook
 */
async function deliverViaWebhook(
  webhookUrl: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Webhook delivery failed: ${response.status}`);
    }

    console.log(`[Fulfillment] Webhook delivered to ${webhookUrl}`);
  } catch (error) {
    console.error(`[Fulfillment] Webhook delivery failed:`, error);
    throw error;
  }
}

/**
 * Expire old quotes
 */
export async function expireOldQuotes(): Promise<number> {
  const result = await prisma.listPurchase.updateMany({
    where: {
      paymentStatus: { in: ['PENDING', 'AWAITING_PAYMENT'] },
      quoteValidUntil: { lt: new Date() },
    },
    data: { paymentStatus: 'EXPIRED' },
  });

  if (result.count > 0) {
    console.log(`[Fulfillment] Expired ${result.count} old quotes`);
  }

  return result.count;
}

/**
 * Get purchase download URL (regenerate if expired)
 */
export async function getPurchaseDownload(
  purchaseId: string,
  tenantId: string
): Promise<{
  downloadUrl: string;
  downloadExpires: Date;
} | null> {
  const purchase = await prisma.listPurchase.findFirst({
    where: {
      id: purchaseId,
      tenantId,
      paymentStatus: 'COMPLETED',
    },
    include: {
      exports: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!purchase) {
    return null;
  }

  // Check if download is still valid
  if (purchase.downloadUrl && purchase.downloadExpires && purchase.downloadExpires > new Date()) {
    return {
      downloadUrl: purchase.downloadUrl,
      downloadExpires: purchase.downloadExpires,
    };
  }

  // Check export file
  const exportFile = purchase.exports[0];
  if (exportFile?.downloadUrl && exportFile.downloadExpires && exportFile.downloadExpires > new Date()) {
    return {
      downloadUrl: exportFile.downloadUrl,
      downloadExpires: exportFile.downloadExpires,
    };
  }

  // TODO: Regenerate download URL from S3 if needed
  return null;
}
