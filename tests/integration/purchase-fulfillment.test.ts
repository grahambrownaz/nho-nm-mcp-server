/**
 * Integration Tests for Purchase Fulfillment Flow
 * Tests the fulfillListPurchase function which handles fulfilling list purchases after payment
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prisma } from '../../src/db/client.js';
import { fulfillListPurchase } from '../../src/services/purchase-fulfillment.js';
import * as exportGenerator from '../../src/services/export-generator.js';

// Mock Prisma client
vi.mock('../../src/db/client.js', () => ({
  prisma: {
    listPurchase: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    exportFile: {
      create: vi.fn(),
    },
    $transaction: vi.fn((callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma)),
  },
}));

// Mock export generator
vi.mock('../../src/services/export-generator.js', () => ({
  generateExport: vi.fn(),
  generateLocalExport: vi.fn(),
  isS3Configured: vi.fn(),
  getDownloadUrl: vi.fn(),
}));

// Mock fetch for webhook delivery
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Create mock purchase matching actual Prisma schema
function createMockPurchase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'purchase-123',
    tenantId: 'tenant-123',
    tenant: {
      id: 'tenant-123',
      name: 'Test Tenant',
      email: 'test@example.com',
    },
    database: 'nho',
    geography: {
      type: 'state',
      values: ['AZ'],
    },
    filters: {
      sale_price_min: 200000,
      sale_price_max: 500000,
    },
    recordCount: 100,
    withEmail: 0,
    withPhone: 0,
    basePrice: 500,
    emailAppendPrice: 0,
    phoneAppendPrice: 0,
    totalPrice: 500,
    exportFormat: 'csv',
    deliveryMethod: 'email',
    deliveryConfig: {
      email: 'customer@example.com',
    },
    paymentStatus: 'AWAITING_PAYMENT',
    stripePaymentLinkId: null,
    stripeSessionId: null,
    downloadUrl: null,
    downloadExpires: null,
    deliveredAt: null,
    quoteValidUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Purchase Fulfillment Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: S3 not configured (local development mode)
    vi.mocked(exportGenerator.isS3Configured).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fulfillListPurchase', () => {
    it('skips fulfillment if purchase not found', async () => {
      vi.mocked(prisma.listPurchase.findUnique).mockResolvedValue(null);

      await fulfillListPurchase('non-existent-id');

      expect(prisma.listPurchase.update).not.toHaveBeenCalled();
    });

    it('skips fulfillment if already completed', async () => {
      const mockPurchase = createMockPurchase({
        paymentStatus: 'COMPLETED',
      });
      vi.mocked(prisma.listPurchase.findUnique).mockResolvedValue(mockPurchase as any);

      await fulfillListPurchase('purchase-123');

      expect(prisma.listPurchase.update).not.toHaveBeenCalled();
    });

    it('updates status to PROCESSING when starting fulfillment', async () => {
      const mockPurchase = createMockPurchase();
      vi.mocked(prisma.listPurchase.findUnique).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.listPurchase.update).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.exportFile.create).mockResolvedValue({ id: 'export-123' } as any);
      vi.mocked(exportGenerator.generateLocalExport).mockResolvedValue({
        buffer: Buffer.from('csv data'),
        contentType: 'text/csv',
        filename: 'test.csv',
      });

      await fulfillListPurchase('purchase-123');

      expect(prisma.listPurchase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'purchase-123' },
          data: { paymentStatus: 'PROCESSING' },
        })
      );
    });

    it('generates local export when S3 is not configured', async () => {
      const mockPurchase = createMockPurchase();
      vi.mocked(prisma.listPurchase.findUnique).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.listPurchase.update).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.exportFile.create).mockResolvedValue({ id: 'export-123' } as any);
      vi.mocked(exportGenerator.isS3Configured).mockReturnValue(false);
      vi.mocked(exportGenerator.generateLocalExport).mockResolvedValue({
        buffer: Buffer.from('csv data'),
        contentType: 'text/csv',
        filename: 'nho_purchase-123.csv',
      });

      await fulfillListPurchase('purchase-123');

      expect(exportGenerator.generateLocalExport).toHaveBeenCalledWith(
        expect.objectContaining({
          format: 'csv',
          filename: expect.stringContaining('purchase-123'),
        })
      );
    });

    it('generates S3 export when S3 is configured', async () => {
      const mockPurchase = createMockPurchase();
      vi.mocked(prisma.listPurchase.findUnique).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.listPurchase.update).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.exportFile.create).mockResolvedValue({ id: 'export-123' } as any);
      vi.mocked(exportGenerator.isS3Configured).mockReturnValue(true);
      vi.mocked(exportGenerator.generateExport).mockResolvedValue({
        s3Key: 's3://bucket/file.csv',
        downloadUrl: 'https://download.url',
        downloadExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        fileSizeBytes: 1024,
      });

      await fulfillListPurchase('purchase-123');

      expect(exportGenerator.generateExport).toHaveBeenCalledWith(
        expect.objectContaining({
          format: 'csv',
          filename: expect.stringContaining('purchase-123'),
        })
      );
    });

    it('creates export file record', async () => {
      const mockPurchase = createMockPurchase();
      vi.mocked(prisma.listPurchase.findUnique).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.listPurchase.update).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.exportFile.create).mockResolvedValue({ id: 'export-123' } as any);
      vi.mocked(exportGenerator.generateLocalExport).mockResolvedValue({
        buffer: Buffer.from('csv data'),
        contentType: 'text/csv',
        filename: 'test.csv',
      });

      await fulfillListPurchase('purchase-123');

      expect(prisma.exportFile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-123',
            sourceType: 'list_purchase',
            sourceId: 'purchase-123',
            format: 'csv',
            listPurchaseId: 'purchase-123',
          }),
        })
      );
    });

    it('marks purchase as COMPLETED on success', async () => {
      const mockPurchase = createMockPurchase();
      vi.mocked(prisma.listPurchase.findUnique).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.listPurchase.update).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.exportFile.create).mockResolvedValue({ id: 'export-123' } as any);
      vi.mocked(exportGenerator.generateLocalExport).mockResolvedValue({
        buffer: Buffer.from('csv data'),
        contentType: 'text/csv',
        filename: 'test.csv',
      });

      await fulfillListPurchase('purchase-123');

      // The second update should mark as COMPLETED
      expect(prisma.listPurchase.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { id: 'purchase-123' },
          data: expect.objectContaining({
            paymentStatus: 'COMPLETED',
            deliveredAt: expect.any(Date),
          }),
        })
      );
    });

    it('marks purchase as FAILED on error', async () => {
      const mockPurchase = createMockPurchase();
      vi.mocked(prisma.listPurchase.findUnique).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.listPurchase.update).mockResolvedValue(mockPurchase as any);
      vi.mocked(exportGenerator.generateLocalExport).mockRejectedValue(new Error('Export failed'));

      await expect(fulfillListPurchase('purchase-123')).rejects.toThrow('Export failed');

      expect(prisma.listPurchase.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { id: 'purchase-123' },
          data: { paymentStatus: 'FAILED' },
        })
      );
    });
  });

  describe('delivery methods', () => {
    it('delivers via webhook when configured', async () => {
      const mockPurchase = createMockPurchase({
        deliveryMethod: 'webhook',
        deliveryConfig: {
          webhook_url: 'https://api.customer.com/data-webhook',
        },
      });
      vi.mocked(prisma.listPurchase.findUnique).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.listPurchase.update).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.exportFile.create).mockResolvedValue({ id: 'export-123' } as any);
      vi.mocked(exportGenerator.generateLocalExport).mockResolvedValue({
        buffer: Buffer.from('csv data'),
        contentType: 'text/csv',
        filename: 'test.csv',
      });
      mockFetch.mockResolvedValue({ ok: true });

      await fulfillListPurchase('purchase-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.customer.com/data-webhook',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.any(String),
        })
      );
    });

    it('webhook payload includes purchase details', async () => {
      const mockPurchase = createMockPurchase({
        deliveryMethod: 'webhook',
        deliveryConfig: {
          webhook_url: 'https://webhook.example.com',
        },
      });
      vi.mocked(prisma.listPurchase.findUnique).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.listPurchase.update).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.exportFile.create).mockResolvedValue({ id: 'export-123' } as any);
      vi.mocked(exportGenerator.generateLocalExport).mockResolvedValue({
        buffer: Buffer.from('csv data'),
        contentType: 'text/csv',
        filename: 'test.csv',
      });
      mockFetch.mockResolvedValue({ ok: true });

      await fulfillListPurchase('purchase-123');

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body).toEqual(
        expect.objectContaining({
          purchase_id: 'purchase-123',
          record_count: 100,
          format: 'csv',
        })
      );
    });

    it('throws error when webhook delivery fails', async () => {
      const mockPurchase = createMockPurchase({
        deliveryMethod: 'webhook',
        deliveryConfig: {
          webhook_url: 'https://api.customer.com/data-webhook',
        },
      });
      vi.mocked(prisma.listPurchase.findUnique).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.listPurchase.update).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.exportFile.create).mockResolvedValue({ id: 'export-123' } as any);
      vi.mocked(exportGenerator.generateLocalExport).mockResolvedValue({
        buffer: Buffer.from('csv data'),
        contentType: 'text/csv',
        filename: 'test.csv',
      });
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      await expect(fulfillListPurchase('purchase-123')).rejects.toThrow('Webhook delivery failed');
    });

    it('logs SFTP delivery as not yet implemented', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const mockPurchase = createMockPurchase({
        deliveryMethod: 'sftp',
        deliveryConfig: {
          sftp_config_id: 'sftp-config-123',
        },
      });
      vi.mocked(prisma.listPurchase.findUnique).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.listPurchase.update).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.exportFile.create).mockResolvedValue({ id: 'export-123' } as any);
      vi.mocked(exportGenerator.generateLocalExport).mockResolvedValue({
        buffer: Buffer.from('csv data'),
        contentType: 'text/csv',
        filename: 'test.csv',
      });

      await fulfillListPurchase('purchase-123');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('SFTP delivery not yet implemented')
      );
    });
  });

  describe('export formats', () => {
    it('generates CSV export', async () => {
      const mockPurchase = createMockPurchase({ exportFormat: 'csv' });
      vi.mocked(prisma.listPurchase.findUnique).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.listPurchase.update).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.exportFile.create).mockResolvedValue({ id: 'export-123' } as any);
      vi.mocked(exportGenerator.generateLocalExport).mockResolvedValue({
        buffer: Buffer.from('csv data'),
        contentType: 'text/csv',
        filename: 'test.csv',
      });

      await fulfillListPurchase('purchase-123');

      expect(exportGenerator.generateLocalExport).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'csv' })
      );
    });

    it('generates Excel export', async () => {
      const mockPurchase = createMockPurchase({ exportFormat: 'excel' });
      vi.mocked(prisma.listPurchase.findUnique).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.listPurchase.update).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.exportFile.create).mockResolvedValue({ id: 'export-123' } as any);
      vi.mocked(exportGenerator.generateLocalExport).mockResolvedValue({
        buffer: Buffer.from('xlsx data'),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: 'test.xlsx',
      });

      await fulfillListPurchase('purchase-123');

      expect(exportGenerator.generateLocalExport).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'excel' })
      );
    });

    it('generates JSON export', async () => {
      const mockPurchase = createMockPurchase({ exportFormat: 'json' });
      vi.mocked(prisma.listPurchase.findUnique).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.listPurchase.update).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.exportFile.create).mockResolvedValue({ id: 'export-123' } as any);
      vi.mocked(exportGenerator.generateLocalExport).mockResolvedValue({
        buffer: Buffer.from('{}'),
        contentType: 'application/json',
        filename: 'test.json',
      });

      await fulfillListPurchase('purchase-123');

      expect(exportGenerator.generateLocalExport).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'json' })
      );
    });
  });

  describe('data generation', () => {
    it('generates correct number of records based on purchase', async () => {
      const mockPurchase = createMockPurchase({ recordCount: 500 });
      vi.mocked(prisma.listPurchase.findUnique).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.listPurchase.update).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.exportFile.create).mockResolvedValue({ id: 'export-123' } as any);
      vi.mocked(exportGenerator.generateLocalExport).mockResolvedValue({
        buffer: Buffer.from('csv data'),
        contentType: 'text/csv',
        filename: 'test.csv',
      });

      await fulfillListPurchase('purchase-123');

      expect(exportGenerator.generateLocalExport).toHaveBeenCalledWith(
        expect.objectContaining({
          records: expect.arrayContaining([
            expect.objectContaining({
              first_name: expect.any(String),
              last_name: expect.any(String),
              address: expect.any(String),
              city: expect.any(String),
              state: 'AZ',
              zip: expect.any(String),
            }),
          ]),
        })
      );

      // Verify record count
      const callArgs = vi.mocked(exportGenerator.generateLocalExport).mock.calls[0][0];
      expect(callArgs.records).toHaveLength(500);
    });

    it('includes email when withEmail > 0', async () => {
      const mockPurchase = createMockPurchase({
        recordCount: 10,
        withEmail: 5,
      });
      vi.mocked(prisma.listPurchase.findUnique).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.listPurchase.update).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.exportFile.create).mockResolvedValue({ id: 'export-123' } as any);
      vi.mocked(exportGenerator.generateLocalExport).mockResolvedValue({
        buffer: Buffer.from('csv data'),
        contentType: 'text/csv',
        filename: 'test.csv',
      });

      await fulfillListPurchase('purchase-123');

      const callArgs = vi.mocked(exportGenerator.generateLocalExport).mock.calls[0][0];
      const recordsWithEmail = callArgs.records.filter((r: Record<string, unknown>) => r.email);
      expect(recordsWithEmail.length).toBe(5);
    });

    it('includes phone when withPhone > 0', async () => {
      const mockPurchase = createMockPurchase({
        recordCount: 10,
        withPhone: 3,
      });
      vi.mocked(prisma.listPurchase.findUnique).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.listPurchase.update).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.exportFile.create).mockResolvedValue({ id: 'export-123' } as any);
      vi.mocked(exportGenerator.generateLocalExport).mockResolvedValue({
        buffer: Buffer.from('csv data'),
        contentType: 'text/csv',
        filename: 'test.csv',
      });

      await fulfillListPurchase('purchase-123');

      const callArgs = vi.mocked(exportGenerator.generateLocalExport).mock.calls[0][0];
      const recordsWithPhone = callArgs.records.filter((r: Record<string, unknown>) => r.phone);
      expect(recordsWithPhone.length).toBe(3);
    });

    it('includes move_date for NHO database', async () => {
      const mockPurchase = createMockPurchase({ database: 'nho' });
      vi.mocked(prisma.listPurchase.findUnique).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.listPurchase.update).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.exportFile.create).mockResolvedValue({ id: 'export-123' } as any);
      vi.mocked(exportGenerator.generateLocalExport).mockResolvedValue({
        buffer: Buffer.from('csv data'),
        contentType: 'text/csv',
        filename: 'test.csv',
      });

      await fulfillListPurchase('purchase-123');

      const callArgs = vi.mocked(exportGenerator.generateLocalExport).mock.calls[0][0];
      expect(callArgs.records[0]).toHaveProperty('move_date');
    });

    it('includes company fields for business database', async () => {
      const mockPurchase = createMockPurchase({ database: 'business' });
      vi.mocked(prisma.listPurchase.findUnique).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.listPurchase.update).mockResolvedValue(mockPurchase as any);
      vi.mocked(prisma.exportFile.create).mockResolvedValue({ id: 'export-123' } as any);
      vi.mocked(exportGenerator.generateLocalExport).mockResolvedValue({
        buffer: Buffer.from('csv data'),
        contentType: 'text/csv',
        filename: 'test.csv',
      });

      await fulfillListPurchase('purchase-123');

      const callArgs = vi.mocked(exportGenerator.generateLocalExport).mock.calls[0][0];
      expect(callArgs.records[0]).toHaveProperty('company_name');
      expect(callArgs.records[0]).toHaveProperty('title');
    });
  });
});
