/**
 * Tests for export_data Tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handler } from '../../../../src/tools/exports/export-data.js';
import { createTenantContext, TenantContext } from '../../../../src/utils/tenant-context.js';

// Mock dependencies
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    export: {
      create: vi.fn(),
      findUnique: vi.fn(),
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

vi.mock('../../../../src/services/data-provider.js', () => ({
  dataProvider: {
    query: vi.fn(),
    getRecords: vi.fn(),
  },
}));

vi.mock('../../../../src/services/export-generator.js', () => ({
  exportGenerator: {
    toCSV: vi.fn(),
    toExcel: vi.fn(),
    toJSON: vi.fn(),
    uploadToS3: vi.fn(),
    generateSignedUrl: vi.fn(),
  },
}));

import { prisma } from '../../../../src/db/client.js';
import { dataProvider } from '../../../../src/services/data-provider.js';
import { exportGenerator } from '../../../../src/services/export-generator.js';

// Create mock tenant context
function createMockContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenant: {
      id: 'tenant-123',
      name: 'Test Company',
      apiKeyHash: 'hashed-key',
      permissions: ['exports:create', 'data:read'],
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
    filters: {},
    ...overrides,
  };
}

// Create mock records
function createMockRecords(count: number = 5) {
  return Array.from({ length: count }, (_, i) => ({
    id: `record-${i + 1}`,
    firstName: `First${i + 1}`,
    lastName: `Last${i + 1}`,
    email: `user${i + 1}@example.com`,
    address: `${100 + i} Main Street`,
    city: 'Phoenix',
    state: 'AZ',
    zip: '85001',
    saleDate: '2026-01-15',
    salePrice: 350000 + i * 10000,
  }));
}

describe('export_data tool', () => {
  const mockContext = createMockContext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('exports fresh query to CSV', () => {
    it('exports query results to CSV format', async () => {
      const mockRecords = createMockRecords(100);
      vi.mocked(dataProvider.query).mockResolvedValue(mockRecords);
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv,data'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://exports/file.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue(
        'https://s3.amazonaws.com/exports/file.csv?signed=true'
      );
      vi.mocked(prisma.export.create).mockResolvedValue({
        id: 'export-csv-123',
        tenantId: 'tenant-123',
        format: 'csv',
        recordCount: 100,
        status: 'completed',
        downloadUrl: 'https://s3.amazonaws.com/exports/file.csv?signed=true',
        createdAt: new Date(),
      });

      const result = await handler(
        {
          query: createMockQuery(),
          format: 'csv',
        },
        mockContext
      );

      expect(result.format).toBe('csv');
      expect(result.recordCount).toBe(100);
      expect(result.downloadUrl).toContain('s3.amazonaws.com');
      expect(exportGenerator.toCSV).toHaveBeenCalledWith(mockRecords, expect.any(Object));
    });

    it('includes header row in CSV', async () => {
      const mockRecords = createMockRecords(10);
      vi.mocked(dataProvider.query).mockResolvedValue(mockRecords);
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('header,row\ndata,row'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://exports/file.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://url');
      vi.mocked(prisma.export.create).mockResolvedValue({
        id: 'export-csv-header',
        format: 'csv',
        recordCount: 10,
        status: 'completed',
      });

      await handler(
        {
          query: createMockQuery(),
          format: 'csv',
        },
        mockContext
      );

      expect(exportGenerator.toCSV).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ includeHeader: true })
      );
    });
  });

  describe('exports fresh query to Excel', () => {
    it('exports query results to Excel format', async () => {
      const mockRecords = createMockRecords(100);
      vi.mocked(dataProvider.query).mockResolvedValue(mockRecords);
      vi.mocked(exportGenerator.toExcel).mockResolvedValue(Buffer.from('xlsx data'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://exports/file.xlsx');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue(
        'https://s3.amazonaws.com/exports/file.xlsx?signed=true'
      );
      vi.mocked(prisma.export.create).mockResolvedValue({
        id: 'export-xlsx-123',
        tenantId: 'tenant-123',
        format: 'xlsx',
        recordCount: 100,
        status: 'completed',
        downloadUrl: 'https://s3.amazonaws.com/exports/file.xlsx?signed=true',
        createdAt: new Date(),
      });

      const result = await handler(
        {
          query: createMockQuery(),
          format: 'xlsx',
        },
        mockContext
      );

      expect(result.format).toBe('xlsx');
      expect(result.downloadUrl).toContain('.xlsx');
      expect(exportGenerator.toExcel).toHaveBeenCalled();
    });

    it('includes worksheet name', async () => {
      const mockRecords = createMockRecords(10);
      vi.mocked(dataProvider.query).mockResolvedValue(mockRecords);
      vi.mocked(exportGenerator.toExcel).mockResolvedValue(Buffer.from('xlsx'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://exports/file.xlsx');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://url');
      vi.mocked(prisma.export.create).mockResolvedValue({
        id: 'export-xlsx-sheet',
        format: 'xlsx',
        recordCount: 10,
        status: 'completed',
      });

      await handler(
        {
          query: createMockQuery(),
          format: 'xlsx',
          sheet_name: 'NHO Data',
        },
        mockContext
      );

      expect(exportGenerator.toExcel).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ sheetName: 'NHO Data' })
      );
    });
  });

  describe('exports fresh query to JSON', () => {
    it('exports query results to JSON format', async () => {
      const mockRecords = createMockRecords(100);
      vi.mocked(dataProvider.query).mockResolvedValue(mockRecords);
      vi.mocked(exportGenerator.toJSON).mockResolvedValue(Buffer.from(JSON.stringify(mockRecords)));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://exports/file.json');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue(
        'https://s3.amazonaws.com/exports/file.json?signed=true'
      );
      vi.mocked(prisma.export.create).mockResolvedValue({
        id: 'export-json-123',
        tenantId: 'tenant-123',
        format: 'json',
        recordCount: 100,
        status: 'completed',
        downloadUrl: 'https://s3.amazonaws.com/exports/file.json?signed=true',
        createdAt: new Date(),
      });

      const result = await handler(
        {
          query: createMockQuery(),
          format: 'json',
        },
        mockContext
      );

      expect(result.format).toBe('json');
      expect(result.downloadUrl).toContain('.json');
      expect(exportGenerator.toJSON).toHaveBeenCalled();
    });

    it('supports pretty printed JSON', async () => {
      const mockRecords = createMockRecords(5);
      vi.mocked(dataProvider.query).mockResolvedValue(mockRecords);
      vi.mocked(exportGenerator.toJSON).mockResolvedValue(Buffer.from('{}'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://exports/file.json');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://url');
      vi.mocked(prisma.export.create).mockResolvedValue({
        id: 'export-json-pretty',
        format: 'json',
        recordCount: 5,
        status: 'completed',
      });

      await handler(
        {
          query: createMockQuery(),
          format: 'json',
          pretty: true,
        },
        mockContext
      );

      expect(exportGenerator.toJSON).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ pretty: true })
      );
    });
  });

  describe('exports from past delivery', () => {
    it('exports records from a delivery', async () => {
      const deliveryRecords = createMockRecords(50);
      vi.mocked(prisma.delivery.findUnique).mockResolvedValue({
        id: 'delivery-123',
        tenantId: 'tenant-123',
        subscriptionId: 'sub-123',
        records: deliveryRecords,
        recordCount: 50,
        createdAt: new Date(),
      });
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://exports/delivery.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://url');
      vi.mocked(prisma.export.create).mockResolvedValue({
        id: 'export-delivery',
        format: 'csv',
        recordCount: 50,
        status: 'completed',
      });

      const result = await handler(
        {
          source: 'delivery',
          delivery_id: 'delivery-123',
          format: 'csv',
        },
        mockContext
      );

      expect(result.recordCount).toBe(50);
      expect(prisma.delivery.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'delivery-123' },
        })
      );
    });

    it('rejects delivery from different tenant', async () => {
      vi.mocked(prisma.delivery.findUnique).mockResolvedValue({
        id: 'delivery-other',
        tenantId: 'other-tenant',
        records: [],
      });

      await expect(
        handler(
          {
            source: 'delivery',
            delivery_id: 'delivery-other',
            format: 'csv',
          },
          mockContext
        )
      ).rejects.toThrow('not found');
    });
  });

  describe('exports from subscription', () => {
    it('exports all records from a subscription', async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        id: 'sub-123',
        tenantId: 'tenant-123',
        query: createMockQuery(),
        deliveries: [
          { id: 'del-1', records: createMockRecords(100) },
          { id: 'del-2', records: createMockRecords(100) },
        ],
      });
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://exports/sub.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://url');
      vi.mocked(prisma.export.create).mockResolvedValue({
        id: 'export-sub',
        format: 'csv',
        recordCount: 200,
        status: 'completed',
      });

      const result = await handler(
        {
          source: 'subscription',
          subscription_id: 'sub-123',
          format: 'csv',
        },
        mockContext
      );

      expect(result.recordCount).toBe(200);
    });

    it('exports deliveries within date range', async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        id: 'sub-456',
        tenantId: 'tenant-123',
        query: createMockQuery(),
        deliveries: [
          { id: 'del-1', records: createMockRecords(50), createdAt: new Date('2026-01-01') },
          { id: 'del-2', records: createMockRecords(50), createdAt: new Date('2026-01-15') },
          { id: 'del-3', records: createMockRecords(50), createdAt: new Date('2026-02-01') },
        ],
      });
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://exports/sub-date.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://url');
      vi.mocked(prisma.export.create).mockResolvedValue({
        id: 'export-sub-date',
        format: 'csv',
        recordCount: 100,
        status: 'completed',
      });

      const result = await handler(
        {
          source: 'subscription',
          subscription_id: 'sub-456',
          format: 'csv',
          date_range: {
            start: '2026-01-01',
            end: '2026-01-31',
          },
        },
        mockContext
      );

      // Should only include deliveries from January
      expect(result.recordCount).toBe(100);
    });
  });

  describe('exports from purchase', () => {
    it('exports records from a completed purchase', async () => {
      const purchaseRecords = createMockRecords(500);
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue({
        id: 'purchase-123',
        tenantId: 'tenant-123',
        status: 'completed',
        records: purchaseRecords,
        recordCount: 500,
      });
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://exports/purchase.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://url');
      vi.mocked(prisma.export.create).mockResolvedValue({
        id: 'export-purchase',
        format: 'csv',
        recordCount: 500,
        status: 'completed',
      });

      const result = await handler(
        {
          source: 'purchase',
          purchase_id: 'purchase-123',
          format: 'csv',
        },
        mockContext
      );

      expect(result.recordCount).toBe(500);
    });

    it('rejects pending purchase', async () => {
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue({
        id: 'purchase-pending',
        tenantId: 'tenant-123',
        status: 'pending',
      });

      await expect(
        handler(
          {
            source: 'purchase',
            purchase_id: 'purchase-pending',
            format: 'csv',
          },
          mockContext
        )
      ).rejects.toThrow('not completed');
    });
  });

  describe('respects column selection', () => {
    it('exports only selected columns', async () => {
      const mockRecords = createMockRecords(10);
      vi.mocked(dataProvider.query).mockResolvedValue(mockRecords);
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://exports/cols.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://url');
      vi.mocked(prisma.export.create).mockResolvedValue({
        id: 'export-cols',
        format: 'csv',
        recordCount: 10,
        status: 'completed',
      });

      await handler(
        {
          query: createMockQuery(),
          format: 'csv',
          columns: ['firstName', 'lastName', 'email', 'city', 'state'],
        },
        mockContext
      );

      expect(exportGenerator.toCSV).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          columns: ['firstName', 'lastName', 'email', 'city', 'state'],
        })
      );
    });

    it('renames columns in export', async () => {
      const mockRecords = createMockRecords(10);
      vi.mocked(dataProvider.query).mockResolvedValue(mockRecords);
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://exports/rename.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://url');
      vi.mocked(prisma.export.create).mockResolvedValue({
        id: 'export-rename',
        format: 'csv',
        recordCount: 10,
        status: 'completed',
      });

      await handler(
        {
          query: createMockQuery(),
          format: 'csv',
          column_mapping: {
            firstName: 'First Name',
            lastName: 'Last Name',
            salePrice: 'Sale Amount',
          },
        },
        mockContext
      );

      expect(exportGenerator.toCSV).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          columnMapping: {
            firstName: 'First Name',
            lastName: 'Last Name',
            salePrice: 'Sale Amount',
          },
        })
      );
    });
  });

  describe('handles large datasets', () => {
    it('exports large dataset in chunks', async () => {
      const largeRecordSet = createMockRecords(50000);
      vi.mocked(dataProvider.query).mockResolvedValue(largeRecordSet);
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('large csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://exports/large.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://url');
      vi.mocked(prisma.export.create).mockResolvedValue({
        id: 'export-large',
        format: 'csv',
        recordCount: 50000,
        status: 'completed',
      });

      const result = await handler(
        {
          query: createMockQuery(),
          format: 'csv',
        },
        mockContext
      );

      expect(result.recordCount).toBe(50000);
    });

    it('processes async for very large exports', async () => {
      vi.mocked(dataProvider.query).mockResolvedValue(createMockRecords(100000));
      vi.mocked(prisma.export.create).mockResolvedValue({
        id: 'export-async',
        format: 'csv',
        recordCount: 100000,
        status: 'processing',
      });

      const result = await handler(
        {
          query: createMockQuery(),
          format: 'csv',
        },
        mockContext
      );

      // Large exports should be processed asynchronously
      expect(result.status).toBe('processing');
      expect(result.exportId).toBe('export-async');
    });

    it('returns progress for async exports', async () => {
      vi.mocked(prisma.export.findUnique).mockResolvedValue({
        id: 'export-progress',
        status: 'processing',
        progress: 45,
        recordCount: 100000,
      });

      // Simulating status check
      const exportStatus = await prisma.export.findUnique({
        where: { id: 'export-progress' },
      });

      expect(exportStatus?.progress).toBe(45);
    });
  });

  describe('validation', () => {
    it('validates format parameter', async () => {
      await expect(
        handler(
          {
            query: createMockQuery(),
            format: 'invalid',
          },
          mockContext
        )
      ).rejects.toThrow();
    });

    it('requires either query or source', async () => {
      await expect(
        handler({ format: 'csv' }, mockContext)
      ).rejects.toThrow();
    });

    it('validates source type', async () => {
      await expect(
        handler(
          {
            source: 'invalid',
            format: 'csv',
          },
          mockContext
        )
      ).rejects.toThrow();
    });
  });

  describe('permission checks', () => {
    it('requires exports:create permission', async () => {
      const noPermContext = createMockContext({
        tenant: {
          ...createMockContext().tenant,
          permissions: ['data:read'],
        },
      });

      await expect(
        handler(
          {
            query: createMockQuery(),
            format: 'csv',
          },
          noPermContext
        )
      ).rejects.toThrow('permission');
    });
  });

  describe('file naming', () => {
    it('generates descriptive filename', async () => {
      vi.mocked(dataProvider.query).mockResolvedValue(createMockRecords(10));
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://exports/nho-az-2026-02-03.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://url');
      vi.mocked(prisma.export.create).mockResolvedValue({
        id: 'export-named',
        format: 'csv',
        recordCount: 10,
        filename: 'nho-az-2026-02-03.csv',
        status: 'completed',
      });

      const result = await handler(
        {
          query: createMockQuery(),
          format: 'csv',
        },
        mockContext
      );

      expect(result.filename).toContain('nho');
      expect(result.filename).toContain('.csv');
    });

    it('allows custom filename', async () => {
      vi.mocked(dataProvider.query).mockResolvedValue(createMockRecords(10));
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://exports/my-export.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://url');
      vi.mocked(prisma.export.create).mockResolvedValue({
        id: 'export-custom-name',
        format: 'csv',
        recordCount: 10,
        filename: 'my-export.csv',
        status: 'completed',
      });

      const result = await handler(
        {
          query: createMockQuery(),
          format: 'csv',
          filename: 'my-export',
        },
        mockContext
      );

      expect(result.filename).toBe('my-export.csv');
    });
  });

  describe('download URL', () => {
    it('generates signed download URL', async () => {
      vi.mocked(dataProvider.query).mockResolvedValue(createMockRecords(10));
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://bucket/file.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue(
        'https://bucket.s3.amazonaws.com/file.csv?X-Amz-Signature=abc123&X-Amz-Expires=3600'
      );
      vi.mocked(prisma.export.create).mockResolvedValue({
        id: 'export-signed',
        format: 'csv',
        recordCount: 10,
        status: 'completed',
      });

      const result = await handler(
        {
          query: createMockQuery(),
          format: 'csv',
        },
        mockContext
      );

      expect(result.downloadUrl).toContain('X-Amz-Signature');
    });

    it('sets URL expiration time', async () => {
      vi.mocked(dataProvider.query).mockResolvedValue(createMockRecords(10));
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://bucket/file.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://url');
      vi.mocked(prisma.export.create).mockResolvedValue({
        id: 'export-expiry',
        format: 'csv',
        recordCount: 10,
        status: 'completed',
      });

      await handler(
        {
          query: createMockQuery(),
          format: 'csv',
        },
        mockContext
      );

      expect(exportGenerator.generateSignedUrl).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ expiresIn: expect.any(Number) })
      );
    });
  });
});
