/**
 * Tests for configure_delivery tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeConfigureDelivery } from '../../../../src/tools/delivery/configure-delivery.js';
import { prisma } from '../../../../src/db/client.js';
import * as sftpDelivery from '../../../../src/services/sftp-delivery.js';
import * as encryption from '../../../../src/services/encryption.js';
import * as printApi from '../../../../src/services/print-api/index.js';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { AuthorizationError } from '../../../../src/utils/errors.js';

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    deliveryConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

// Mock SFTP delivery service
vi.mock('../../../../src/services/sftp-delivery.js', () => ({
  getSftpDeliveryService: vi.fn(() => ({
    testConnection: vi.fn(),
  })),
}));

// Mock encryption service
vi.mock('../../../../src/services/encryption.js', () => ({
  encrypt: vi.fn((val) => `encrypted:${val}`),
}));

// Mock JDF generator
vi.mock('../../../../src/services/jdf-generator.js', () => ({
  JDF_PRESETS: {
    '4x6_100lb_gloss_fc': {},
    '4x6_100lb_matte_fc': {},
    '6x9_100lb_gloss_fc': {},
    '6x9_100lb_matte_fc': {},
  },
}));

// Mock print API
vi.mock('../../../../src/services/print-api/index.js', () => ({
  configureAndRegisterProvider: vi.fn(() => ({
    name: 'lob',
    displayName: 'Lob',
    testConnection: vi.fn().mockResolvedValue({ success: true }),
  })),
  listPrintApiProviders: vi.fn(() => [
    { name: 'reminder_media', displayName: 'ReminderMedia', isDefault: false, isConfigured: false },
    { name: 'lob', displayName: 'Lob', isDefault: false, isConfigured: false },
    { name: 'stannp', displayName: 'Stannp', isDefault: false, isConfigured: false },
    { name: 'postgrid', displayName: 'PostGrid', isDefault: false, isConfigured: false },
  ]),
}));

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
    subscription: null,
    permissions: ['*'],
    ...overrides,
  };
}

describe('configure_delivery tool', () => {
  let mockSftpService: { testConnection: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockSftpService = {
      testConnection: vi.fn().mockResolvedValue({
        success: true,
        message: 'Connection successful',
        folderExists: true,
        folderWritable: true,
        latencyMs: 50,
      }),
    };

    vi.mocked(sftpDelivery.getSftpDeliveryService).mockReturnValue(mockSftpService);

    vi.mocked(prisma.deliveryConfig.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.deliveryConfig.create).mockResolvedValue({
      id: 'config-id',
      tenantId: 'test-tenant-id',
      name: 'Test Config',
      method: 'SFTP_HOT_FOLDER',
      isDefault: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
  });

  describe('SFTP hot folder configuration', () => {
    it('configures SFTP with password', async () => {
      const context = createTestContext();
      const input = {
        name: 'Printer SFTP',
        method: 'sftp_hot_folder',
        sftp: {
          host: 'sftp.example.com',
          port: 22,
          username: 'testuser',
          password: 'testpass',
          folder_path: '/incoming/data',
        },
      };

      const result = await executeConfigureDelivery(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.config.method).toBe('sftp_hot_folder');
    });

    it('validates SFTP connection when test_connection is true', async () => {
      const context = createTestContext();
      const input = {
        name: 'Printer SFTP',
        method: 'sftp_hot_folder',
        sftp: {
          host: 'sftp.example.com',
          port: 22,
          username: 'testuser',
          password: 'testpass',
          folder_path: '/incoming',
        },
        test_connection: true,
      };

      const result = await executeConfigureDelivery(input, context);

      expect(mockSftpService.testConnection).toHaveBeenCalled();
      expect(result.data?.test_result).toBeDefined();
      expect(result.data?.test_result?.success).toBe(true);
    });

    it('encrypts password before storage', async () => {
      const context = createTestContext();
      const input = {
        name: 'Printer SFTP',
        method: 'sftp_hot_folder',
        sftp: {
          host: 'sftp.example.com',
          port: 22,
          username: 'testuser',
          password: 'secretpassword',
          folder_path: '/incoming',
        },
        test_connection: false,
      };

      await executeConfigureDelivery(input, context);

      expect(encryption.encrypt).toHaveBeenCalledWith('secretpassword');
    });

    it('throws error when SFTP config is missing', async () => {
      const context = createTestContext();
      const input = {
        name: 'Printer SFTP',
        method: 'sftp_hot_folder',
      };

      await expect(executeConfigureDelivery(input, context)).rejects.toThrow();
    });

    it('throws error when neither password nor private_key is provided', async () => {
      const context = createTestContext();
      const input = {
        name: 'Printer SFTP',
        method: 'sftp_hot_folder',
        sftp: {
          host: 'sftp.example.com',
          port: 22,
          username: 'testuser',
          folder_path: '/incoming',
        },
      };

      await expect(executeConfigureDelivery(input, context)).rejects.toThrow();
    });

    it('accepts SSH key authentication', async () => {
      const context = createTestContext();
      const input = {
        name: 'Printer SFTP',
        method: 'sftp_hot_folder',
        sftp: {
          host: 'sftp.example.com',
          port: 22,
          username: 'testuser',
          private_key: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----',
          folder_path: '/incoming',
        },
        test_connection: false,
      };

      const result = await executeConfigureDelivery(input, context);

      expect(result.success).toBe(true);
    });

    it('handles SFTP connection failure', async () => {
      mockSftpService.testConnection.mockResolvedValue({
        success: false,
        message: 'Connection refused',
        folderExists: false,
        folderWritable: false,
      });

      const context = createTestContext();
      const input = {
        name: 'Printer SFTP',
        method: 'sftp_hot_folder',
        sftp: {
          host: 'invalid.sftp.com',
          port: 22,
          username: 'testuser',
          password: 'testpass',
          folder_path: '/incoming',
        },
        test_connection: true,
      };

      const result = await executeConfigureDelivery(input, context);

      expect(result.data?.test_result?.success).toBe(false);
    });

    it('includes JDF preset validation', async () => {
      const context = createTestContext();
      const input = {
        name: 'Printer SFTP with JDF',
        method: 'sftp_hot_folder',
        sftp: {
          host: 'sftp.example.com',
          port: 22,
          username: 'testuser',
          password: 'testpass',
          folder_path: '/incoming',
          include_jdf: true,
          jdf_preset: '4x6_100lb_gloss_fc',
        },
        test_connection: false,
      };

      const result = await executeConfigureDelivery(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.jdf_presets).toBeDefined();
    });

    it('throws error for invalid JDF preset', async () => {
      const context = createTestContext();
      const input = {
        name: 'Printer SFTP with JDF',
        method: 'sftp_hot_folder',
        sftp: {
          host: 'sftp.example.com',
          port: 22,
          username: 'testuser',
          password: 'testpass',
          folder_path: '/incoming',
          include_jdf: true,
          jdf_preset: 'invalid_preset',
        },
        test_connection: false,
      };

      await expect(executeConfigureDelivery(input, context)).rejects.toThrow();
    });
  });

  describe('email configuration', () => {
    it('configures email delivery', async () => {
      vi.mocked(prisma.deliveryConfig.create).mockResolvedValue({
        id: 'config-id',
        tenantId: 'test-tenant-id',
        name: 'Email Delivery',
        method: 'EMAIL',
        isDefault: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const context = createTestContext();
      const input = {
        name: 'Email Delivery',
        method: 'email',
        email: {
          address: 'delivery@example.com',
        },
        test_connection: false,
      };

      const result = await executeConfigureDelivery(input, context);

      expect(result.success).toBe(true);
    });

    it('throws error when email config is missing', async () => {
      const context = createTestContext();
      const input = {
        name: 'Email Delivery',
        method: 'email',
      };

      await expect(executeConfigureDelivery(input, context)).rejects.toThrow();
    });
  });

  describe('webhook configuration', () => {
    it('configures webhook delivery', async () => {
      vi.mocked(prisma.deliveryConfig.create).mockResolvedValue({
        id: 'config-id',
        tenantId: 'test-tenant-id',
        name: 'Webhook Delivery',
        method: 'WEBHOOK',
        isDefault: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const context = createTestContext();
      const input = {
        name: 'Webhook Delivery',
        method: 'webhook',
        webhook: {
          url: 'https://api.example.com/webhook/delivery',
          headers: {
            'X-Api-Key': 'api-key-123',
          },
        },
        test_connection: false,
      };

      const result = await executeConfigureDelivery(input, context);

      expect(result.success).toBe(true);
    });

    it('throws error when webhook config is missing', async () => {
      const context = createTestContext();
      const input = {
        name: 'Webhook Delivery',
        method: 'webhook',
      };

      await expect(executeConfigureDelivery(input, context)).rejects.toThrow();
    });
  });

  describe('print API configuration', () => {
    it('configures print API delivery', async () => {
      vi.mocked(prisma.deliveryConfig.create).mockResolvedValue({
        id: 'config-id',
        tenantId: 'test-tenant-id',
        name: 'Print API',
        method: 'PRINT_API',
        isDefault: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const context = createTestContext();
      const input = {
        name: 'Print API',
        method: 'print_api',
        print_api: {
          provider: 'lob',
          api_key: 'test_api_key',
        },
        test_connection: false,
      };

      const result = await executeConfigureDelivery(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.print_api_providers).toBeDefined();
    });

    it('tests print API connection', async () => {
      vi.mocked(prisma.deliveryConfig.create).mockResolvedValue({
        id: 'config-id',
        tenantId: 'test-tenant-id',
        name: 'Print API',
        method: 'PRINT_API',
        isDefault: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const context = createTestContext();
      const input = {
        name: 'Print API',
        method: 'print_api',
        print_api: {
          provider: 'lob',
          api_key: 'test_api_key',
        },
        test_connection: true,
      };

      const result = await executeConfigureDelivery(input, context);

      expect(printApi.configureAndRegisterProvider).toHaveBeenCalled();
      expect(result.data?.test_result?.success).toBe(true);
    });

    it('throws error when print_api config is missing', async () => {
      const context = createTestContext();
      const input = {
        name: 'Print API',
        method: 'print_api',
      };

      await expect(executeConfigureDelivery(input, context)).rejects.toThrow();
    });
  });

  describe('cloud storage configuration', () => {
    it('configures cloud storage delivery', async () => {
      vi.mocked(prisma.deliveryConfig.create).mockResolvedValue({
        id: 'config-id',
        tenantId: 'test-tenant-id',
        name: 'S3 Storage',
        method: 'CLOUD_STORAGE',
        isDefault: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const context = createTestContext();
      const input = {
        name: 'S3 Storage',
        method: 'cloud_storage',
        cloud_storage: {
          provider: 's3',
          bucket: 'my-bucket',
          path: '/deliveries',
          credentials: JSON.stringify({ accessKeyId: 'xxx', secretAccessKey: 'yyy' }),
        },
        test_connection: false,
      };

      const result = await executeConfigureDelivery(input, context);

      expect(result.success).toBe(true);
    });

    it('throws error when cloud_storage config is missing', async () => {
      const context = createTestContext();
      const input = {
        name: 'S3 Storage',
        method: 'cloud_storage',
      };

      await expect(executeConfigureDelivery(input, context)).rejects.toThrow();
    });
  });

  describe('input validation', () => {
    it('throws error for invalid delivery method', async () => {
      const context = createTestContext();
      const input = {
        name: 'Invalid Method',
        method: 'carrier_pigeon',
      };

      await expect(executeConfigureDelivery(input, context)).rejects.toThrow();
    });

    it('throws error for missing name', async () => {
      const context = createTestContext();
      const input = {
        method: 'email',
        email: {
          address: 'test@example.com',
        },
      };

      await expect(executeConfigureDelivery(input, context)).rejects.toThrow();
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing subscription:write permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {
        name: 'Printer SFTP',
        method: 'sftp_hot_folder',
        sftp: {
          host: 'sftp.example.com',
          username: 'user',
          password: 'pass',
          folder_path: '/incoming',
        },
      };

      await expect(executeConfigureDelivery(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with subscription:write permission', async () => {
      const context = createTestContext({
        permissions: ['subscription:write'],
      });
      const input = {
        name: 'Printer SFTP',
        method: 'sftp_hot_folder',
        sftp: {
          host: 'sftp.example.com',
          username: 'user',
          password: 'pass',
          folder_path: '/incoming',
        },
        test_connection: false,
      };

      const result = await executeConfigureDelivery(input, context);
      expect(result.success).toBe(true);
    });

    it('allows access with wildcard permission', async () => {
      const context = createTestContext({
        permissions: ['*'],
      });
      const input = {
        name: 'Printer SFTP',
        method: 'sftp_hot_folder',
        sftp: {
          host: 'sftp.example.com',
          username: 'user',
          password: 'pass',
          folder_path: '/incoming',
        },
        test_connection: false,
      };

      const result = await executeConfigureDelivery(input, context);
      expect(result.success).toBe(true);
    });
  });

  describe('default configuration', () => {
    it('sets as default when is_default is true', async () => {
      const context = createTestContext();
      const input = {
        name: 'Default SFTP',
        method: 'sftp_hot_folder',
        is_default: true,
        sftp: {
          host: 'sftp.example.com',
          username: 'user',
          password: 'pass',
          folder_path: '/incoming',
        },
        test_connection: false,
      };

      await executeConfigureDelivery(input, context);

      expect(prisma.deliveryConfig.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'test-tenant-id',
          isDefault: true,
        },
        data: { isDefault: false },
      });
    });
  });

  describe('response format', () => {
    it('returns config details', async () => {
      const context = createTestContext();
      const input = {
        name: 'Printer SFTP',
        method: 'sftp_hot_folder',
        sftp: {
          host: 'sftp.example.com',
          username: 'user',
          password: 'pass',
          folder_path: '/incoming',
        },
        test_connection: false,
      };

      const result = await executeConfigureDelivery(input, context);

      expect(result.data?.config.id).toBeDefined();
      expect(result.data?.config.name).toBe('Test Config');
      expect(result.data?.config.method).toBe('sftp_hot_folder');
      expect(result.data?.config.createdAt).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('handles database errors gracefully', async () => {
      const context = createTestContext();
      const input = {
        name: 'Printer SFTP',
        method: 'sftp_hot_folder',
        sftp: {
          host: 'sftp.example.com',
          username: 'user',
          password: 'pass',
          folder_path: '/incoming',
        },
        test_connection: false,
      };

      vi.mocked(prisma.deliveryConfig.create).mockRejectedValue(new Error('Database error'));

      await expect(executeConfigureDelivery(input, context)).rejects.toThrow('Database error');
    });
  });
});
