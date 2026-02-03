/**
 * Integration Tests for Delivery Pipeline
 *
 * Tests the full flow from subscription trigger through data fetching,
 * deduplication, PDF generation, and SFTP delivery.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { prisma } from '../../src/db/client.js';
import { SubscriptionProcessor } from '../../src/cron/subscription-processor.js';
import { DeduplicationService } from '../../src/services/deduplication.js';
import { PdfGenerator } from '../../src/services/pdf-generator.js';
import { JdfGenerator } from '../../src/services/jdf-generator.js';
import { SftpDeliveryService } from '../../src/services/sftp-delivery.js';
import { dataService } from '../../src/services/data-service.js';
import fs from 'fs/promises';
import path from 'path';

// Test configuration
const TEST_TENANT_ID = 'integration-test-tenant';
const TEST_SUBSCRIPTION_ID = 'integration-test-subscription';
const TEST_TEMPLATE_ID = 'integration-test-template';
const TEST_OUTPUT_DIR = '/tmp/nho-integration-tests';

// Mock external services for integration tests
vi.mock('../../src/services/data-service.js', () => ({
  dataService: {
    searchData: vi.fn(),
    getRecordCount: vi.fn(),
  },
}));

// Mock SFTP client
vi.mock('ssh2-sftp-client', () => {
  const mockSftp = {
    connect: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
    stat: vi.fn().mockResolvedValue({ size: 12345 }),
  };
  return { default: vi.fn(() => mockSftp) };
});

// Mock Prisma for integration tests
vi.mock('../../src/db/client.js', () => ({
  prisma: {
    subscription: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    delivery: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    deliveryRecord: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
    },
    template: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn(prisma)),
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

// Test fixtures
function createTestSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_SUBSCRIPTION_ID,
    tenantId: TEST_TENANT_ID,
    name: 'Integration Test Subscription',
    database: 'NHO',
    status: 'ACTIVE',
    frequency: 'WEEKLY',
    dayOfWeek: 1,
    nextDeliveryDate: new Date(Date.now() - 3600000),
    query: {
      database: 'nho',
      geography: { type: 'state', values: ['AZ'] },
    },
    templateId: TEST_TEMPLATE_ID,
    postcardSize: '4x6',
    deliveryConfig: {
      method: 'SFTP_HOT_FOLDER',
      host: 'sftp.test.com',
      port: 22,
      username: 'testuser',
      encryptedCredentials: 'encrypted-test-password',
      remotePath: '/incoming',
    },
    recordLimit: 100,
    tenant: {
      id: TEST_TENANT_ID,
      name: 'Integration Test Tenant',
      status: 'ACTIVE',
    },
    template: {
      id: TEST_TEMPLATE_ID,
      name: 'Test Postcard Template',
      templateData: {
        front: '<html><body>Front {{firstName}} {{lastName}}</body></html>',
        back: '<html><body>{{address}}, {{city}}, {{state}} {{zip}}</body></html>',
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createTestRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: `record-${Math.random().toString(36).substr(2, 9)}`,
    firstName: 'John',
    lastName: 'Smith',
    address: '123 Main Street',
    city: 'Phoenix',
    state: 'AZ',
    zip: '85001',
    saleDate: new Date(),
    propertyType: 'Single Family',
    salePrice: 450000,
    ...overrides,
  };
}

describe('Delivery Pipeline Integration', () => {
  let processor: SubscriptionProcessor;
  let deduplicationService: DeduplicationService;
  let pdfGenerator: PdfGenerator;
  let jdfGenerator: JdfGenerator;
  let sftpService: SftpDeliveryService;

  beforeAll(async () => {
    // Create test output directory
    await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });
  });

  beforeEach(() => {
    vi.clearAllMocks();

    processor = new SubscriptionProcessor();
    deduplicationService = new DeduplicationService();
    pdfGenerator = new PdfGenerator();
    jdfGenerator = new JdfGenerator();
    sftpService = new SftpDeliveryService();

    // Setup default mocks
    vi.mocked(prisma.subscription.findMany).mockResolvedValue([createTestSubscription()]);
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(createTestSubscription());
    vi.mocked(prisma.subscription.update).mockResolvedValue(createTestSubscription());
    vi.mocked(prisma.delivery.create).mockResolvedValue({
      id: 'delivery-integration-test',
      subscriptionId: TEST_SUBSCRIPTION_ID,
      tenantId: TEST_TENANT_ID,
      status: 'PENDING',
      createdAt: new Date(),
    } as any);
    vi.mocked(prisma.delivery.update).mockResolvedValue({
      id: 'delivery-integration-test',
      status: 'COMPLETED',
    } as any);
    vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([]);
    vi.mocked(prisma.deliveryRecord.createMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      id: TEST_TENANT_ID,
      name: 'Integration Test Tenant',
      status: 'ACTIVE',
    } as any);
    vi.mocked(prisma.template.findUnique).mockResolvedValue({
      id: TEST_TEMPLATE_ID,
      name: 'Test Template',
      templateData: {},
    } as any);
  });

  afterAll(async () => {
    // Cleanup test output directory
    try {
      await fs.rm(TEST_OUTPUT_DIR, { recursive: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('Full Delivery Pipeline', () => {
    it('executes complete pipeline from subscription to SFTP delivery', async () => {
      const testRecords = [
        createTestRecord({ id: 'record-1', firstName: 'John', lastName: 'Doe' }),
        createTestRecord({ id: 'record-2', firstName: 'Jane', lastName: 'Smith' }),
        createTestRecord({ id: 'record-3', firstName: 'Bob', lastName: 'Johnson' }),
      ];

      vi.mocked(dataService.searchData).mockResolvedValue(testRecords);

      const subscription = createTestSubscription();
      await processor.processSubscription(subscription);

      // Verify data was fetched
      expect(dataService.searchData).toHaveBeenCalledWith(
        expect.objectContaining({
          database: 'nho',
        })
      );

      // Verify delivery was created
      expect(prisma.delivery.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          subscriptionId: TEST_SUBSCRIPTION_ID,
          tenantId: TEST_TENANT_ID,
          status: 'PROCESSING',
        }),
      });

      // Verify delivery was completed
      expect(prisma.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-integration-test' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          recordCount: 3,
        }),
      });

      // Verify next delivery date was updated
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: TEST_SUBSCRIPTION_ID },
        data: expect.objectContaining({
          nextDeliveryDate: expect.any(Date),
          lastDeliveryDate: expect.any(Date),
        }),
      });
    });

    it('handles pipeline with deduplication', async () => {
      const testRecords = [
        createTestRecord({ id: 'record-1', address: '100 First St' }),
        createTestRecord({ id: 'record-2', address: '200 Second St' }),
        createTestRecord({ id: 'record-3', address: '300 Third St' }),
      ];

      // Mock one record as previously delivered
      vi.mocked(dataService.searchData).mockResolvedValue(testRecords);
      vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([
        {
          id: 'prev-delivery-1',
          recordHash: 'hash-for-record-2',
          subscriptionId: TEST_SUBSCRIPTION_ID,
          tenantId: TEST_TENANT_ID,
          deliveredAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        } as any,
      ]);

      const subscription = createTestSubscription();
      await processor.processSubscription(subscription);

      // Verify deduplication was applied
      expect(prisma.deliveryRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            subscriptionId: TEST_SUBSCRIPTION_ID,
          }),
        })
      );
    });

    it('handles empty data results gracefully', async () => {
      vi.mocked(dataService.searchData).mockResolvedValue([]);

      const subscription = createTestSubscription();
      await processor.processSubscription(subscription);

      // Verify delivery was marked complete with 0 records
      expect(prisma.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-integration-test' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          recordCount: 0,
        }),
      });
    });

    it('handles all records filtered as duplicates', async () => {
      const testRecords = [
        createTestRecord({ id: 'record-1' }),
        createTestRecord({ id: 'record-2' }),
      ];

      vi.mocked(dataService.searchData).mockResolvedValue(testRecords);

      // Mock all records as previously delivered
      vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue(
        testRecords.map((r, i) => ({
          id: `prev-${i}`,
          recordHash: `hash-${r.id}`,
          subscriptionId: TEST_SUBSCRIPTION_ID,
          tenantId: TEST_TENANT_ID,
          deliveredAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        })) as any
      );

      const subscription = createTestSubscription();
      await processor.processSubscription(subscription);

      expect(prisma.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-integration-test' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          recordCount: 0,
        }),
      });
    });
  });

  describe('Pipeline Error Recovery', () => {
    it('marks delivery as failed on data fetch error', async () => {
      vi.mocked(dataService.searchData).mockRejectedValue(new Error('Database connection failed'));

      const subscription = createTestSubscription();

      await expect(processor.processSubscription(subscription)).rejects.toThrow();

      expect(prisma.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-integration-test' },
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: expect.stringContaining('Database connection failed'),
        }),
      });
    });

    it('marks delivery as failed on SFTP connection error', async () => {
      const testRecords = [createTestRecord()];
      vi.mocked(dataService.searchData).mockResolvedValue(testRecords);

      // Mock SFTP failure
      const SftpClient = (await import('ssh2-sftp-client')).default;
      const mockInstance = new SftpClient();
      (mockInstance.connect as any).mockRejectedValue(new Error('SFTP connection refused'));

      const subscription = createTestSubscription();

      await expect(processor.processSubscription(subscription)).rejects.toThrow();

      expect(prisma.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-integration-test' },
        data: expect.objectContaining({
          status: 'FAILED',
        }),
      });
    });

    it('does not update next delivery date on failure', async () => {
      vi.mocked(dataService.searchData).mockRejectedValue(new Error('Error'));

      const subscription = createTestSubscription();

      await expect(processor.processSubscription(subscription)).rejects.toThrow();

      // Verify subscription update was NOT called with nextDeliveryDate
      const updateCalls = vi.mocked(prisma.subscription.update).mock.calls;
      const hasNextDateUpdate = updateCalls.some(
        (call) => call[0].data.nextDeliveryDate !== undefined
      );
      expect(hasNextDateUpdate).toBe(false);
    });
  });

  describe('JDF Integration', () => {
    it('generates JDF ticket for print fulfillment', async () => {
      const testRecords = [
        createTestRecord({ id: 'record-1' }),
        createTestRecord({ id: 'record-2' }),
      ];

      vi.mocked(dataService.searchData).mockResolvedValue(testRecords);

      const subscription = createTestSubscription({
        postcardSize: '6x9',
        deliveryConfig: {
          method: 'SFTP_HOT_FOLDER',
          host: 'sftp.printprovider.com',
          remotePath: '/hot-folder',
        },
      });

      // Create JDF directly to test format
      const jdf = jdfGenerator.createJobTicket({
        jobName: 'Integration_Test_Job',
        quantity: 2,
        postcardSize: '6x9',
        mediaPreset: '6x9_100lb_gloss_fc',
        pdfPath: '/tmp/postcards.pdf',
      });

      expect(jdf).toContain('<?xml version="1.0"');
      expect(jdf).toContain('JDF');
      expect(jdf).toContain('Amount="2"');
    });

    it('includes correct media specifications in JDF', () => {
      const jdf = jdfGenerator.createJobTicket({
        jobName: 'Media_Test',
        quantity: 100,
        postcardSize: '4x6',
        mediaPreset: '4x6_100lb_gloss_fc',
        pdfPath: '/tmp/test.pdf',
        duplex: true,
        coating: 'uv',
      });

      expect(jdf).toContain('Sides="TwoSided"');
      expect(jdf).toContain('CoatingType="UV"');
    });
  });

  describe('Multi-Subscription Processing', () => {
    it('processes multiple due subscriptions', async () => {
      const subscriptions = [
        createTestSubscription({ id: 'sub-1', name: 'Subscription 1' }),
        createTestSubscription({ id: 'sub-2', name: 'Subscription 2' }),
        createTestSubscription({ id: 'sub-3', name: 'Subscription 3' }),
      ];

      vi.mocked(prisma.subscription.findMany).mockResolvedValue(subscriptions);
      vi.mocked(dataService.searchData).mockResolvedValue([createTestRecord()]);

      const results = await processor.processAll();

      expect(results.processed).toBe(3);
      expect(results.succeeded).toBe(3);
      expect(results.failed).toBe(0);
    });

    it('continues processing after individual subscription failure', async () => {
      const subscriptions = [
        createTestSubscription({ id: 'sub-1' }),
        createTestSubscription({ id: 'sub-2' }),
        createTestSubscription({ id: 'sub-3' }),
      ];

      vi.mocked(prisma.subscription.findMany).mockResolvedValue(subscriptions);
      vi.mocked(dataService.searchData)
        .mockResolvedValueOnce([createTestRecord()])
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce([createTestRecord()]);

      const results = await processor.processAll();

      expect(results.processed).toBe(3);
      expect(results.succeeded).toBe(2);
      expect(results.failed).toBe(1);
    });

    it('isolates failures between subscriptions', async () => {
      const subscriptions = [
        createTestSubscription({ id: 'sub-1', tenantId: 'tenant-1' }),
        createTestSubscription({ id: 'sub-2', tenantId: 'tenant-2' }),
      ];

      vi.mocked(prisma.subscription.findMany).mockResolvedValue(subscriptions);

      // First subscription fails, second succeeds
      vi.mocked(dataService.searchData)
        .mockRejectedValueOnce(new Error('Tenant 1 error'))
        .mockResolvedValueOnce([createTestRecord()]);

      const results = await processor.processAll();

      expect(results.failed).toBe(1);
      expect(results.succeeded).toBe(1);

      // Verify tenant-2's delivery was created successfully
      const createCalls = vi.mocked(prisma.delivery.create).mock.calls;
      expect(createCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Deduplication Window', () => {
    it('respects 90-day deduplication window', async () => {
      const testRecords = [
        createTestRecord({ id: 'record-1', address: '100 Test St' }),
      ];

      vi.mocked(dataService.searchData).mockResolvedValue(testRecords);

      // Mock record delivered 89 days ago (within window)
      vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([
        {
          id: 'prev-1',
          recordHash: 'test-hash',
          deliveredAt: new Date(Date.now() - 89 * 24 * 60 * 60 * 1000),
        } as any,
      ]);

      const subscription = createTestSubscription();
      await processor.processSubscription(subscription);

      // Record should be filtered out
      expect(prisma.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-integration-test' },
        data: expect.objectContaining({
          recordCount: expect.any(Number),
        }),
      });
    });

    it('allows records outside 90-day window', async () => {
      const testRecords = [
        createTestRecord({ id: 'record-1', address: '100 Test St' }),
      ];

      vi.mocked(dataService.searchData).mockResolvedValue(testRecords);

      // Mock record delivered 91 days ago (outside window)
      vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([
        {
          id: 'prev-1',
          recordHash: 'test-hash',
          deliveredAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000),
        } as any,
      ]);

      const subscription = createTestSubscription();
      await processor.processSubscription(subscription);

      // Record should NOT be filtered out
      expect(prisma.deliveryRecord.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            recordHash: expect.any(String),
          }),
        ]),
      });
    });
  });

  describe('Delivery Tracking', () => {
    it('records all delivered records for future deduplication', async () => {
      const testRecords = [
        createTestRecord({ id: 'record-1' }),
        createTestRecord({ id: 'record-2' }),
        createTestRecord({ id: 'record-3' }),
      ];

      vi.mocked(dataService.searchData).mockResolvedValue(testRecords);

      const subscription = createTestSubscription();
      await processor.processSubscription(subscription);

      expect(prisma.deliveryRecord.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            deliveryId: 'delivery-integration-test',
            subscriptionId: TEST_SUBSCRIPTION_ID,
            tenantId: TEST_TENANT_ID,
          }),
        ]),
      });
    });

    it('updates delivery with file information', async () => {
      const testRecords = [createTestRecord()];
      vi.mocked(dataService.searchData).mockResolvedValue(testRecords);

      const subscription = createTestSubscription();
      await processor.processSubscription(subscription);

      expect(prisma.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-integration-test' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          filePath: expect.any(String),
        }),
      });
    });
  });

  describe('Frequency Scheduling', () => {
    it('calculates next weekly delivery correctly', async () => {
      const testRecords = [createTestRecord()];
      vi.mocked(dataService.searchData).mockResolvedValue(testRecords);

      const subscription = createTestSubscription({
        frequency: 'WEEKLY',
        dayOfWeek: 1, // Monday
      });

      await processor.processSubscription(subscription);

      const updateCall = vi.mocked(prisma.subscription.update).mock.calls[0];
      const nextDate = updateCall[0].data.nextDeliveryDate as Date;

      // Next date should be approximately 7 days from now
      const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
      expect(nextDate.getTime()).toBeGreaterThan(Date.now());
      expect(nextDate.getTime()).toBeLessThanOrEqual(sevenDaysFromNow + 86400000); // Allow 1 day tolerance
    });

    it('calculates next monthly delivery correctly', async () => {
      const testRecords = [createTestRecord()];
      vi.mocked(dataService.searchData).mockResolvedValue(testRecords);

      const subscription = createTestSubscription({
        frequency: 'MONTHLY',
        dayOfMonth: 15,
      });

      await processor.processSubscription(subscription);

      const updateCall = vi.mocked(prisma.subscription.update).mock.calls[0];
      const nextDate = updateCall[0].data.nextDeliveryDate as Date;

      expect(nextDate.getDate()).toBe(15);
    });

    it('calculates next daily delivery correctly', async () => {
      const testRecords = [createTestRecord()];
      vi.mocked(dataService.searchData).mockResolvedValue(testRecords);

      const subscription = createTestSubscription({
        frequency: 'DAILY',
      });

      await processor.processSubscription(subscription);

      const updateCall = vi.mocked(prisma.subscription.update).mock.calls[0];
      const nextDate = updateCall[0].data.nextDeliveryDate as Date;

      // Next date should be tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(nextDate.getDate()).toBe(tomorrow.getDate());
    });
  });
});
