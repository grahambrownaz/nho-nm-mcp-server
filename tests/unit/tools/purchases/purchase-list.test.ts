/**
 * Tests for purchase_list Tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TenantContext } from '../../../../src/utils/auth.js';

// Mock dependencies before imports
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    listPurchase: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
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

vi.mock('../../../../src/tools/data/preview-count.js', () => ({
  executePreviewCount: vi.fn(),
}));

vi.mock('../../../../src/tools/data/get-sample-data.js', () => ({
  executeGetSampleData: vi.fn(),
}));

vi.mock('../../../../src/services/list-pricing.js', () => ({
  calculateListPrice: vi.fn(),
}));

vi.mock('../../../../src/schemas/filters.js', async () => {
  const { z } = await import('zod');
  return {
    DatabaseTypeSchema: z.enum(['consumer', 'business', 'nho', 'new_mover']),
    getFilterSchema: vi.fn(() => z.object({}).passthrough()),
  };
});

// Import after mocks
import { executePurchaseList } from '../../../../src/tools/purchases/purchase-list.js';
import { prisma } from '../../../../src/db/client.js';
import { executePreviewCount } from '../../../../src/tools/data/preview-count.js';
import { executeGetSampleData } from '../../../../src/tools/data/get-sample-data.js';
import { calculateListPrice } from '../../../../src/services/list-pricing.js';
import Stripe from 'stripe';

// Mock Decimal type
function mockDecimal(value: number) {
  return {
    toNumber: () => value,
    toString: () => String(value),
    valueOf: () => value,
  } as any;
}

// Create mock tenant context
function createTestContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenant: {
      id: 'tenant-123',
      name: 'Test Company',
      email: 'test@example.com',
      company: 'Test Company',
      phone: null,
      status: 'ACTIVE',
      stripeCustomerId: 'cus_test123',
      parentTenantId: null,
      isReseller: false,
      wholesalePricing: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    apiKey: {
      id: 'test-api-key-id',
      key: 'test-key',
      name: 'Test Key',
      tenantId: 'tenant-123',
      permissions: ['*'],
      isActive: true,
      lastUsedAt: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    subscription: {
      id: 'test-subscription-id',
      tenantId: 'tenant-123',
      plan: 'PROFESSIONAL',
      status: 'ACTIVE',
      monthlyRecordLimit: 10000,
      monthlyEmailAppends: 5000,
      monthlyPhoneAppends: 5000,
      allowedDatabases: ['NHO', 'NEW_MOVER', 'CONSUMER', 'BUSINESS'],
      allowedGeographies: null,
      allowedStates: [],
      allowedZipCodes: [],
      pricePerRecord: mockDecimal(0.05),
      priceEmailAppend: mockDecimal(0.02),
      pricePhoneAppend: mockDecimal(0.03),
      pricePdfGeneration: mockDecimal(0.10),
      pricePrintPerPiece: mockDecimal(0.65),
      billingCycleStart: new Date(),
      billingCycleEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    permissions: ['*'],
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
  const mockContext = createTestContext();
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

    // Default mocks
    vi.mocked(executePreviewCount).mockResolvedValue({
      success: true,
      data: {
        total_available: 5000,
        database: 'nho',
        geography: { type: 'state', values: ['AZ'] },
      },
    });

    vi.mocked(executeGetSampleData).mockResolvedValue({
      success: true,
      data: {
        samples: [
          { id: '1', firstName: 'John', lastName: 'Smith' },
          { id: '2', firstName: 'Jane', lastName: 'Doe' },
        ],
        total_available: 5000,
      },
    });

    vi.mocked(calculateListPrice).mockReturnValue({
      baseAmount: 250,
      emailAppendAmount: 0,
      phoneAppendAmount: 0,
      discountPercent: 0,
      discountAmount: 0,
      subtotal: 250,
      total: 250,
      meetsMinimum: true,
      minimumOrder: 25,
    });

    vi.mocked(prisma.listPurchase.create).mockResolvedValue({
      id: 'purchase-123',
      tenantId: 'tenant-123',
      database: 'nho',
      geography: {},
      recordCount: 5000,
      withEmail: 0,
      withPhone: 0,
      baseAmount: mockDecimal(250),
      appendAmount: mockDecimal(0),
      discountPercent: 0,
      totalAmount: mockDecimal(250),
      exportFormat: 'csv',
      deliveryMethod: 'download',
      paymentStatus: 'PENDING',
      quoteValidUntil: new Date(Date.now() + 30 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    vi.mocked(prisma.listPurchase.update).mockResolvedValue({
      id: 'purchase-123',
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('creates quote with pricing', () => {
    it('creates quote for list purchase', async () => {
      const result = await executePurchaseList(
        {
          database: 'nho',
          geography: { type: 'state', values: ['AZ'] },
          export_format: 'csv',
          delivery_method: 'download',
        },
        mockContext
      );

      expect(result.quote_id).toBe('purchase-123');
      expect(result.record_count).toBe(5000);
      expect(result.pricing.total).toBe(250);
    });

    it('includes sample records in response', async () => {
      const result = await executePurchaseList(
        {
          database: 'nho',
          geography: { type: 'state', values: ['AZ'] },
          export_format: 'csv',
          delivery_method: 'download',
        },
        mockContext
      );

      expect(result.sample_records).toBeDefined();
      expect(result.sample_records).toHaveLength(2);
    });
  });

  describe('generates Stripe Payment Link', () => {
    it('creates Stripe payment link', async () => {
      const result = await executePurchaseList(
        {
          database: 'nho',
          geography: { type: 'state', values: ['AZ'] },
          export_format: 'csv',
          delivery_method: 'download',
          payment_method: 'payment_link',
        },
        mockContext
      );

      expect(result.payment_link).toBeDefined();
      expect(result.payment_link).toContain('stripe.com');
      expect(mockStripe.paymentLinks.create).toHaveBeenCalled();
    });

    it('includes purchase metadata in payment link', async () => {
      await executePurchaseList(
        {
          database: 'nho',
          geography: { type: 'state', values: ['AZ'] },
          export_format: 'csv',
          delivery_method: 'download',
          payment_method: 'payment_link',
        },
        mockContext
      );

      expect(mockStripe.paymentLinks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            purchase_id: 'purchase-123',
            tenant_id: 'tenant-123',
          }),
        })
      );
    });
  });

  describe('stores purchase record', () => {
    it('creates purchase record in database', async () => {
      const result = await executePurchaseList(
        {
          database: 'nho',
          geography: { type: 'state', values: ['AZ'] },
          export_format: 'csv',
          delivery_method: 'download',
        },
        mockContext
      );

      expect(prisma.listPurchase.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-123',
            database: 'nho',
          }),
        })
      );
      expect(result.quote_id).toBe('purchase-123');
    });
  });

  describe('calculates email/phone append pricing', () => {
    it('adds email append cost to total', async () => {
      vi.mocked(calculateListPrice).mockReturnValue({
        baseAmount: 250,
        emailAppendAmount: 150,
        phoneAppendAmount: 0,
        discountPercent: 0,
        discountAmount: 0,
        subtotal: 400,
        total: 400,
        meetsMinimum: true,
        minimumOrder: 25,
      });

      const result = await executePurchaseList(
        {
          database: 'nho',
          geography: { type: 'state', values: ['AZ'] },
          export_format: 'csv',
          delivery_method: 'download',
          include_email: true,
        },
        mockContext
      );

      expect(result.pricing.email_append).toBe(150);
      expect(result.pricing.total).toBe(400);
    });

    it('adds phone append cost to total', async () => {
      vi.mocked(calculateListPrice).mockReturnValue({
        baseAmount: 250,
        emailAppendAmount: 0,
        phoneAppendAmount: 100,
        discountPercent: 0,
        discountAmount: 0,
        subtotal: 350,
        total: 350,
        meetsMinimum: true,
        minimumOrder: 25,
      });

      const result = await executePurchaseList(
        {
          database: 'nho',
          geography: { type: 'state', values: ['AZ'] },
          export_format: 'csv',
          delivery_method: 'download',
          include_phone: true,
        },
        mockContext
      );

      expect(result.pricing.phone_append).toBe(100);
      expect(result.pricing.total).toBe(350);
    });
  });

  describe('applies volume discounts', () => {
    it('applies discount for large orders', async () => {
      vi.mocked(executePreviewCount).mockResolvedValue({
        success: true,
        data: {
          total_available: 10000,
          database: 'nho',
          geography: { type: 'state', values: ['AZ'] },
        },
      });

      vi.mocked(calculateListPrice).mockReturnValue({
        baseAmount: 500,
        emailAppendAmount: 0,
        phoneAppendAmount: 0,
        discountPercent: 15,
        discountAmount: 75,
        subtotal: 500,
        total: 425,
        meetsMinimum: true,
        minimumOrder: 25,
      });

      const result = await executePurchaseList(
        {
          database: 'nho',
          geography: { type: 'state', values: ['AZ'] },
          export_format: 'csv',
          delivery_method: 'download',
        },
        mockContext
      );

      expect(result.pricing.discount_percent).toBe(15);
      expect(result.pricing.discount_amount).toBe(75);
    });
  });

  describe('validation', () => {
    it('requires database parameter', async () => {
      await expect(
        executePurchaseList(
          {
            geography: { type: 'state', values: ['AZ'] },
            export_format: 'csv',
            delivery_method: 'download',
          } as any,
          mockContext
        )
      ).rejects.toThrow();
    });

    it('rejects queries with no results', async () => {
      vi.mocked(executePreviewCount).mockResolvedValue({
        success: true,
        data: {
          total_available: 0,
          database: 'nho',
          geography: { type: 'state', values: ['AZ'] },
        },
      });

      await expect(
        executePurchaseList(
          {
            database: 'nho',
            geography: { type: 'state', values: ['AZ'] },
            export_format: 'csv',
            delivery_method: 'download',
          },
          mockContext
        )
      ).rejects.toThrow('No records match');
    });

    it('enforces minimum order', async () => {
      vi.mocked(calculateListPrice).mockReturnValue({
        baseAmount: 10,
        emailAppendAmount: 0,
        phoneAppendAmount: 0,
        discountPercent: 0,
        discountAmount: 0,
        subtotal: 10,
        total: 10,
        meetsMinimum: false,
        minimumOrder: 25,
      });

      await expect(
        executePurchaseList(
          {
            database: 'nho',
            geography: { type: 'state', values: ['AZ'] },
            export_format: 'csv',
            delivery_method: 'download',
          },
          mockContext
        )
      ).rejects.toThrow('minimum');
    });
  });

  describe('delivery options', () => {
    it('accepts download delivery method', async () => {
      const result = await executePurchaseList(
        {
          database: 'nho',
          geography: { type: 'state', values: ['AZ'] },
          export_format: 'csv',
          delivery_method: 'download',
        },
        mockContext
      );

      expect(result.delivery.method).toBe('download');
    });

    it('accepts email delivery method', async () => {
      const result = await executePurchaseList(
        {
          database: 'nho',
          geography: { type: 'state', values: ['AZ'] },
          export_format: 'csv',
          delivery_method: 'email',
          delivery_config: {
            email: 'delivery@example.com',
          },
        },
        mockContext
      );

      expect(result.delivery.method).toBe('email');
    });
  });

  describe('export format options', () => {
    it('accepts csv format', async () => {
      const result = await executePurchaseList(
        {
          database: 'nho',
          geography: { type: 'state', values: ['AZ'] },
          export_format: 'csv',
          delivery_method: 'download',
        },
        mockContext
      );

      expect(result.delivery.format).toBe('csv');
    });

    it('accepts excel format', async () => {
      const result = await executePurchaseList(
        {
          database: 'nho',
          geography: { type: 'state', values: ['AZ'] },
          export_format: 'excel',
          delivery_method: 'download',
        },
        mockContext
      );

      expect(result.delivery.format).toBe('excel');
    });

    it('accepts json format', async () => {
      const result = await executePurchaseList(
        {
          database: 'nho',
          geography: { type: 'state', values: ['AZ'] },
          export_format: 'json',
          delivery_method: 'download',
        },
        mockContext
      );

      expect(result.delivery.format).toBe('json');
    });
  });
});
