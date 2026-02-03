/**
 * Integration Tests for Purchase Fulfillment Flow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prisma } from '../../src/db/client.js';
import { handleStripeWebhook } from '../../src/webhooks/stripe.js';
import { purchaseFulfillment } from '../../src/services/purchase-fulfillment.js';
import { dataProvider } from '../../src/services/data-provider.js';
import { exportGenerator } from '../../src/services/export-generator.js';
import { emailService } from '../../src/services/email.js';
import { sftpService } from '../../src/services/sftp.js';

// Mock all dependencies
vi.mock('../../src/db/client.js', () => ({
  prisma: {
    purchase: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    delivery: {
      create: vi.fn(),
    },
    export: {
      create: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

vi.mock('../../src/services/data-provider.js', () => ({
  dataProvider: {
    query: vi.fn(),
    getRecords: vi.fn(),
  },
}));

vi.mock('../../src/services/export-generator.js', () => ({
  exportGenerator: {
    toCSV: vi.fn(),
    toExcel: vi.fn(),
    toJSON: vi.fn(),
    uploadToS3: vi.fn(),
    generateSignedUrl: vi.fn(),
  },
}));

vi.mock('../../src/services/email.js', () => ({
  emailService: {
    send: vi.fn(),
    sendWithAttachment: vi.fn(),
  },
}));

vi.mock('../../src/services/sftp.js', () => ({
  sftpService: {
    upload: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  },
}));

vi.mock('../../src/services/webhook.js', () => ({
  webhookService: {
    send: vi.fn(),
  },
}));

import { webhookService } from '../../src/services/webhook.js';

// Create mock purchase
function createMockPurchase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'purchase-123',
    tenantId: 'tenant-123',
    status: 'pending',
    query: {
      database: 'nho',
      geography: {
        type: 'state',
        values: ['AZ'],
      },
      filters: {
        sale_price_min: 200000,
        sale_price_max: 500000,
      },
    },
    recordCount: 5000,
    totalAmount: 25000,
    exportFormat: 'csv',
    deliveryMethod: 'email',
    deliveryConfig: {
      email: 'customer@example.com',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// Create mock records
function createMockRecords(count: number = 100) {
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
    salePrice: 350000 + i * 1000,
  }));
}

describe('Purchase Fulfillment Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('payment webhook triggers fulfillment', () => {
    it('triggers fulfillment on successful payment', async () => {
      const mockPurchase = createMockPurchase();
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue(mockPurchase);
      vi.mocked(prisma.purchase.update).mockResolvedValue({
        ...mockPurchase,
        status: 'processing',
      });

      const mockRecords = createMockRecords(5000);
      vi.mocked(dataProvider.query).mockResolvedValue(mockRecords);
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv data'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://bucket/file.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://download.url');
      vi.mocked(emailService.send).mockResolvedValue({ success: true });
      vi.mocked(prisma.delivery.create).mockResolvedValue({
        id: 'delivery-123',
        purchaseId: 'purchase-123',
      });

      // Simulate Stripe webhook
      const stripeEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test123',
            payment_status: 'paid',
            metadata: {
              type: 'list_purchase',
              purchaseId: 'purchase-123',
              tenantId: 'tenant-123',
            },
          },
        },
      };

      await handleStripeWebhook(stripeEvent);

      expect(prisma.purchase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'purchase-123' },
          data: expect.objectContaining({
            status: 'processing',
          }),
        })
      );
    });

    it('marks purchase as paid', async () => {
      const mockPurchase = createMockPurchase();
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue(mockPurchase);
      vi.mocked(prisma.purchase.update).mockResolvedValue({
        ...mockPurchase,
        status: 'paid',
        paidAt: new Date(),
      });

      const stripeEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test456',
            payment_status: 'paid',
            metadata: {
              type: 'list_purchase',
              purchaseId: 'purchase-123',
            },
          },
        },
      };

      await handleStripeWebhook(stripeEvent);

      expect(prisma.purchase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paidAt: expect.any(Date),
          }),
        })
      );
    });

    it('stores Stripe payment intent ID', async () => {
      const mockPurchase = createMockPurchase();
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue(mockPurchase);
      vi.mocked(prisma.purchase.update).mockResolvedValue(mockPurchase);

      const stripeEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test789',
            payment_status: 'paid',
            payment_intent: 'pi_test123',
            metadata: {
              type: 'list_purchase',
              purchaseId: 'purchase-123',
            },
          },
        },
      };

      await handleStripeWebhook(stripeEvent);

      expect(prisma.purchase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stripePaymentIntentId: 'pi_test123',
          }),
        })
      );
    });
  });

  describe('queries data correctly', () => {
    it('executes query from purchase', async () => {
      const mockPurchase = createMockPurchase({
        query: {
          database: 'nho',
          geography: { type: 'state', values: ['CA', 'NV'] },
          filters: {
            sale_price_min: 300000,
            property_type: ['Single Family'],
          },
        },
      });

      vi.mocked(prisma.purchase.findUnique).mockResolvedValue(mockPurchase);
      vi.mocked(dataProvider.query).mockResolvedValue(createMockRecords(1000));
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://bucket/file.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://url');
      vi.mocked(emailService.send).mockResolvedValue({ success: true });
      vi.mocked(prisma.purchase.update).mockResolvedValue(mockPurchase);
      vi.mocked(prisma.delivery.create).mockResolvedValue({ id: 'delivery-1' });

      await purchaseFulfillment.fulfill('purchase-123');

      expect(dataProvider.query).toHaveBeenCalledWith(
        expect.objectContaining({
          database: 'nho',
          geography: expect.objectContaining({
            type: 'state',
            values: ['CA', 'NV'],
          }),
          filters: expect.objectContaining({
            sale_price_min: 300000,
          }),
        })
      );
    });

    it('applies email append when requested', async () => {
      const mockPurchase = createMockPurchase({
        appendEmail: true,
      });

      vi.mocked(prisma.purchase.findUnique).mockResolvedValue(mockPurchase);
      vi.mocked(dataProvider.query).mockResolvedValue(createMockRecords(100));
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://bucket/file.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://url');
      vi.mocked(emailService.send).mockResolvedValue({ success: true });
      vi.mocked(prisma.purchase.update).mockResolvedValue(mockPurchase);
      vi.mocked(prisma.delivery.create).mockResolvedValue({ id: 'delivery-1' });

      await purchaseFulfillment.fulfill('purchase-123');

      expect(dataProvider.query).toHaveBeenCalledWith(
        expect.objectContaining({
          appendEmail: true,
        })
      );
    });

    it('applies phone append when requested', async () => {
      const mockPurchase = createMockPurchase({
        appendPhone: true,
      });

      vi.mocked(prisma.purchase.findUnique).mockResolvedValue(mockPurchase);
      vi.mocked(dataProvider.query).mockResolvedValue(createMockRecords(100));
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://bucket/file.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://url');
      vi.mocked(emailService.send).mockResolvedValue({ success: true });
      vi.mocked(prisma.purchase.update).mockResolvedValue(mockPurchase);
      vi.mocked(prisma.delivery.create).mockResolvedValue({ id: 'delivery-1' });

      await purchaseFulfillment.fulfill('purchase-123');

      expect(dataProvider.query).toHaveBeenCalledWith(
        expect.objectContaining({
          appendPhone: true,
        })
      );
    });
  });

  describe('generates export file', () => {
    it('generates CSV export', async () => {
      const mockPurchase = createMockPurchase({
        exportFormat: 'csv',
      });
      const mockRecords = createMockRecords(500);

      vi.mocked(prisma.purchase.findUnique).mockResolvedValue(mockPurchase);
      vi.mocked(dataProvider.query).mockResolvedValue(mockRecords);
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv data'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://bucket/file.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://url');
      vi.mocked(emailService.send).mockResolvedValue({ success: true });
      vi.mocked(prisma.purchase.update).mockResolvedValue(mockPurchase);
      vi.mocked(prisma.delivery.create).mockResolvedValue({ id: 'delivery-1' });

      await purchaseFulfillment.fulfill('purchase-123');

      expect(exportGenerator.toCSV).toHaveBeenCalledWith(
        mockRecords,
        expect.any(Object)
      );
    });

    it('generates Excel export', async () => {
      const mockPurchase = createMockPurchase({
        exportFormat: 'xlsx',
      });
      const mockRecords = createMockRecords(500);

      vi.mocked(prisma.purchase.findUnique).mockResolvedValue(mockPurchase);
      vi.mocked(dataProvider.query).mockResolvedValue(mockRecords);
      vi.mocked(exportGenerator.toExcel).mockResolvedValue(Buffer.from('xlsx data'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://bucket/file.xlsx');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://url');
      vi.mocked(emailService.send).mockResolvedValue({ success: true });
      vi.mocked(prisma.purchase.update).mockResolvedValue(mockPurchase);
      vi.mocked(prisma.delivery.create).mockResolvedValue({ id: 'delivery-1' });

      await purchaseFulfillment.fulfill('purchase-123');

      expect(exportGenerator.toExcel).toHaveBeenCalled();
    });

    it('generates JSON export', async () => {
      const mockPurchase = createMockPurchase({
        exportFormat: 'json',
      });
      const mockRecords = createMockRecords(500);

      vi.mocked(prisma.purchase.findUnique).mockResolvedValue(mockPurchase);
      vi.mocked(dataProvider.query).mockResolvedValue(mockRecords);
      vi.mocked(exportGenerator.toJSON).mockResolvedValue(Buffer.from('{}'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://bucket/file.json');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://url');
      vi.mocked(emailService.send).mockResolvedValue({ success: true });
      vi.mocked(prisma.purchase.update).mockResolvedValue(mockPurchase);
      vi.mocked(prisma.delivery.create).mockResolvedValue({ id: 'delivery-1' });

      await purchaseFulfillment.fulfill('purchase-123');

      expect(exportGenerator.toJSON).toHaveBeenCalled();
    });

    it('uploads export to S3', async () => {
      const mockPurchase = createMockPurchase();
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue(mockPurchase);
      vi.mocked(dataProvider.query).mockResolvedValue(createMockRecords(100));
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv data'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://bucket/exports/purchase-123.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://url');
      vi.mocked(emailService.send).mockResolvedValue({ success: true });
      vi.mocked(prisma.purchase.update).mockResolvedValue(mockPurchase);
      vi.mocked(prisma.delivery.create).mockResolvedValue({ id: 'delivery-1' });

      await purchaseFulfillment.fulfill('purchase-123');

      expect(exportGenerator.uploadToS3).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.stringContaining('purchase-123'),
        expect.any(Object)
      );
    });
  });

  describe('delivers via email', () => {
    it('sends email with download link', async () => {
      const mockPurchase = createMockPurchase({
        deliveryMethod: 'email',
        deliveryConfig: {
          email: 'customer@example.com',
        },
      });

      vi.mocked(prisma.purchase.findUnique).mockResolvedValue(mockPurchase);
      vi.mocked(dataProvider.query).mockResolvedValue(createMockRecords(100));
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://bucket/file.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://download.example.com/file.csv');
      vi.mocked(emailService.send).mockResolvedValue({ success: true, messageId: 'msg-123' });
      vi.mocked(prisma.purchase.update).mockResolvedValue(mockPurchase);
      vi.mocked(prisma.delivery.create).mockResolvedValue({ id: 'delivery-1' });

      await purchaseFulfillment.fulfill('purchase-123');

      expect(emailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'customer@example.com',
          subject: expect.stringContaining('Data'),
          html: expect.stringContaining('https://download.example.com'),
        })
      );
    });

    it('includes purchase details in email', async () => {
      const mockPurchase = createMockPurchase({
        recordCount: 5000,
        query: { database: 'nho' },
        deliveryMethod: 'email',
        deliveryConfig: { email: 'customer@example.com' },
      });

      vi.mocked(prisma.purchase.findUnique).mockResolvedValue(mockPurchase);
      vi.mocked(dataProvider.query).mockResolvedValue(createMockRecords(100));
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://bucket/file.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://download.url');
      vi.mocked(emailService.send).mockResolvedValue({ success: true });
      vi.mocked(prisma.purchase.update).mockResolvedValue(mockPurchase);
      vi.mocked(prisma.delivery.create).mockResolvedValue({ id: 'delivery-1' });

      await purchaseFulfillment.fulfill('purchase-123');

      expect(emailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringMatching(/5[,]?000/),
        })
      );
    });
  });

  describe('delivers via webhook', () => {
    it('sends data to webhook URL', async () => {
      const mockPurchase = createMockPurchase({
        deliveryMethod: 'webhook',
        deliveryConfig: {
          url: 'https://api.customer.com/data-webhook',
          headers: { 'X-API-Key': 'secret123' },
        },
      });

      vi.mocked(prisma.purchase.findUnique).mockResolvedValue(mockPurchase);
      vi.mocked(dataProvider.query).mockResolvedValue(createMockRecords(100));
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://bucket/file.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://download.url');
      vi.mocked(webhookService.send).mockResolvedValue({ success: true });
      vi.mocked(prisma.purchase.update).mockResolvedValue(mockPurchase);
      vi.mocked(prisma.delivery.create).mockResolvedValue({ id: 'delivery-1' });

      await purchaseFulfillment.fulfill('purchase-123');

      expect(webhookService.send).toHaveBeenCalledWith(
        'https://api.customer.com/data-webhook',
        expect.objectContaining({
          purchaseId: 'purchase-123',
          downloadUrl: 'https://download.url',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'secret123',
          }),
        })
      );
    });

    it('includes metadata in webhook payload', async () => {
      const mockPurchase = createMockPurchase({
        deliveryMethod: 'webhook',
        deliveryConfig: {
          url: 'https://webhook.example.com',
        },
        recordCount: 2500,
      });

      vi.mocked(prisma.purchase.findUnique).mockResolvedValue(mockPurchase);
      vi.mocked(dataProvider.query).mockResolvedValue(createMockRecords(100));
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://bucket/file.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://download.url');
      vi.mocked(webhookService.send).mockResolvedValue({ success: true });
      vi.mocked(prisma.purchase.update).mockResolvedValue(mockPurchase);
      vi.mocked(prisma.delivery.create).mockResolvedValue({ id: 'delivery-1' });

      await purchaseFulfillment.fulfill('purchase-123');

      expect(webhookService.send).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          recordCount: 2500,
          format: 'csv',
        }),
        expect.any(Object)
      );
    });
  });

  describe('delivers via SFTP', () => {
    it('uploads file to SFTP server', async () => {
      const mockPurchase = createMockPurchase({
        deliveryMethod: 'sftp',
        deliveryConfig: {
          host: 'sftp.customer.com',
          port: 22,
          username: 'customer',
          password: 'encrypted-password',
          remotePath: '/uploads/data/',
        },
      });

      vi.mocked(prisma.purchase.findUnique).mockResolvedValue(mockPurchase);
      vi.mocked(dataProvider.query).mockResolvedValue(createMockRecords(100));
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://bucket/file.csv');
      vi.mocked(sftpService.connect).mockResolvedValue(undefined);
      vi.mocked(sftpService.upload).mockResolvedValue({ success: true });
      vi.mocked(sftpService.disconnect).mockResolvedValue(undefined);
      vi.mocked(prisma.purchase.update).mockResolvedValue(mockPurchase);
      vi.mocked(prisma.delivery.create).mockResolvedValue({ id: 'delivery-1' });

      await purchaseFulfillment.fulfill('purchase-123');

      expect(sftpService.upload).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.stringContaining('/uploads/data/'),
        expect.any(Object)
      );
    });

    it('uses correct filename for SFTP upload', async () => {
      const mockPurchase = createMockPurchase({
        deliveryMethod: 'sftp',
        deliveryConfig: {
          host: 'sftp.example.com',
          remotePath: '/data/',
          filenamePattern: 'nho-data-{date}.csv',
        },
      });

      vi.mocked(prisma.purchase.findUnique).mockResolvedValue(mockPurchase);
      vi.mocked(dataProvider.query).mockResolvedValue(createMockRecords(100));
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://bucket/file.csv');
      vi.mocked(sftpService.connect).mockResolvedValue(undefined);
      vi.mocked(sftpService.upload).mockResolvedValue({ success: true });
      vi.mocked(sftpService.disconnect).mockResolvedValue(undefined);
      vi.mocked(prisma.purchase.update).mockResolvedValue(mockPurchase);
      vi.mocked(prisma.delivery.create).mockResolvedValue({ id: 'delivery-1' });

      await purchaseFulfillment.fulfill('purchase-123');

      expect(sftpService.upload).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.stringMatching(/nho-data-\d{4}-\d{2}-\d{2}\.csv/),
        expect.any(Object)
      );
    });
  });

  describe('error handling', () => {
    it('marks purchase as failed on data query error', async () => {
      const mockPurchase = createMockPurchase();
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue(mockPurchase);
      vi.mocked(dataProvider.query).mockRejectedValue(new Error('Data provider error'));
      vi.mocked(prisma.purchase.update).mockResolvedValue({
        ...mockPurchase,
        status: 'failed',
      });

      await expect(
        purchaseFulfillment.fulfill('purchase-123')
      ).rejects.toThrow();

      expect(prisma.purchase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
            error: expect.stringContaining('Data provider'),
          }),
        })
      );
    });

    it('marks purchase as failed on delivery error', async () => {
      const mockPurchase = createMockPurchase();
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue(mockPurchase);
      vi.mocked(dataProvider.query).mockResolvedValue(createMockRecords(100));
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://bucket/file.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://url');
      vi.mocked(emailService.send).mockRejectedValue(new Error('Email delivery failed'));
      vi.mocked(prisma.purchase.update).mockResolvedValue({
        ...mockPurchase,
        status: 'failed',
      });

      await expect(
        purchaseFulfillment.fulfill('purchase-123')
      ).rejects.toThrow();

      expect(prisma.purchase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
          }),
        })
      );
    });

    it('retries on transient failures', async () => {
      const mockPurchase = createMockPurchase();
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue(mockPurchase);
      vi.mocked(dataProvider.query).mockResolvedValue(createMockRecords(100));
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://bucket/file.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://url');
      vi.mocked(emailService.send)
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({ success: true });
      vi.mocked(prisma.purchase.update).mockResolvedValue(mockPurchase);
      vi.mocked(prisma.delivery.create).mockResolvedValue({ id: 'delivery-1' });

      await purchaseFulfillment.fulfill('purchase-123', { retries: 2 });

      expect(emailService.send).toHaveBeenCalledTimes(2);
    });
  });

  describe('completion tracking', () => {
    it('marks purchase as completed on success', async () => {
      const mockPurchase = createMockPurchase();
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue(mockPurchase);
      vi.mocked(dataProvider.query).mockResolvedValue(createMockRecords(100));
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://bucket/file.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://url');
      vi.mocked(emailService.send).mockResolvedValue({ success: true });
      vi.mocked(prisma.purchase.update).mockResolvedValue({
        ...mockPurchase,
        status: 'completed',
      });
      vi.mocked(prisma.delivery.create).mockResolvedValue({ id: 'delivery-1' });

      await purchaseFulfillment.fulfill('purchase-123');

      expect(prisma.purchase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'completed',
            completedAt: expect.any(Date),
          }),
        })
      );
    });

    it('creates delivery record', async () => {
      const mockPurchase = createMockPurchase();
      vi.mocked(prisma.purchase.findUnique).mockResolvedValue(mockPurchase);
      vi.mocked(dataProvider.query).mockResolvedValue(createMockRecords(100));
      vi.mocked(exportGenerator.toCSV).mockResolvedValue(Buffer.from('csv'));
      vi.mocked(exportGenerator.uploadToS3).mockResolvedValue('s3://bucket/file.csv');
      vi.mocked(exportGenerator.generateSignedUrl).mockResolvedValue('https://url');
      vi.mocked(emailService.send).mockResolvedValue({ success: true });
      vi.mocked(prisma.purchase.update).mockResolvedValue(mockPurchase);
      vi.mocked(prisma.delivery.create).mockResolvedValue({
        id: 'delivery-123',
        purchaseId: 'purchase-123',
        recordCount: 100,
      });

      await purchaseFulfillment.fulfill('purchase-123');

      expect(prisma.delivery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            purchaseId: 'purchase-123',
            recordCount: 100,
            deliveryMethod: 'email',
          }),
        })
      );
    });
  });
});
