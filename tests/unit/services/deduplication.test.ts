/**
 * Tests for Deduplication Service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DeduplicationService,
  getDeduplicationService,
  generateRecordHash,
  type DeduplicationRecord,
} from '../../../src/services/deduplication.js';
import { prisma } from '../../../src/db/client.js';

// Mock Prisma client
vi.mock('../../../src/db/client.js', () => ({
  prisma: {
    deliveryRecord: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      aggregate: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

// Create mock record matching DeduplicationRecord interface
function createMockRecord(overrides: Partial<DeduplicationRecord> = {}): DeduplicationRecord {
  return {
    first_name: 'John',
    last_name: 'Smith',
    address: '123 Main St',
    city: 'Phoenix',
    state: 'AZ',
    zip: '85001',
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
    vi.mocked(prisma.deliveryRecord.createMany).mockResolvedValue({ count: 0 });
  });

  describe('generateRecordHash', () => {
    it('hashes record consistently', () => {
      const record = createMockRecord();

      const hash1 = generateRecordHash(record);
      const hash2 = generateRecordHash(record);

      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1.length).toBeGreaterThan(0);
    });

    it('same address + name produces same hash', () => {
      const record1 = createMockRecord({
        first_name: 'John',
        last_name: 'Doe',
        address: '456 Oak Ave',
        city: 'Tempe',
        state: 'AZ',
        zip: '85281',
      });

      const record2 = createMockRecord({
        first_name: 'John',
        last_name: 'Doe',
        address: '456 Oak Ave',
        city: 'Tempe',
        state: 'AZ',
        zip: '85281',
        // Different email/phone should not affect hash (they are not used in hashing)
        email: 'different@example.com',
        phone: '4805559999',
      });

      const hash1 = generateRecordHash(record1);
      const hash2 = generateRecordHash(record2);

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

      const hash1 = generateRecordHash(record1);
      const hash2 = generateRecordHash(record2);

      expect(hash1).not.toBe(hash2);
    });

    it('different last names produce different hashes', () => {
      const record1 = createMockRecord({
        first_name: 'John',
        last_name: 'Smith',
      });

      const record2 = createMockRecord({
        first_name: 'John',
        last_name: 'Doe',
      });

      const hash1 = generateRecordHash(record1);
      const hash2 = generateRecordHash(record2);

      expect(hash1).not.toBe(hash2);
    });

    it('normalizes case for consistent hashing', () => {
      const record1 = createMockRecord({
        first_name: 'JOHN',
        last_name: 'SMITH',
        address: '123 MAIN ST',
        city: 'PHOENIX',
      });

      const record2 = createMockRecord({
        first_name: 'john',
        last_name: 'smith',
        address: '123 main st',
        city: 'phoenix',
      });

      const hash1 = generateRecordHash(record1);
      const hash2 = generateRecordHash(record2);

      expect(hash1).toBe(hash2);
    });

    it('handles missing optional fields', () => {
      const record = createMockRecord({
        first_name: undefined,
      });

      const hash = generateRecordHash(record);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });
  });

  describe('deduplicateRecords', () => {
    it('filters out records delivered in last 90 days', async () => {
      const records = [
        createMockRecord({ address: '100 First St' }),
        createMockRecord({ address: '200 Second St' }),
        createMockRecord({ address: '300 Third St' }),
      ];

      // Mock that record-2's hash was already delivered
      const record2Hash = generateRecordHash(records[1]);
      vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([
        createMockDeliveryRecord({
          recordHash: record2Hash,
          deliveredAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        }),
      ] as any);

      const result = await service.deduplicateRecords(
        'tenant-123',
        'subscription-123',
        records,
        90
      );

      expect(result.uniqueRecords).toHaveLength(2);
      expect(result.duplicateCount).toBe(1);
    });

    it('handles empty input array', async () => {
      const result = await service.deduplicateRecords(
        'tenant-123',
        'subscription-123',
        [],
        90
      );

      expect(result.uniqueRecords).toHaveLength(0);
      expect(result.originalCount).toBe(0);
    });

    it('returns all records when no previous deliveries exist', async () => {
      const records = [
        createMockRecord({ address: '100 First St' }),
        createMockRecord({ address: '200 Second St' }),
        createMockRecord({ address: '300 Third St' }),
      ];

      vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([]);

      const result = await service.deduplicateRecords(
        'tenant-123',
        'subscription-123',
        records,
        90
      );

      expect(result.uniqueRecords).toHaveLength(3);
      expect(result.duplicateCount).toBe(0);
    });

    it('uses custom window days', async () => {
      const records = [createMockRecord({ address: '100 First St' })];

      await service.deduplicateRecords(
        'tenant-123',
        'subscription-123',
        records,
        30
      );

      // Verify query was made with correct parameters
      expect(prisma.deliveryRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-123',
            subscriptionId: 'subscription-123',
          }),
        })
      );
    });

    it('filters by subscription scope', async () => {
      const records = [createMockRecord()];

      await service.deduplicateRecords(
        'tenant-123',
        'subscription-123',
        records,
        90
      );

      expect(prisma.deliveryRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            subscriptionId: 'subscription-123',
          }),
        })
      );
    });

    it('filters by tenant scope', async () => {
      const records = [createMockRecord()];

      await service.deduplicateRecords(
        'tenant-123',
        'subscription-123',
        records,
        90
      );

      expect(prisma.deliveryRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-123',
          }),
        })
      );
    });
  });

  describe('deduplicateBatch', () => {
    it('deduplicates within same batch', () => {
      const records = [
        createMockRecord({ first_name: 'John', last_name: 'Doe', address: '123 Main St' }),
        createMockRecord({ first_name: 'John', last_name: 'Doe', address: '123 Main St' }), // Duplicate
        createMockRecord({ first_name: 'Jane', last_name: 'Smith', address: '456 Oak Ave' }),
      ];

      const result = service.deduplicateBatch(records);

      expect(result.uniqueRecords).toHaveLength(2);
      expect(result.duplicateCount).toBe(1);
      expect(result.originalCount).toBe(3);
    });

    it('handles empty batch', () => {
      const result = service.deduplicateBatch([]);

      expect(result.uniqueRecords).toHaveLength(0);
      expect(result.duplicateCount).toBe(0);
    });
  });

  describe('recordDeliveries', () => {
    it('records delivered hashes to database', async () => {
      const records = [
        createMockRecord({ address: '100 First St' }),
        createMockRecord({ address: '200 Second St' }),
      ];

      vi.mocked(prisma.deliveryRecord.createMany).mockResolvedValue({ count: 2 });

      const count = await service.recordDeliveries(
        'delivery-123',
        'tenant-123',
        'subscription-123',
        records,
        'NHO'
      );

      expect(count).toBe(2);
      expect(prisma.deliveryRecord.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            deliveryId: 'delivery-123',
            subscriptionId: 'subscription-123',
            tenantId: 'tenant-123',
            recordHash: expect.any(String),
            database: 'NHO',
          }),
        ]),
        skipDuplicates: true,
      });
    });
  });

  describe('getStats', () => {
    it('returns statistics for subscription', async () => {
      vi.mocked(prisma.deliveryRecord.count).mockResolvedValue(100);
      vi.mocked(prisma.deliveryRecord.groupBy).mockResolvedValue([
        { recordHash: 'hash1' },
        { recordHash: 'hash2' },
        { recordHash: 'hash3' },
      ] as any);
      vi.mocked(prisma.deliveryRecord.aggregate).mockResolvedValue({
        _min: { deliveredAt: new Date('2026-01-01') },
        _max: { deliveredAt: new Date('2026-02-01') },
      } as any);

      const stats = await service.getStats('tenant-123', 'subscription-123', 90);

      expect(stats.totalDelivered).toBe(100);
      expect(stats.uniqueAddresses).toBe(3);
      expect(stats.windowDays).toBe(90);
      expect(stats.oldestRecord).toBeInstanceOf(Date);
      expect(stats.newestRecord).toBeInstanceOf(Date);
    });
  });

  describe('cleanupOldRecords', () => {
    it('removes records older than retention period', async () => {
      vi.mocked(prisma.deliveryRecord.deleteMany).mockResolvedValue({ count: 100 });

      const count = await service.cleanupOldRecords('tenant-123', 90);

      expect(count).toBe(100);
      expect(prisma.deliveryRecord.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tenantId: 'tenant-123',
          deliveredAt: expect.objectContaining({
            lt: expect.any(Date),
          }),
        }),
      });
    });
  });

  describe('batch processing', () => {
    it('handles large batch of records efficiently', async () => {
      const records = Array.from({ length: 1000 }, (_, i) =>
        createMockRecord({
          address: `${i} Test Street`,
        })
      );

      vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([]);

      const result = await service.deduplicateRecords(
        'tenant-123',
        'subscription-123',
        records,
        90
      );

      expect(result.uniqueRecords).toHaveLength(1000);
    });
  });

  describe('error handling', () => {
    it('handles database errors gracefully', async () => {
      const records = [createMockRecord()];

      vi.mocked(prisma.deliveryRecord.findMany).mockRejectedValue(new Error('Database error'));

      await expect(
        service.deduplicateRecords('tenant-123', 'subscription-123', records, 90)
      ).rejects.toThrow('Database error');
    });
  });

  describe('singleton instance', () => {
    it('returns singleton instance', () => {
      const instance1 = getDeduplicationService();
      const instance2 = getDeduplicationService();

      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(DeduplicationService);
    });
  });
});
