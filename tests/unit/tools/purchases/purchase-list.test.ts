/**
 * Tests for purchase_list Tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handler } from '../../../../src/tools/purchases/purchase-list.js';
import { createTenantContext, TenantContext } from '../../../../src/utils/tenant-context.js';
import Stripe from 'stripe';

// Mock dependencies
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    purchase: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    pricing: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('stripe', () => ({
  default: vi.fn(() => ({
    paymentLinks: {
      create: vi.fn(),
    },
    prices: {
      create: vi.fn(),
    },
    products: {
      create: vi.fn(),
    },
  })),
}));

vi.mock('../../../../src/services/data-provider.js', () => ({
  dataProvider: {
    getCount: vi.fn(),
    getSampleRecords: vi.fn(),
  },
}));

import { prisma } from '../../../../src/db/client.js';
import { dataProvider } from '../../../../src/services/data-provider.js';

// Create mock tenant context
function createMockContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenant: {
      id: 'tenant-123',
      name: 'Test Company',
      stripeCustomerId: 'cus_test123',
      apiKeyHash: 'hashed-key',
      permissions: ['purchases:create', 'data:read'],
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    requestId: 'req-123',
    ...overrides,
  };
}

// Create mock query
function createMockQuery(overrides: Record<string, unknown> = {}) {
  return {
    database: 'nho',
    geography: {
      type: 'state',
      values: ['AZ'],
    },
    filters: {
      sale_price_min: 200000,
      sale_price_max: 500000,
    },
    ...overrides,
  };
}

describe('purchase_list tool', () => {
  const mockContext = createMockContext();
  let mockStripe: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockStripe = {
      paymentLinks: {
        create: vi.fn().mockResolvedValue({
          id: 'plink_test123',
          url: 'https://buy.stripe.com/test_link',
        }),
      },
      prices: {
        create: vi.fn().mockResolvedValue({
          id: 'price_test123',
        }),
      },
      products: {
        create: vi.fn().mockResolvedValue({
          id: 'prod_test123',
        }),
      },
    };

    vi.mocked(Stripe).mockReturnValue(mockStripe);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('creates quote with pricing', () => {
    it('creates quote for list purchase', async () => {
      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 5000 });
      vi.mocked(dataProvider.getSampleRecords).mockResolvedValue([
        { id: '1', firstName: 'John', lastName: 'Smith' },
        { id: '2', firstName: 'Jane', lastName: 'Doe' },
      ]);

      vi.mocked(prisma.pricing.findFirst).mockResolvedValue({
        id: 'pricing-1',
        database: 'nho',
        pricePerRecord: 0.05,
        minRecords: 100,
        maxRecords: 100000,
      });

      vi.mocked(prisma.purchase.create).mockResolvedValue({
        id: 'purchase-123',
        tenantId: 'tenant-123',
        status: 'pending',
        query: createMockQuery(),
        recordCount: 5000,
        totalAmount: 25000, // 5000 * $0.05 = $250.00 in cents
        createdAt: new Date(),
      });

      const result = await handler(
        {
          query: createMockQuery(),
        },
        mockContext
      );

      expect(result.quote).toBeDefined();
      expect(result.quote.recordCount).toBe(5000);
      expect(result.quote.pricePerRecord).toBe(0.05);
      expect(result.quote.totalAmount).toBeGreaterThan(0);
    });

    it('includes breakdown of costs', async () => {
      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 1000 });
      vi.mocked(dataProvider.getSampleRecords).mockResolvedValue([]);
      vi.mocked(prisma.pricing.findFirst).mockResolvedValue({
        id: 'pricing-1',
        database: 'nho',
        pricePerRecord: 0.05,
      });
      vi.mocked(prisma.purchase.create).mockResolvedValue({
        id: 'purchase-123',
        status: 'pending',
        recordCount: 1000,
        totalAmount: 5000,
      });

      const result = await handler(
        {
          query: createMockQuery(),
        },
        mockContext
      );

      expect(result.quote.breakdown).toBeDefined();
      expect(result.quote.breakdown.basePrice).toBeGreaterThan(0);
    });
  });

  describe('generates Stripe Payment Link', () => {
    it('creates Stripe payment link', async () => {
      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 1000 });
      vi.mocked(dataProvider.getSampleRecords).mockResolvedValue([]);
      vi.mocked(prisma.pricing.findFirst).mockResolvedValue({
        id: 'pricing-1',
        pricePerRecord: 0.05,
      });
      vi.mocked(prisma.purchase.create).mockResolvedValue({
        id: 'purchase-123',
        status: 'pending',
        recordCount: 1000,
        totalAmount: 5000,
      });

      const result = await handler(
        {
          query: createMockQuery(),
        },
        mockContext
      );

      expect(result.paymentLink).toBeDefined();
      expect(result.paymentLink.url).toContain('stripe.com');
      expect(mockStripe.paymentLinks.create).toHaveBeenCalled();
    });

    it('includes purchase metadata in payment link', async () => {
      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 500 });
      vi.mocked(dataProvider.getSampleRecords).mockResolvedValue([]);
      vi.mocked(prisma.pricing.findFirst).mockResolvedValue({
        id: 'pricing-1',
        pricePerRecord: 0.05,
      });
      vi.mocked(prisma.purchase.create).mockResolvedValue({
        id: 'purchase-456',
        status: 'pending',
        recordCount: 500,
        totalAmount: 2500,
      });

      await handler(
        {
          query: createMockQuery(),
        },
        mockContext
      );

      expect(mockStripe.paymentLinks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            purchaseId: 'purchase-456',
            tenantId: 'tenant-123',
          }),
        })
      );
    });

    it('sets correct amount on payment link', async () => {
      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 2000 });
      vi.mocked(dataProvider.getSampleRecords).mockResolvedValue([]);
      vi.mocked(prisma.pricing.findFirst).mockResolvedValue({
        id: 'pricing-1',
        pricePerRecord: 0.10, // $0.10 per record
      });
      vi.mocked(prisma.purchase.create).mockResolvedValue({
        id: 'purchase-789',
        status: 'pending',
        recordCount: 2000,
        totalAmount: 20000, // $200.00 in cents
      });

      await handler(
        {
          query: createMockQuery(),
        },
        mockContext
      );

      expect(mockStripe.prices.create).toHaveBeenCalledWith(
        expect.objectContaining({
          unit_amount: 20000, // $200.00 in cents
          currency: 'usd',
        })
      );
    });
  });

  describe('stores purchase record', () => {
    it('creates purchase record in database', async () => {
      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 1500 });
      vi.mocked(dataProvider.getSampleRecords).mockResolvedValue([]);
      vi.mocked(prisma.pricing.findFirst).mockResolvedValue({
        id: 'pricing-1',
        pricePerRecord: 0.05,
      });
      vi.mocked(prisma.purchase.create).mockResolvedValue({
        id: 'purchase-new',
        status: 'pending',
        recordCount: 1500,
        totalAmount: 7500,
      });

      const result = await handler(
        {
          query: createMockQuery(),
        },
        mockContext
      );

      expect(prisma.purchase.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-123',
            status: 'pending',
            recordCount: 1500,
          }),
        })
      );
      expect(result.purchaseId).toBe('purchase-new');
    });

    it('stores query parameters in purchase', async () => {
      const query = createMockQuery({
        filters: {
          sale_price_min: 300000,
          property_type: ['Single Family'],
        },
      });

      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 800 });
      vi.mocked(dataProvider.getSampleRecords).mockResolvedValue([]);
      vi.mocked(prisma.pricing.findFirst).mockResolvedValue({
        id: 'pricing-1',
        pricePerRecord: 0.05,
      });
      vi.mocked(prisma.purchase.create).mockResolvedValue({
        id: 'purchase-query',
        status: 'pending',
        query: query,
        recordCount: 800,
        totalAmount: 4000,
      });

      await handler({ query }, mockContext);

      expect(prisma.purchase.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            query: expect.objectContaining({
              filters: expect.objectContaining({
                sale_price_min: 300000,
              }),
            }),
          }),
        })
      );
    });
  });

  describe('returns sample records', () => {
    it('includes sample records in response', async () => {
      const sampleRecords = [
        { id: '1', firstName: 'John', lastName: 'Smith', city: 'Phoenix' },
        { id: '2', firstName: 'Jane', lastName: 'Doe', city: 'Scottsdale' },
        { id: '3', firstName: 'Bob', lastName: 'Jones', city: 'Tempe' },
      ];

      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 1000 });
      vi.mocked(dataProvider.getSampleRecords).mockResolvedValue(sampleRecords);
      vi.mocked(prisma.pricing.findFirst).mockResolvedValue({
        id: 'pricing-1',
        pricePerRecord: 0.05,
      });
      vi.mocked(prisma.purchase.create).mockResolvedValue({
        id: 'purchase-sample',
        status: 'pending',
        recordCount: 1000,
        totalAmount: 5000,
      });

      const result = await handler(
        {
          query: createMockQuery(),
          include_sample: true,
        },
        mockContext
      );

      expect(result.sampleRecords).toBeDefined();
      expect(result.sampleRecords).toHaveLength(3);
      expect(result.sampleRecords[0].firstName).toBe('John');
    });

    it('limits sample records to requested count', async () => {
      const manyRecords = Array.from({ length: 20 }, (_, i) => ({
        id: `${i}`,
        firstName: `First${i}`,
        lastName: `Last${i}`,
      }));

      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 5000 });
      vi.mocked(dataProvider.getSampleRecords).mockResolvedValue(manyRecords.slice(0, 5));
      vi.mocked(prisma.pricing.findFirst).mockResolvedValue({
        id: 'pricing-1',
        pricePerRecord: 0.05,
      });
      vi.mocked(prisma.purchase.create).mockResolvedValue({
        id: 'purchase-limit',
        status: 'pending',
        recordCount: 5000,
        totalAmount: 25000,
      });

      const result = await handler(
        {
          query: createMockQuery(),
          include_sample: true,
          sample_count: 5,
        },
        mockContext
      );

      expect(result.sampleRecords).toHaveLength(5);
    });
  });

  describe('calculates email/phone append pricing', () => {
    it('adds email append cost to total', async () => {
      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 1000 });
      vi.mocked(dataProvider.getSampleRecords).mockResolvedValue([]);
      vi.mocked(prisma.pricing.findFirst).mockResolvedValue({
        id: 'pricing-1',
        pricePerRecord: 0.05,
        emailAppendPrice: 0.03,
        phoneAppendPrice: 0.02,
      });
      vi.mocked(prisma.purchase.create).mockResolvedValue({
        id: 'purchase-email',
        status: 'pending',
        recordCount: 1000,
        totalAmount: 8000, // Base $50 + Email $30 = $80
      });

      const result = await handler(
        {
          query: createMockQuery(),
          append_email: true,
        },
        mockContext
      );

      expect(result.quote.breakdown.emailAppend).toBeDefined();
      expect(result.quote.breakdown.emailAppend).toBe(3000); // $30 in cents
      expect(result.quote.totalAmount).toBeGreaterThan(5000);
    });

    it('adds phone append cost to total', async () => {
      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 1000 });
      vi.mocked(dataProvider.getSampleRecords).mockResolvedValue([]);
      vi.mocked(prisma.pricing.findFirst).mockResolvedValue({
        id: 'pricing-1',
        pricePerRecord: 0.05,
        emailAppendPrice: 0.03,
        phoneAppendPrice: 0.02,
      });
      vi.mocked(prisma.purchase.create).mockResolvedValue({
        id: 'purchase-phone',
        status: 'pending',
        recordCount: 1000,
        totalAmount: 7000, // Base $50 + Phone $20 = $70
      });

      const result = await handler(
        {
          query: createMockQuery(),
          append_phone: true,
        },
        mockContext
      );

      expect(result.quote.breakdown.phoneAppend).toBeDefined();
      expect(result.quote.breakdown.phoneAppend).toBe(2000); // $20 in cents
    });

    it('calculates combined append pricing', async () => {
      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 1000 });
      vi.mocked(dataProvider.getSampleRecords).mockResolvedValue([]);
      vi.mocked(prisma.pricing.findFirst).mockResolvedValue({
        id: 'pricing-1',
        pricePerRecord: 0.05,
        emailAppendPrice: 0.03,
        phoneAppendPrice: 0.02,
      });
      vi.mocked(prisma.purchase.create).mockResolvedValue({
        id: 'purchase-both',
        status: 'pending',
        recordCount: 1000,
        totalAmount: 10000, // Base $50 + Email $30 + Phone $20 = $100
      });

      const result = await handler(
        {
          query: createMockQuery(),
          append_email: true,
          append_phone: true,
        },
        mockContext
      );

      expect(result.quote.totalAmount).toBe(10000);
      expect(result.quote.breakdown.emailAppend).toBe(3000);
      expect(result.quote.breakdown.phoneAppend).toBe(2000);
    });
  });

  describe('applies volume discounts', () => {
    it('applies 10% discount for 5000+ records', async () => {
      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 5000 });
      vi.mocked(dataProvider.getSampleRecords).mockResolvedValue([]);
      vi.mocked(prisma.pricing.findFirst).mockResolvedValue({
        id: 'pricing-1',
        pricePerRecord: 0.05,
        volumeDiscounts: [
          { minRecords: 5000, discount: 0.10 },
          { minRecords: 10000, discount: 0.15 },
          { minRecords: 25000, discount: 0.20 },
        ],
      });
      vi.mocked(prisma.purchase.create).mockResolvedValue({
        id: 'purchase-vol1',
        status: 'pending',
        recordCount: 5000,
        totalAmount: 22500, // $250 - 10% = $225
      });

      const result = await handler(
        {
          query: createMockQuery(),
        },
        mockContext
      );

      expect(result.quote.discount).toBeDefined();
      expect(result.quote.discount.percentage).toBe(10);
      expect(result.quote.discount.amount).toBe(2500); // $25 in cents
    });

    it('applies 15% discount for 10000+ records', async () => {
      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 10000 });
      vi.mocked(dataProvider.getSampleRecords).mockResolvedValue([]);
      vi.mocked(prisma.pricing.findFirst).mockResolvedValue({
        id: 'pricing-1',
        pricePerRecord: 0.05,
        volumeDiscounts: [
          { minRecords: 5000, discount: 0.10 },
          { minRecords: 10000, discount: 0.15 },
          { minRecords: 25000, discount: 0.20 },
        ],
      });
      vi.mocked(prisma.purchase.create).mockResolvedValue({
        id: 'purchase-vol2',
        status: 'pending',
        recordCount: 10000,
        totalAmount: 42500, // $500 - 15% = $425
      });

      const result = await handler(
        {
          query: createMockQuery(),
        },
        mockContext
      );

      expect(result.quote.discount.percentage).toBe(15);
    });

    it('applies 20% discount for 25000+ records', async () => {
      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 30000 });
      vi.mocked(dataProvider.getSampleRecords).mockResolvedValue([]);
      vi.mocked(prisma.pricing.findFirst).mockResolvedValue({
        id: 'pricing-1',
        pricePerRecord: 0.05,
        volumeDiscounts: [
          { minRecords: 5000, discount: 0.10 },
          { minRecords: 10000, discount: 0.15 },
          { minRecords: 25000, discount: 0.20 },
        ],
      });
      vi.mocked(prisma.purchase.create).mockResolvedValue({
        id: 'purchase-vol3',
        status: 'pending',
        recordCount: 30000,
        totalAmount: 120000, // $1500 - 20% = $1200
      });

      const result = await handler(
        {
          query: createMockQuery(),
        },
        mockContext
      );

      expect(result.quote.discount.percentage).toBe(20);
    });

    it('no discount for small orders', async () => {
      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 500 });
      vi.mocked(dataProvider.getSampleRecords).mockResolvedValue([]);
      vi.mocked(prisma.pricing.findFirst).mockResolvedValue({
        id: 'pricing-1',
        pricePerRecord: 0.05,
        volumeDiscounts: [
          { minRecords: 5000, discount: 0.10 },
        ],
      });
      vi.mocked(prisma.purchase.create).mockResolvedValue({
        id: 'purchase-small',
        status: 'pending',
        recordCount: 500,
        totalAmount: 2500, // $25 no discount
      });

      const result = await handler(
        {
          query: createMockQuery(),
        },
        mockContext
      );

      expect(result.quote.discount).toBeUndefined();
    });
  });

  describe('validation', () => {
    it('requires query parameter', async () => {
      await expect(
        handler({}, mockContext)
      ).rejects.toThrow();
    });

    it('validates query structure', async () => {
      await expect(
        handler(
          { query: { database: 'invalid' } },
          mockContext
        )
      ).rejects.toThrow();
    });

    it('rejects queries with no results', async () => {
      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 0 });

      await expect(
        handler({ query: createMockQuery() }, mockContext)
      ).rejects.toThrow('No records found');
    });

    it('enforces minimum record count', async () => {
      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 50 });
      vi.mocked(prisma.pricing.findFirst).mockResolvedValue({
        id: 'pricing-1',
        pricePerRecord: 0.05,
        minRecords: 100,
      });

      await expect(
        handler({ query: createMockQuery() }, mockContext)
      ).rejects.toThrow('minimum');
    });
  });

  describe('permission checks', () => {
    it('requires purchases:create permission', async () => {
      const noPermContext = createMockContext({
        tenant: {
          ...createMockContext().tenant,
          permissions: ['data:read'],
        },
      });

      await expect(
        handler({ query: createMockQuery() }, noPermContext)
      ).rejects.toThrow('permission');
    });
  });

  describe('delivery options', () => {
    it('accepts delivery method in request', async () => {
      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 1000 });
      vi.mocked(dataProvider.getSampleRecords).mockResolvedValue([]);
      vi.mocked(prisma.pricing.findFirst).mockResolvedValue({
        id: 'pricing-1',
        pricePerRecord: 0.05,
      });
      vi.mocked(prisma.purchase.create).mockResolvedValue({
        id: 'purchase-delivery',
        status: 'pending',
        recordCount: 1000,
        totalAmount: 5000,
        deliveryMethod: 'email',
      });

      const result = await handler(
        {
          query: createMockQuery(),
          delivery: {
            method: 'email',
            email: 'delivery@example.com',
          },
        },
        mockContext
      );

      expect(result.delivery.method).toBe('email');
    });

    it('supports webhook delivery', async () => {
      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 1000 });
      vi.mocked(dataProvider.getSampleRecords).mockResolvedValue([]);
      vi.mocked(prisma.pricing.findFirst).mockResolvedValue({
        id: 'pricing-1',
        pricePerRecord: 0.05,
      });
      vi.mocked(prisma.purchase.create).mockResolvedValue({
        id: 'purchase-webhook',
        status: 'pending',
        recordCount: 1000,
        totalAmount: 5000,
        deliveryMethod: 'webhook',
      });

      const result = await handler(
        {
          query: createMockQuery(),
          delivery: {
            method: 'webhook',
            url: 'https://api.example.com/webhook',
          },
        },
        mockContext
      );

      expect(result.delivery.method).toBe('webhook');
    });
  });

  describe('export format options', () => {
    it('accepts export format in request', async () => {
      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 1000 });
      vi.mocked(dataProvider.getSampleRecords).mockResolvedValue([]);
      vi.mocked(prisma.pricing.findFirst).mockResolvedValue({
        id: 'pricing-1',
        pricePerRecord: 0.05,
      });
      vi.mocked(prisma.purchase.create).mockResolvedValue({
        id: 'purchase-format',
        status: 'pending',
        recordCount: 1000,
        totalAmount: 5000,
        exportFormat: 'xlsx',
      });

      const result = await handler(
        {
          query: createMockQuery(),
          export_format: 'xlsx',
        },
        mockContext
      );

      expect(result.exportFormat).toBe('xlsx');
    });

    it('defaults to CSV format', async () => {
      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 1000 });
      vi.mocked(dataProvider.getSampleRecords).mockResolvedValue([]);
      vi.mocked(prisma.pricing.findFirst).mockResolvedValue({
        id: 'pricing-1',
        pricePerRecord: 0.05,
      });
      vi.mocked(prisma.purchase.create).mockResolvedValue({
        id: 'purchase-default',
        status: 'pending',
        recordCount: 1000,
        totalAmount: 5000,
        exportFormat: 'csv',
      });

      const result = await handler(
        {
          query: createMockQuery(),
        },
        mockContext
      );

      expect(result.exportFormat).toBe('csv');
    });
  });
});
