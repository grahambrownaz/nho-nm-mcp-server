/**
 * Integration Tests for Exports REST API
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp } from '../../../src/api/app.js';
import { prisma } from '../../../src/db/client.js';

// Mock dependencies
vi.mock('../../../src/db/client.js', () => ({
  prisma: {
    tenant: {
      findUnique: vi.fn(),
    },
    export: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    delivery: {
      findUnique: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
    },
    purchase: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../../../src/services/data-provider.js', () => ({
  dataProvider: {
    query: vi.fn(),
  },
}));

vi.mock('../../../src/services/export-generator.js', () => ({
  exportGenerator: {
    toCSV: vi.fn(),
    toExcel: vi.fn(),
    toJSON: vi.fn(),
    uploadToS3: vi.fn(),
    generateSignedUrl: vi.fn(),
  },
}));

import { dataProvider } from '../../../src/services/data-provider.js';
import { exportGenerator } from '../../../src/services/export-generator.js';

// Create mock records
function createMockRecords(count: number = 10) {
  return Array.from({ length: count }, (_, i) => ({
    id: `record-${i + 1}`,
    firstName: `First${i + 1}`,
    lastName: `Last${i + 1}`,
    email: `user${i + 1}@example.com`,
    city: 'Phoenix',
    state: 'AZ',
    zip: '85001',
  }));
}

describe('Exports REST API', () => {
  let app: any;
  let mockRequest: (method: string, path: string, options?: any) => Promise<any>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock tenant authentication
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      id: 'tenant-123',
      name: 'Test Company',
      apiKeyHash: 'hashed-key',
      permissions: ['exports:create', 'exports:read', 'data:read'],
      settings: {},
    });

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

  describe('POST /api/v1/exports', () => {
    it('creates export from query', async () => {
      const mockRecords = createMockRecords(100);
      vi.mocked(dataProvider.query).mockResolvedValue(mockRecords);
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv data'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://bucket/export.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue(
        'https://download.example.com/export.csv?signed=true'
      );
      vi.mocked(prisma.export.create).mockResolvedValue({
        id: 'export-123',
        tenantId: 'tenant-123',
        format: 'csv',
        recordCount: 100,
        status: 'completed',
        filename: 'nho-export-2026-02-03.csv',
        downloadUrl: 'https://download.example.com/export.csv?signed=true',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      });

      const response = await mockRequest('POST', '/api/v1/exports', {
        body: {
          query: {
            database: 'nho',
            geography: { type: 'state', values: ['AZ'] },
          },
          format: 'csv',
        },
      });

      expect(response.status).toBe(201);
      expect(response.body.id).toBe('export-123');
      expect(response.body.format).toBe('csv');
      expect(response.body.recordCount).toBe(100);
      expect(response.body.downloadUrl).toContain('download.example.com');
    });

    it('creates Excel export', async () => {
      const mockRecords = createMockRecords(50);
      vi.mocked(dataProvider.query).mockResolvedValue(mockRecords);
      vi.mocked(exportGenerator.toExcel).mockResolvedValue(Buffer.from('xlsx data'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://bucket/export.xlsx');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue(
        'https://download.example.com/export.xlsx'
      );
      vi.mocked(prisma.export.create).mockResolvedValue({
        id: 'export-xlsx',
        format: 'xlsx',
        recordCount: 50,
        status: 'completed',
        downloadUrl: 'https://download.example.com/export.xlsx',
      });

      const response = await mockRequest('POST', '/api/v1/exports', {
        body: {
          query: {
            database: 'consumer',
            geography: { type: 'zip', values: ['85001'] },
          },
          format: 'xlsx',
        },
      });

      expect(response.status).toBe(201);
      expect(response.body.format).toBe('xlsx');
      expect(exportGenerator.toExcel).toHaveBeenCalled();
    });

    it('creates JSON export', async () => {
      const mockRecords = createMockRecords(25);
      vi.mocked(dataProvider.query).mockResolvedValue(mockRecords);
      vi.mocked(exportGenerator.toJSON).mockResolvedValue(
        Buffer.from(JSON.stringify(mockRecords))
      );
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://bucket/export.json');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue(
        'https://download.example.com/export.json'
      );
      vi.mocked(prisma.export.create).mockResolvedValue({
        id: 'export-json',
        format: 'json',
        recordCount: 25,
        status: 'completed',
        downloadUrl: 'https://download.example.com/export.json',
      });

      const response = await mockRequest('POST', '/api/v1/exports', {
        body: {
          query: {
            database: 'business',
            geography: { type: 'state', values: ['TX'] },
          },
          format: 'json',
        },
      });

      expect(response.status).toBe(201);
      expect(response.body.format).toBe('json');
      expect(exportGenerator.toJSON).toHaveBeenCalled();
    });

    it('exports from delivery source', async () => {
      const deliveryRecords = createMockRecords(200);
      vi.mocked(prisma.delivery.findUnique).mockResolvedValue({
        id: 'delivery-123',
        tenantId: 'tenant-123',
        records: deliveryRecords,
        recordCount: 200,
      });
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://bucket/delivery.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://download.url');
      vi.mocked(prisma.export.create).mockResolvedValue({
        id: 'export-delivery',
        format: 'csv',
        recordCount: 200,
        status: 'completed',
        downloadUrl: 'https://download.url',
      });

      const response = await mockRequest('POST', '/api/v1/exports', {
        body: {
          source: 'delivery',
          delivery_id: 'delivery-123',
          format: 'csv',
        },
      });

      expect(response.status).toBe(201);
      expect(response.body.recordCount).toBe(200);
    });

    it('exports from purchase source', async () => {
      const purchaseRecords = createMockRecords(500);
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue({
        id: 'purchase-123',
        tenantId: 'tenant-123',
        status: 'completed',
        records: purchaseRecords,
        recordCount: 500,
      });
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://bucket/purchase.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://download.url');
      vi.mocked(prisma.export.create).mockResolvedValue({
        id: 'export-purchase',
        format: 'csv',
        recordCount: 500,
        status: 'completed',
        downloadUrl: 'https://download.url',
      });

      const response = await mockRequest('POST', '/api/v1/exports', {
        body: {
          source: 'purchase',
          purchase_id: 'purchase-123',
          format: 'csv',
        },
      });

      expect(response.status).toBe(201);
      expect(response.body.recordCount).toBe(500);
    });

    it('selects specific columns', async () => {
      vi.mocked(dataProvider.query).mockResolvedValue(createMockRecords(10));
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://bucket/cols.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://url');
      vi.mocked(prisma.export.create).mockResolvedValue({
        id: 'export-cols',
        format: 'csv',
        recordCount: 10,
        status: 'completed',
      });

      const response = await mockRequest('POST', '/api/v1/exports', {
        body: {
          query: {
            database: 'nho',
            geography: { type: 'state', values: ['AZ'] },
          },
          format: 'csv',
          columns: ['firstName', 'lastName', 'email'],
        },
      });

      expect(response.status).toBe(201);
      expect(exportGenerator.toCSV).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          columns: ['firstName', 'lastName', 'email'],
        })
      );
    });

    it('returns 400 for invalid format', async () => {
      const response = await mockRequest('POST', '/api/v1/exports', {
        body: {
          query: {
            database: 'nho',
            geography: { type: 'state', values: ['AZ'] },
          },
          format: 'invalid',
        },
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('format');
    });

    it('returns 400 when missing query and source', async () => {
      const response = await mockRequest('POST', '/api/v1/exports', {
        body: {
          format: 'csv',
        },
      });

      expect(response.status).toBe(400);
    });

    it('returns 401 without API key', async () => {
      const response = await app.handleRequest({
        method: 'POST',
        path: '/api/v1/exports',
        headers: { 'content-type': 'application/json' },
        body: { query: {}, format: 'csv' },
      });

      expect(response.status).toBe(401);
    });

    it('returns 403 without permission', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
        id: 'tenant-123',
        permissions: ['data:read'], // Missing exports:create
      });

      const response = await mockRequest('POST', '/api/v1/exports', {
        body: {
          query: {
            database: 'nho',
            geography: { type: 'state', values: ['AZ'] },
          },
          format: 'csv',
        },
      });

      expect(response.status).toBe(403);
    });

    it('handles large export asynchronously', async () => {
      vi.mocked(dataProvider.query).mockResolvedValue(createMockRecords(100000));
      vi.mocked(prisma.export.create).mockResolvedValue({
        id: 'export-large',
        format: 'csv',
        recordCount: 100000,
        status: 'processing',
      });

      const response = await mockRequest('POST', '/api/v1/exports', {
        body: {
          query: {
            database: 'consumer',
            geography: { type: 'state', values: ['CA'] },
          },
          format: 'csv',
        },
      });

      expect(response.status).toBe(202); // Accepted for async processing
      expect(response.body.status).toBe('processing');
      expect(response.body.id).toBe('export-large');
    });
  });

  describe('GET /api/v1/exports/:id', () => {
    it('returns export with download URL', async () => {
      vi.mocked(prisma.export.findUnique).mockResolvedValue({
        id: 'export-123',
        tenantId: 'tenant-123',
        format: 'csv',
        recordCount: 100,
        status: 'completed',
        filename: 'nho-export-2026-02-03.csv',
        downloadUrl: 'https://download.example.com/export.csv?signed=true',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date('2026-02-03T10:00:00Z'),
      });

      const response = await mockRequest('GET', '/api/v1/exports/export-123');

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('export-123');
      expect(response.body.status).toBe('completed');
      expect(response.body.downloadUrl).toContain('download.example.com');
      expect(response.body.expiresAt).toBeDefined();
    });

    it('returns processing status for in-progress export', async () => {
      vi.mocked(prisma.export.findUnique).mockResolvedValue({
        id: 'export-processing',
        tenantId: 'tenant-123',
        format: 'csv',
        recordCount: 50000,
        status: 'processing',
        progress: 45,
      });

      const response = await mockRequest('GET', '/api/v1/exports/export-processing');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('processing');
      expect(response.body.progress).toBe(45);
      expect(response.body.downloadUrl).toBeUndefined();
    });

    it('regenerates download URL if expired', async () => {
      vi.mocked(prisma.export.findUnique).mockResolvedValue({
        id: 'export-expired',
        tenantId: 'tenant-123',
        format: 'csv',
        recordCount: 100,
        status: 'completed',
        s3Key: 'exports/export-expired.csv',
        downloadUrl: 'https://old-url.com/expired',
        expiresAt: new Date(Date.now() - 1000), // Already expired
      });
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue(
        'https://new-url.com/fresh'
      );

      const response = await mockRequest('GET', '/api/v1/exports/export-expired');

      expect(response.status).toBe(200);
      expect(response.body.downloadUrl).toBe('https://new-url.com/fresh');
      expect(exportGenerator.generateSignedUrl).toHaveBeenCalled();
    });

    it('returns 404 for non-existent export', async () => {
      vi.mocked(prisma.export.findUnique).mockResolvedValue(null);

      const response = await mockRequest('GET', '/api/v1/exports/non-existent');

      expect(response.status).toBe(404);
    });

    it('returns 404 for export from different tenant', async () => {
      vi.mocked(prisma.export.findUnique).mockResolvedValue({
        id: 'export-other',
        tenantId: 'other-tenant',
        status: 'completed',
      });

      const response = await mockRequest('GET', '/api/v1/exports/export-other');

      expect(response.status).toBe(404);
    });

    it('includes file size in response', async () => {
      vi.mocked(prisma.export.findUnique).mockResolvedValue({
        id: 'export-size',
        tenantId: 'tenant-123',
        format: 'csv',
        recordCount: 1000,
        status: 'completed',
        fileSize: 245760, // 240 KB
        downloadUrl: 'https://download.url',
      });

      const response = await mockRequest('GET', '/api/v1/exports/export-size');

      expect(response.status).toBe(200);
      expect(response.body.fileSize).toBe(245760);
    });
  });

  describe('GET /api/v1/exports', () => {
    it('lists tenant exports', async () => {
      vi.mocked(prisma.export.findMany).mockResolvedValue([
        {
          id: 'export-1',
          tenantId: 'tenant-123',
          format: 'csv',
          recordCount: 100,
          status: 'completed',
          createdAt: new Date('2026-02-01'),
        },
        {
          id: 'export-2',
          tenantId: 'tenant-123',
          format: 'xlsx',
          recordCount: 200,
          status: 'completed',
          createdAt: new Date('2026-02-02'),
        },
      ]);

      const response = await mockRequest('GET', '/api/v1/exports');

      expect(response.status).toBe(200);
      expect(response.body.exports).toHaveLength(2);
    });

    it('supports pagination', async () => {
      vi.mocked(prisma.export.findMany).mockResolvedValue([]);

      const response = await mockRequest('GET', '/api/v1/exports?limit=10&offset=20');

      expect(response.status).toBe(200);
      expect(prisma.export.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
        })
      );
    });

    it('filters by format', async () => {
      vi.mocked(prisma.export.findMany).mockResolvedValue([]);

      const response = await mockRequest('GET', '/api/v1/exports?format=csv');

      expect(response.status).toBe(200);
      expect(prisma.export.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            format: 'csv',
          }),
        })
      );
    });

    it('filters by status', async () => {
      vi.mocked(prisma.export.findMany).mockResolvedValue([]);

      const response = await mockRequest('GET', '/api/v1/exports?status=processing');

      expect(response.status).toBe(200);
      expect(prisma.export.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'processing',
          }),
        })
      );
    });

    it('orders by creation date descending', async () => {
      vi.mocked(prisma.export.findMany).mockResolvedValue([]);

      const response = await mockRequest('GET', '/api/v1/exports');

      expect(response.status).toBe(200);
      expect(prisma.export.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        })
      );
    });
  });
});
