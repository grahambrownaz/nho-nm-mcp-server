/**
 * Tests for configure_swotspot tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { AuthorizationError } from '../../../../src/utils/errors.js';

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    swotspotConfig: {
      upsert: vi.fn(),
    },
  },
}));

// Mock encryption
vi.mock('../../../../src/services/encryption.js', () => ({
  encrypt: vi.fn((val: string) => `encrypted:${val}`),
}));

// Mock SWOTSPOT client
vi.mock('../../../../src/services/swotspot/client.js', () => ({
  SwotspotClient: vi.fn().mockImplementation(() => ({
    testConnection: vi.fn().mockResolvedValue({
      success: true,
      message: 'Connected to SWOTSPOT.ai (mock mode)',
      accountId: 'swotspot-mock-account',
    }),
  })),
}));

import { executeConfigureSwotspot } from '../../../../src/tools/swotspot/configure-swotspot.js';
import { prisma } from '../../../../src/db/client.js';

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

describe('configure_swotspot tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.swotspotConfig.upsert).mockResolvedValue({} as never);
  });

  describe('successful configuration', () => {
    it('stores encrypted API key', async () => {
      const context = createTestContext();
      const input = { api_key: 'swotspot-api-key-123' };

      const result = await executeConfigureSwotspot(input, context);

      expect(result.success).toBe(true);
      expect(prisma.swotspotConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            apiKey: 'encrypted:swotspot-api-key-123',
          }),
        })
      );
    });

    it('tests connection by default', async () => {
      const context = createTestContext();
      const input = { api_key: 'test-key' };

      const result = await executeConfigureSwotspot(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.connection_tested).toBe(true);
      expect(result.data?.account_id).toBe('swotspot-mock-account');
    });

    it('skips connection test when test_connection=false', async () => {
      const context = createTestContext();
      const input = { api_key: 'test-key', test_connection: false };

      const result = await executeConfigureSwotspot(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.connection_tested).toBe(false);
    });

    it('upserts config for tenant', async () => {
      const context = createTestContext();
      const input = { api_key: 'test-key' };

      await executeConfigureSwotspot(input, context);

      expect(prisma.swotspotConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'test-tenant-id' },
        })
      );
    });
  });

  describe('input validation', () => {
    it('throws error for empty api_key', async () => {
      const context = createTestContext();
      const input = { api_key: '' };

      await expect(executeConfigureSwotspot(input, context)).rejects.toThrow();
    });

    it('throws error for missing api_key', async () => {
      const context = createTestContext();
      const input = {};

      await expect(executeConfigureSwotspot(input, context)).rejects.toThrow();
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing swotspot:write permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = { api_key: 'test-key' };

      await expect(executeConfigureSwotspot(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with swotspot:write permission', async () => {
      const context = createTestContext({
        permissions: ['swotspot:write'],
      });
      const input = { api_key: 'test-key' };

      const result = await executeConfigureSwotspot(input, context);
      expect(result.success).toBe(true);
    });
  });
});
