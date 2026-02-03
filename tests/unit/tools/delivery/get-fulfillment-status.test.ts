/**
 * Tests for get_fulfillment_status tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeGetFulfillmentStatus } from '../../../../src/tools/delivery/get-fulfillment-status.js';
import { prisma } from '../../../../src/db/client.js';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { ValidationError, AuthorizationError, NotFoundError } from '../../../../src/utils/errors.js';

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    delivery: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock Decimal type that matches Prisma's Decimal behavior
function mockDecimal(value: number) {
  return {
    toNumber: () => value,
    toString: () => String(value),
    valueOf: () => value,
  } as any;
}

// Create a valid tenant context for tests
function createTestContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenant: {
      id: 'test-tenant-id',
      name: 'Test Tenant',
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
      tenantId: 'test-tenant-id',
      permissions: ['*'],
      isActive: true,
      lastUsedAt: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    subscription: {
      id: 'test-subscription-id',
      tenantId: 'test-tenant-id',
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

// Create mock delivery
function createMockDelivery(overrides: Record<string, unknown> = {}) {
  return {
    id: 'delivery-123',
    subscriptionId: 'subscription-123',
    tenantId: 'test-tenant-id',
    status: 'COMPLETED',
    recordCount: 150,
    fileUrl: 'https://storage.example.com/deliveries/delivery-123.csv',
    filePath: '/deliveries/2024/02/03/delivery-123.csv',
    fileSize: 245678,
    fulfillmentMethod: 'SFTP',
    fulfillmentDetails: {
      host: 'sftp.example.com',
      remotePath: '/incoming/delivery-123.csv',
      uploadedAt: new Date().toISOString(),
    },
    jdfPath: null,
    cost: mockDecimal(7.50),
    deliveredAt: new Date(),
    errorMessage: null,
    subscription: {
      id: 'subscription-123',
      name: 'NHO Weekly',
      database: 'NHO',
      tenantId: 'test-tenant-id',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('get_fulfillment_status tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock responses
    vi.mocked(prisma.delivery.findUnique).mockResolvedValue(createMockDelivery());
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      id: 'subscription-123',
      tenantId: 'test-tenant-id',
    } as any);
  });

  describe('SFTP delivery status', () => {
    it('returns status for SFTP delivery', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: 'delivery-123',
      };

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('COMPLETED');
      expect(result.data?.fulfillment_method).toBe('SFTP');
    });

    it('returns file path for SFTP delivery', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: 'delivery-123',
      };

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.data?.file_path).toBe('/deliveries/2024/02/03/delivery-123.csv');
      expect(result.data?.remote_path).toBe('/incoming/delivery-123.csv');
    });

    it('returns file size', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: 'delivery-123',
      };

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.data?.file_size).toBe(245678);
      expect(result.data?.file_size_formatted).toBeDefined();
    });

    it('returns record count', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: 'delivery-123',
      };

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.data?.record_count).toBe(150);
    });

    it('returns delivery timestamp', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: 'delivery-123',
      };

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.data?.delivered_at).toBeDefined();
    });
  });

  describe('pending deliveries', () => {
    it('handles pending deliveries', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: 'delivery-pending',
      };

      vi.mocked(prisma.delivery.findUnique).mockResolvedValue(
        createMockDelivery({
          id: 'delivery-pending',
          status: 'PENDING',
          fileUrl: null,
          filePath: null,
          fileSize: null,
          deliveredAt: null,
          fulfillmentDetails: null,
        })
      );

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('PENDING');
      expect(result.data?.file_path).toBeNull();
      expect(result.data?.delivered_at).toBeNull();
    });

    it('returns processing status', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: 'delivery-processing',
      };

      vi.mocked(prisma.delivery.findUnique).mockResolvedValue(
        createMockDelivery({
          id: 'delivery-processing',
          status: 'PROCESSING',
          deliveredAt: null,
        })
      );

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.data?.status).toBe('PROCESSING');
    });

    it('returns queued status', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: 'delivery-queued',
      };

      vi.mocked(prisma.delivery.findUnique).mockResolvedValue(
        createMockDelivery({
          id: 'delivery-queued',
          status: 'QUEUED',
          deliveredAt: null,
        })
      );

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.data?.status).toBe('QUEUED');
    });
  });

  describe('failed deliveries', () => {
    it('handles failed deliveries', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: 'delivery-failed',
      };

      vi.mocked(prisma.delivery.findUnique).mockResolvedValue(
        createMockDelivery({
          id: 'delivery-failed',
          status: 'FAILED',
          fileUrl: null,
          filePath: null,
          deliveredAt: null,
          errorMessage: 'SFTP connection timeout',
        })
      );

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('FAILED');
      expect(result.data?.error_message).toBe('SFTP connection timeout');
    });

    it('includes retry information for failed delivery', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: 'delivery-failed',
      };

      vi.mocked(prisma.delivery.findUnique).mockResolvedValue(
        createMockDelivery({
          id: 'delivery-failed',
          status: 'FAILED',
          errorMessage: 'Connection refused',
          fulfillmentDetails: {
            retryCount: 3,
            lastRetryAt: new Date().toISOString(),
            nextRetryAt: new Date(Date.now() + 3600000).toISOString(),
          },
        })
      );

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.data?.retry_count).toBe(3);
      expect(result.data?.next_retry_at).toBeDefined();
    });
  });

  describe('email delivery status', () => {
    it('returns status for email delivery', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: 'delivery-email',
      };

      vi.mocked(prisma.delivery.findUnique).mockResolvedValue(
        createMockDelivery({
          id: 'delivery-email',
          fulfillmentMethod: 'EMAIL',
          fulfillmentDetails: {
            emailTo: 'recipient@example.com',
            emailSentAt: new Date().toISOString(),
            emailMessageId: 'msg-12345',
          },
        })
      );

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.data?.fulfillment_method).toBe('EMAIL');
      expect(result.data?.email_recipient).toBe('recipient@example.com');
    });
  });

  describe('webhook delivery status', () => {
    it('returns status for webhook delivery', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: 'delivery-webhook',
      };

      vi.mocked(prisma.delivery.findUnique).mockResolvedValue(
        createMockDelivery({
          id: 'delivery-webhook',
          fulfillmentMethod: 'WEBHOOK',
          fulfillmentDetails: {
            webhookUrl: 'https://api.example.com/webhook',
            responseStatus: 200,
            responseBody: '{"received": true}',
          },
        })
      );

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.data?.fulfillment_method).toBe('WEBHOOK');
      expect(result.data?.webhook_response_status).toBe(200);
    });
  });

  describe('print delivery status with JDF', () => {
    it('returns JDF path for print delivery', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: 'delivery-print',
      };

      vi.mocked(prisma.delivery.findUnique).mockResolvedValue(
        createMockDelivery({
          id: 'delivery-print',
          fulfillmentMethod: 'SFTP_HOT_FOLDER',
          jdfPath: '/incoming/delivery-print.jdf',
          fulfillmentDetails: {
            pdfPath: '/incoming/postcards.pdf',
            jdfPath: '/incoming/delivery-print.jdf',
            printJobId: 'PJ-12345',
          },
        })
      );

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.data?.jdf_path).toBe('/incoming/delivery-print.jdf');
      expect(result.data?.print_job_id).toBe('PJ-12345');
    });
  });

  describe('list deliveries by subscription', () => {
    it('lists all deliveries for a subscription', async () => {
      const context = createTestContext();
      const input = {
        subscription_id: 'subscription-123',
      };

      vi.mocked(prisma.delivery.findMany).mockResolvedValue([
        createMockDelivery({ id: 'delivery-1', deliveredAt: new Date() }),
        createMockDelivery({ id: 'delivery-2', deliveredAt: new Date(Date.now() - 86400000) }),
        createMockDelivery({ id: 'delivery-3', deliveredAt: new Date(Date.now() - 172800000) }),
      ]);

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.deliveries).toHaveLength(3);
    });

    it('validates subscription ownership', async () => {
      const context = createTestContext();
      const input = {
        subscription_id: 'other-subscription',
      };

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        id: 'other-subscription',
        tenantId: 'other-tenant-id',
      } as any);

      await expect(executeGetFulfillmentStatus(input, context)).rejects.toThrow(AuthorizationError);
    });
  });

  describe('input validation', () => {
    it('throws ValidationError for missing identifiers', async () => {
      const context = createTestContext();
      const input = {};

      await expect(executeGetFulfillmentStatus(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for invalid delivery_id format', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: 'not-a-uuid',
      };

      await expect(executeGetFulfillmentStatus(input, context)).rejects.toThrow();
    });
  });

  describe('delivery lookup', () => {
    it('throws NotFoundError for non-existent delivery', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: '00000000-0000-0000-0000-000000000000',
      };

      vi.mocked(prisma.delivery.findUnique).mockResolvedValue(null);

      await expect(executeGetFulfillmentStatus(input, context)).rejects.toThrow(NotFoundError);
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when delivery belongs to different tenant', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: 'delivery-123',
      };

      vi.mocked(prisma.delivery.findUnique).mockResolvedValue(
        createMockDelivery({ tenantId: 'other-tenant-id' })
      );

      await expect(executeGetFulfillmentStatus(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('throws AuthorizationError when missing delivery:read permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {
        delivery_id: 'delivery-123',
      };

      await expect(executeGetFulfillmentStatus(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with delivery:read permission', async () => {
      const context = createTestContext({
        permissions: ['delivery:read'],
      });
      const input = {
        delivery_id: 'delivery-123',
      };

      const result = await executeGetFulfillmentStatus(input, context);
      expect(result.success).toBe(true);
    });

    it('allows access with wildcard permission', async () => {
      const context = createTestContext({
        permissions: ['*'],
      });
      const input = {
        delivery_id: 'delivery-123',
      };

      const result = await executeGetFulfillmentStatus(input, context);
      expect(result.success).toBe(true);
    });
  });

  describe('download URL', () => {
    it('returns download URL for completed delivery', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: 'delivery-123',
      };

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.data?.download_url).toBeDefined();
      expect(result.data?.download_url).toContain('delivery-123');
    });

    it('includes expiry for download URL', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: 'delivery-123',
      };

      const result = await executeGetFulfillmentStatus(input, context);

      expect(result.data?.download_url_expires_at).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('handles database errors gracefully', async () => {
      const context = createTestContext();
      const input = {
        delivery_id: 'delivery-123',
      };

      vi.mocked(prisma.delivery.findUnique).mockRejectedValue(new Error('Database error'));

      await expect(executeGetFulfillmentStatus(input, context)).rejects.toThrow('Database error');
    });
  });
});
