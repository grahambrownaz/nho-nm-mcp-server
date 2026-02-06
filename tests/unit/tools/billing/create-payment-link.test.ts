/**
 * Tests for create_payment_link Tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeCreatePaymentLink } from '../../../../src/tools/billing/create-payment-link.js';
import type { TenantContext } from '../../../../src/utils/auth.js';
import Stripe from 'stripe';

// Mock Stripe
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

// Mock database
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    listPurchase: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from '../../../../src/db/client.js';

// Create mock tenant context matching TenantContext interface
function createMockContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenant: {
      id: 'tenant-123',
      name: 'Test Company',
      email: 'test@example.com',
      company: 'Test Company Inc',
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
      id: 'api-key-123',
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
    subscription: null,
    permissions: ['*'],
    ...overrides,
  };
}

// Valid UUIDs for testing
const VALID_QUOTE_ID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_QUOTE_ID_2 = '550e8400-e29b-41d4-a716-446655440001';
const VALID_QUOTE_ID_3 = '550e8400-e29b-41d4-a716-446655440002';

describe('create_payment_link tool', () => {
  const mockContext = createMockContext();
  let mockStripe: {
    paymentLinks: { create: ReturnType<typeof vi.fn> };
    prices: { create: ReturnType<typeof vi.fn> };
    products: { create: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Ensure demo mode is disabled for tests
    delete process.env.DEMO_MODE;

    mockStripe = {
      paymentLinks: {
        create: vi.fn().mockResolvedValue({
          id: 'plink_test123',
          url: 'https://buy.stripe.com/test_abc123',
          active: true,
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

    vi.mocked(Stripe).mockReturnValue(mockStripe as unknown as Stripe);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('creates link for list purchase', () => {
    it('creates payment link for data list purchase', async () => {
      vi.mocked(prisma.listPurchase.findFirst).mockResolvedValue({
        id: 'purchase-123',
        tenantId: 'tenant-123',
        paymentStatus: 'PENDING',
        recordCount: 5000,
        totalAmount: 250.00,
        database: 'nho',
        quoteValidUntil: new Date(Date.now() + 86400000),
      } as never);

      vi.mocked(prisma.listPurchase.update).mockResolvedValue({
        id: 'purchase-123',
        stripePaymentLinkId: 'plink_test123',
        paymentStatus: 'AWAITING_PAYMENT',
      } as never);

      const result = await executeCreatePaymentLink(
        {
          product_type: 'list_purchase',
          quote_id: VALID_QUOTE_ID,
        },
        mockContext
      );

      expect(result.url).toContain('stripe.com');
      expect(mockStripe.paymentLinks.create).toHaveBeenCalled();
    });

    it('includes purchase details in product description', async () => {
      vi.mocked(prisma.listPurchase.findFirst).mockResolvedValue({
        id: 'purchase-456',
        tenantId: 'tenant-123',
        paymentStatus: 'PENDING',
        recordCount: 10000,
        totalAmount: 500.00,
        database: 'nho',
        quoteValidUntil: new Date(Date.now() + 86400000),
      } as never);

      vi.mocked(prisma.listPurchase.update).mockResolvedValue({
        id: 'purchase-456',
        stripePaymentLinkId: 'plink_test456',
      } as never);

      await executeCreatePaymentLink(
        {
          product_type: 'list_purchase',
          quote_id: VALID_QUOTE_ID_2,
        },
        mockContext
      );

      expect(mockStripe.prices.create).toHaveBeenCalledWith(
        expect.objectContaining({
          product_data: expect.objectContaining({
            name: expect.stringContaining('NHO'),
          }),
        })
      );
    });
  });

  describe('creates link for postcard batch', () => {
    it('creates payment link for postcard batch', async () => {
      const result = await executeCreatePaymentLink(
        {
          product_type: 'postcard_batch',
          postcard_count: 500,
          postcard_size: '4x6',
        },
        mockContext
      );

      expect(result.url).toContain('stripe.com');
      expect(mockStripe.paymentLinks.create).toHaveBeenCalled();
    });

    it('includes postcard details in product description', async () => {
      await executeCreatePaymentLink(
        {
          product_type: 'postcard_batch',
          postcard_count: 1000,
          postcard_size: '6x9',
        },
        mockContext
      );

      expect(mockStripe.prices.create).toHaveBeenCalledWith(
        expect.objectContaining({
          product_data: expect.objectContaining({
            name: expect.stringContaining('6x9'),
          }),
        })
      );
    });
  });

  describe('includes correct amount', () => {
    it('sets correct amount from purchase total', async () => {
      vi.mocked(prisma.listPurchase.findFirst).mockResolvedValue({
        id: 'purchase-amount',
        tenantId: 'tenant-123',
        paymentStatus: 'PENDING',
        recordCount: 2500,
        totalAmount: 125.00,
        database: 'nho',
        quoteValidUntil: new Date(Date.now() + 86400000),
      } as never);

      vi.mocked(prisma.listPurchase.update).mockResolvedValue({
        id: 'purchase-amount',
        stripePaymentLinkId: 'plink_amount',
      } as never);

      const result = await executeCreatePaymentLink(
        {
          product_type: 'list_purchase',
          quote_id: '550e8400-e29b-41d4-a716-446655440003',
        },
        mockContext
      );

      expect(mockStripe.prices.create).toHaveBeenCalledWith(
        expect.objectContaining({
          unit_amount: 12500, // $125.00 in cents
          currency: 'usd',
        })
      );
      expect(result.amount).toBe(125);
    });

    it('handles decimal amounts correctly', async () => {
      vi.mocked(prisma.listPurchase.findFirst).mockResolvedValue({
        id: 'purchase-decimal',
        tenantId: 'tenant-123',
        paymentStatus: 'PENDING',
        recordCount: 333,
        totalAmount: 16.65,
        database: 'nho',
        quoteValidUntil: new Date(Date.now() + 86400000),
      } as never);

      vi.mocked(prisma.listPurchase.update).mockResolvedValue({
        id: 'purchase-decimal',
        stripePaymentLinkId: 'plink_decimal',
      } as never);

      await executeCreatePaymentLink(
        {
          product_type: 'list_purchase',
          quote_id: '550e8400-e29b-41d4-a716-446655440004',
        },
        mockContext
      );

      expect(mockStripe.prices.create).toHaveBeenCalledWith(
        expect.objectContaining({
          unit_amount: 1665, // $16.65 in cents
        })
      );
    });
  });

  describe('includes metadata', () => {
    it('includes purchase metadata in payment link', async () => {
      vi.mocked(prisma.listPurchase.findFirst).mockResolvedValue({
        id: 'purchase-meta',
        tenantId: 'tenant-123',
        paymentStatus: 'PENDING',
        recordCount: 1000,
        totalAmount: 50.00,
        database: 'nho',
        quoteValidUntil: new Date(Date.now() + 86400000),
      } as never);

      vi.mocked(prisma.listPurchase.update).mockResolvedValue({
        id: 'purchase-meta',
        stripePaymentLinkId: 'plink_meta',
      } as never);

      await executeCreatePaymentLink(
        {
          product_type: 'list_purchase',
          quote_id: '550e8400-e29b-41d4-a716-446655440005',
        },
        mockContext
      );

      expect(mockStripe.paymentLinks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            product_type: 'list_purchase',
            tenant_id: 'tenant-123',
          }),
        })
      );
    });

    it('includes custom metadata when provided', async () => {
      vi.mocked(prisma.listPurchase.findFirst).mockResolvedValue({
        id: 'purchase-custom',
        tenantId: 'tenant-123',
        paymentStatus: 'PENDING',
        recordCount: 500,
        totalAmount: 25.00,
        database: 'nho',
        quoteValidUntil: new Date(Date.now() + 86400000),
      } as never);

      vi.mocked(prisma.listPurchase.update).mockResolvedValue({
        id: 'purchase-custom',
        stripePaymentLinkId: 'plink_custom',
      } as never);

      await executeCreatePaymentLink(
        {
          product_type: 'list_purchase',
          quote_id: '550e8400-e29b-41d4-a716-446655440006',
          metadata: {
            campaign: 'spring-2026',
            source: 'api',
          },
        },
        mockContext
      );

      expect(mockStripe.paymentLinks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            campaign: 'spring-2026',
            source: 'api',
          }),
        })
      );
    });
  });

  describe('sets expiration', () => {
    it('sets default expiration of 24 hours', async () => {
      vi.mocked(prisma.listPurchase.findFirst).mockResolvedValue({
        id: 'purchase-expire',
        tenantId: 'tenant-123',
        paymentStatus: 'PENDING',
        recordCount: 1000,
        totalAmount: 50.00,
        database: 'nho',
        quoteValidUntil: new Date(Date.now() + 86400000),
      } as never);

      vi.mocked(prisma.listPurchase.update).mockResolvedValue({
        id: 'purchase-expire',
        stripePaymentLinkId: 'plink_expire',
      } as never);

      const now = Date.now();
      const result = await executeCreatePaymentLink(
        {
          product_type: 'list_purchase',
          quote_id: '550e8400-e29b-41d4-a716-446655440007',
        },
        mockContext
      );

      expect(result.expires_at).toBeDefined();
      const expiresIn = new Date(result.expires_at).getTime() - now;
      // Should be roughly 24 hours (within a minute tolerance)
      expect(expiresIn).toBeGreaterThan(23 * 60 * 60 * 1000);
      expect(expiresIn).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 60000);
    });

    it('allows custom expiration', async () => {
      vi.mocked(prisma.listPurchase.findFirst).mockResolvedValue({
        id: 'purchase-custom-expire',
        tenantId: 'tenant-123',
        paymentStatus: 'PENDING',
        recordCount: 1000,
        totalAmount: 50.00,
        database: 'nho',
        quoteValidUntil: new Date(Date.now() + 86400000 * 7),
      } as never);

      vi.mocked(prisma.listPurchase.update).mockResolvedValue({
        id: 'purchase-custom-expire',
        stripePaymentLinkId: 'plink_custom_expire',
      } as never);

      const result = await executeCreatePaymentLink(
        {
          product_type: 'list_purchase',
          quote_id: '550e8400-e29b-41d4-a716-446655440008',
          expires_in_hours: 168, // 7 days
        },
        mockContext
      );

      expect(result.expires_at).toBeDefined();
    });
  });

  describe('includes success/cancel URLs', () => {
    it('uses default success URL when not provided', async () => {
      vi.mocked(prisma.listPurchase.findFirst).mockResolvedValue({
        id: 'purchase-urls',
        tenantId: 'tenant-123',
        paymentStatus: 'PENDING',
        recordCount: 1000,
        totalAmount: 50.00,
        database: 'nho',
        quoteValidUntil: new Date(Date.now() + 86400000),
      } as never);

      vi.mocked(prisma.listPurchase.update).mockResolvedValue({
        id: 'purchase-urls',
        stripePaymentLinkId: 'plink_urls',
      } as never);

      await executeCreatePaymentLink(
        {
          product_type: 'list_purchase',
          quote_id: '550e8400-e29b-41d4-a716-446655440009',
        },
        mockContext
      );

      expect(mockStripe.paymentLinks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          after_completion: expect.objectContaining({
            type: 'redirect',
            redirect: expect.objectContaining({
              url: expect.any(String),
            }),
          }),
        })
      );
    });

    it('allows custom success URL', async () => {
      vi.mocked(prisma.listPurchase.findFirst).mockResolvedValue({
        id: 'purchase-custom-success',
        tenantId: 'tenant-123',
        paymentStatus: 'PENDING',
        recordCount: 1000,
        totalAmount: 50.00,
        database: 'nho',
        quoteValidUntil: new Date(Date.now() + 86400000),
      } as never);

      vi.mocked(prisma.listPurchase.update).mockResolvedValue({
        id: 'purchase-custom-success',
        stripePaymentLinkId: 'plink_custom_success',
      } as never);

      await executeCreatePaymentLink(
        {
          product_type: 'list_purchase',
          quote_id: '550e8400-e29b-41d4-a716-44665544000a',
          success_url: 'https://custom.example.com/thank-you',
        },
        mockContext
      );

      expect(mockStripe.paymentLinks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          after_completion: expect.objectContaining({
            redirect: expect.objectContaining({
              url: 'https://custom.example.com/thank-you',
            }),
          }),
        })
      );
    });
  });

  describe('validation', () => {
    it('validates type parameter', async () => {
      await expect(
        executeCreatePaymentLink({ product_type: 'invalid' }, mockContext)
      ).rejects.toThrow();
    });

    it('requires quote_id for list_purchase type', async () => {
      await expect(
        executeCreatePaymentLink({ product_type: 'list_purchase' }, mockContext)
      ).rejects.toThrow();
    });

    it('requires postcard_count and postcard_size for postcard_batch type', async () => {
      await expect(
        executeCreatePaymentLink({ product_type: 'postcard_batch' }, mockContext)
      ).rejects.toThrow();
    });

    it('validates purchase exists', async () => {
      vi.mocked(prisma.listPurchase.findFirst).mockResolvedValue(null);

      await expect(
        executeCreatePaymentLink(
          {
            product_type: 'list_purchase',
            quote_id: '550e8400-e29b-41d4-a716-44665544000b',
          },
          mockContext
        )
      ).rejects.toThrow();
    });
  });

  describe('custom line items', () => {
    it('creates payment link with custom line items', async () => {
      const result = await executeCreatePaymentLink(
        {
          product_type: 'custom',
          line_items: [
            { description: 'Custom Service', quantity: 2, unit_price: 50.00 },
            { description: 'Additional Fee', quantity: 1, unit_price: 25.00 },
          ],
        },
        mockContext
      );

      expect(result.url).toContain('stripe.com');
      expect(result.amount).toBe(125); // 2*50 + 1*25
      expect(result.line_items).toHaveLength(2);
    });

    it('requires line_items for custom type', async () => {
      await expect(
        executeCreatePaymentLink({ product_type: 'custom' }, mockContext)
      ).rejects.toThrow();
    });
  });
});
