/**
 * Tests for configure_delivery tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeConfigureDelivery } from '../../../../src/tools/delivery/configure-delivery.js';
import { prisma } from '../../../../src/db/client.js';
import { sftpDeliveryService } from '../../../../src/services/sftp-delivery.js';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { ValidationError, AuthorizationError } from '../../../../src/utils/errors.js';

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    deliveryConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock SFTP delivery service
vi.mock('../../../../src/services/sftp-delivery.js', () => ({
  sftpDeliveryService: {
    testConnection: vi.fn(),
    encryptCredentials: vi.fn(),
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

describe('configure_delivery tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock responses
    vi.mocked(sftpDeliveryService.testConnection).mockResolvedValue(true);
    vi.mocked(sftpDeliveryService.encryptCredentials).mockReturnValue('encrypted-credentials');
    vi.mocked(prisma.deliveryConfig.upsert).mockResolvedValue({
      id: 'config-id',
      tenantId: 'test-tenant-id',
      method: 'SFTP',
      config: { host: 'sftp.example.com' },
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
  });

  describe('SFTP configuration', () => {
    it('configures SFTP with valid credentials', async () => {
      const context = createTestContext();
      const input = {
        method: 'sftp',
        config: {
          host: 'sftp.example.com',
          port: 22,
          username: 'testuser',
          password: 'testpass',
          remote_path: '/incoming/data',
        },
      };

      const result = await executeConfigureDelivery(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.method).toBe('sftp');
      expect(result.data?.connection_verified).toBe(true);
    });

    it('validates SFTP connection on save', async () => {
      const context = createTestContext();
      const input = {
        method: 'sftp',
        config: {
          host: 'sftp.example.com',
          port: 22,
          username: 'testuser',
          password: 'testpass',
          remote_path: '/incoming',
        },
        validate_connection: true,
      };

      await executeConfigureDelivery(input, context);

      expect(sftpDeliveryService.testConnection).toHaveBeenCalledWith({
        host: 'sftp.example.com',
        port: 22,
        username: 'testuser',
        password: 'testpass',
        remote_path: '/incoming',
      });
    });

    it('encrypts credentials before storage', async () => {
      const context = createTestContext();
      const input = {
        method: 'sftp',
        config: {
          host: 'sftp.example.com',
          port: 22,
          username: 'testuser',
          password: 'secretpassword',
          remote_path: '/incoming',
        },
      };

      await executeConfigureDelivery(input, context);

      expect(sftpDeliveryService.encryptCredentials).toHaveBeenCalledWith(
        expect.objectContaining({
          password: 'secretpassword',
        })
      );
      expect(prisma.deliveryConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            config: expect.objectContaining({
              credentials: 'encrypted-credentials',
            }),
          }),
        })
      );
    });

    it('rejects invalid SFTP config - missing host', async () => {
      const context = createTestContext();
      const input = {
        method: 'sftp',
        config: {
          port: 22,
          username: 'testuser',
          password: 'testpass',
          remote_path: '/incoming',
        },
      };

      await expect(executeConfigureDelivery(input, context)).rejects.toThrow();
    });

    it('rejects invalid SFTP config - missing username', async () => {
      const context = createTestContext();
      const input = {
        method: 'sftp',
        config: {
          host: 'sftp.example.com',
          port: 22,
          password: 'testpass',
          remote_path: '/incoming',
        },
      };

      await expect(executeConfigureDelivery(input, context)).rejects.toThrow();
    });

    it('rejects invalid SFTP config - invalid port', async () => {
      const context = createTestContext();
      const input = {
        method: 'sftp',
        config: {
          host: 'sftp.example.com',
          port: -1, // Invalid port
          username: 'testuser',
          password: 'testpass',
          remote_path: '/incoming',
        },
      };

      await expect(executeConfigureDelivery(input, context)).rejects.toThrow();
    });

    it('handles SFTP connection failure', async () => {
      const context = createTestContext();
      const input = {
        method: 'sftp',
        config: {
          host: 'invalid.sftp.com',
          port: 22,
          username: 'testuser',
          password: 'testpass',
          remote_path: '/incoming',
        },
        validate_connection: true,
      };

      vi.mocked(sftpDeliveryService.testConnection).mockResolvedValue(false);

      await expect(executeConfigureDelivery(input, context)).rejects.toThrow();
    });

    it('accepts SSH key authentication', async () => {
      const context = createTestContext();
      const input = {
        method: 'sftp',
        config: {
          host: 'sftp.example.com',
          port: 22,
          username: 'testuser',
          private_key: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----',
          remote_path: '/incoming',
        },
      };

      const result = await executeConfigureDelivery(input, context);

      expect(result.success).toBe(true);
    });

    it('uses default port 22 if not specified', async () => {
      const context = createTestContext();
      const input = {
        method: 'sftp',
        config: {
          host: 'sftp.example.com',
          username: 'testuser',
          password: 'testpass',
          remote_path: '/incoming',
        },
      };

      const result = await executeConfigureDelivery(input, context);

      expect(result.success).toBe(true);
      expect(sftpDeliveryService.testConnection).toHaveBeenCalledWith(
        expect.objectContaining({ port: 22 })
      );
    });
  });

  describe('email configuration', () => {
    it('configures email delivery', async () => {
      const context = createTestContext();
      const input = {
        method: 'email',
        config: {
          email_address: 'delivery@example.com',
          subject_template: 'Your {{database}} data is ready',
          include_summary: true,
        },
      };

      vi.mocked(prisma.deliveryConfig.upsert).mockResolvedValue({
        id: 'config-id',
        tenantId: 'test-tenant-id',
        method: 'EMAIL',
        config: { email_address: 'delivery@example.com' },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await executeConfigureDelivery(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.method).toBe('email');
    });

    it('validates email address format', async () => {
      const context = createTestContext();
      const input = {
        method: 'email',
        config: {
          email_address: 'not-an-email',
        },
      };

      await expect(executeConfigureDelivery(input, context)).rejects.toThrow();
    });

    it('accepts multiple email recipients', async () => {
      const context = createTestContext();
      const input = {
        method: 'email',
        config: {
          email_addresses: ['team@example.com', 'admin@example.com'],
          subject_template: 'Data delivery ready',
        },
      };

      vi.mocked(prisma.deliveryConfig.upsert).mockResolvedValue({
        id: 'config-id',
        tenantId: 'test-tenant-id',
        method: 'EMAIL',
        config: { email_addresses: ['team@example.com', 'admin@example.com'] },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await executeConfigureDelivery(input, context);

      expect(result.success).toBe(true);
    });
  });

  describe('webhook configuration', () => {
    it('configures webhook delivery', async () => {
      const context = createTestContext();
      const input = {
        method: 'webhook',
        config: {
          url: 'https://api.example.com/webhook/delivery',
          secret: 'webhook-secret-123',
          headers: {
            'X-Api-Key': 'api-key-123',
          },
        },
      };

      vi.mocked(prisma.deliveryConfig.upsert).mockResolvedValue({
        id: 'config-id',
        tenantId: 'test-tenant-id',
        method: 'WEBHOOK',
        config: { url: 'https://api.example.com/webhook/delivery' },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await executeConfigureDelivery(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.method).toBe('webhook');
    });

    it('validates webhook URL format', async () => {
      const context = createTestContext();
      const input = {
        method: 'webhook',
        config: {
          url: 'not-a-url',
        },
      };

      await expect(executeConfigureDelivery(input, context)).rejects.toThrow();
    });

    it('requires HTTPS for webhook URL', async () => {
      const context = createTestContext();
      const input = {
        method: 'webhook',
        config: {
          url: 'http://insecure.example.com/webhook',
        },
      };

      await expect(executeConfigureDelivery(input, context)).rejects.toThrow();
    });

    it('encrypts webhook secret before storage', async () => {
      const context = createTestContext();
      const input = {
        method: 'webhook',
        config: {
          url: 'https://api.example.com/webhook',
          secret: 'super-secret-key',
        },
      };

      await executeConfigureDelivery(input, context);

      expect(sftpDeliveryService.encryptCredentials).toHaveBeenCalled();
    });
  });

  describe('FTP configuration', () => {
    it('configures FTP delivery', async () => {
      const context = createTestContext();
      const input = {
        method: 'ftp',
        config: {
          host: 'ftp.example.com',
          port: 21,
          username: 'ftpuser',
          password: 'ftppass',
          remote_path: '/uploads',
          secure: true, // FTPS
        },
      };

      vi.mocked(prisma.deliveryConfig.upsert).mockResolvedValue({
        id: 'config-id',
        tenantId: 'test-tenant-id',
        method: 'FTP',
        config: { host: 'ftp.example.com' },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await executeConfigureDelivery(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.method).toBe('ftp');
    });
  });

  describe('SFTP hot folder configuration', () => {
    it('configures SFTP hot folder for printer', async () => {
      const context = createTestContext();
      const input = {
        method: 'sftp_hot_folder',
        config: {
          host: 'printer.sftp.com',
          port: 22,
          username: 'printjob',
          password: 'printpass',
          remote_path: '/hot_folder/incoming',
          generate_jdf: true,
          jdf_settings: {
            media_preset: '4x6_100lb_gloss_fc',
            duplex: true,
          },
        },
      };

      vi.mocked(prisma.deliveryConfig.upsert).mockResolvedValue({
        id: 'config-id',
        tenantId: 'test-tenant-id',
        method: 'SFTP_HOT_FOLDER',
        config: { host: 'printer.sftp.com', generate_jdf: true },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await executeConfigureDelivery(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.method).toBe('sftp_hot_folder');
    });
  });

  describe('input validation', () => {
    it('throws ValidationError for invalid delivery method', async () => {
      const context = createTestContext();
      const input = {
        method: 'carrier_pigeon', // Invalid method
        config: {},
      };

      await expect(executeConfigureDelivery(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for missing config', async () => {
      const context = createTestContext();
      const input = {
        method: 'sftp',
      };

      await expect(executeConfigureDelivery(input, context)).rejects.toThrow();
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing delivery:configure permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {
        method: 'sftp',
        config: {
          host: 'sftp.example.com',
          username: 'user',
          password: 'pass',
          remote_path: '/incoming',
        },
      };

      await expect(executeConfigureDelivery(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with delivery:configure permission', async () => {
      const context = createTestContext({
        permissions: ['delivery:configure'],
      });
      const input = {
        method: 'sftp',
        config: {
          host: 'sftp.example.com',
          username: 'user',
          password: 'pass',
          remote_path: '/incoming',
        },
      };

      const result = await executeConfigureDelivery(input, context);
      expect(result.success).toBe(true);
    });

    it('allows access with wildcard permission', async () => {
      const context = createTestContext({
        permissions: ['*'],
      });
      const input = {
        method: 'sftp',
        config: {
          host: 'sftp.example.com',
          username: 'user',
          password: 'pass',
          remote_path: '/incoming',
        },
      };

      const result = await executeConfigureDelivery(input, context);
      expect(result.success).toBe(true);
    });
  });

  describe('tenant association', () => {
    it('associates config with current tenant', async () => {
      const context = createTestContext();
      const input = {
        method: 'sftp',
        config: {
          host: 'sftp.example.com',
          username: 'user',
          password: 'pass',
          remote_path: '/incoming',
        },
      };

      await executeConfigureDelivery(input, context);

      expect(prisma.deliveryConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'test-tenant-id',
          }),
        })
      );
    });
  });

  describe('error handling', () => {
    it('handles database errors gracefully', async () => {
      const context = createTestContext();
      const input = {
        method: 'sftp',
        config: {
          host: 'sftp.example.com',
          username: 'user',
          password: 'pass',
          remote_path: '/incoming',
        },
      };

      vi.mocked(prisma.deliveryConfig.upsert).mockRejectedValue(new Error('Database error'));

      await expect(executeConfigureDelivery(input, context)).rejects.toThrow('Database error');
    });
  });
});
