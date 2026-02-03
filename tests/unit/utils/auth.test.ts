/**
 * Tests for authentication utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateApiKey,
  hasPermission,
  requirePermission,
  hasDatabaseAccess,
  requireDatabaseAccess,
  isGeographyAllowed,
  extractApiKey,
  clearApiKeyCache,
  type TenantContext,
} from '../../../src/utils/auth.js';
import { AuthenticationError, AuthorizationError } from '../../../src/utils/errors.js';
import { prisma } from '../../../src/db/client.js';

// Mock Prisma
vi.mock('../../../src/db/client.js', () => ({
  prisma: {
    apiKey: {
      findUnique: vi.fn(),
      update: vi.fn(),
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

// Create a test tenant context
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

describe('validateApiKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearApiKeyCache();
  });

  it('throws AuthenticationError when API key is undefined', async () => {
    await expect(validateApiKey(undefined)).rejects.toThrow(AuthenticationError);
    await expect(validateApiKey(undefined)).rejects.toThrow('API key is required');
  });

  it('throws AuthenticationError when API key is empty string', async () => {
    await expect(validateApiKey('')).rejects.toThrow(AuthenticationError);
  });

  it('throws AuthenticationError for invalid API key', async () => {
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(null);

    await expect(validateApiKey('invalid-key')).rejects.toThrow(AuthenticationError);
    await expect(validateApiKey('invalid-key')).rejects.toThrow('Invalid API key');
  });

  it('throws AuthenticationError for inactive API key', async () => {
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue({
      id: 'key-id',
      key: 'test-key',
      name: 'Test Key',
      tenantId: 'tenant-id',
      permissions: ['*'],
      isActive: false,
      lastUsedAt: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      tenant: {
        id: 'tenant-id',
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
        subscriptions: [],
      },
    } as any);

    await expect(validateApiKey('test-key')).rejects.toThrow('API key is inactive');
  });

  it('throws AuthenticationError for expired API key', async () => {
    const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday

    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue({
      id: 'key-id',
      key: 'test-key',
      name: 'Test Key',
      tenantId: 'tenant-id',
      permissions: ['*'],
      isActive: true,
      lastUsedAt: null,
      expiresAt: expiredDate,
      createdAt: new Date(),
      updatedAt: new Date(),
      tenant: {
        id: 'tenant-id',
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
        subscriptions: [],
      },
    } as any);

    await expect(validateApiKey('test-key')).rejects.toThrow('API key has expired');
  });

  it('throws AuthenticationError for inactive tenant', async () => {
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue({
      id: 'key-id',
      key: 'test-key',
      name: 'Test Key',
      tenantId: 'tenant-id',
      permissions: ['*'],
      isActive: true,
      lastUsedAt: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      tenant: {
        id: 'tenant-id',
        name: 'Test Tenant',
        email: 'test@example.com',
        company: 'Test Company',
        phone: null,
        status: 'SUSPENDED',
        stripeCustomerId: null,
        parentTenantId: null,
        isReseller: false,
        wholesalePricing: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        subscriptions: [],
      },
    } as any);

    await expect(validateApiKey('test-key')).rejects.toThrow('Tenant account is suspended');
  });

  it('returns TenantContext for valid API key', async () => {
    const mockApiKeyRecord = {
      id: 'key-id',
      key: 'valid-key',
      name: 'Test Key',
      tenantId: 'tenant-id',
      permissions: ['data:read', 'data:write'],
      isActive: true,
      lastUsedAt: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      tenant: {
        id: 'tenant-id',
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
        subscriptions: [
          {
            id: 'sub-id',
            tenantId: 'tenant-id',
            plan: 'PROFESSIONAL',
            status: 'ACTIVE',
            monthlyRecordLimit: 10000,
            monthlyEmailAppends: 5000,
            monthlyPhoneAppends: 5000,
            allowedDatabases: ['NHO', 'NEW_MOVER'],
            allowedGeographies: null,
            allowedStates: [],
            allowedZipCodes: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      },
    };

    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(mockApiKeyRecord as any);
    vi.mocked(prisma.apiKey.update).mockResolvedValue(mockApiKeyRecord as any);

    const context = await validateApiKey('valid-key');

    expect(context).toBeDefined();
    expect(context.tenant.id).toBe('tenant-id');
    expect(context.apiKey.id).toBe('key-id');
    expect(context.permissions).toEqual(['data:read', 'data:write']);
    expect(context.subscription).toBeDefined();
  });

  it('caches valid API key lookups', async () => {
    const mockApiKeyRecord = {
      id: 'key-id',
      key: 'cached-key',
      name: 'Test Key',
      tenantId: 'tenant-id',
      permissions: ['*'],
      isActive: true,
      lastUsedAt: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      tenant: {
        id: 'tenant-id',
        name: 'Test Tenant',
        email: 'test@example.com',
        company: null,
        phone: null,
        status: 'ACTIVE',
        stripeCustomerId: null,
        parentTenantId: null,
        isReseller: false,
        wholesalePricing: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        subscriptions: [],
      },
    };

    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(mockApiKeyRecord as any);
    vi.mocked(prisma.apiKey.update).mockResolvedValue(mockApiKeyRecord as any);

    // First call - should hit database
    await validateApiKey('cached-key');
    expect(prisma.apiKey.findUnique).toHaveBeenCalledTimes(1);

    // Second call - should use cache
    await validateApiKey('cached-key');
    expect(prisma.apiKey.findUnique).toHaveBeenCalledTimes(1); // Still 1
  });
});

describe('hasPermission', () => {
  it('returns true for wildcard permission', () => {
    const context = createTestContext({ permissions: ['*'] });
    expect(hasPermission(context, 'data:read')).toBe(true);
    expect(hasPermission(context, 'template:write')).toBe(true);
    expect(hasPermission(context, 'anything')).toBe(true);
  });

  it('returns true for admin permission', () => {
    const context = createTestContext({ permissions: ['admin'] });
    expect(hasPermission(context, 'data:read')).toBe(true);
    expect(hasPermission(context, 'billing:read')).toBe(true);
  });

  it('returns true for exact permission match', () => {
    const context = createTestContext({ permissions: ['data:read', 'data:write'] });
    expect(hasPermission(context, 'data:read')).toBe(true);
    expect(hasPermission(context, 'data:write')).toBe(true);
  });

  it('returns true for category wildcard match', () => {
    const context = createTestContext({ permissions: ['data:*'] });
    expect(hasPermission(context, 'data:read')).toBe(true);
    expect(hasPermission(context, 'data:write')).toBe(true);
    expect(hasPermission(context, 'data:delete')).toBe(true);
  });

  it('returns false when permission not present', () => {
    const context = createTestContext({ permissions: ['data:read'] });
    expect(hasPermission(context, 'data:write')).toBe(false);
    expect(hasPermission(context, 'template:read')).toBe(false);
  });

  it('returns false for different category with wildcard', () => {
    const context = createTestContext({ permissions: ['data:*'] });
    expect(hasPermission(context, 'template:read')).toBe(false);
  });

  it('returns false for empty permissions', () => {
    const context = createTestContext({ permissions: [] });
    expect(hasPermission(context, 'data:read')).toBe(false);
  });
});

describe('requirePermission', () => {
  it('does not throw when permission is present', () => {
    const context = createTestContext({ permissions: ['data:read'] });
    expect(() => requirePermission(context, 'data:read')).not.toThrow();
  });

  it('does not throw for wildcard permission', () => {
    const context = createTestContext({ permissions: ['*'] });
    expect(() => requirePermission(context, 'any:permission')).not.toThrow();
  });

  it('throws AuthorizationError when permission is missing', () => {
    const context = createTestContext({ permissions: ['data:read'] });
    expect(() => requirePermission(context, 'data:write')).toThrow(AuthorizationError);
    expect(() => requirePermission(context, 'data:write')).toThrow('Permission denied');
  });

  it('includes required permission in error details', () => {
    const context = createTestContext({ permissions: [] });
    try {
      requirePermission(context, 'data:read');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
      expect((error as AuthorizationError).details?.requiredPermission).toBe('data:read');
    }
  });
});

describe('hasDatabaseAccess', () => {
  it('returns true when database is in allowed list', () => {
    const context = createTestContext();
    context.subscription!.allowedDatabases = ['NHO', 'NEW_MOVER'];

    expect(hasDatabaseAccess(context, 'nho')).toBe(true);
    expect(hasDatabaseAccess(context, 'new_mover')).toBe(true);
  });

  it('returns false when database is not in allowed list', () => {
    const context = createTestContext();
    context.subscription!.allowedDatabases = ['NHO'];

    expect(hasDatabaseAccess(context, 'new_mover')).toBe(false);
    expect(hasDatabaseAccess(context, 'consumer')).toBe(false);
    expect(hasDatabaseAccess(context, 'business')).toBe(false);
  });

  it('handles case-insensitive database names', () => {
    const context = createTestContext();
    context.subscription!.allowedDatabases = ['NHO', 'NEW_MOVER'];

    expect(hasDatabaseAccess(context, 'NHO')).toBe(true);
    expect(hasDatabaseAccess(context, 'nho')).toBe(true);
  });

  it('returns false when no subscription', () => {
    const context = createTestContext({ subscription: null });
    expect(hasDatabaseAccess(context, 'nho')).toBe(false);
  });
});

describe('requireDatabaseAccess', () => {
  it('does not throw when database is allowed', () => {
    const context = createTestContext();
    context.subscription!.allowedDatabases = ['NHO', 'NEW_MOVER'];

    expect(() => requireDatabaseAccess(context, 'nho')).not.toThrow();
  });

  it('throws AuthorizationError when database not allowed', () => {
    const context = createTestContext();
    context.subscription!.allowedDatabases = ['NHO'];

    expect(() => requireDatabaseAccess(context, 'consumer')).toThrow(AuthorizationError);
    expect(() => requireDatabaseAccess(context, 'consumer')).toThrow('Access denied');
  });

  it('includes database in error details', () => {
    const context = createTestContext();
    context.subscription!.allowedDatabases = [];

    try {
      requireDatabaseAccess(context, 'business');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
      expect((error as AuthorizationError).details?.database).toBe('business');
    }
  });
});

describe('isGeographyAllowed', () => {
  it('returns true when no restrictions', () => {
    const context = createTestContext();
    context.subscription!.allowedStates = [];
    context.subscription!.allowedZipCodes = [];

    expect(isGeographyAllowed(context, { type: 'nationwide' })).toBe(true);
    expect(isGeographyAllowed(context, { type: 'state', values: ['AZ', 'CA'] })).toBe(true);
    expect(isGeographyAllowed(context, { type: 'zip', values: ['85001'] })).toBe(true);
  });

  it('allows nationwide only when no restrictions', () => {
    const context = createTestContext();
    context.subscription!.allowedStates = ['AZ'];
    context.subscription!.allowedZipCodes = [];

    expect(isGeographyAllowed(context, { type: 'nationwide' })).toBe(false);
  });

  it('allows state geography when states are in allowed list', () => {
    const context = createTestContext();
    context.subscription!.allowedStates = ['AZ', 'CA', 'TX'];
    context.subscription!.allowedZipCodes = [];

    expect(isGeographyAllowed(context, { type: 'state', values: ['AZ'] })).toBe(true);
    expect(isGeographyAllowed(context, { type: 'state', values: ['AZ', 'CA'] })).toBe(true);
    expect(isGeographyAllowed(context, { type: 'state', values: ['NY'] })).toBe(false);
  });

  it('handles case-insensitive state codes', () => {
    const context = createTestContext();
    context.subscription!.allowedStates = ['AZ'];
    context.subscription!.allowedZipCodes = [];

    expect(isGeographyAllowed(context, { type: 'state', values: ['az'] })).toBe(true);
  });

  it('allows zip geography when zips are in allowed list', () => {
    const context = createTestContext();
    context.subscription!.allowedStates = [];
    context.subscription!.allowedZipCodes = ['85001', '85002', '85003'];

    expect(isGeographyAllowed(context, { type: 'zip', values: ['85001'] })).toBe(true);
    expect(isGeographyAllowed(context, { type: 'zip', values: ['85001', '85002'] })).toBe(true);
    expect(isGeographyAllowed(context, { type: 'zip', values: ['90210'] })).toBe(false);
  });

  it('returns false when no subscription', () => {
    const context = createTestContext({ subscription: null });
    expect(isGeographyAllowed(context, { type: 'zip', values: ['85001'] })).toBe(false);
  });

  it('allows city geography with state restrictions if not zip restricted', () => {
    const context = createTestContext();
    context.subscription!.allowedStates = ['AZ'];
    context.subscription!.allowedZipCodes = [];

    // City geography is allowed since we're not checking city-to-state mapping
    expect(isGeographyAllowed(context, { type: 'city', values: ['Phoenix'] })).toBe(true);
  });

  it('allows county geography with state restrictions', () => {
    const context = createTestContext();
    context.subscription!.allowedStates = ['AZ'];
    context.subscription!.allowedZipCodes = [];

    expect(isGeographyAllowed(context, { type: 'county', values: ['Maricopa County'] })).toBe(true);
  });

  it('allows radius geography', () => {
    const context = createTestContext();
    context.subscription!.allowedStates = ['AZ'];
    context.subscription!.allowedZipCodes = [];

    expect(isGeographyAllowed(context, {
      type: 'radius',
      center: { lat: 33.4484, lng: -112.074 },
      radiusMiles: 25,
    })).toBe(true);
  });
});

describe('extractApiKey', () => {
  it('extracts API key from X-API-Key header', () => {
    const headers = { 'x-api-key': 'my-api-key' };
    expect(extractApiKey(headers)).toBe('my-api-key');
  });

  it('extracts API key from Authorization Bearer header', () => {
    const headers = { authorization: 'Bearer my-bearer-token' };
    expect(extractApiKey(headers)).toBe('my-bearer-token');
  });

  it('prefers X-API-Key over Authorization header', () => {
    const headers = {
      'x-api-key': 'api-key-value',
      authorization: 'Bearer bearer-value',
    };
    expect(extractApiKey(headers)).toBe('api-key-value');
  });

  it('returns undefined when no API key headers present', () => {
    const headers = { 'content-type': 'application/json' };
    expect(extractApiKey(headers)).toBeUndefined();
  });

  it('returns undefined for empty headers', () => {
    expect(extractApiKey({})).toBeUndefined();
  });

  it('ignores non-Bearer Authorization headers', () => {
    const headers = { authorization: 'Basic base64encoded' };
    expect(extractApiKey(headers)).toBeUndefined();
  });

  it('handles undefined header values', () => {
    const headers: Record<string, string | undefined> = { 'x-api-key': undefined };
    expect(extractApiKey(headers)).toBeUndefined();
  });
});

describe('clearApiKeyCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearApiKeyCache();
  });

  it('clears the cache so next lookup hits database', async () => {
    const mockApiKeyRecord = {
      id: 'key-id',
      key: 'cache-test-key',
      name: 'Test Key',
      tenantId: 'tenant-id',
      permissions: ['*'],
      isActive: true,
      lastUsedAt: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      tenant: {
        id: 'tenant-id',
        name: 'Test Tenant',
        email: 'test@example.com',
        company: null,
        phone: null,
        status: 'ACTIVE',
        stripeCustomerId: null,
        parentTenantId: null,
        isReseller: false,
        wholesalePricing: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        subscriptions: [],
      },
    };

    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(mockApiKeyRecord as any);
    vi.mocked(prisma.apiKey.update).mockResolvedValue(mockApiKeyRecord as any);

    // First call
    await validateApiKey('cache-test-key');
    expect(prisma.apiKey.findUnique).toHaveBeenCalledTimes(1);

    // Clear cache
    clearApiKeyCache();

    // Second call should hit database again
    await validateApiKey('cache-test-key');
    expect(prisma.apiKey.findUnique).toHaveBeenCalledTimes(2);
  });
});
