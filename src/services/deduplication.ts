/**
 * Deduplication Service
 * Handles record deduplication against delivery history
 */

import * as crypto from 'crypto';
import { prisma } from '../db/client.js';
import type { DatabaseType } from '@prisma/client';

/**
 * Record to be deduplicated
 */
export interface DeduplicationRecord {
  first_name?: string;
  last_name?: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  [key: string]: unknown;
}

/**
 * Deduplication result
 */
export interface DeduplicationResult {
  originalCount: number;
  uniqueCount: number;
  duplicateCount: number;
  uniqueRecords: DeduplicationRecord[];
  duplicateHashes: string[];
}

/**
 * Normalize string for consistent hashing
 */
function normalizeString(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, ''); // Remove non-alphanumeric characters
}

/**
 * Normalize address for deduplication
 */
function normalizeAddress(address: string): string {
  let normalized = address.toLowerCase().trim();

  // Common abbreviations
  const abbreviations: Record<string, string> = {
    'street': 'st',
    'avenue': 'ave',
    'boulevard': 'blvd',
    'drive': 'dr',
    'road': 'rd',
    'lane': 'ln',
    'court': 'ct',
    'circle': 'cir',
    'place': 'pl',
    'terrace': 'ter',
    'highway': 'hwy',
    'parkway': 'pkwy',
    'north': 'n',
    'south': 's',
    'east': 'e',
    'west': 'w',
    'northeast': 'ne',
    'northwest': 'nw',
    'southeast': 'se',
    'southwest': 'sw',
    'apartment': 'apt',
    'suite': 'ste',
    'unit': 'unit',
    'floor': 'fl',
    'building': 'bldg',
  };

  // Replace full words with abbreviations
  for (const [full, abbr] of Object.entries(abbreviations)) {
    normalized = normalized.replace(new RegExp(`\\b${full}\\b`, 'gi'), abbr);
  }

  // Remove punctuation and extra spaces
  normalized = normalized.replace(/[.,#-]/g, ' ').replace(/\s+/g, ' ').trim();

  // Remove non-alphanumeric except spaces
  normalized = normalized.replace(/[^a-z0-9\s]/g, '');

  return normalized;
}

/**
 * Generate hash for a record
 */
export function generateRecordHash(record: DeduplicationRecord): string {
  const normalizedAddress = normalizeAddress(record.address);
  const normalizedLastName = normalizeString(record.last_name);
  const normalizedZip = record.zip.replace(/\D/g, '').substring(0, 5);

  // Create composite key: address + last_name + zip
  const compositeKey = `${normalizedAddress}|${normalizedLastName}|${normalizedZip}`;

  // Generate SHA-256 hash
  return crypto.createHash('sha256').update(compositeKey).digest('hex');
}

/**
 * Deduplication Service class
 */
export class DeduplicationService {
  private defaultWindowDays = 90;

  /**
   * Set the default deduplication window
   */
  setDefaultWindow(days: number): void {
    this.defaultWindowDays = days;
  }

  /**
   * Deduplicate records against delivery history
   */
  async deduplicateRecords(
    tenantId: string,
    subscriptionId: string,
    records: DeduplicationRecord[],
    windowDays?: number
  ): Promise<DeduplicationResult> {
    const window = windowDays || this.defaultWindowDays;
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - window);

    // Generate hashes for all incoming records
    const recordsWithHashes = records.map((record) => ({
      record,
      hash: generateRecordHash(record),
    }));

    // Get all hashes
    const allHashes = recordsWithHashes.map((r) => r.hash);

    // Query for existing hashes within the window
    const existingRecords = await prisma.deliveryRecord.findMany({
      where: {
        tenantId,
        subscriptionId,
        recordHash: { in: allHashes },
        deliveredAt: { gte: windowStart },
      },
      select: { recordHash: true },
    });

    const existingHashSet = new Set(existingRecords.map((r) => r.recordHash));

    // Filter out duplicates
    const uniqueRecords: DeduplicationRecord[] = [];
    const duplicateHashes: string[] = [];

    for (const { record, hash } of recordsWithHashes) {
      if (existingHashSet.has(hash)) {
        duplicateHashes.push(hash);
      } else {
        uniqueRecords.push(record);
        // Add to set to handle duplicates within the batch
        existingHashSet.add(hash);
      }
    }

    return {
      originalCount: records.length,
      uniqueCount: uniqueRecords.length,
      duplicateCount: duplicateHashes.length,
      uniqueRecords,
      duplicateHashes,
    };
  }

  /**
   * Deduplicate records within a single batch (no database lookup)
   */
  deduplicateBatch(records: DeduplicationRecord[]): DeduplicationResult {
    const seen = new Map<string, DeduplicationRecord>();
    const duplicateHashes: string[] = [];

    for (const record of records) {
      const hash = generateRecordHash(record);

      if (seen.has(hash)) {
        duplicateHashes.push(hash);
      } else {
        seen.set(hash, record);
      }
    }

    return {
      originalCount: records.length,
      uniqueCount: seen.size,
      duplicateCount: duplicateHashes.length,
      uniqueRecords: Array.from(seen.values()),
      duplicateHashes,
    };
  }

  /**
   * Record delivered records in the database
   */
  async recordDeliveries(
    deliveryId: string,
    tenantId: string,
    subscriptionId: string,
    records: DeduplicationRecord[],
    database: DatabaseType
  ): Promise<number> {
    const deliveryRecords = records.map((record) => ({
      deliveryId,
      tenantId,
      subscriptionId,
      recordHash: generateRecordHash(record),
      firstName: record.first_name || null,
      lastName: record.last_name || null,
      address: record.address,
      city: record.city,
      state: record.state,
      zip: record.zip,
      database,
      moveDate: record.move_date ? new Date(record.move_date as string) : null,
      deliveredAt: new Date(),
    }));

    const result = await prisma.deliveryRecord.createMany({
      data: deliveryRecords,
      skipDuplicates: true,
    });

    return result.count;
  }

  /**
   * Get deduplication statistics for a subscription
   */
  async getStats(
    tenantId: string,
    subscriptionId: string,
    windowDays?: number
  ): Promise<{
    totalDelivered: number;
    uniqueAddresses: number;
    windowDays: number;
    oldestRecord: Date | null;
    newestRecord: Date | null;
  }> {
    const window = windowDays || this.defaultWindowDays;
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - window);

    const [totalCount, uniqueCount, dateRange] = await Promise.all([
      prisma.deliveryRecord.count({
        where: {
          tenantId,
          subscriptionId,
          deliveredAt: { gte: windowStart },
        },
      }),
      prisma.deliveryRecord.groupBy({
        by: ['recordHash'],
        where: {
          tenantId,
          subscriptionId,
          deliveredAt: { gte: windowStart },
        },
      }),
      prisma.deliveryRecord.aggregate({
        where: {
          tenantId,
          subscriptionId,
          deliveredAt: { gte: windowStart },
        },
        _min: { deliveredAt: true },
        _max: { deliveredAt: true },
      }),
    ]);

    return {
      totalDelivered: totalCount,
      uniqueAddresses: uniqueCount.length,
      windowDays: window,
      oldestRecord: dateRange._min.deliveredAt,
      newestRecord: dateRange._max.deliveredAt,
    };
  }

  /**
   * Clean up old delivery records outside the window
   */
  async cleanupOldRecords(tenantId: string, windowDays?: number): Promise<number> {
    const window = windowDays || this.defaultWindowDays;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - window);

    const result = await prisma.deliveryRecord.deleteMany({
      where: {
        tenantId,
        deliveredAt: { lt: cutoffDate },
      },
    });

    return result.count;
  }
}

// Singleton instance
let deduplicationServiceInstance: DeduplicationService | null = null;

/**
 * Get the singleton deduplication service instance
 */
export function getDeduplicationService(): DeduplicationService {
  if (!deduplicationServiceInstance) {
    deduplicationServiceInstance = new DeduplicationService();
  }
  return deduplicationServiceInstance;
}
