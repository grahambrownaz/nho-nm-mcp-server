/**
 * Tests for create_payment_link Tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handler } from '../../../../src/tools/billing/create-payment-link.js';
import { createTenantContext, TenantContext } from '../../../../src/utils/tenant-context.js';
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
    paymentLink: {
      create: vi.fn(),
    },
    purchase: {
      findUnique: vi.fn(),
    },
    postcardBatch: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '../../../../src/db/client.js';

// Create mock tenant context
function createMockContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenant: {
      id: 'tenant-123',
      name: 'Test Company',
      stripeCustomerId: 'cus_test123',
      apiKeyHash: 'hashed-key',
      permissions: ['billing:create', 'purchases:read'],
      settings: {
        successUrl: 'https://app.example.com/success',
        cancelUrl: 'https://app.example.com/cancel',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    requestId: 'req-123',
    ...overrides,
  };
}

describe('create_payment_link tool', () => {
  const mockContext = createMockContext();
  let mockStripe: any;

  beforeEach(() => {
    vi.clearAllMocks();

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

    vi.mocked(Stripe).mockReturnValue(mockStripe);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('creates link for list purchase', () => {
    it('creates payment link for data list purchase', async () => {
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue({
        id: 'purchase-123',
        tenantId: 'tenant-123',
        status: 'pending',
        recordCount: 5000,
        totalAmount: 25000, // $250.00
        query: {
          database: 'nho',
          geography: { type: 'state', values: ['AZ'] },
        },
      });

      vi.mocked(prisma.paymentLink.create).mockResolvedValue({
        id: 'link-123',
        stripePaymentLinkId: 'plink_test123',
        url: 'https://buy.stripe.com/test_abc123',
        type: 'list_purchase',
        referenceId: 'purchase-123',
        amount: 25000,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      const result = await handler(
        {
          type: 'list_purchase',
          purchase_id: 'purchase-123',
        },
        mockContext
      );

      expect(result.url).toContain('stripe.com');
      expect(result.type).toBe('list_purchase');
      expect(mockStripe.paymentLinks.create).toHaveBeenCalled();
    });

    it('includes purchase details in product description', async () => {
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue({
        id: 'purchase-456',
        tenantId: 'tenant-123',
        status: 'pending',
        recordCount: 10000,
        totalAmount: 50000,
        query: {
          database: 'nho',
          geography: { type: 'state', values: ['CA'] },
        },
      });

      vi.mocked(prisma.paymentLink.create).mockResolvedValue({
        id: 'link-456',
        stripePaymentLinkId: 'plink_test456',
        url: 'https://buy.stripe.com/test_def456',
        type: 'list_purchase',
        amount: 50000,
      });

      await handler(
        {
          type: 'list_purchase',
          purchase_id: 'purchase-456',
        },
        mockContext
      );

      expect(mockStripe.products.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expect.stringContaining('NHO'),
          description: expect.stringContaining('10000'),
        })
      );
    });
  });

  describe('creates link for postcard batch', () => {
    it('creates payment link for postcard batch', async () => {
      vi.mocked(prisma.postcardBatch.findUnique).mockResolvedValue({
        id: 'batch-123',
        tenantId: 'tenant-123',
        status: 'pending_payment',
        postcardCount: 500,
        totalAmount: 32500, // $325.00 (500 * $0.65)
        templateId: 'template-456',
      });

      vi.mocked(prisma.paymentLink.create).mockResolvedValue({
        id: 'link-batch-123',
        stripePaymentLinkId: 'plink_batch123',
        url: 'https://buy.stripe.com/test_batch123',
        type: 'postcard_batch',
        referenceId: 'batch-123',
        amount: 32500,
      });

      const result = await handler(
        {
          type: 'postcard_batch',
          batch_id: 'batch-123',
        },
        mockContext
      );

      expect(result.url).toContain('stripe.com');
      expect(result.type).toBe('postcard_batch');
    });

    it('includes postcard details in product description', async () => {
      vi.mocked(prisma.postcardBatch.findUnique).mockResolvedValue({
        id: 'batch-789',
        tenantId: 'tenant-123',
        status: 'pending_payment',
        postcardCount: 1000,
        totalAmount: 65000,
        templateId: 'template-789',
        size: '6x9',
      });

      vi.mocked(prisma.paymentLink.create).mockResolvedValue({
        id: 'link-batch-789',
        stripePaymentLinkId: 'plink_batch789',
        url: 'https://buy.stripe.com/test_batch789',
        type: 'postcard_batch',
        amount: 65000,
      });

      await handler(
        {
          type: 'postcard_batch',
          batch_id: 'batch-789',
        },
        mockContext
      );

      expect(mockStripe.products.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expect.stringContaining('Postcard'),
          description: expect.stringContaining('1000'),
        })
      );
    });
  });

  describe('includes correct amount', () => {
    it('sets correct amount from purchase total', async () => {
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue({
        id: 'purchase-amount',
        tenantId: 'tenant-123',
        status: 'pending',
        recordCount: 2500,
        totalAmount: 12500, // $125.00
      });

      vi.mocked(prisma.paymentLink.create).mockResolvedValue({
        id: 'link-amount',
        stripePaymentLinkId: 'plink_amount',
        url: 'https://buy.stripe.com/test_amount',
        amount: 12500,
      });

      const result = await handler(
        {
          type: 'list_purchase',
          purchase_id: 'purchase-amount',
        },
        mockContext
      );

      expect(mockStripe.prices.create).toHaveBeenCalledWith(
        expect.objectContaining({
          unit_amount: 12500,
          currency: 'usd',
        })
      );
      expect(result.amount).toBe(12500);
    });

    it('handles decimal amounts correctly', async () => {
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue({
        id: 'purchase-decimal',
        tenantId: 'tenant-123',
        status: 'pending',
        recordCount: 333,
        totalAmount: 1665, // $16.65
      });

      vi.mocked(prisma.paymentLink.create).mockResolvedValue({
        id: 'link-decimal',
        stripePaymentLinkId: 'plink_decimal',
        url: 'https://buy.stripe.com/test_decimal',
        amount: 1665,
      });

      await handler(
        {
          type: 'list_purchase',
          purchase_id: 'purchase-decimal',
        },
        mockContext
      );

      expect(mockStripe.prices.create).toHaveBeenCalledWith(
        expect.objectContaining({
          unit_amount: 1665,
        })
      );
    });
  });

  describe('includes metadata', () => {
    it('includes purchase metadata in payment link', async () => {
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue({
        id: 'purchase-meta',
        tenantId: 'tenant-123',
        status: 'pending',
        recordCount: 1000,
        totalAmount: 5000,
      });

      vi.mocked(prisma.paymentLink.create).mockResolvedValue({
        id: 'link-meta',
        stripePaymentLinkId: 'plink_meta',
        url: 'https://buy.stripe.com/test_meta',
        amount: 5000,
      });

      await handler(
        {
          type: 'list_purchase',
          purchase_id: 'purchase-meta',
        },
        mockContext
      );

      expect(mockStripe.paymentLinks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            type: 'list_purchase',
            purchaseId: 'purchase-meta',
            tenantId: 'tenant-123',
          }),
        })
      );
    });

    it('includes batch metadata in payment link', async () => {
      vi.mocked(prisma.postcardBatch.findUnique).mockResolvedValue({
        id: 'batch-meta',
        tenantId: 'tenant-123',
        status: 'pending_payment',
        postcardCount: 200,
        totalAmount: 13000,
      });

      vi.mocked(prisma.paymentLink.create).mockResolvedValue({
        id: 'link-batch-meta',
        stripePaymentLinkId: 'plink_batch_meta',
        url: 'https://buy.stripe.com/test_batch_meta',
        amount: 13000,
      });

      await handler(
        {
          type: 'postcard_batch',
          batch_id: 'batch-meta',
        },
        mockContext
      );

      expect(mockStripe.paymentLinks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            type: 'postcard_batch',
            batchId: 'batch-meta',
            tenantId: 'tenant-123',
          }),
        })
      );
    });

    it('includes custom metadata when provided', async () => {
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue({
        id: 'purchase-custom',
        tenantId: 'tenant-123',
        status: 'pending',
        recordCount: 500,
        totalAmount: 2500,
      });

      vi.mocked(prisma.paymentLink.create).mockResolvedValue({
        id: 'link-custom',
        stripePaymentLinkId: 'plink_custom',
        url: 'https://buy.stripe.com/test_custom',
        amount: 2500,
      });

      await handler(
        {
          type: 'list_purchase',
          purchase_id: 'purchase-custom',
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
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue({
        id: 'purchase-expire',
        tenantId: 'tenant-123',
        status: 'pending',
        recordCount: 1000,
        totalAmount: 5000,
      });

      const now = Date.now();
      vi.mocked(prisma.paymentLink.create).mockResolvedValue({
        id: 'link-expire',
        stripePaymentLinkId: 'plink_expire',
        url: 'https://buy.stripe.com/test_expire',
        amount: 5000,
        expiresAt: new Date(now + 24 * 60 * 60 * 1000),
      });

      const result = await handler(
        {
          type: 'list_purchase',
          purchase_id: 'purchase-expire',
        },
        mockContext
      );

      expect(result.expiresAt).toBeDefined();
      const expiresIn = new Date(result.expiresAt).getTime() - now;
      // Should be roughly 24 hours (within a minute tolerance)
      expect(expiresIn).toBeGreaterThan(23 * 60 * 60 * 1000);
      expect(expiresIn).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 60000);
    });

    it('allows custom expiration', async () => {
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue({
        id: 'purchase-custom-expire',
        tenantId: 'tenant-123',
        status: 'pending',
        recordCount: 1000,
        totalAmount: 5000,
      });

      const customExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      vi.mocked(prisma.paymentLink.create).mockResolvedValue({
        id: 'link-custom-expire',
        stripePaymentLinkId: 'plink_custom_expire',
        url: 'https://buy.stripe.com/test_custom_expire',
        amount: 5000,
        expiresAt: customExpiry,
      });

      const result = await handler(
        {
          type: 'list_purchase',
          purchase_id: 'purchase-custom-expire',
          expires_in_hours: 168, // 7 days
        },
        mockContext
      );

      expect(result.expiresAt).toBeDefined();
    });

    it('records expiration in database', async () => {
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue({
        id: 'purchase-db-expire',
        tenantId: 'tenant-123',
        status: 'pending',
        recordCount: 1000,
        totalAmount: 5000,
      });

      vi.mocked(prisma.paymentLink.create).mockResolvedValue({
        id: 'link-db-expire',
        stripePaymentLinkId: 'plink_db_expire',
        url: 'https://buy.stripe.com/test_db_expire',
        amount: 5000,
        expiresAt: new Date(),
      });

      await handler(
        {
          type: 'list_purchase',
          purchase_id: 'purchase-db-expire',
        },
        mockContext
      );

      expect(prisma.paymentLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            expiresAt: expect.any(Date),
          }),
        })
      );
    });
  });

  describe('includes success/cancel URLs', () => {
    it('uses tenant default URLs', async () => {
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue({
        id: 'purchase-urls',
        tenantId: 'tenant-123',
        status: 'pending',
        recordCount: 1000,
        totalAmount: 5000,
      });

      vi.mocked(prisma.paymentLink.create).mockResolvedValue({
        id: 'link-urls',
        stripePaymentLinkId: 'plink_urls',
        url: 'https://buy.stripe.com/test_urls',
        amount: 5000,
      });

      await handler(
        {
          type: 'list_purchase',
          purchase_id: 'purchase-urls',
        },
        mockContext
      );

      expect(mockStripe.paymentLinks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          after_completion: expect.objectContaining({
            type: 'redirect',
            redirect: expect.objectContaining({
              url: expect.stringContaining('success'),
            }),
          }),
        })
      );
    });

    it('allows custom success URL', async () => {
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue({
        id: 'purchase-custom-success',
        tenantId: 'tenant-123',
        status: 'pending',
        recordCount: 1000,
        totalAmount: 5000,
      });

      vi.mocked(prisma.paymentLink.create).mockResolvedValue({
        id: 'link-custom-success',
        stripePaymentLinkId: 'plink_custom_success',
        url: 'https://buy.stripe.com/test_custom_success',
        amount: 5000,
      });

      await handler(
        {
          type: 'list_purchase',
          purchase_id: 'purchase-custom-success',
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

    it('includes purchase ID in success URL', async () => {
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue({
        id: 'purchase-id-in-url',
        tenantId: 'tenant-123',
        status: 'pending',
        recordCount: 1000,
        totalAmount: 5000,
      });

      vi.mocked(prisma.paymentLink.create).mockResolvedValue({
        id: 'link-id-in-url',
        stripePaymentLinkId: 'plink_id_in_url',
        url: 'https://buy.stripe.com/test_id_in_url',
        amount: 5000,
      });

      await handler(
        {
          type: 'list_purchase',
          purchase_id: 'purchase-id-in-url',
          success_url: 'https://app.example.com/success?purchase_id={purchase_id}',
        },
        mockContext
      );

      expect(mockStripe.paymentLinks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          after_completion: expect.objectContaining({
            redirect: expect.objectContaining({
              url: expect.stringContaining('purchase-id-in-url'),
            }),
          }),
        })
      );
    });
  });

  describe('validation', () => {
    it('validates type parameter', async () => {
      await expect(
        handler({ type: 'invalid' }, mockContext)
      ).rejects.toThrow();
    });

    it('requires purchase_id for list_purchase type', async () => {
      await expect(
        handler({ type: 'list_purchase' }, mockContext)
      ).rejects.toThrow('purchase_id');
    });

    it('requires batch_id for postcard_batch type', async () => {
      await expect(
        handler({ type: 'postcard_batch' }, mockContext)
      ).rejects.toThrow('batch_id');
    });

    it('validates purchase exists', async () => {
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue(null);

      await expect(
        handler(
          {
            type: 'list_purchase',
            purchase_id: 'non-existent',
          },
          mockContext
        )
      ).rejects.toThrow('not found');
    });

    it('validates purchase belongs to tenant', async () => {
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue({
        id: 'purchase-other-tenant',
        tenantId: 'other-tenant',
        status: 'pending',
        totalAmount: 5000,
      });

      await expect(
        handler(
          {
            type: 'list_purchase',
            purchase_id: 'purchase-other-tenant',
          },
          mockContext
        )
      ).rejects.toThrow('not found');
    });

    it('validates purchase is pending', async () => {
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue({
        id: 'purchase-completed',
        tenantId: 'tenant-123',
        status: 'completed',
        totalAmount: 5000,
      });

      await expect(
        handler(
          {
            type: 'list_purchase',
            purchase_id: 'purchase-completed',
          },
          mockContext
        )
      ).rejects.toThrow('already');
    });
  });

  describe('permission checks', () => {
    it('requires billing:create permission', async () => {
      const noPermContext = createMockContext({
        tenant: {
          ...createMockContext().tenant,
          permissions: ['purchases:read'],
        },
      });

      await expect(
        handler(
          {
            type: 'list_purchase',
            purchase_id: 'purchase-123',
          },
          noPermContext
        )
      ).rejects.toThrow('permission');
    });
  });
});
