/**
 * Integration Tests for Direct Mode Delivery (Print API Integration)
 *
 * Tests the full flow from subscription trigger through ReminderMedia API
 * and Stripe usage reporting.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { prisma } from '../../src/db/client.js';
import { SubscriptionProcessor } from '../../src/cron/subscription-processor.js';
import { reminderMediaAdapter } from '../../src/services/print-api/remindermedia.js';
import { stripeBillingService } from '../../src/services/stripe-billing.js';
import { dataService } from '../../src/services/data-service.js';
import { pdfGenerator } from '../../src/services/pdf-generator.js';
import { deduplicationService } from '../../src/services/deduplication.js';

// Test configuration
const TEST_TENANT_ID = 'direct-mode-test-tenant';
const TEST_SUBSCRIPTION_ID = 'direct-mode-test-subscription';
const TEST_TEMPLATE_ID = 'direct-mode-test-template';

// Mock all external services
vi.mock('../../src/services/data-service.js', () => ({
  dataService: {
    searchData: vi.fn(),
    getRecordCount: vi.fn(),
  },
}));

vi.mock('../../src/services/print-api/remindermedia.js', () => ({
  reminderMediaAdapter: {
    createPostcard: vi.fn(),
    createBatch: vi.fn(),
    getStatus: vi.fn(),
    cancelJob: vi.fn(),
  },
}));

vi.mock('../../src/services/stripe-billing.js', () => ({
  stripeBillingService: {
    reportUsage: vi.fn(),
  },
}));

vi.mock('../../src/services/pdf-generator.js', () => ({
  pdfGenerator: {
    generatePostcardPdf: vi.fn(),
    generateBatchPdf: vi.fn(),
  },
}));

vi.mock('../../src/services/deduplication.js', () => ({
  deduplicationService: {
    filterDuplicates: vi.fn(),
    recordDelivery: vi.fn(),
  },
}));

// Mock Prisma
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
    },
    deliveryRecord: {
      findMany: vi.fn(),
      createMany: vi.fn(),
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
    name: 'Direct Mode Test Subscription',
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
    fulfillmentMethod: 'PRINT_API',
    deliveryConfig: {
      method: 'PRINT_API',
      provider: 'remindermedia',
      returnAddress: {
        name: 'Test Company',
        address: '123 Main St',
        city: 'Phoenix',
        state: 'AZ',
        zip: '85001',
      },
    },
    recordLimit: 100,
    tenant: {
      id: TEST_TENANT_ID,
      name: 'Direct Mode Test Tenant',
      email: 'test@example.com',
      status: 'ACTIVE',
      stripeCustomerId: 'cus_test_123',
      stripeSubscriptionId: 'sub_test_123',
      subscriptionItems: {
        records: 'si_records_123',
        pdf: 'si_pdf_123',
        print: 'si_print_123',
      },
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
    address: '456 Oak Avenue',
    city: 'Tempe',
    state: 'AZ',
    zip: '85281',
    saleDate: new Date(),
    propertyType: 'Single Family',
    salePrice: 375000,
    ...overrides,
  };
}

describe('Direct Mode Delivery Integration', () => {
  let processor: SubscriptionProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new SubscriptionProcessor();

    // Setup default mocks
    vi.mocked(prisma.subscription.findMany).mockResolvedValue([createTestSubscription()]);
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(createTestSubscription());
    vi.mocked(prisma.subscription.update).mockResolvedValue(createTestSubscription());
    vi.mocked(prisma.delivery.create).mockResolvedValue({
      id: 'delivery-direct-test',
      subscriptionId: TEST_SUBSCRIPTION_ID,
      tenantId: TEST_TENANT_ID,
      status: 'PENDING',
      fulfillmentMethod: 'PRINT_API',
      createdAt: new Date(),
    } as any);
    vi.mocked(prisma.delivery.update).mockResolvedValue({
      id: 'delivery-direct-test',
      status: 'COMPLETED',
    } as any);
    vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([]);
    vi.mocked(prisma.deliveryRecord.createMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      id: TEST_TENANT_ID,
      name: 'Direct Mode Test Tenant',
      status: 'ACTIVE',
      stripeCustomerId: 'cus_test_123',
      subscriptionItems: {
        records: 'si_records_123',
        pdf: 'si_pdf_123',
        print: 'si_print_123',
      },
    } as any);
    vi.mocked(prisma.usageRecord.create).mockResolvedValue({} as any);

    // Mock data service
    vi.mocked(dataService.searchData).mockResolvedValue([
      createTestRecord({ id: 'record-1' }),
      createTestRecord({ id: 'record-2' }),
      createTestRecord({ id: 'record-3' }),
    ]);

    // Mock deduplication
    vi.mocked(deduplicationService.filterDuplicates).mockImplementation((records) =>
      Promise.resolve(records)
    );
    vi.mocked(deduplicationService.recordDelivery).mockResolvedValue(undefined);

    // Mock PDF generation
    vi.mocked(pdfGenerator.generatePostcardPdf).mockResolvedValue({
      pdfUrl: 'https://storage.example.com/postcards/test.pdf',
      frontUrl: 'https://storage.example.com/postcards/test-front.pdf',
      backUrl: 'https://storage.example.com/postcards/test-back.pdf',
    });
    vi.mocked(pdfGenerator.generateBatchPdf).mockResolvedValue({
      pdfPath: '/tmp/batch.pdf',
      pageCount: 6,
    });

    // Mock ReminderMedia API
    vi.mocked(reminderMediaAdapter.createBatch).mockResolvedValue({
      batchId: 'rm-batch-123',
      totalCount: 3,
      successCount: 3,
      failedCount: 0,
      postcards: [
        { id: 'rm-pc-1', status: 'pending', createdAt: new Date() },
        { id: 'rm-pc-2', status: 'pending', createdAt: new Date() },
        { id: 'rm-pc-3', status: 'pending', createdAt: new Date() },
      ],
      failedPostcards: [],
    });
    vi.mocked(reminderMediaAdapter.getStatus).mockResolvedValue({
      id: 'rm-pc-1',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Mock Stripe usage reporting
    vi.mocked(stripeBillingService.reportUsage).mockResolvedValue({} as any);
  });

  describe('Print API fulfillment', () => {
    it('processes subscription with print_api fulfillment', async () => {
      const subscription = createTestSubscription({
        fulfillmentMethod: 'PRINT_API',
      });

      await processor.processSubscription(subscription);

      // Verify data was fetched
      expect(dataService.searchData).toHaveBeenCalled();

      // Verify PDF was generated
      expect(pdfGenerator.generatePostcardPdf).toHaveBeenCalled();

      // Verify ReminderMedia API was called
      expect(reminderMediaAdapter.createBatch).toHaveBeenCalled();

      // Verify delivery was completed
      expect(prisma.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-direct-test' },
        data: expect.objectContaining({
          status: 'COMPLETED',
        }),
      });
    });

    it('calls ReminderMedia API with correct postcard data', async () => {
      const records = [
        createTestRecord({
          firstName: 'Alice',
          lastName: 'Johnson',
          address: '100 First St',
          city: 'Phoenix',
          state: 'AZ',
          zip: '85001',
        }),
        createTestRecord({
          firstName: 'Bob',
          lastName: 'Williams',
          address: '200 Second St',
          city: 'Tempe',
          state: 'AZ',
          zip: '85281',
        }),
      ];

      vi.mocked(dataService.searchData).mockResolvedValue(records);

      const subscription = createTestSubscription();
      await processor.processSubscription(subscription);

      expect(reminderMediaAdapter.createBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          postcards: expect.arrayContaining([
            expect.objectContaining({
              size: '4x6',
              recipient: expect.objectContaining({
                name: 'Alice Johnson',
                address: '100 First St',
                city: 'Phoenix',
                state: 'AZ',
                zip: '85001',
              }),
            }),
            expect.objectContaining({
              recipient: expect.objectContaining({
                name: 'Bob Williams',
              }),
            }),
          ]),
        })
      );
    });

    it('includes return address in API call', async () => {
      const subscription = createTestSubscription({
        deliveryConfig: {
          method: 'PRINT_API',
          provider: 'remindermedia',
          returnAddress: {
            name: 'Acme Realty',
            address: '789 Business Blvd',
            city: 'Scottsdale',
            state: 'AZ',
            zip: '85251',
          },
        },
      });

      await processor.processSubscription(subscription);

      expect(reminderMediaAdapter.createBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          postcards: expect.arrayContaining([
            expect.objectContaining({
              returnAddress: expect.objectContaining({
                name: 'Acme Realty',
                address: '789 Business Blvd',
              }),
            }),
          ]),
        })
      );
    });
  });

  describe('job ID storage', () => {
    it('stores job ID in delivery record', async () => {
      const subscription = createTestSubscription();
      await processor.processSubscription(subscription);

      expect(prisma.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-direct-test' },
        data: expect.objectContaining({
          fulfillmentDetails: expect.objectContaining({
            printApiJobId: 'rm-batch-123',
            provider: 'remindermedia',
          }),
        }),
      });
    });

    it('stores individual postcard IDs', async () => {
      const subscription = createTestSubscription();
      await processor.processSubscription(subscription);

      expect(prisma.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-direct-test' },
        data: expect.objectContaining({
          fulfillmentDetails: expect.objectContaining({
            postcardIds: ['rm-pc-1', 'rm-pc-2', 'rm-pc-3'],
          }),
        }),
      });
    });
  });

  describe('Stripe usage reporting', () => {
    it('reports usage to Stripe after successful delivery', async () => {
      const records = [
        createTestRecord(),
        createTestRecord(),
        createTestRecord(),
      ];
      vi.mocked(dataService.searchData).mockResolvedValue(records);

      const subscription = createTestSubscription();
      await processor.processSubscription(subscription);

      // Verify records usage reported
      expect(stripeBillingService.reportUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionItemId: 'si_records_123',
          quantity: 3,
        })
      );

      // Verify PDF usage reported
      expect(stripeBillingService.reportUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionItemId: 'si_pdf_123',
          quantity: 3,
        })
      );

      // Verify print usage reported
      expect(stripeBillingService.reportUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionItemId: 'si_print_123',
          quantity: 3,
        })
      );
    });

    it('includes idempotency key in usage report', async () => {
      const subscription = createTestSubscription();
      await processor.processSubscription(subscription);

      expect(stripeBillingService.reportUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: expect.stringContaining('delivery-direct-test'),
        })
      );
    });

    it('creates usage record in database', async () => {
      const subscription = createTestSubscription();
      await processor.processSubscription(subscription);

      expect(prisma.usageRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: TEST_TENANT_ID,
          deliveryId: 'delivery-direct-test',
        }),
      });
    });
  });

  describe('partial batch failure handling', () => {
    it('handles partial batch failures', async () => {
      vi.mocked(reminderMediaAdapter.createBatch).mockResolvedValue({
        batchId: 'rm-batch-partial',
        totalCount: 3,
        successCount: 2,
        failedCount: 1,
        postcards: [
          { id: 'rm-pc-1', status: 'pending', createdAt: new Date() },
          { id: 'rm-pc-2', status: 'pending', createdAt: new Date() },
        ],
        failedPostcards: [
          {
            index: 2,
            error: 'Invalid address',
            originalRequest: createTestRecord(),
          },
        ],
      });

      const subscription = createTestSubscription();
      await processor.processSubscription(subscription);

      // Should still complete but log failures
      expect(prisma.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-direct-test' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          fulfillmentDetails: expect.objectContaining({
            successCount: 2,
            failedCount: 1,
          }),
        }),
      });
    });

    it('only reports successful postcards to Stripe', async () => {
      vi.mocked(reminderMediaAdapter.createBatch).mockResolvedValue({
        batchId: 'rm-batch-partial',
        totalCount: 5,
        successCount: 3,
        failedCount: 2,
        postcards: [
          { id: 'rm-pc-1', status: 'pending', createdAt: new Date() },
          { id: 'rm-pc-2', status: 'pending', createdAt: new Date() },
          { id: 'rm-pc-3', status: 'pending', createdAt: new Date() },
        ],
        failedPostcards: [],
      });

      const subscription = createTestSubscription();
      await processor.processSubscription(subscription);

      // Should only report 3 print jobs (successful ones)
      expect(stripeBillingService.reportUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionItemId: 'si_print_123',
          quantity: 3,
        })
      );
    });
  });

  describe('error handling', () => {
    it('marks delivery as failed on API error', async () => {
      vi.mocked(reminderMediaAdapter.createBatch).mockRejectedValue(
        new Error('API connection failed')
      );

      const subscription = createTestSubscription();

      await expect(processor.processSubscription(subscription)).rejects.toThrow();

      expect(prisma.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-direct-test' },
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: expect.stringContaining('API connection failed'),
        }),
      });
    });

    it('does not report usage on failure', async () => {
      vi.mocked(reminderMediaAdapter.createBatch).mockRejectedValue(
        new Error('API error')
      );

      const subscription = createTestSubscription();

      await expect(processor.processSubscription(subscription)).rejects.toThrow();

      // Stripe usage should not be reported
      expect(stripeBillingService.reportUsage).not.toHaveBeenCalled();
    });

    it('retries on transient API errors', async () => {
      vi.mocked(reminderMediaAdapter.createBatch)
        .mockRejectedValueOnce(new Error('Connection timeout'))
        .mockResolvedValueOnce({
          batchId: 'rm-batch-retry',
          totalCount: 3,
          successCount: 3,
          failedCount: 0,
          postcards: [
            { id: 'rm-pc-1', status: 'pending', createdAt: new Date() },
            { id: 'rm-pc-2', status: 'pending', createdAt: new Date() },
            { id: 'rm-pc-3', status: 'pending', createdAt: new Date() },
          ],
          failedPostcards: [],
        });

      const subscription = createTestSubscription();
      await processor.processSubscription(subscription);

      expect(reminderMediaAdapter.createBatch).toHaveBeenCalledTimes(2);
      expect(prisma.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-direct-test' },
        data: expect.objectContaining({
          status: 'COMPLETED',
        }),
      });
    });
  });

  describe('postcard size variations', () => {
    it('handles 4x6 postcards', async () => {
      const subscription = createTestSubscription({ postcardSize: '4x6' });
      await processor.processSubscription(subscription);

      expect(reminderMediaAdapter.createBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          postcards: expect.arrayContaining([
            expect.objectContaining({ size: '4x6' }),
          ]),
        })
      );
    });

    it('handles 6x9 postcards', async () => {
      const subscription = createTestSubscription({ postcardSize: '6x9' });
      await processor.processSubscription(subscription);

      expect(reminderMediaAdapter.createBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          postcards: expect.arrayContaining([
            expect.objectContaining({ size: '6x9' }),
          ]),
        })
      );
    });

    it('handles 6x11 postcards', async () => {
      const subscription = createTestSubscription({ postcardSize: '6x11' });
      await processor.processSubscription(subscription);

      expect(reminderMediaAdapter.createBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          postcards: expect.arrayContaining([
            expect.objectContaining({ size: '6x11' }),
          ]),
        })
      );
    });
  });

  describe('template merging', () => {
    it('generates personalized PDFs for each record', async () => {
      const records = [
        createTestRecord({ firstName: 'Alice', lastName: 'Smith' }),
        createTestRecord({ firstName: 'Bob', lastName: 'Jones' }),
      ];
      vi.mocked(dataService.searchData).mockResolvedValue(records);

      const subscription = createTestSubscription();
      await processor.processSubscription(subscription);

      expect(pdfGenerator.generatePostcardPdf).toHaveBeenCalledTimes(2);
      expect(pdfGenerator.generatePostcardPdf).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: TEST_TEMPLATE_ID,
          data: expect.objectContaining({
            firstName: 'Alice',
            lastName: 'Smith',
          }),
        })
      );
    });
  });

  describe('metadata tracking', () => {
    it('includes subscription metadata in API call', async () => {
      const subscription = createTestSubscription();
      await processor.processSubscription(subscription);

      expect(reminderMediaAdapter.createBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            subscriptionId: TEST_SUBSCRIPTION_ID,
            tenantId: TEST_TENANT_ID,
            deliveryId: 'delivery-direct-test',
          }),
        })
      );
    });
  });
});
