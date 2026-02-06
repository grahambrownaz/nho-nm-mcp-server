/**
 * Integration Tests for Delivery Pipeline
 *
 * Tests the full flow from subscription trigger through data fetching,
 * deduplication, PDF generation, and SFTP delivery.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../src/db/client.js';
import { processSubscription, processAllDueSubscriptions } from '../../src/cron/subscription-processor.js';
import { getDeduplicationService } from '../../src/services/deduplication.js';
import { getPdfGenerator } from '../../src/services/pdf-generator.js';
import { getJdfGenerator } from '../../src/services/jdf-generator.js';
import { getSftpDeliveryService } from '../../src/services/sftp-delivery.js';
import fs from 'fs/promises';

// Test configuration
const TEST_TENANT_ID = 'integration-test-tenant';
const TEST_SUBSCRIPTION_ID = 'integration-test-subscription';
const TEST_TEMPLATE_ID = 'integration-test-template';
const TEST_OUTPUT_DIR = '/tmp/nho-integration-tests';

// Mock external services
vi.mock('../../src/services/deduplication.js', () => {
  const mockDedupeService = {
    deduplicateRecords: vi.fn(),
    recordDeliveries: vi.fn(),
    setDefaultWindow: vi.fn(),
  };
  return {
    getDeduplicationService: vi.fn(() => mockDedupeService),
    DeduplicationService: vi.fn(() => mockDedupeService),
    generateRecordHash: vi.fn(() => 'mock-hash'),
  };
});

vi.mock('../../src/services/pdf-generator.js', () => {
  const mockPdfGenerator = {
    initialize: vi.fn(),
    generate: vi.fn(),
    close: vi.fn(),
    generatePreview: vi.fn(),
  };
  return {
    getPdfGenerator: vi.fn(() => mockPdfGenerator),
    PDFGenerator: vi.fn(() => mockPdfGenerator),
  };
});

vi.mock('../../src/services/jdf-generator.js', () => {
  const mockJdfGenerator = {
    generate: vi.fn(),
    generateSimplified: vi.fn(),
    getPresets: vi.fn(() => ({})),
    getPreset: vi.fn(),
  };
  return {
    getJdfGenerator: vi.fn(() => mockJdfGenerator),
    JdfGenerator: vi.fn(() => mockJdfGenerator),
    JDF_PRESETS: {},
  };
});

vi.mock('../../src/services/sftp-delivery.js', () => {
  const mockSftpService = {
    uploadFile: vi.fn(),
    uploadBuffer: vi.fn(),
    uploadBatch: vi.fn(),
    testConnection: vi.fn(),
  };
  return {
    getSftpDeliveryService: vi.fn(() => mockSftpService),
    SftpDeliveryService: vi.fn(() => mockSftpService),
  };
});

vi.mock('../../src/services/print-api/index.js', () => ({
  getPrintApiProviderOptional: vi.fn(() => null),
  configureAndRegisterProvider: vi.fn(),
}));

vi.mock('../../src/services/encryption.js', () => ({
  decrypt: vi.fn((val) => val),
  encrypt: vi.fn((val) => val),
}));

vi.mock('../../src/services/platform-sync/index.js', () => ({
  syncToPlatform: vi.fn(),
}));

// Mock Prisma
vi.mock('../../src/db/client.js', () => ({
  prisma: {
    dataSubscription: {
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
    deliveryConfig: {
      findFirst: vi.fn(),
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

// Test fixtures
function createTestSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_SUBSCRIPTION_ID,
    tenantId: TEST_TENANT_ID,
    name: 'Integration Test Subscription',
    database: 'NHO',
    status: 'ACTIVE',
    frequency: 'WEEKLY',
    nextDeliveryAt: new Date(Date.now() - 3600000),
    geography: { type: 'state', values: ['AZ'] },
    filters: null,
    templateId: TEST_TEMPLATE_ID,
    fulfillmentMethod: 'DOWNLOAD',
    fulfillmentConfig: null,
    syncChannels: null,
    clientName: null,
    totalDeliveries: 0,
    totalRecords: 0,
    template: {
      id: TEST_TEMPLATE_ID,
      name: 'Test Postcard Template',
      htmlFront: '<html><body>Front {{first_name}} {{last_name}}</body></html>',
      htmlBack: '<html><body>{{address}}, {{city}}, {{state}} {{zip}}</body></html>',
      cssStyles: null,
      size: 'SIZE_4X6',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createTestRecord(overrides: Record<string, unknown> = {}) {
  return {
    first_name: 'John',
    last_name: 'Smith',
    address: '123 Main Street',
    city: 'Phoenix',
    state: 'AZ',
    zip: '85001',
    move_date: new Date().toISOString(),
    ...overrides,
  };
}

describe('Delivery Pipeline Integration', () => {
  beforeAll(async () => {
    // Create test output directory
    await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup Prisma mocks
    vi.mocked(prisma.dataSubscription.findMany).mockResolvedValue([createTestSubscription()] as any);
    vi.mocked(prisma.dataSubscription.findUnique).mockResolvedValue(createTestSubscription() as any);
    vi.mocked(prisma.dataSubscription.update).mockResolvedValue(createTestSubscription() as any);
    vi.mocked(prisma.delivery.create).mockResolvedValue({
      id: 'delivery-integration-test',
      dataSubscriptionId: TEST_SUBSCRIPTION_ID,
      tenantId: TEST_TENANT_ID,
      status: 'PROCESSING',
      recordCount: 3,
      newRecordsCount: 3,
      duplicatesRemoved: 0,
      dataCost: 0.15,
      pdfCost: 0,
      fulfillmentCost: 0,
      totalCost: 0.15,
      scheduledAt: new Date(),
      startedAt: new Date(),
      createdAt: new Date(),
    } as any);
    vi.mocked(prisma.delivery.update).mockResolvedValue({
      id: 'delivery-integration-test',
      status: 'COMPLETED',
    } as any);
    vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([]);
    vi.mocked(prisma.deliveryRecord.createMany).mockResolvedValue({ count: 3 });
    vi.mocked(prisma.deliveryConfig.findFirst).mockResolvedValue({
      id: 'config-1',
      tenantId: TEST_TENANT_ID,
      name: 'SFTP Config',
      method: 'SFTP_HOT_FOLDER',
      sftpHost: 'sftp.test.com',
      sftpPort: 22,
      sftpUsername: 'testuser',
      sftpPassword: 'encrypted-password',
      sftpFolderPath: '/incoming',
      includeJdf: true,
      jdfPreset: '4x6_100lb_gloss_fc',
      isActive: true,
      isDefault: true,
    } as any);
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      id: TEST_TENANT_ID,
      name: 'Integration Test Tenant',
      status: 'ACTIVE',
    } as any);
    vi.mocked(prisma.template.findUnique).mockResolvedValue({
      id: TEST_TEMPLATE_ID,
      name: 'Test Template',
      htmlFront: '<div>{{first_name}}</div>',
      htmlBack: null,
      cssStyles: null,
      size: 'SIZE_4X6',
    } as any);

    // Mock deduplication service
    const dedupeService = getDeduplicationService();
    vi.mocked(dedupeService.deduplicateRecords).mockResolvedValue({
      originalCount: 3,
      uniqueCount: 3,
      duplicateCount: 0,
      uniqueRecords: [
        createTestRecord({ first_name: 'John', last_name: 'Doe' }),
        createTestRecord({ first_name: 'Jane', last_name: 'Smith' }),
        createTestRecord({ first_name: 'Bob', last_name: 'Johnson' }),
      ],
      duplicateHashes: [],
    });
    vi.mocked(dedupeService.recordDeliveries).mockResolvedValue(3);

    // Mock PDF generation
    const pdfGen = getPdfGenerator();
    vi.mocked(pdfGen.generate).mockResolvedValue({
      success: true,
      jobId: 'pdf-job-1',
      files: ['/tmp/postcards.pdf'],
      recordCount: 3,
      pageCount: 6,
      errors: [],
    });

    // Mock JDF generation
    const jdfGen = getJdfGenerator();
    vi.mocked(jdfGen.generate).mockReturnValue({
      success: true,
      xml: '<?xml version="1.0"?><JDF></JDF>',
      jobId: 'jdf-job-1',
      preset: {
        name: '4x6 100lb Gloss',
        media: { type: 'Paper', weight: 148, coating: 'Glossy', colorType: 'FullColor' },
        dimensions: { width: 6, height: 4 },
      },
    });

    // Mock SFTP service
    const sftpService = getSftpDeliveryService();
    vi.mocked(sftpService.uploadFile).mockResolvedValue({
      success: true,
      localPath: '/tmp/test.pdf',
      remotePath: '/incoming/test.pdf',
      fileSize: 12345,
      uploadedAt: new Date(),
    });
    vi.mocked(sftpService.uploadBuffer).mockResolvedValue({
      success: true,
      localPath: '[buffer]',
      remotePath: '/incoming/test.jdf',
      fileSize: 1234,
      uploadedAt: new Date(),
    });
  });

  afterAll(async () => {
    // Cleanup test output directory
    try {
      await fs.rm(TEST_OUTPUT_DIR, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Full Delivery Pipeline', () => {
    it('executes complete pipeline from subscription to delivery', async () => {
      const subscription = createTestSubscription();
      const result = await processSubscription(subscription as any);

      expect(result.success).toBe(true);
      expect(result.recordCount).toBeGreaterThan(0);
      expect(prisma.delivery.create).toHaveBeenCalled();
      expect(prisma.delivery.update).toHaveBeenCalled();
    });

    it('performs deduplication against history', async () => {
      const subscription = createTestSubscription();
      const dedupeService = getDeduplicationService();

      await processSubscription(subscription as any);

      expect(dedupeService.deduplicateRecords).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        TEST_SUBSCRIPTION_ID,
        expect.any(Array),
        90
      );
    });

    it('handles empty data results gracefully', async () => {
      const dedupeService = getDeduplicationService();
      vi.mocked(dedupeService.deduplicateRecords).mockResolvedValue({
        originalCount: 0,
        uniqueCount: 0,
        duplicateCount: 0,
        uniqueRecords: [],
        duplicateHashes: [],
      });

      const subscription = createTestSubscription();
      const result = await processSubscription(subscription as any);

      expect(result.success).toBe(true);
      expect(result.newRecordCount).toBe(0);
    });

    it('handles all records filtered as duplicates', async () => {
      const dedupeService = getDeduplicationService();
      vi.mocked(dedupeService.deduplicateRecords).mockResolvedValue({
        originalCount: 3,
        uniqueCount: 0,
        duplicateCount: 3,
        uniqueRecords: [],
        duplicateHashes: ['hash1', 'hash2', 'hash3'],
      });

      const subscription = createTestSubscription();
      const result = await processSubscription(subscription as any);

      expect(result.success).toBe(true);
      expect(result.newRecordCount).toBe(0);
      expect(result.duplicatesRemoved).toBe(3);
    });
  });

  describe('Pipeline Error Recovery', () => {
    it('marks delivery as failed on error', async () => {
      const dedupeService = getDeduplicationService();
      vi.mocked(dedupeService.deduplicateRecords).mockRejectedValue(new Error('Database connection failed'));

      const subscription = createTestSubscription();
      const result = await processSubscription(subscription as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection failed');
    });

    it('handles SFTP connection error', async () => {
      const sftpService = getSftpDeliveryService();
      vi.mocked(sftpService.uploadFile).mockResolvedValue({
        success: false,
        localPath: '/tmp/test.pdf',
        remotePath: '/incoming/test.pdf',
        fileSize: 0,
        uploadedAt: new Date(),
        error: 'Connection refused',
      });

      const subscription = createTestSubscription();
      const result = await processSubscription(subscription as any);

      // Note: The current implementation handles SFTP errors gracefully
      // and marks the delivery as successful even when SFTP fails.
      // The SFTP error is logged but doesn't fail the overall delivery.
      expect(result.success).toBe(true);
    });
  });

  describe('JDF Integration', () => {
    it('generates JDF ticket when configured', async () => {
      const subscription = createTestSubscription();
      const jdfGen = getJdfGenerator();

      await processSubscription(subscription as any);

      expect(jdfGen.generate).toHaveBeenCalled();
    });

    it('skips JDF when not configured', async () => {
      vi.mocked(prisma.deliveryConfig.findFirst).mockResolvedValue({
        id: 'config-1',
        method: 'SFTP_HOT_FOLDER',
        includeJdf: false,
        isActive: true,
      } as any);

      const subscription = createTestSubscription();
      const jdfGen = getJdfGenerator();

      await processSubscription(subscription as any);

      expect(jdfGen.generate).not.toHaveBeenCalled();
    });
  });

  describe('Multi-Subscription Processing', () => {
    it('processes multiple due subscriptions', async () => {
      const subscriptions = [
        createTestSubscription({ id: 'sub-1', name: 'Subscription 1' }),
        createTestSubscription({ id: 'sub-2', name: 'Subscription 2' }),
        createTestSubscription({ id: 'sub-3', name: 'Subscription 3' }),
      ];

      vi.mocked(prisma.dataSubscription.findMany).mockResolvedValue(subscriptions as any);

      const results = await processAllDueSubscriptions();

      expect(results.processed).toBe(3);
      expect(results.successful).toBe(3);
      expect(results.failed).toBe(0);
    });

    it('continues processing after individual subscription failure', async () => {
      const subscriptions = [
        createTestSubscription({ id: 'sub-1' }),
        createTestSubscription({ id: 'sub-2' }),
        createTestSubscription({ id: 'sub-3' }),
      ];

      vi.mocked(prisma.dataSubscription.findMany).mockResolvedValue(subscriptions as any);

      const dedupeService = getDeduplicationService();
      vi.mocked(dedupeService.deduplicateRecords)
        .mockResolvedValueOnce({
          originalCount: 3,
          uniqueCount: 3,
          duplicateCount: 0,
          uniqueRecords: [createTestRecord()],
          duplicateHashes: [],
        })
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({
          originalCount: 3,
          uniqueCount: 3,
          duplicateCount: 0,
          uniqueRecords: [createTestRecord()],
          duplicateHashes: [],
        });

      const results = await processAllDueSubscriptions();

      expect(results.processed).toBe(3);
      expect(results.successful).toBe(2);
      expect(results.failed).toBe(1);
    });

    it('isolates failures between subscriptions', async () => {
      const subscriptions = [
        createTestSubscription({ id: 'sub-1', tenantId: 'tenant-1' }),
        createTestSubscription({ id: 'sub-2', tenantId: 'tenant-2' }),
      ];

      vi.mocked(prisma.dataSubscription.findMany).mockResolvedValue(subscriptions as any);

      const dedupeService = getDeduplicationService();
      vi.mocked(dedupeService.deduplicateRecords)
        .mockRejectedValueOnce(new Error('Tenant 1 error'))
        .mockResolvedValueOnce({
          originalCount: 3,
          uniqueCount: 3,
          duplicateCount: 0,
          uniqueRecords: [createTestRecord()],
          duplicateHashes: [],
        });

      const results = await processAllDueSubscriptions();

      expect(results.failed).toBe(1);
      expect(results.successful).toBe(1);
    });
  });

  describe('Delivery Tracking', () => {
    it('records delivered records for deduplication', async () => {
      const subscription = createTestSubscription();
      const dedupeService = getDeduplicationService();

      await processSubscription(subscription as any);

      expect(dedupeService.recordDeliveries).toHaveBeenCalled();
    });

    it('updates delivery with completion status', async () => {
      const subscription = createTestSubscription();

      await processSubscription(subscription as any);

      expect(prisma.delivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'COMPLETED',
            completedAt: expect.any(Date),
          }),
        })
      );
    });
  });

  describe('Frequency Scheduling', () => {
    it('calculates next weekly delivery', async () => {
      const subscription = createTestSubscription({ frequency: 'WEEKLY' });

      await processSubscription(subscription as any);

      expect(prisma.dataSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nextDeliveryAt: expect.any(Date),
          }),
        })
      );

      const updateCall = vi.mocked(prisma.dataSubscription.update).mock.calls[0];
      const nextDate = updateCall[0].data.nextDeliveryAt as Date;

      // Next date should be in the future
      expect(nextDate.getTime()).toBeGreaterThan(Date.now());
    });

    it('calculates next monthly delivery', async () => {
      const subscription = createTestSubscription({ frequency: 'MONTHLY' });

      await processSubscription(subscription as any);

      const updateCall = vi.mocked(prisma.dataSubscription.update).mock.calls[0];
      const nextDate = updateCall[0].data.nextDeliveryAt as Date;

      // Next date should be on the 1st of next month
      expect(nextDate.getDate()).toBe(1);
    });

    it('calculates next daily delivery', async () => {
      const subscription = createTestSubscription({ frequency: 'DAILY' });

      await processSubscription(subscription as any);

      const updateCall = vi.mocked(prisma.dataSubscription.update).mock.calls[0];
      const nextDate = updateCall[0].data.nextDeliveryAt as Date;

      // Next date should be tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(nextDate.getDate()).toBe(tomorrow.getDate());
    });
  });
});
