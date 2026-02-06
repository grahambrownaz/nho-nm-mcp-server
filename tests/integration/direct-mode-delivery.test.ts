/**
 * Integration Tests for Direct Mode Delivery (Print API Integration)
 *
 * Tests the full flow from subscription trigger through print API
 * fulfillment.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../../src/db/client.js';
import { processSubscription } from '../../src/cron/subscription-processor.js';
import { getDeduplicationService } from '../../src/services/deduplication.js';
import { getPdfGenerator } from '../../src/services/pdf-generator.js';
import {
  getPrintApiProviderOptional,
  configureAndRegisterProvider,
} from '../../src/services/print-api/index.js';

// Test configuration
const TEST_TENANT_ID = 'direct-mode-test-tenant';
const TEST_SUBSCRIPTION_ID = 'direct-mode-test-subscription';
const TEST_TEMPLATE_ID = 'direct-mode-test-template';

// Create mock provider
const mockPrintProvider = {
  name: 'mock_provider',
  displayName: 'Mock Provider',
  isConfigured: vi.fn(() => true),
  initialize: vi.fn(),
  submitJob: vi.fn(),
  getJobStatus: vi.fn(),
  cancelJob: vi.fn(),
};

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

vi.mock('../../src/services/print-api/index.js', () => ({
  getPrintApiProviderOptional: vi.fn(() => mockPrintProvider),
  configureAndRegisterProvider: vi.fn(() => mockPrintProvider),
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
    },
    deliveryRecord: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    deliveryConfig: {
      findFirst: vi.fn(),
    },
    template: {
      findUnique: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
    },
    usageRecord: {
      create: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn(prisma)),
  },
}));

// Test fixtures
function createTestSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_SUBSCRIPTION_ID,
    tenantId: TEST_TENANT_ID,
    name: 'Direct Mode Test Subscription',
    database: 'NHO',
    status: 'ACTIVE',
    frequency: 'WEEKLY',
    nextDeliveryAt: new Date(Date.now() - 3600000),
    geography: { type: 'state', values: ['AZ'] },
    filters: null,
    templateId: TEST_TEMPLATE_ID,
    fulfillmentMethod: 'PRINT_MAIL',
    fulfillmentConfig: null,
    syncChannels: null,
    clientName: null,
    clientEmail: null,
    clientPhone: null,
    totalDeliveries: 0,
    totalRecords: 0,
    template: {
      id: TEST_TEMPLATE_ID,
      name: 'Test Postcard Template',
      htmlFront: '<html><body>Front {{first_name}} {{last_name}}</body></html>',
      htmlBack: '<html><body>{{address}}, {{city}}, {{state}} {{zip}}</body></html>',
      cssStyles: null,
      size: 'SIZE_4X6',
      category: 'GENERAL',
      mergeFields: ['first_name', 'last_name', 'address', 'city', 'state', 'zip'],
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
    address: '456 Oak Avenue',
    city: 'Tempe',
    state: 'AZ',
    zip: '85281',
    move_date: new Date().toISOString(),
    ...overrides,
  };
}

describe('Direct Mode Delivery Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup Prisma mocks
    vi.mocked(prisma.dataSubscription.findMany).mockResolvedValue([createTestSubscription()] as any);
    vi.mocked(prisma.dataSubscription.findUnique).mockResolvedValue(createTestSubscription() as any);
    vi.mocked(prisma.dataSubscription.update).mockResolvedValue(createTestSubscription() as any);
    vi.mocked(prisma.delivery.create).mockResolvedValue({
      id: 'delivery-direct-test',
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
      id: 'delivery-direct-test',
      status: 'COMPLETED',
    } as any);
    vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([]);
    vi.mocked(prisma.deliveryRecord.createMany).mockResolvedValue({ count: 3 });
    vi.mocked(prisma.deliveryConfig.findFirst).mockResolvedValue({
      id: 'config-1',
      tenantId: TEST_TENANT_ID,
      name: 'Print API Config',
      method: 'PRINT_API',
      printApiProvider: 'reminder_media',
      printApiKey: 'encrypted-key',
      printApiSettings: {
        default_mail_class: 'standard',
        return_address: {
          name: 'Test Company',
          address_line_1: '123 Main St',
          city: 'Phoenix',
          state: 'AZ',
          zip: '85001',
        },
      },
      includeJdf: false,
      isActive: true,
      isDefault: true,
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
        createTestRecord({ first_name: 'Record1' }),
        createTestRecord({ first_name: 'Record2' }),
        createTestRecord({ first_name: 'Record3' }),
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

    // Mock Print API provider
    vi.mocked(mockPrintProvider.submitJob).mockResolvedValue({
      success: true,
      externalJobId: 'rm-batch-123',
      estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      cost: 1.95,
      costPerPiece: 0.65,
      recipientCount: 3,
    });
  });

  describe('Print API fulfillment', () => {
    it('processes subscription and creates delivery record', async () => {
      const subscription = createTestSubscription();

      const result = await processSubscription(subscription as any);

      expect(result.success).toBe(true);
      expect(prisma.delivery.create).toHaveBeenCalled();
    });

    it('deduplicates records before processing', async () => {
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

    it('generates PDF when template is configured', async () => {
      const subscription = createTestSubscription();
      const pdfGen = getPdfGenerator();

      await processSubscription(subscription as any);

      expect(pdfGen.generate).toHaveBeenCalled();
    });

    it('calls print API provider for fulfillment', async () => {
      const subscription = createTestSubscription();

      await processSubscription(subscription as any);

      expect(mockPrintProvider.submitJob).toHaveBeenCalled();
    });

    it('marks delivery as completed on success', async () => {
      const subscription = createTestSubscription();

      await processSubscription(subscription as any);

      expect(prisma.delivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'COMPLETED',
          }),
        })
      );
    });
  });

  describe('Fulfillment details storage', () => {
    it('stores external job ID in fulfillment details', async () => {
      const subscription = createTestSubscription();

      await processSubscription(subscription as any);

      expect(prisma.delivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fulfillmentDetails: expect.objectContaining({
              externalJobId: 'rm-batch-123',
            }),
          }),
        })
      );
    });

    it('stores provider name in fulfillment details', async () => {
      const subscription = createTestSubscription();

      await processSubscription(subscription as any);

      expect(prisma.delivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fulfillmentDetails: expect.objectContaining({
              provider: 'mock_provider',
            }),
          }),
        })
      );
    });
  });

  describe('Error handling', () => {
    it('marks delivery as failed on print API error', async () => {
      vi.mocked(mockPrintProvider.submitJob).mockResolvedValue({
        success: false,
        error: 'API connection failed',
        errorCode: 'CONNECTION_ERROR',
      });

      const subscription = createTestSubscription();
      const result = await processSubscription(subscription as any);

      expect(prisma.delivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fulfillmentStatus: 'FAILED',
          }),
        })
      );
    });

    it('continues processing when no delivery config is found', async () => {
      vi.mocked(prisma.deliveryConfig.findFirst).mockResolvedValue(null);

      const subscription = createTestSubscription();
      const result = await processSubscription(subscription as any);

      // Should complete but with NOT_APPLICABLE fulfillment
      expect(prisma.delivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fulfillmentStatus: 'NOT_APPLICABLE',
            status: 'COMPLETED',
          }),
        })
      );
    });
  });

  describe('Deduplication handling', () => {
    it('handles empty unique records gracefully', async () => {
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

    it('records delivered records for future deduplication', async () => {
      const subscription = createTestSubscription();
      const dedupeService = getDeduplicationService();

      await processSubscription(subscription as any);

      expect(dedupeService.recordDeliveries).toHaveBeenCalled();
    });
  });

  describe('Subscription stats update', () => {
    it('updates subscription with next delivery date', async () => {
      const subscription = createTestSubscription();

      await processSubscription(subscription as any);

      expect(prisma.dataSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lastDeliveryAt: expect.any(Date),
            nextDeliveryAt: expect.any(Date),
          }),
        })
      );
    });

    it('increments total deliveries counter', async () => {
      const subscription = createTestSubscription();

      await processSubscription(subscription as any);

      expect(prisma.dataSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalDeliveries: { increment: 1 },
          }),
        })
      );
    });

    it('increments total records counter', async () => {
      const subscription = createTestSubscription();

      await processSubscription(subscription as any);

      expect(prisma.dataSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalRecords: { increment: expect.any(Number) },
          }),
        })
      );
    });
  });
});
