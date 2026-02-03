/**
 * Integration Tests for Purchases REST API
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp } from '../../../src/api/app.js';
import { prisma } from '../../../src/db/client.js';
import Stripe from 'stripe';

// Mock dependencies
vi.mock('../../../src/db/client.js', () => ({
  prisma: {
    tenant: {
      findUnique: vi.fn(),
    },
    purchase: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
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

vi.mock('../../../src/services/data-provider.js', () => ({
  dataProvider: {
    getCount: vi.fn(),
    getSampleRecords: vi.fn(),
  },
}));

import { dataProvider } from '../../../src/services/data-provider.js';

describe('Purchases REST API', () => {
  let app: any;
  let mockStripe: any;
  let mockRequest: (method: string, path: string, options?: any) => Promise<any>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock tenant authentication
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      id: 'tenant-123',
      name: 'Test Company',
      stripeCustomerId: 'cus_test123',
      apiKeyHash: 'hashed-key',
      permissions: ['purchases:create', 'purchases:read', 'data:read'],
      settings: {},
    });

    // Mock Stripe
    mockStripe = {
      paymentLinks: {
        create: vi.fn().mockResolvedValue({
          id: 'plink_test123',
          url: 'https://buy.stripe.com/test_link',
        }),
      },
      prices: {
        create: vi.fn().mockResolvedValue({ id: 'price_test123' }),
      },
      products: {
        create: vi.fn().mockResolvedValue({ id: 'prod_test123' }),
      },
    };
    vi.mocked(Stripe).mockReturnValue(mockStripe);

    app = await createApp();

    // Mock request function
    mockRequest = async (method: string, path: string, options: any = {}) => {
      const { headers = {}, body } = options;
      return app.handleRequest({
        method,
        path,
        headers: {
          'x-api-key': 'test-api-key',
          'content-type': 'application/json',
          ...headers,
        },
        body,
      });
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/v1/purchases', () => {
    it('creates quote with pricing', async () => {
      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 5000 });
      vi.mocked(dataProvider.getSampleRecords).mockResolvedValue([]);
      vi.mocked(prisma.pricing.findFirst).mockResolvedValue({
        id: 'pricing-1',
        pricePerRecord: 0.05,
      });
      vi.mocked(prisma.purchase.create).mockResolvedValue({
        id: 'purchase-123',
        tenantId: 'tenant-123',
        status: 'pending',
        recordCount: 5000,
        totalAmount: 25000,
        query: {
          database: 'nho',
          geography: { type: 'state', values: ['AZ'] },
        },
        createdAt: new Date(),
      });

      const response = await mockRequest('POST', '/api/v1/purchases', {
        body: {
          query: {
            database: 'nho',
            geography: { type: 'state', values: ['AZ'] },
            filters: { sale_price_min: 200000 },
          },
        },
      });

      expect(response.status).toBe(201);
      expect(response.body.id).toBe('purchase-123');
      expect(response.body.quote).toBeDefined();
      expect(response.body.quote.recordCount).toBe(5000);
      expect(response.body.quote.totalAmount).toBe(25000);
    });

    it('includes payment link in response', async () => {
      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 1000 });
      vi.mocked(dataProvider.getSampleRecords).mockResolvedValue([]);
      vi.mocked(prisma.pricing.findFirst).mockResolvedValue({
        id: 'pricing-1',
        pricePerRecord: 0.05,
      });
      vi.mocked(prisma.purchase.create).mockResolvedValue({
        id: 'purchase-456',
        status: 'pending',
        recordCount: 1000,
        totalAmount: 5000,
      });

      const response = await mockRequest('POST', '/api/v1/purchases', {
        body: {
          query: {
            database: 'nho',
            geography: { type: 'zip', values: ['85001'] },
          },
        },
      });

      expect(response.status).toBe(201);
      expect(response.body.paymentLink).toBeDefined();
      expect(response.body.paymentLink.url).toContain('stripe.com');
    });

    it('includes sample records when requested', async () => {
      const sampleRecords = [
        { id: '1', firstName: 'John', lastName: 'Smith' },
        { id: '2', firstName: 'Jane', lastName: 'Doe' },
      ];

      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 500 });
      vi.mocked(dataProvider.getSampleRecords).mockResolvedValue(sampleRecords);
      vi.mocked(prisma.pricing.findFirst).mockResolvedValue({
        id: 'pricing-1',
        pricePerRecord: 0.05,
      });
      vi.mocked(prisma.purchase.create).mockResolvedValue({
        id: 'purchase-789',
        status: 'pending',
        recordCount: 500,
        totalAmount: 2500,
      });

      const response = await mockRequest('POST', '/api/v1/purchases', {
        body: {
          query: {
            database: 'nho',
            geography: { type: 'state', values: ['CA'] },
          },
          include_sample: true,
          sample_count: 5,
        },
      });

      expect(response.status).toBe(201);
      expect(response.body.sampleRecords).toBeDefined();
      expect(response.body.sampleRecords).toHaveLength(2);
    });

    it('applies volume discounts', async () => {
      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 10000 });
      vi.mocked(dataProvider.getSampleRecords).mockResolvedValue([]);
      vi.mocked(prisma.pricing.findFirst).mockResolvedValue({
        id: 'pricing-1',
        pricePerRecord: 0.05,
        volumeDiscounts: [
          { minRecords: 5000, discount: 0.10 },
          { minRecords: 10000, discount: 0.15 },
        ],
      });
      vi.mocked(prisma.purchase.create).mockResolvedValue({
        id: 'purchase-vol',
        status: 'pending',
        recordCount: 10000,
        totalAmount: 42500, // $500 - 15% = $425
      });

      const response = await mockRequest('POST', '/api/v1/purchases', {
        body: {
          query: {
            database: 'consumer',
            geography: { type: 'state', values: ['TX'] },
          },
        },
      });

      expect(response.status).toBe(201);
      expect(response.body.quote.discount).toBeDefined();
      expect(response.body.quote.discount.percentage).toBe(15);
    });

    it('returns 400 for invalid query', async () => {
      const response = await mockRequest('POST', '/api/v1/purchases', {
        body: {
          query: {
            database: 'invalid',
          },
        },
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('returns 400 for zero results', async () => {
      vi.mocked(dataProvider.getCount).mockResolvedValue({ count: 0 });

      const response = await mockRequest('POST', '/api/v1/purchases', {
        body: {
          query: {
            database: 'nho',
            geography: { type: 'zip', values: ['00000'] },
          },
        },
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('No records');
    });

    it('returns 401 without API key', async () => {
      const response = await app.handleRequest({
        method: 'POST',
        path: '/api/v1/purchases',
        headers: { 'content-type': 'application/json' },
        body: { query: {} },
      });

      expect(response.status).toBe(401);
    });

    it('returns 403 without permission', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
        id: 'tenant-123',
        permissions: ['data:read'], // Missing purchases:create
      });

      const response = await mockRequest('POST', '/api/v1/purchases', {
        body: {
          query: {
            database: 'nho',
            geography: { type: 'state', values: ['AZ'] },
          },
        },
      });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/v1/purchases/:id', () => {
    it('returns purchase details', async () => {
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue({
        id: 'purchase-123',
        tenantId: 'tenant-123',
        status: 'completed',
        recordCount: 5000,
        totalAmount: 25000,
        query: {
          database: 'nho',
          geography: { type: 'state', values: ['AZ'] },
        },
        createdAt: new Date('2026-02-01'),
        completedAt: new Date('2026-02-01'),
        deliveries: [
          {
            id: 'delivery-1',
            recordCount: 5000,
            downloadUrl: 'https://download.example.com/file.csv',
          },
        ],
      });

      const response = await mockRequest('GET', '/api/v1/purchases/purchase-123');

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('purchase-123');
      expect(response.body.status).toBe('completed');
      expect(response.body.recordCount).toBe(5000);
    });

    it('includes delivery information', async () => {
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue({
        id: 'purchase-456',
        tenantId: 'tenant-123',
        status: 'completed',
        deliveries: [
          {
            id: 'delivery-1',
            recordCount: 1000,
            downloadUrl: 'https://download.example.com/data.csv',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        ],
      });

      const response = await mockRequest('GET', '/api/v1/purchases/purchase-456');

      expect(response.status).toBe(200);
      expect(response.body.deliveries).toHaveLength(1);
      expect(response.body.deliveries[0].downloadUrl).toContain('download.example.com');
    });

    it('returns 404 for non-existent purchase', async () => {
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue(null);

      const response = await mockRequest('GET', '/api/v1/purchases/non-existent');

      expect(response.status).toBe(404);
    });

    it('returns 404 for purchase from different tenant', async () => {
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue({
        id: 'purchase-other',
        tenantId: 'other-tenant',
        status: 'completed',
      });

      const response = await mockRequest('GET', '/api/v1/purchases/purchase-other');

      expect(response.status).toBe(404);
    });

    it('includes payment status', async () => {
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue({
        id: 'purchase-paid',
        tenantId: 'tenant-123',
        status: 'paid',
        paidAt: new Date('2026-02-01T10:00:00Z'),
        stripePaymentIntentId: 'pi_test123',
      });

      const response = await mockRequest('GET', '/api/v1/purchases/purchase-paid');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('paid');
      expect(response.body.paidAt).toBeDefined();
    });
  });

  describe('GET /api/v1/purchases', () => {
    it('lists tenant purchases', async () => {
      vi.mocked(prisma.purchase.findMany).mockResolvedValue([
        {
          id: 'purchase-1',
          tenantId: 'tenant-123',
          status: 'completed',
          recordCount: 1000,
          totalAmount: 5000,
          createdAt: new Date('2026-02-01'),
        },
        {
          id: 'purchase-2',
          tenantId: 'tenant-123',
          status: 'pending',
          recordCount: 2000,
          totalAmount: 10000,
          createdAt: new Date('2026-02-02'),
        },
      ]);

      const response = await mockRequest('GET', '/api/v1/purchases');

      expect(response.status).toBe(200);
      expect(response.body.purchases).toHaveLength(2);
    });

    it('supports pagination', async () => {
      vi.mocked(prisma.purchase.findMany).mockResolvedValue([
        { id: 'purchase-1', tenantId: 'tenant-123', status: 'completed' },
      ]);

      const response = await mockRequest('GET', '/api/v1/purchases?limit=10&offset=0');

      expect(response.status).toBe(200);
      expect(prisma.purchase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 0,
        })
      );
    });

    it('filters by status', async () => {
      vi.mocked(prisma.purchase.findMany).mockResolvedValue([
        { id: 'purchase-1', tenantId: 'tenant-123', status: 'completed' },
      ]);

      const response = await mockRequest('GET', '/api/v1/purchases?status=completed');

      expect(response.status).toBe(200);
      expect(prisma.purchase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'completed',
          }),
        })
      );
    });
  });
});
