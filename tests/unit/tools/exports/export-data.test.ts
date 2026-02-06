/**
 * Tests for export_data Tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TenantContext } from '../../../../src/utils/auth.js';

// Mock dependencies before imports
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    exportFile: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    delivery: {
      findFirst: vi.fn(),
    },
    deliveryRecord: {
      findMany: vi.fn(),
    },
    listPurchase: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('../../../../src/tools/data/search-data.js', () => ({
  executeSearchData: vi.fn(),
}));

vi.mock('../../../../src/services/export-generator.js', () => ({
  generateExport: vi.fn(),
  generateLocalExport: vi.fn(),
  isS3Configured: vi.fn(),
}));

vi.mock('../../../../src/schemas/filters.js', async () => {
  const { z } = await import('zod');
  return {
    DatabaseTypeSchema: z.enum(['consumer', 'business', 'nho', 'new_mover']),
    getFilterSchema: vi.fn(() => z.object({}).passthrough()),
  };
});

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-123'),
}));

// Import after mocks
import { executeExportData } from '../../../../src/tools/exports/export-data.js';
import { prisma } from '../../../../src/db/client.js';
import { executeSearchData } from '../../../../src/tools/data/search-data.js';
import { generateExport, generateLocalExport, isS3Configured } from '../../../../src/services/export-generator.js';

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
      stripeCustomerId: null,
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
  const mockContext = createTestContext();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks
    vi.mocked(isS3Configured).mockReturnValue(false);
    vi.mocked(generateLocalExport).mockResolvedValue({
      buffer: Buffer.from('csv,data'),
      contentType: 'text/csv',
      filename: 'export.csv',
    });

    vi.mocked(executeSearchData).mockResolvedValue({
      success: true,
      data: {
        records: createMockRecords(100),
        total: 100,
        database: 'nho',
      },
    });

    vi.mocked(prisma.exportFile.create).mockResolvedValue({
      id: 'export-123',
      tenantId: 'tenant-123',
      sourceType: 'query',
      sourceId: 'test-uuid-123',
      format: 'csv',
      s3Key: '',
      fileSizeBytes: 1000,
      recordCount: 100,
      columns: ['firstName', 'lastName', 'email'],
      downloadUrl: 'data:text/csv;base64,Y3N2LGRhdGE=',
      downloadExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('exports fresh query to CSV', () => {
    it('exports query results to CSV format', async () => {
      const result = await executeExportData(
        {
          query: createMockQuery(),
          format: 'csv',
          delivery: 'download_url',
        },
        mockContext
      );

      expect(result.format).toBe('csv');
      expect(result.record_count).toBe(100);
      expect(result.download_url).toBeDefined();
      expect(generateLocalExport).toHaveBeenCalled();
    });

    it('includes header row in CSV', async () => {
      await executeExportData(
        {
          query: createMockQuery(),
          format: 'csv',
          delivery: 'download_url',
          include_headers: true,
        },
        mockContext
      );

      expect(generateLocalExport).toHaveBeenCalledWith(
        expect.objectContaining({ includeHeaders: true })
      );
    });
  });

  describe('exports fresh query to Excel', () => {
    it('exports query results to Excel format', async () => {
      vi.mocked(generateLocalExport).mockResolvedValue({
        buffer: Buffer.from('xlsx data'),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: 'export.xlsx',
      });

      vi.mocked(prisma.exportFile.create).mockResolvedValue({
        id: 'export-xlsx-123',
        format: 'excel',
        recordCount: 100,
        fileSizeBytes: 2000,
        downloadUrl: 'data:application/xlsx;base64,eGxzeCBkYXRh',
        downloadExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      } as any);

      const result = await executeExportData(
        {
          query: createMockQuery(),
          format: 'excel',
          delivery: 'download_url',
        },
        mockContext
      );

      expect(result.format).toBe('excel');
      expect(generateLocalExport).toHaveBeenCalled();
    });
  });

  describe('exports fresh query to JSON', () => {
    it('exports query results to JSON format', async () => {
      vi.mocked(generateLocalExport).mockResolvedValue({
        buffer: Buffer.from(JSON.stringify(createMockRecords())),
        contentType: 'application/json',
        filename: 'export.json',
      });

      vi.mocked(prisma.exportFile.create).mockResolvedValue({
        id: 'export-json-123',
        format: 'json',
        recordCount: 100,
        fileSizeBytes: 1500,
        downloadUrl: 'data:application/json;base64,W10=',
        downloadExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      } as any);

      const result = await executeExportData(
        {
          query: createMockQuery(),
          format: 'json',
          delivery: 'download_url',
        },
        mockContext
      );

      expect(result.format).toBe('json');
      expect(generateLocalExport).toHaveBeenCalled();
    });
  });

  describe('exports from past delivery', () => {
    it('exports records from a delivery', async () => {
      const deliveryRecords = Array.from({ length: 50 }, (_, i) => ({
        id: `dr-${i}`,
        firstName: `First${i}`,
        lastName: `Last${i}`,
        address: `${i} Main St`,
        city: 'Phoenix',
        state: 'AZ',
        zip: '85001',
        moveDate: new Date(),
      }));

      vi.mocked(prisma.delivery.findFirst).mockResolvedValue({
        id: '123e4567-e89b-12d3-a456-426614174000',
        tenantId: 'tenant-123',
        status: 'COMPLETED',
      } as any);

      vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue(deliveryRecords as any);

      vi.mocked(prisma.exportFile.create).mockResolvedValue({
        id: 'export-delivery',
        format: 'csv',
        recordCount: 50,
        fileSizeBytes: 500,
        downloadUrl: 'data:text/csv;base64,Y3N2',
        downloadExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      } as any);

      const result = await executeExportData(
        {
          delivery_id: '123e4567-e89b-12d3-a456-426614174000',
          format: 'csv',
          delivery: 'download_url',
        },
        mockContext
      );

      expect(result.record_count).toBe(50);
      expect(prisma.delivery.findFirst).toHaveBeenCalled();
    });

    it('rejects delivery from different tenant', async () => {
      vi.mocked(prisma.delivery.findFirst).mockResolvedValue(null);

      await expect(
        executeExportData(
          {
            delivery_id: '223e4567-e89b-12d3-a456-426614174001',
            format: 'csv',
            delivery: 'download_url',
          },
          mockContext
        )
      ).rejects.toThrow('not found');
    });
  });

  describe('exports from purchase', () => {
    it('rejects pending purchase', async () => {
      vi.mocked(prisma.listPurchase.findFirst).mockResolvedValue(null);

      await expect(
        executeExportData(
          {
            purchase_id: '323e4567-e89b-12d3-a456-426614174002',
            format: 'csv',
            delivery: 'download_url',
          },
          mockContext
        )
      ).rejects.toThrow();
    });
  });

  describe('respects column selection', () => {
    it('exports only selected columns', async () => {
      await executeExportData(
        {
          query: createMockQuery(),
          format: 'csv',
          delivery: 'download_url',
          columns: ['firstName', 'lastName', 'email', 'city', 'state'],
        },
        mockContext
      );

      expect(generateLocalExport).toHaveBeenCalledWith(
        expect.objectContaining({
          columns: ['firstName', 'lastName', 'email', 'city', 'state'],
        })
      );
    });
  });

  describe('validation', () => {
    it('validates format parameter', async () => {
      await expect(
        executeExportData(
          {
            query: createMockQuery(),
            format: 'invalid' as any,
            delivery: 'download_url',
          },
          mockContext
        )
      ).rejects.toThrow();
    });

    it('requires either query or source', async () => {
      await expect(
        executeExportData(
          {
            format: 'csv',
            delivery: 'download_url',
          } as any,
          mockContext
        )
      ).rejects.toThrow();
    });
  });

  describe('handles empty results', () => {
    it('throws error when no records to export', async () => {
      vi.mocked(executeSearchData).mockResolvedValue({
        success: true,
        data: {
          records: [],
          total: 0,
          database: 'nho',
        },
      });

      await expect(
        executeExportData(
          {
            query: createMockQuery(),
            format: 'csv',
            delivery: 'download_url',
          },
          mockContext
        )
      ).rejects.toThrow('No records');
    });
  });

  describe('delivery methods', () => {
    it('supports download_url delivery', async () => {
      const result = await executeExportData(
        {
          query: createMockQuery(),
          format: 'csv',
          delivery: 'download_url',
        },
        mockContext
      );

      expect(result.delivery_status).toBe('delivered');
      expect(result.download_url).toBeDefined();
    });

    it('supports email delivery', async () => {
      const result = await executeExportData(
        {
          query: createMockQuery(),
          format: 'csv',
          delivery: 'email',
          delivery_config: {
            email: 'test@example.com',
          },
        },
        mockContext
      );

      expect(result.delivery_status).toBe('queued');
    });
  });

  describe('uses S3 when configured', () => {
    it('uploads to S3 when configured', async () => {
      vi.mocked(isS3Configured).mockReturnValue(true);
      vi.mocked(generateExport).mockResolvedValue({
        s3Key: 'exports/file.csv',
        fileSizeBytes: 1000,
        downloadUrl: 'https://s3.amazonaws.com/bucket/exports/file.csv?signed=true',
        downloadExpires: new Date(Date.now() + 3600000),
        recordCount: 100,
        format: 'csv',
        columns: ['firstName', 'lastName'],
      });

      const result = await executeExportData(
        {
          query: createMockQuery(),
          format: 'csv',
          delivery: 'download_url',
        },
        mockContext
      );

      expect(generateExport).toHaveBeenCalled();
      expect(result.download_url).toContain('s3.amazonaws.com');
    });
  });
});
