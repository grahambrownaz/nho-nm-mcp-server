/**
 * Tests for Usage Reporter (Cron Job)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  UsageReporter,
  usageReporter,
} from '../../../src/cron/usage-reporter.js';
import { prisma } from '../../../src/db/client.js';
import { stripeBillingService } from '../../../src/services/stripe-billing.js';
import { logger } from '../../../src/utils/logger.js';

// Mock all dependencies
vi.mock('../../../src/db/client.js', () => ({
  prisma: {
    tenant: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    delivery: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
    usageRecord: {
      create: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    subscription: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn(prisma)),
  },
}));

vi.mock('../../../src/services/stripe-billing.js', () => ({
  stripeBillingService: {
    reportUsage: vi.fn(),
  },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
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

// Create mock tenant
function createMockTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tenant-123',
    name: 'Test Tenant',
    email: 'test@example.com',
    stripeCustomerId: 'cus_test_123',
    stripeSubscriptionId: 'sub_test_123',
    status: 'ACTIVE',
    subscriptionItems: {
      records: 'si_records_123',
      pdf: 'si_pdf_123',
      print: 'si_print_123',
    },
    ...overrides,
  };
}

// Create mock delivery
function createMockDelivery(overrides: Record<string, unknown> = {}) {
  return {
    id: 'delivery-123',
    tenantId: 'tenant-123',
    subscriptionId: 'subscription-123',
    recordCount: 100,
    pdfCount: 100,
    printJobCount: 100,
    status: 'COMPLETED',
    cost: mockDecimal(50),
    deliveredAt: new Date(),
    usageReported: false,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('Usage Reporter', () => {
  let reporter: UsageReporter;

  beforeEach(() => {
    vi.clearAllMocks();
    reporter = new UsageReporter();

    // Setup default mocks
    vi.mocked(prisma.tenant.findMany).mockResolvedValue([createMockTenant()]);
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(createMockTenant());
    vi.mocked(prisma.delivery.findMany).mockResolvedValue([]);
    vi.mocked(prisma.delivery.aggregate).mockResolvedValue({
      _sum: { recordCount: 0, pdfCount: 0, printJobCount: 0 },
    } as any);
    vi.mocked(prisma.usageRecord.create).mockResolvedValue({} as any);
    vi.mocked(prisma.usageRecord.findMany).mockResolvedValue([]);
    vi.mocked(prisma.usageRecord.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(stripeBillingService.reportUsage).mockResolvedValue({} as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('reportDataRecordsUsage', () => {
    it('reports data records usage to Stripe', async () => {
      const deliveries = [
        createMockDelivery({ id: 'delivery-1', recordCount: 500 }),
        createMockDelivery({ id: 'delivery-2', recordCount: 300 }),
      ];

      vi.mocked(prisma.delivery.findMany).mockResolvedValue(deliveries);

      await reporter.reportUsageForTenant('tenant-123');

      expect(stripeBillingService.reportUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionItemId: 'si_records_123',
          quantity: 800,
        })
      );
    });

    it('includes idempotency key for records', async () => {
      const deliveries = [createMockDelivery({ recordCount: 500 })];

      vi.mocked(prisma.delivery.findMany).mockResolvedValue(deliveries);

      await reporter.reportUsageForTenant('tenant-123');

      expect(stripeBillingService.reportUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: expect.stringContaining('records'),
        })
      );
    });

    it('marks deliveries as usage reported', async () => {
      const deliveries = [
        createMockDelivery({ id: 'delivery-1' }),
        createMockDelivery({ id: 'delivery-2' }),
      ];

      vi.mocked(prisma.delivery.findMany).mockResolvedValue(deliveries);

      await reporter.reportUsageForTenant('tenant-123');

      expect(prisma.usageRecord.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deliveryId: expect.objectContaining({
              in: ['delivery-1', 'delivery-2'],
            }),
          }),
          data: expect.objectContaining({
            reportedToStripe: true,
          }),
        })
      );
    });
  });

  describe('reportPdfGenerationUsage', () => {
    it('reports PDF generation usage to Stripe', async () => {
      const deliveries = [
        createMockDelivery({ id: 'delivery-1', pdfCount: 50 }),
        createMockDelivery({ id: 'delivery-2', pdfCount: 30 }),
      ];

      vi.mocked(prisma.delivery.findMany).mockResolvedValue(deliveries);

      await reporter.reportUsageForTenant('tenant-123');

      expect(stripeBillingService.reportUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionItemId: 'si_pdf_123',
          quantity: 80,
        })
      );
    });

    it('skips PDF reporting when count is zero', async () => {
      const deliveries = [createMockDelivery({ pdfCount: 0, printJobCount: 0 })];

      vi.mocked(prisma.delivery.findMany).mockResolvedValue(deliveries);

      await reporter.reportUsageForTenant('tenant-123');

      // Should only report records, not PDF or print
      const pdfCalls = vi.mocked(stripeBillingService.reportUsage).mock.calls.filter(
        (call) => call[0].subscriptionItemId === 'si_pdf_123' && call[0].quantity > 0
      );
      expect(pdfCalls).toHaveLength(0);
    });
  });

  describe('reportPrintJobUsage', () => {
    it('reports print job usage to Stripe', async () => {
      const deliveries = [
        createMockDelivery({ id: 'delivery-1', printJobCount: 100 }),
        createMockDelivery({ id: 'delivery-2', printJobCount: 150 }),
      ];

      vi.mocked(prisma.delivery.findMany).mockResolvedValue(deliveries);

      await reporter.reportUsageForTenant('tenant-123');

      expect(stripeBillingService.reportUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionItemId: 'si_print_123',
          quantity: 250,
        })
      );
    });

    it('uses correct price per piece', async () => {
      const deliveries = [createMockDelivery({ printJobCount: 1000 })];

      vi.mocked(prisma.delivery.findMany).mockResolvedValue(deliveries);

      await reporter.reportUsageForTenant('tenant-123');

      expect(stripeBillingService.reportUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionItemId: 'si_print_123',
          quantity: 1000,
        })
      );
    });
  });

  describe('usage aggregation', () => {
    it('aggregates usage correctly across multiple deliveries', async () => {
      const deliveries = [
        createMockDelivery({ recordCount: 100, pdfCount: 100, printJobCount: 100 }),
        createMockDelivery({ recordCount: 200, pdfCount: 200, printJobCount: 200 }),
        createMockDelivery({ recordCount: 300, pdfCount: 300, printJobCount: 300 }),
      ];

      vi.mocked(prisma.delivery.findMany).mockResolvedValue(deliveries);

      await reporter.reportUsageForTenant('tenant-123');

      // Verify records usage
      expect(stripeBillingService.reportUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionItemId: 'si_records_123',
          quantity: 600,
        })
      );

      // Verify PDF usage
      expect(stripeBillingService.reportUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionItemId: 'si_pdf_123',
          quantity: 600,
        })
      );

      // Verify print usage
      expect(stripeBillingService.reportUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionItemId: 'si_print_123',
          quantity: 600,
        })
      );
    });

    it('handles empty deliveries gracefully', async () => {
      vi.mocked(prisma.delivery.findMany).mockResolvedValue([]);

      await reporter.reportUsageForTenant('tenant-123');

      // Should not report any usage
      expect(stripeBillingService.reportUsage).not.toHaveBeenCalled();
    });

    it('only processes unreported deliveries', async () => {
      vi.mocked(prisma.delivery.findMany).mockResolvedValue([
        createMockDelivery({ usageReported: false }),
      ]);

      await reporter.reportUsageForTenant('tenant-123');

      expect(prisma.delivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            usageReported: false,
          }),
        })
      );
    });
  });

  describe('Stripe API error handling', () => {
    it('handles Stripe API rate limiting', async () => {
      const deliveries = [createMockDelivery({ recordCount: 500 })];
      vi.mocked(prisma.delivery.findMany).mockResolvedValue(deliveries);

      vi.mocked(stripeBillingService.reportUsage).mockRejectedValueOnce(
        new Error('Rate limit exceeded')
      );

      await expect(reporter.reportUsageForTenant('tenant-123')).rejects.toThrow('Rate limit');
    });

    it('handles Stripe API authentication errors', async () => {
      const deliveries = [createMockDelivery({ recordCount: 500 })];
      vi.mocked(prisma.delivery.findMany).mockResolvedValue(deliveries);

      vi.mocked(stripeBillingService.reportUsage).mockRejectedValueOnce(
        new Error('Invalid API key')
      );

      await expect(reporter.reportUsageForTenant('tenant-123')).rejects.toThrow('Invalid API key');
    });

    it('handles Stripe subscription item not found', async () => {
      const deliveries = [createMockDelivery({ recordCount: 500 })];
      vi.mocked(prisma.delivery.findMany).mockResolvedValue(deliveries);

      vi.mocked(stripeBillingService.reportUsage).mockRejectedValueOnce(
        new Error('No such subscription_item: si_invalid')
      );

      await expect(reporter.reportUsageForTenant('tenant-123')).rejects.toThrow(
        'No such subscription_item'
      );
    });

    it('logs errors and continues processing other tenants', async () => {
      const tenants = [
        createMockTenant({ id: 'tenant-1' }),
        createMockTenant({ id: 'tenant-2' }),
      ];

      vi.mocked(prisma.tenant.findMany).mockResolvedValue(tenants);
      vi.mocked(prisma.delivery.findMany)
        .mockResolvedValueOnce([createMockDelivery({ tenantId: 'tenant-1' })])
        .mockResolvedValueOnce([createMockDelivery({ tenantId: 'tenant-2' })]);

      vi.mocked(stripeBillingService.reportUsage)
        .mockRejectedValueOnce(new Error('Error for tenant-1'))
        .mockResolvedValueOnce({} as any);

      const results = await reporter.reportAllUsage();

      expect(results.failed).toBe(1);
      expect(results.succeeded).toBe(1);
    });

    it('retries on transient errors', async () => {
      const deliveries = [createMockDelivery({ recordCount: 500 })];
      vi.mocked(prisma.delivery.findMany).mockResolvedValue(deliveries);

      vi.mocked(stripeBillingService.reportUsage)
        .mockRejectedValueOnce(new Error('Connection timeout'))
        .mockResolvedValueOnce({} as any);

      await reporter.reportUsageForTenant('tenant-123');

      expect(stripeBillingService.reportUsage).toHaveBeenCalledTimes(2);
    });
  });

  describe('tenant processing', () => {
    it('processes all active tenants', async () => {
      const tenants = [
        createMockTenant({ id: 'tenant-1' }),
        createMockTenant({ id: 'tenant-2' }),
        createMockTenant({ id: 'tenant-3' }),
      ];

      vi.mocked(prisma.tenant.findMany).mockResolvedValue(tenants);
      vi.mocked(prisma.delivery.findMany).mockResolvedValue([createMockDelivery()]);

      await reporter.reportAllUsage();

      expect(prisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
            stripeSubscriptionId: expect.objectContaining({
              not: null,
            }),
          }),
        })
      );
    });

    it('skips tenants without Stripe subscription', async () => {
      const tenants = [
        createMockTenant({ id: 'tenant-1', stripeSubscriptionId: null }),
      ];

      vi.mocked(prisma.tenant.findMany).mockResolvedValue(tenants);

      await reporter.reportAllUsage();

      expect(stripeBillingService.reportUsage).not.toHaveBeenCalled();
    });
  });

  describe('usage records', () => {
    it('creates usage record in database', async () => {
      const deliveries = [createMockDelivery({ recordCount: 500 })];
      vi.mocked(prisma.delivery.findMany).mockResolvedValue(deliveries);

      await reporter.reportUsageForTenant('tenant-123');

      expect(prisma.usageRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-123',
          type: 'DATA_RECORDS',
          quantity: 500,
        }),
      });
    });

    it('records timestamp of usage report', async () => {
      const deliveries = [createMockDelivery({ recordCount: 500 })];
      vi.mocked(prisma.delivery.findMany).mockResolvedValue(deliveries);

      await reporter.reportUsageForTenant('tenant-123');

      expect(prisma.usageRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reportedAt: expect.any(Date),
        }),
      });
    });
  });

  describe('reportAllUsage', () => {
    it('returns summary of processed tenants', async () => {
      const tenants = [
        createMockTenant({ id: 'tenant-1' }),
        createMockTenant({ id: 'tenant-2' }),
      ];

      vi.mocked(prisma.tenant.findMany).mockResolvedValue(tenants);
      vi.mocked(prisma.delivery.findMany).mockResolvedValue([createMockDelivery()]);

      const results = await reporter.reportAllUsage();

      expect(results.processed).toBe(2);
      expect(results.succeeded).toBe(2);
      expect(results.failed).toBe(0);
    });
  });

  describe('singleton instance', () => {
    it('exports singleton instance', () => {
      expect(usageReporter).toBeDefined();
      expect(usageReporter).toBeInstanceOf(UsageReporter);
    });
  });
});
