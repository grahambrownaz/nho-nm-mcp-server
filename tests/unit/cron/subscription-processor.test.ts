/**
 * Tests for Subscription Processor (Cron Job)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SubscriptionProcessor,
  subscriptionProcessor,
} from '../../../src/cron/subscription-processor.js';
import { prisma } from '../../../src/db/client.js';
import { dataService } from '../../../src/services/data-service.js';
import { deduplicationService } from '../../../src/services/deduplication.js';
import { pdfGenerator } from '../../../src/services/pdf-generator.js';
import { jdfGenerator } from '../../../src/services/jdf-generator.js';
import { sftpDeliveryService } from '../../../src/services/sftp-delivery.js';

// Mock all dependencies
vi.mock('../../../src/db/client.js', () => ({
  prisma: {
    subscription: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    delivery: {
      create: vi.fn(),
      update: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn(prisma)),
  },
}));

vi.mock('../../../src/services/data-service.js', () => ({
  dataService: {
    searchData: vi.fn(),
    getRecordCount: vi.fn(),
  },
}));

vi.mock('../../../src/services/deduplication.js', () => ({
  deduplicationService: {
    filterDuplicates: vi.fn(),
    recordDelivery: vi.fn(),
  },
}));

vi.mock('../../../src/services/pdf-generator.js', () => ({
  pdfGenerator: {
    generatePostcardPdf: vi.fn(),
    generateBatchPdf: vi.fn(),
  },
}));

vi.mock('../../../src/services/jdf-generator.js', () => ({
  jdfGenerator: {
    createJobTicket: vi.fn(),
  },
}));

vi.mock('../../../src/services/sftp-delivery.js', () => ({
  sftpDeliveryService: {
    connect: vi.fn(),
    upload: vi.fn(),
    uploadWithRetry: vi.fn(),
    disconnect: vi.fn(),
  },
}));

// Mock Decimal type
function mockDecimal(value: number) {
  return {
    toNumber: () => value,
    toString: () => String(value),
    valueOf: () => value,
  } as any;
}

// Create mock subscription
function createMockSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'subscription-123',
    tenantId: 'tenant-123',
    name: 'NHO Weekly Delivery',
    database: 'NHO',
    status: 'ACTIVE',
    frequency: 'WEEKLY',
    dayOfWeek: 1, // Monday
    dayOfMonth: null,
    nextDeliveryDate: new Date(),
    query: {
      database: 'nho',
      geography: {
        type: 'state',
        values: ['AZ'],
      },
    },
    templateId: 'template-123',
    deliveryConfig: {
      method: 'SFTP',
      host: 'sftp.printprovider.com',
      port: 22,
      username: 'customer',
      encryptedCredentials: 'encrypted-password',
      remotePath: '/incoming',
    },
    recordLimit: 1000,
    tenant: {
      id: 'tenant-123',
      name: 'Test Tenant',
      status: 'ACTIVE',
    },
    template: {
      id: 'template-123',
      name: 'Postcard Template',
      templateData: { front: 'template-front.html', back: 'template-back.html' },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

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
    saleDate: new Date(),
    ...overrides,
  };
}

describe('Subscription Processor', () => {
  let processor: SubscriptionProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new SubscriptionProcessor();

    // Setup default mocks
    vi.mocked(prisma.subscription.findMany).mockResolvedValue([]);
    vi.mocked(prisma.subscription.update).mockResolvedValue(createMockSubscription());
    vi.mocked(prisma.delivery.create).mockResolvedValue({
      id: 'delivery-123',
      subscriptionId: 'subscription-123',
      status: 'PENDING',
    } as any);
    vi.mocked(prisma.delivery.update).mockResolvedValue({
      id: 'delivery-123',
      status: 'COMPLETED',
    } as any);
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      id: 'tenant-123',
      name: 'Test Tenant',
      status: 'ACTIVE',
    } as any);

    vi.mocked(dataService.searchData).mockResolvedValue([
      createMockRecord({ id: 'record-1' }),
      createMockRecord({ id: 'record-2' }),
    ]);
    vi.mocked(deduplicationService.filterDuplicates).mockImplementation((records) =>
      Promise.resolve(records)
    );
    vi.mocked(deduplicationService.recordDelivery).mockResolvedValue(undefined);
    vi.mocked(pdfGenerator.generateBatchPdf).mockResolvedValue({
      pdfPath: '/tmp/postcards.pdf',
      pageCount: 2,
    });
    vi.mocked(jdfGenerator.createJobTicket).mockReturnValue('<?xml version="1.0"?><JDF/>');
    vi.mocked(sftpDeliveryService.connect).mockResolvedValue(undefined);
    vi.mocked(sftpDeliveryService.uploadWithRetry).mockResolvedValue(undefined);
    vi.mocked(sftpDeliveryService.disconnect).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getDueSubscriptions', () => {
    it('finds subscriptions due for processing', async () => {
      const dueSubscription = createMockSubscription({
        nextDeliveryDate: new Date(Date.now() - 3600000), // 1 hour ago
      });

      vi.mocked(prisma.subscription.findMany).mockResolvedValue([dueSubscription]);

      const due = await processor.getDueSubscriptions();

      expect(due).toHaveLength(1);
      expect(due[0].id).toBe('subscription-123');
    });

    it('excludes paused subscriptions', async () => {
      vi.mocked(prisma.subscription.findMany).mockResolvedValue([]);

      const due = await processor.getDueSubscriptions();

      expect(prisma.subscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
          }),
        })
      );
      expect(due).toHaveLength(0);
    });

    it('excludes future subscriptions', async () => {
      const futureSubscription = createMockSubscription({
        nextDeliveryDate: new Date(Date.now() + 86400000), // Tomorrow
      });

      vi.mocked(prisma.subscription.findMany).mockResolvedValue([]);

      const due = await processor.getDueSubscriptions();

      expect(due).toHaveLength(0);
    });

    it('includes tenant in query', async () => {
      await processor.getDueSubscriptions();

      expect(prisma.subscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            tenant: true,
          }),
        })
      );
    });
  });

  describe('processSubscription', () => {
    it('processes a subscription end-to-end', async () => {
      const subscription = createMockSubscription();

      await processor.processSubscription(subscription);

      // Should search for data
      expect(dataService.searchData).toHaveBeenCalled();

      // Should filter duplicates
      expect(deduplicationService.filterDuplicates).toHaveBeenCalled();

      // Should generate PDF
      expect(pdfGenerator.generateBatchPdf).toHaveBeenCalled();

      // Should generate JDF
      expect(jdfGenerator.createJobTicket).toHaveBeenCalled();

      // Should upload via SFTP
      expect(sftpDeliveryService.uploadWithRetry).toHaveBeenCalled();

      // Should record delivery
      expect(deduplicationService.recordDelivery).toHaveBeenCalled();
    });

    it('creates delivery record on start', async () => {
      const subscription = createMockSubscription();

      await processor.processSubscription(subscription);

      expect(prisma.delivery.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          subscriptionId: 'subscription-123',
          tenantId: 'tenant-123',
          status: 'PROCESSING',
        }),
      });
    });

    it('updates delivery status on completion', async () => {
      const subscription = createMockSubscription();

      await processor.processSubscription(subscription);

      expect(prisma.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-123' },
        data: expect.objectContaining({
          status: 'COMPLETED',
        }),
      });
    });

    it('updates next delivery date', async () => {
      const subscription = createMockSubscription({ frequency: 'WEEKLY' });

      await processor.processSubscription(subscription);

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'subscription-123' },
        data: expect.objectContaining({
          nextDeliveryDate: expect.any(Date),
          lastDeliveryDate: expect.any(Date),
        }),
      });
    });

    it('handles subscription with no records', async () => {
      const subscription = createMockSubscription();
      vi.mocked(dataService.searchData).mockResolvedValue([]);

      await processor.processSubscription(subscription);

      // Should still create delivery but mark as no records
      expect(prisma.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-123' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          recordCount: 0,
        }),
      });

      // Should not attempt PDF generation
      expect(pdfGenerator.generateBatchPdf).not.toHaveBeenCalled();
    });

    it('handles all records filtered as duplicates', async () => {
      const subscription = createMockSubscription();
      vi.mocked(deduplicationService.filterDuplicates).mockResolvedValue([]);

      await processor.processSubscription(subscription);

      expect(prisma.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-123' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          recordCount: 0,
        }),
      });
    });
  });

  describe('deduplication', () => {
    it('filters duplicates using 90-day window', async () => {
      const subscription = createMockSubscription();
      const records = [createMockRecord({ id: 'record-1' })];
      vi.mocked(dataService.searchData).mockResolvedValue(records);

      await processor.processSubscription(subscription);

      expect(deduplicationService.filterDuplicates).toHaveBeenCalledWith(
        records,
        expect.objectContaining({
          subscriptionId: 'subscription-123',
          tenantId: 'tenant-123',
          windowDays: 90,
        })
      );
    });

    it('records delivered records for future deduplication', async () => {
      const subscription = createMockSubscription();
      const records = [
        createMockRecord({ id: 'record-1' }),
        createMockRecord({ id: 'record-2' }),
      ];
      vi.mocked(dataService.searchData).mockResolvedValue(records);
      vi.mocked(deduplicationService.filterDuplicates).mockResolvedValue(records);

      await processor.processSubscription(subscription);

      expect(deduplicationService.recordDelivery).toHaveBeenCalledWith(
        records,
        expect.objectContaining({
          deliveryId: 'delivery-123',
          subscriptionId: 'subscription-123',
          tenantId: 'tenant-123',
        })
      );
    });
  });

  describe('PDF generation', () => {
    it('generates batch PDF for postcard subscriptions', async () => {
      const subscription = createMockSubscription({
        templateId: 'template-123',
      });
      const records = [createMockRecord()];
      vi.mocked(dataService.searchData).mockResolvedValue(records);
      vi.mocked(deduplicationService.filterDuplicates).mockResolvedValue(records);

      await processor.processSubscription(subscription);

      expect(pdfGenerator.generateBatchPdf).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: 'template-123',
          records,
        })
      );
    });

    it('skips PDF generation for data-only subscriptions', async () => {
      const subscription = createMockSubscription({
        templateId: null,
        deliveryConfig: {
          method: 'SFTP',
          format: 'CSV',
        },
      });

      await processor.processSubscription(subscription);

      expect(pdfGenerator.generateBatchPdf).not.toHaveBeenCalled();
    });
  });

  describe('JDF generation', () => {
    it('generates JDF ticket for print jobs', async () => {
      const subscription = createMockSubscription({
        deliveryConfig: {
          method: 'SFTP_HOT_FOLDER',
          host: 'sftp.printprovider.com',
        },
      });
      const records = [createMockRecord(), createMockRecord()];
      vi.mocked(dataService.searchData).mockResolvedValue(records);
      vi.mocked(deduplicationService.filterDuplicates).mockResolvedValue(records);

      await processor.processSubscription(subscription);

      expect(jdfGenerator.createJobTicket).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: 2,
          pdfPath: expect.any(String),
        })
      );
    });

    it('includes postcard size in JDF', async () => {
      const subscription = createMockSubscription({
        postcardSize: '6x9',
        deliveryConfig: {
          method: 'SFTP_HOT_FOLDER',
        },
      });
      const records = [createMockRecord()];
      vi.mocked(dataService.searchData).mockResolvedValue(records);
      vi.mocked(deduplicationService.filterDuplicates).mockResolvedValue(records);

      await processor.processSubscription(subscription);

      expect(jdfGenerator.createJobTicket).toHaveBeenCalledWith(
        expect.objectContaining({
          postcardSize: '6x9',
        })
      );
    });
  });

  describe('SFTP upload', () => {
    it('uploads PDF and JDF to SFTP', async () => {
      const subscription = createMockSubscription({
        deliveryConfig: {
          method: 'SFTP_HOT_FOLDER',
          host: 'sftp.example.com',
          port: 22,
          username: 'user',
          encryptedCredentials: 'encrypted',
          remotePath: '/incoming',
        },
      });
      const records = [createMockRecord()];
      vi.mocked(dataService.searchData).mockResolvedValue(records);
      vi.mocked(deduplicationService.filterDuplicates).mockResolvedValue(records);

      await processor.processSubscription(subscription);

      expect(sftpDeliveryService.connect).toHaveBeenCalled();
      expect(sftpDeliveryService.uploadWithRetry).toHaveBeenCalled();
      expect(sftpDeliveryService.disconnect).toHaveBeenCalled();
    });

    it('uses retry logic for uploads', async () => {
      const subscription = createMockSubscription();
      const records = [createMockRecord()];
      vi.mocked(dataService.searchData).mockResolvedValue(records);
      vi.mocked(deduplicationService.filterDuplicates).mockResolvedValue(records);

      await processor.processSubscription(subscription);

      expect(sftpDeliveryService.uploadWithRetry).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          maxRetries: expect.any(Number),
        })
      );
    });

    it('disconnects SFTP even on failure', async () => {
      const subscription = createMockSubscription();
      const records = [createMockRecord()];
      vi.mocked(dataService.searchData).mockResolvedValue(records);
      vi.mocked(deduplicationService.filterDuplicates).mockResolvedValue(records);
      vi.mocked(sftpDeliveryService.uploadWithRetry).mockRejectedValue(
        new Error('Upload failed')
      );

      await expect(processor.processSubscription(subscription)).rejects.toThrow();

      expect(sftpDeliveryService.disconnect).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('marks delivery as failed on error', async () => {
      const subscription = createMockSubscription();
      vi.mocked(dataService.searchData).mockRejectedValue(new Error('Database error'));

      await expect(processor.processSubscription(subscription)).rejects.toThrow();

      expect(prisma.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-123' },
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: expect.stringContaining('Database error'),
        }),
      });
    });

    it('does not update next delivery date on failure', async () => {
      const subscription = createMockSubscription();
      vi.mocked(dataService.searchData).mockRejectedValue(new Error('Error'));

      await expect(processor.processSubscription(subscription)).rejects.toThrow();

      // nextDeliveryDate should not be updated on failure
      expect(prisma.subscription.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nextDeliveryDate: expect.any(Date),
          }),
        })
      );
    });

    it('handles PDF generation failure', async () => {
      const subscription = createMockSubscription();
      const records = [createMockRecord()];
      vi.mocked(dataService.searchData).mockResolvedValue(records);
      vi.mocked(deduplicationService.filterDuplicates).mockResolvedValue(records);
      vi.mocked(pdfGenerator.generateBatchPdf).mockRejectedValue(
        new Error('PDF generation failed')
      );

      await expect(processor.processSubscription(subscription)).rejects.toThrow();

      expect(prisma.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-123' },
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: expect.stringContaining('PDF generation failed'),
        }),
      });
    });

    it('handles SFTP connection failure', async () => {
      const subscription = createMockSubscription();
      const records = [createMockRecord()];
      vi.mocked(dataService.searchData).mockResolvedValue(records);
      vi.mocked(deduplicationService.filterDuplicates).mockResolvedValue(records);
      vi.mocked(sftpDeliveryService.connect).mockRejectedValue(
        new Error('Connection refused')
      );

      await expect(processor.processSubscription(subscription)).rejects.toThrow();

      expect(prisma.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-123' },
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: expect.stringContaining('Connection refused'),
        }),
      });
    });
  });

  describe('frequency calculations', () => {
    it('calculates next weekly delivery date', async () => {
      const subscription = createMockSubscription({
        frequency: 'WEEKLY',
        dayOfWeek: 1, // Monday
      });

      await processor.processSubscription(subscription);

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'subscription-123' },
        data: expect.objectContaining({
          nextDeliveryDate: expect.any(Date),
        }),
      });

      // Verify next date is 7 days ahead
      const updateCall = vi.mocked(prisma.subscription.update).mock.calls[0];
      const nextDate = updateCall[0].data.nextDeliveryDate as Date;
      expect(nextDate.getTime()).toBeGreaterThan(Date.now());
    });

    it('calculates next monthly delivery date', async () => {
      const subscription = createMockSubscription({
        frequency: 'MONTHLY',
        dayOfMonth: 15,
      });

      await processor.processSubscription(subscription);

      expect(prisma.subscription.update).toHaveBeenCalled();
    });

    it('calculates next daily delivery date', async () => {
      const subscription = createMockSubscription({
        frequency: 'DAILY',
      });

      await processor.processSubscription(subscription);

      expect(prisma.subscription.update).toHaveBeenCalled();
    });
  });

  describe('processAll', () => {
    it('processes all due subscriptions', async () => {
      const subscriptions = [
        createMockSubscription({ id: 'sub-1' }),
        createMockSubscription({ id: 'sub-2' }),
      ];

      vi.mocked(prisma.subscription.findMany).mockResolvedValue(subscriptions);

      const results = await processor.processAll();

      expect(results.processed).toBe(2);
      expect(results.succeeded).toBe(2);
      expect(results.failed).toBe(0);
    });

    it('continues processing after individual failures', async () => {
      const subscriptions = [
        createMockSubscription({ id: 'sub-1' }),
        createMockSubscription({ id: 'sub-2' }),
      ];

      vi.mocked(prisma.subscription.findMany).mockResolvedValue(subscriptions);
      vi.mocked(dataService.searchData)
        .mockRejectedValueOnce(new Error('Error'))
        .mockResolvedValueOnce([createMockRecord()]);

      const results = await processor.processAll();

      expect(results.processed).toBe(2);
      expect(results.succeeded).toBe(1);
      expect(results.failed).toBe(1);
    });

    it('returns empty results when no subscriptions due', async () => {
      vi.mocked(prisma.subscription.findMany).mockResolvedValue([]);

      const results = await processor.processAll();

      expect(results.processed).toBe(0);
      expect(results.succeeded).toBe(0);
      expect(results.failed).toBe(0);
    });
  });

  describe('record limit', () => {
    it('respects subscription record limit', async () => {
      const subscription = createMockSubscription({
        recordLimit: 100,
      });

      await processor.processSubscription(subscription);

      expect(dataService.searchData).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 100,
        })
      );
    });
  });

  describe('singleton instance', () => {
    it('exports singleton instance', () => {
      expect(subscriptionProcessor).toBeDefined();
      expect(subscriptionProcessor).toBeInstanceOf(SubscriptionProcessor);
    });
  });
});
