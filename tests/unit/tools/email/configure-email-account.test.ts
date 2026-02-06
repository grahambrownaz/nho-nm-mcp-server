/**
 * Tests for configure_email_account tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { AuthorizationError } from '../../../../src/utils/errors.js';

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    emailConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

// Mock encryption service
vi.mock('../../../../src/services/encryption.js', () => ({
  encrypt: vi.fn((val: string) => `encrypted:${val}`),
}));

// Mock ReachMail client
vi.mock('../../../../src/services/reachmail/client.js', () => ({
  ReachMailClient: vi.fn().mockImplementation(() => ({
    testConnection: vi.fn().mockResolvedValue({
      success: true,
      message: 'Connected as Test User (test@example.com)',
      accountId: 'acct-123',
      email: 'test@example.com',
    }),
  })),
}));

// Import after mocks
import { executeConfigureEmailAccount } from '../../../../src/tools/email/configure-email-account.js';
import { prisma } from '../../../../src/db/client.js';
import * as encryption from '../../../../src/services/encryption.js';
import { ReachMailClient } from '../../../../src/services/reachmail/client.js';

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

describe('configure_email_account tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(prisma.emailConfig.upsert).mockResolvedValue({
      id: 'config-123',
      tenantId: 'test-tenant-id',
      reachmailToken: 'encrypted:test-token',
      reachmailAccountId: 'acct-123',
      defaultFromAddress: 'send@example.com',
      defaultReplyTo: null,
      physicalAddress: '123 Main St, Suite 100, City, ST 12345',
      dkimDomain: null,
      isVerified: true,
      lastTestAt: new Date(),
      lastTestSuccess: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
  });

  describe('successful configuration', () => {
    it('configures email account with connection test', async () => {
      const context = createTestContext();
      const input = {
        reachmail_token: 'test-token',
        from_address: 'send@example.com',
        physical_address: '123 Main St, Suite 100, City, ST 12345',
      };

      const result = await executeConfigureEmailAccount(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.config_id).toBe('config-123');
      expect(result.data?.account_id).toBe('acct-123');
      expect(result.data?.from_address).toBe('send@example.com');
      expect(result.data?.connection_tested).toBe(true);
    });

    it('configures without connection test', async () => {
      const context = createTestContext();
      const input = {
        reachmail_token: 'test-token',
        from_address: 'send@example.com',
        physical_address: '123 Main St, Suite 100, City, ST 12345',
        test_connection: false,
      };

      const result = await executeConfigureEmailAccount(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.connection_tested).toBe(false);
      expect(ReachMailClient).not.toHaveBeenCalled();
    });

    it('encrypts token before storage', async () => {
      const context = createTestContext();
      const input = {
        reachmail_token: 'my-secret-token',
        from_address: 'send@example.com',
        physical_address: '123 Main St, Suite 100, City, ST 12345',
        test_connection: false,
      };

      await executeConfigureEmailAccount(input, context);

      expect(encryption.encrypt).toHaveBeenCalledWith('my-secret-token');
    });

    it('upserts config (one per tenant)', async () => {
      const context = createTestContext();
      const input = {
        reachmail_token: 'test-token',
        from_address: 'send@example.com',
        physical_address: '123 Main St, Suite 100, City, ST 12345',
        test_connection: false,
      };

      await executeConfigureEmailAccount(input, context);

      expect(prisma.emailConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'test-tenant-id' },
          create: expect.objectContaining({
            tenantId: 'test-tenant-id',
            reachmailToken: 'encrypted:test-token',
          }),
          update: expect.objectContaining({
            reachmailToken: 'encrypted:test-token',
          }),
        })
      );
    });

    it('stores optional reply_to and dkim_domain', async () => {
      const context = createTestContext();
      const input = {
        reachmail_token: 'test-token',
        from_address: 'send@example.com',
        reply_to: 'reply@example.com',
        physical_address: '123 Main St, Suite 100, City, ST 12345',
        dkim_domain: 'example.com',
        test_connection: false,
      };

      await executeConfigureEmailAccount(input, context);

      expect(prisma.emailConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            defaultReplyTo: 'reply@example.com',
            dkimDomain: 'example.com',
          }),
        })
      );
    });
  });

  describe('connection test failures', () => {
    it('returns error when connection test fails', async () => {
      vi.mocked(ReachMailClient).mockImplementation(() => ({
        testConnection: vi.fn().mockResolvedValue({
          success: false,
          message: 'Invalid token',
        }),
      } as any));

      const context = createTestContext();
      const input = {
        reachmail_token: 'invalid-token',
        from_address: 'send@example.com',
        physical_address: '123 Main St, Suite 100, City, ST 12345',
      };

      const result = await executeConfigureEmailAccount(input, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection test failed');
    });
  });

  describe('input validation', () => {
    it('throws error for missing token', async () => {
      const context = createTestContext();
      const input = {
        from_address: 'send@example.com',
        physical_address: '123 Main St, Suite 100, City, ST 12345',
      };

      await expect(executeConfigureEmailAccount(input, context)).rejects.toThrow();
    });

    it('throws error for invalid from_address', async () => {
      const context = createTestContext();
      const input = {
        reachmail_token: 'test-token',
        from_address: 'not-an-email',
        physical_address: '123 Main St, Suite 100, City, ST 12345',
      };

      await expect(executeConfigureEmailAccount(input, context)).rejects.toThrow();
    });

    it('throws error for short physical_address', async () => {
      const context = createTestContext();
      const input = {
        reachmail_token: 'test-token',
        from_address: 'send@example.com',
        physical_address: 'short',
      };

      await expect(executeConfigureEmailAccount(input, context)).rejects.toThrow();
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing email:write permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {
        reachmail_token: 'test-token',
        from_address: 'send@example.com',
        physical_address: '123 Main St, Suite 100, City, ST 12345',
      };

      await expect(executeConfigureEmailAccount(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with email:write permission', async () => {
      const context = createTestContext({
        permissions: ['email:write'],
      });
      const input = {
        reachmail_token: 'test-token',
        from_address: 'send@example.com',
        physical_address: '123 Main St, Suite 100, City, ST 12345',
        test_connection: false,
      };

      const result = await executeConfigureEmailAccount(input, context);
      expect(result.success).toBe(true);
    });

    it('allows access with wildcard permission', async () => {
      const context = createTestContext({
        permissions: ['*'],
      });
      const input = {
        reachmail_token: 'test-token',
        from_address: 'send@example.com',
        physical_address: '123 Main St, Suite 100, City, ST 12345',
        test_connection: false,
      };

      const result = await executeConfigureEmailAccount(input, context);
      expect(result.success).toBe(true);
    });
  });
});
