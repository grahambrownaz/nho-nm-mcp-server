/**
 * Tests for search_data tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeSearchData } from '../../../../src/tools/data/search-data.js';
import { leadsPleaseApi } from '../../../../src/services/leadsplease-api.js';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { ValidationError, AuthorizationError, QuotaExceededError } from '../../../../src/utils/errors.js';

// Mock the LeadsPlease API
vi.mock('../../../../src/services/leadsplease-api.js', () => ({
  leadsPleaseApi: {
    searchRecords: vi.fn(),
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

describe('search_data tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock response
    vi.mocked(leadsPleaseApi.searchRecords).mockResolvedValue({
      records: [
        {
          first_name: 'John',
          last_name: 'Doe',
          address: '123 Main St',
          city: 'Phoenix',
          state: 'AZ',
          zip: '85001',
        },
        {
          first_name: 'Jane',
          last_name: 'Smith',
          address: '456 Oak Ave',
          city: 'Phoenix',
          state: 'AZ',
          zip: '85002',
        },
      ],
      total: 150,
    });
  });

  describe('valid input', () => {
    it('returns records for valid input with ZIP geography', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: {
          type: 'zip',
          values: ['85001', '85002'],
        },
        limit: 100,
      };

      const result = await executeSearchData(input, context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.records).toHaveLength(2);
      expect(result.data?.total).toBe(150);
      expect(result.data?.returned).toBe(2);
      expect(result.data?.hasMore).toBe(true);
    });

    it('returns records for valid input with state geography', async () => {
      const context = createTestContext();
      const input = {
        database: 'new_mover',
        geography: {
          type: 'state',
          values: ['AZ', 'CA'],
        },
      };

      const result = await executeSearchData(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.records).toBeDefined();
      expect(leadsPleaseApi.searchRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          database: 'new_mover',
          geography: { type: 'state', values: ['AZ', 'CA'] },
        })
      );
    });

    it('returns records for radius geography', async () => {
      const context = createTestContext();
      const input = {
        database: 'consumer',
        geography: {
          type: 'radius',
          center: { lat: 33.4484, lng: -112.074 },
          radiusMiles: 25,
        },
      };

      const result = await executeSearchData(input, context);

      expect(result.success).toBe(true);
      expect(leadsPleaseApi.searchRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          geography: {
            type: 'radius',
            center: { lat: 33.4484, lng: -112.074 },
            radiusMiles: 25,
          },
        })
      );
    });

    it('returns records for nationwide geography', async () => {
      const context = createTestContext();
      const input = {
        database: 'business',
        geography: {
          type: 'nationwide',
        },
      };

      const result = await executeSearchData(input, context);

      expect(result.success).toBe(true);
    });
  });

  describe('input validation', () => {
    it('throws ValidationError for invalid database enum', async () => {
      const context = createTestContext();
      const input = {
        database: 'invalid_database',
        geography: {
          type: 'zip',
          values: ['85001'],
        },
      };

      await expect(executeSearchData(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for missing geography', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
      };

      await expect(executeSearchData(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for invalid geography type', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: {
          type: 'invalid_type',
          values: ['85001'],
        },
      };

      await expect(executeSearchData(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for missing database', async () => {
      const context = createTestContext();
      const input = {
        geography: {
          type: 'zip',
          values: ['85001'],
        },
      };

      await expect(executeSearchData(input, context)).rejects.toThrow();
    });
  });

  describe('limit enforcement', () => {
    it('enforces minimum limit of 1', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        limit: 0,
      };

      await expect(executeSearchData(input, context)).rejects.toThrow();
    });

    it('enforces maximum limit of 10000', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        limit: 10001,
      };

      await expect(executeSearchData(input, context)).rejects.toThrow();
    });

    it('accepts valid limit within range', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        limit: 5000,
      };

      const result = await executeSearchData(input, context);
      expect(result.success).toBe(true);
      expect(leadsPleaseApi.searchRecords).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 5000 })
      );
    });

    it('uses default limit of 100 when not specified', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
      };

      await executeSearchData(input, context);

      expect(leadsPleaseApi.searchRecords).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 })
      );
    });
  });

  describe('email/phone inclusion flags', () => {
    it('includes email when include_email is true', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        include_email: true,
      };

      const result = await executeSearchData(input, context);

      expect(leadsPleaseApi.searchRecords).toHaveBeenCalledWith(
        expect.objectContaining({ includeEmail: true })
      );
      expect(result.usage?.emailAppends).toBeGreaterThan(0);
    });

    it('includes phone when include_phone is true', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        include_phone: true,
      };

      const result = await executeSearchData(input, context);

      expect(leadsPleaseApi.searchRecords).toHaveBeenCalledWith(
        expect.objectContaining({ includePhone: true })
      );
      expect(result.usage?.phoneAppends).toBeGreaterThan(0);
    });

    it('includes both email and phone when both flags are true', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        include_email: true,
        include_phone: true,
      };

      const result = await executeSearchData(input, context);

      expect(leadsPleaseApi.searchRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          includeEmail: true,
          includePhone: true,
        })
      );
      expect(result.usage?.emailAppends).toBeGreaterThan(0);
      expect(result.usage?.phoneAppends).toBeGreaterThan(0);
    });

    it('excludes email/phone when flags are false', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        include_email: false,
        include_phone: false,
      };

      const result = await executeSearchData(input, context);

      expect(leadsPleaseApi.searchRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          includeEmail: false,
          includePhone: false,
        })
      );
      expect(result.usage?.emailAppends).toBe(0);
      expect(result.usage?.phoneAppends).toBe(0);
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing data:read permission', async () => {
      const context = createTestContext({
        permissions: ['template:read'],
      });
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
      };

      await expect(executeSearchData(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('throws AuthorizationError when database not in allowed list', async () => {
      const context = createTestContext();
      // Override subscription with limited databases
      context.subscription = {
        ...context.subscription!,
        allowedDatabases: ['NHO'], // Only NHO allowed
      };

      const input = {
        database: 'business', // Not in allowed list
        geography: { type: 'zip', values: ['85001'] },
      };

      await expect(executeSearchData(input, context)).rejects.toThrow(AuthorizationError);
    });
  });

  describe('usage tracking', () => {
    it('calculates estimated cost correctly', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        include_email: true,
        include_phone: true,
      };

      const result = await executeSearchData(input, context);

      // 2 records * $0.05 + 2 email appends * $0.02 + 2 phone appends * $0.03
      // = $0.10 + $0.04 + $0.06 = $0.20
      expect(result.usage?.estimatedCost).toBe(0.2);
    });

    it('returns correct usage counts', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        include_email: true,
      };

      const result = await executeSearchData(input, context);

      expect(result.usage?.recordsReturned).toBe(2);
      expect(result.usage?.emailAppends).toBe(2);
      expect(result.usage?.phoneAppends).toBe(0);
    });
  });

  describe('pagination', () => {
    it('handles offset parameter correctly', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        offset: 50,
        limit: 25,
      };

      const result = await executeSearchData(input, context);

      expect(leadsPleaseApi.searchRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          offset: 50,
          limit: 25,
        })
      );
      expect(result.data?.offset).toBe(50);
    });

    it('sets hasMore correctly when more records available', async () => {
      vi.mocked(leadsPleaseApi.searchRecords).mockResolvedValue({
        records: [{ first_name: 'John', last_name: 'Doe', address: '123 Main St', city: 'Phoenix', state: 'AZ', zip: '85001' }],
        total: 100,
      });

      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        offset: 0,
        limit: 1,
      };

      const result = await executeSearchData(input, context);

      expect(result.data?.hasMore).toBe(true);
    });

    it('sets hasMore to false when all records returned', async () => {
      vi.mocked(leadsPleaseApi.searchRecords).mockResolvedValue({
        records: [{ first_name: 'John', last_name: 'Doe', address: '123 Main St', city: 'Phoenix', state: 'AZ', zip: '85001' }],
        total: 1,
      });

      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
      };

      const result = await executeSearchData(input, context);

      expect(result.data?.hasMore).toBe(false);
    });
  });

  describe('filters', () => {
    it('passes demographic filters to API', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        filters: {
          income: { min: 50000, max: 150000 },
          age: { min: 25, max: 55 },
          homeValue: { min: 200000, max: 500000 },
          dwellingType: ['single_family', 'condo'],
          hasChildren: true,
          ownerOccupied: true,
        },
      };

      await executeSearchData(input, context);

      expect(leadsPleaseApi.searchRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: {
            income: { min: 50000, max: 150000 },
            age: { min: 25, max: 55 },
            homeValue: { min: 200000, max: 500000 },
            dwellingType: ['single_family', 'condo'],
            hasChildren: true,
            ownerOccupied: true,
          },
        })
      );
    });
  });
});
