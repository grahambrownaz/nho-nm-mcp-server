/**
 * Tests for Deduplication Service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DeduplicationService,
  deduplicationService,
  hashRecord,
} from '../../../src/services/deduplication.js';
import { prisma } from '../../../src/db/client.js';

// Mock Prisma client
vi.mock('../../../src/db/client.js', () => ({
  prisma: {
    deliveryRecord: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    delivery: {
      findMany: vi.fn(),
    },
  },
}));

// Create mock record
function createMockRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'record-123',
    firstName: 'John',
    lastName: 'Smith',
    address: '123 Main St',
    city: 'Phoenix',
    state: 'AZ',
    zip: '85001',
    email: 'john@example.com',
    phone: '6025551234',
    ...overrides,
  };
}

// Create mock delivery record (for deduplication history)
function createMockDeliveryRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'delivery-record-123',
    deliveryId: 'delivery-123',
    recordHash: 'abc123hash',
    subscriptionId: 'subscription-123',
    tenantId: 'tenant-123',
    deliveredAt: new Date(),
    ...overrides,
  };
}

describe('Deduplication Service', () => {
  let service: DeduplicationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DeduplicationService();

    // Default mock responses
    vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([]);
  });

  describe('hashRecord', () => {
    it('hashes record consistently', () => {
      const record = createMockRecord();

      const hash1 = hashRecord(record);
      const hash2 = hashRecord(record);

      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1.length).toBeGreaterThan(0);
    });

    it('same address + name produces same hash', () => {
      const record1 = createMockRecord({
        firstName: 'John',
        lastName: 'Doe',
        address: '456 Oak Ave',
        city: 'Tempe',
        state: 'AZ',
        zip: '85281',
      });

      const record2 = createMockRecord({
        firstName: 'John',
        lastName: 'Doe',
        address: '456 Oak Ave',
        city: 'Tempe',
        state: 'AZ',
        zip: '85281',
        // Different email/phone should not affect hash
        email: 'different@example.com',
        phone: '4805559999',
      });

      const hash1 = hashRecord(record1);
      const hash2 = hashRecord(record2);

      expect(hash1).toBe(hash2);
    });

    it('different addresses produce different hashes', () => {
      const record1 = createMockRecord({
        address: '123 Main St',
        city: 'Phoenix',
        state: 'AZ',
        zip: '85001',
      });

      const record2 = createMockRecord({
        address: '456 Oak Ave',
        city: 'Tempe',
        state: 'AZ',
        zip: '85281',
      });

      const hash1 = hashRecord(record1);
      const hash2 = hashRecord(record2);

      expect(hash1).not.toBe(hash2);
    });

    it('different names produce different hashes', () => {
      const record1 = createMockRecord({
        firstName: 'John',
        lastName: 'Smith',
      });

      const record2 = createMockRecord({
        firstName: 'Jane',
        lastName: 'Doe',
      });

      const hash1 = hashRecord(record1);
      const hash2 = hashRecord(record2);

      expect(hash1).not.toBe(hash2);
    });

    it('normalizes case for consistent hashing', () => {
      const record1 = createMockRecord({
        firstName: 'JOHN',
        lastName: 'SMITH',
        address: '123 MAIN ST',
        city: 'PHOENIX',
      });

      const record2 = createMockRecord({
        firstName: 'john',
        lastName: 'smith',
        address: '123 main st',
        city: 'phoenix',
      });

      const hash1 = hashRecord(record1);
      const hash2 = hashRecord(record2);

      expect(hash1).toBe(hash2);
    });

    it('trims whitespace for consistent hashing', () => {
      const record1 = createMockRecord({
        firstName: '  John  ',
        lastName: '  Smith  ',
        address: '  123 Main St  ',
      });

      const record2 = createMockRecord({
        firstName: 'John',
        lastName: 'Smith',
        address: '123 Main St',
      });

      const hash1 = hashRecord(record1);
      const hash2 = hashRecord(record2);

      expect(hash1).toBe(hash2);
    });

    it('handles missing optional fields', () => {
      const record = createMockRecord({
        email: null,
        phone: undefined,
      });

      const hash = hashRecord(record);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });
  });

  describe('filterDuplicates', () => {
    it('filters out records delivered in last 90 days', async () => {
      const records = [
        createMockRecord({ id: 'record-1', address: '100 First St' }),
        createMockRecord({ id: 'record-2', address: '200 Second St' }),
        createMockRecord({ id: 'record-3', address: '300 Third St' }),
      ];

      // Mock that record-2's hash was already delivered
      const record2Hash = hashRecord(records[1]);
      vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([
        createMockDeliveryRecord({
          recordHash: record2Hash,
          deliveredAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        }),
      ]);

      const filtered = await service.filterDuplicates(records, {
        subscriptionId: 'subscription-123',
        tenantId: 'tenant-123',
        windowDays: 90,
      });

      expect(filtered).toHaveLength(2);
      expect(filtered.find((r) => r.id === 'record-2')).toBeUndefined();
    });

    it('allows records outside 90-day window', async () => {
      const records = [
        createMockRecord({ id: 'record-1', address: '100 First St' }),
        createMockRecord({ id: 'record-2', address: '200 Second St' }),
      ];

      // Mock that record-2's hash was delivered 100 days ago (outside window)
      const record2Hash = hashRecord(records[1]);
      vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([
        createMockDeliveryRecord({
          recordHash: record2Hash,
          deliveredAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000), // 100 days ago
        }),
      ]);

      const filtered = await service.filterDuplicates(records, {
        subscriptionId: 'subscription-123',
        tenantId: 'tenant-123',
        windowDays: 90,
      });

      // Both records should pass since the previous delivery is outside the 90-day window
      expect(filtered).toHaveLength(2);
    });

    it('handles empty input array', async () => {
      const filtered = await service.filterDuplicates([], {
        subscriptionId: 'subscription-123',
        tenantId: 'tenant-123',
        windowDays: 90,
      });

      expect(filtered).toHaveLength(0);
      expect(filtered).toEqual([]);
    });

    it('returns all records when no previous deliveries exist', async () => {
      const records = [
        createMockRecord({ id: 'record-1' }),
        createMockRecord({ id: 'record-2' }),
        createMockRecord({ id: 'record-3' }),
      ];

      vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([]);

      const filtered = await service.filterDuplicates(records, {
        subscriptionId: 'subscription-123',
        tenantId: 'tenant-123',
        windowDays: 90,
      });

      expect(filtered).toHaveLength(3);
    });

    it('uses custom window days', async () => {
      const records = [createMockRecord({ id: 'record-1', address: '100 First St' })];

      const recordHash = hashRecord(records[0]);
      vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([
        createMockDeliveryRecord({
          recordHash,
          deliveredAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000), // 45 days ago
        }),
      ]);

      // With 30-day window, should pass
      const filtered30 = await service.filterDuplicates(records, {
        subscriptionId: 'subscription-123',
        tenantId: 'tenant-123',
        windowDays: 30,
      });
      expect(filtered30).toHaveLength(1);

      // With 60-day window, should be filtered
      const filtered60 = await service.filterDuplicates(records, {
        subscriptionId: 'subscription-123',
        tenantId: 'tenant-123',
        windowDays: 60,
      });
      expect(filtered60).toHaveLength(0);
    });

    it('filters by subscription scope', async () => {
      const records = [createMockRecord({ id: 'record-1' })];

      await service.filterDuplicates(records, {
        subscriptionId: 'subscription-123',
        tenantId: 'tenant-123',
        windowDays: 90,
      });

      expect(prisma.deliveryRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            subscriptionId: 'subscription-123',
          }),
        })
      );
    });

    it('filters by tenant scope', async () => {
      const records = [createMockRecord({ id: 'record-1' })];

      await service.filterDuplicates(records, {
        subscriptionId: 'subscription-123',
        tenantId: 'tenant-123',
        windowDays: 90,
      });

      expect(prisma.deliveryRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-123',
          }),
        })
      );
    });
  });

  describe('recordDelivery', () => {
    it('records delivered hashes to database', async () => {
      const records = [
        createMockRecord({ id: 'record-1', address: '100 First St' }),
        createMockRecord({ id: 'record-2', address: '200 Second St' }),
      ];

      vi.mocked(prisma.deliveryRecord.createMany).mockResolvedValue({ count: 2 });

      await service.recordDelivery(records, {
        deliveryId: 'delivery-123',
        subscriptionId: 'subscription-123',
        tenantId: 'tenant-123',
      });

      expect(prisma.deliveryRecord.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            deliveryId: 'delivery-123',
            subscriptionId: 'subscription-123',
            tenantId: 'tenant-123',
            recordHash: expect.any(String),
          }),
        ]),
      });
    });

    it('handles empty records array', async () => {
      await service.recordDelivery([], {
        deliveryId: 'delivery-123',
        subscriptionId: 'subscription-123',
        tenantId: 'tenant-123',
      });

      // Should not call createMany with empty array
      expect(prisma.deliveryRecord.createMany).not.toHaveBeenCalled();
    });
  });

  describe('getDeduplicationStats', () => {
    it('returns statistics for subscription', async () => {
      vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([
        createMockDeliveryRecord({ deliveredAt: new Date() }),
        createMockDeliveryRecord({ deliveredAt: new Date() }),
        createMockDeliveryRecord({ deliveredAt: new Date() }),
      ]);

      const stats = await service.getDeduplicationStats({
        subscriptionId: 'subscription-123',
        tenantId: 'tenant-123',
        windowDays: 90,
      });

      expect(stats.totalDelivered).toBe(3);
      expect(stats.uniqueHashes).toBeDefined();
    });

    it('calculates unique hash count', async () => {
      const sameHash = 'duplicate-hash';
      vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([
        createMockDeliveryRecord({ recordHash: sameHash }),
        createMockDeliveryRecord({ recordHash: sameHash }),
        createMockDeliveryRecord({ recordHash: 'unique-hash' }),
      ]);

      const stats = await service.getDeduplicationStats({
        subscriptionId: 'subscription-123',
        tenantId: 'tenant-123',
        windowDays: 90,
      });

      expect(stats.uniqueHashes).toBe(2);
    });
  });

  describe('clearExpiredRecords', () => {
    it('removes records older than retention period', async () => {
      const mockDeleteMany = vi.fn().mockResolvedValue({ count: 100 });
      (prisma.deliveryRecord as any).deleteMany = mockDeleteMany;

      await service.clearExpiredRecords({
        tenantId: 'tenant-123',
        retentionDays: 90,
      });

      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tenantId: 'tenant-123',
          deliveredAt: expect.objectContaining({
            lt: expect.any(Date),
          }),
        }),
      });
    });
  });

  describe('checkDuplicate', () => {
    it('returns true for duplicate record', async () => {
      const record = createMockRecord();
      const recordHash = hashRecord(record);

      vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([
        createMockDeliveryRecord({
          recordHash,
          deliveredAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        }),
      ]);

      const isDuplicate = await service.checkDuplicate(record, {
        subscriptionId: 'subscription-123',
        tenantId: 'tenant-123',
        windowDays: 90,
      });

      expect(isDuplicate).toBe(true);
    });

    it('returns false for non-duplicate record', async () => {
      const record = createMockRecord();

      vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([]);

      const isDuplicate = await service.checkDuplicate(record, {
        subscriptionId: 'subscription-123',
        tenantId: 'tenant-123',
        windowDays: 90,
      });

      expect(isDuplicate).toBe(false);
    });
  });

  describe('batch processing', () => {
    it('handles large batch of records efficiently', async () => {
      const records = Array.from({ length: 1000 }, (_, i) =>
        createMockRecord({
          id: `record-${i}`,
          address: `${i} Test Street`,
        })
      );

      vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([]);

      const filtered = await service.filterDuplicates(records, {
        subscriptionId: 'subscription-123',
        tenantId: 'tenant-123',
        windowDays: 90,
      });

      expect(filtered).toHaveLength(1000);
    });

    it('deduplicates within same batch', async () => {
      const records = [
        createMockRecord({ id: 'record-1', firstName: 'John', lastName: 'Doe', address: '123 Main St' }),
        createMockRecord({ id: 'record-2', firstName: 'John', lastName: 'Doe', address: '123 Main St' }), // Duplicate
        createMockRecord({ id: 'record-3', firstName: 'Jane', lastName: 'Smith', address: '456 Oak Ave' }),
      ];

      vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([]);

      const filtered = await service.filterDuplicates(records, {
        subscriptionId: 'subscription-123',
        tenantId: 'tenant-123',
        windowDays: 90,
        deduplicateWithinBatch: true,
      });

      expect(filtered).toHaveLength(2);
    });
  });

  describe('error handling', () => {
    it('handles database errors gracefully', async () => {
      const records = [createMockRecord()];

      vi.mocked(prisma.deliveryRecord.findMany).mockRejectedValue(new Error('Database error'));

      await expect(
        service.filterDuplicates(records, {
          subscriptionId: 'subscription-123',
          tenantId: 'tenant-123',
          windowDays: 90,
        })
      ).rejects.toThrow('Database error');
    });
  });

  describe('singleton instance', () => {
    it('exports singleton instance', () => {
      expect(deduplicationService).toBeDefined();
      expect(deduplicationService).toBeInstanceOf(DeduplicationService);
    });
  });
});
