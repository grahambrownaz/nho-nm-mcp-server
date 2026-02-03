/**
 * Tests for get_sample_data tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeGetSampleData } from '../../../../src/tools/data/get-sample-data.js';
import { leadsPleaseApi } from '../../../../src/services/leadsplease-api.js';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { ValidationError, AuthorizationError } from '../../../../src/utils/errors.js';

// Mock the LeadsPlease API
vi.mock('../../../../src/services/leadsplease-api.js', () => ({
  leadsPleaseApi: {
    getSamples: vi.fn(),
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

describe('get_sample_data tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock response - 5 sample records
    vi.mocked(leadsPleaseApi.getSamples).mockResolvedValue([
      { first_name: 'John', last_name: 'Doe', address: '123 Main St', city: 'Phoenix', state: 'AZ', zip: '85001' },
      { first_name: 'Jane', last_name: 'Smith', address: '456 Oak Ave', city: 'Scottsdale', state: 'AZ', zip: '85251' },
      { first_name: 'Mike', last_name: 'Johnson', address: '789 Pine Rd', city: 'Mesa', state: 'AZ', zip: '85201' },
      { first_name: 'Sarah', last_name: 'Williams', address: '321 Elm Dr', city: 'Tempe', state: 'AZ', zip: '85281' },
      { first_name: 'Chris', last_name: 'Brown', address: '654 Cedar Ln', city: 'Chandler', state: 'AZ', zip: '85224' },
    ]);
  });

  describe('valid input', () => {
    it('returns sample records for valid ZIP geography', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: {
          type: 'zip',
          values: ['85001', '85002'],
        },
      };

      const result = await executeGetSampleData(input, context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.samples).toHaveLength(5);
      expect(result.data?.count).toBe(5);
      expect(result.data?.database).toBe('nho');
    });

    it('returns sample records for state geography', async () => {
      const context = createTestContext();
      const input = {
        database: 'new_mover',
        geography: {
          type: 'state',
          values: ['AZ'],
        },
      };

      const result = await executeGetSampleData(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.database).toBe('new_mover');
    });

    it('returns sample records for all database types', async () => {
      const context = createTestContext();
      const databases = ['nho', 'new_mover', 'consumer', 'business'];

      for (const database of databases) {
        const input = {
          database,
          geography: { type: 'state', values: ['AZ'] },
        };

        const result = await executeGetSampleData(input, context);
        expect(result.success).toBe(true);
        expect(result.data?.database).toBe(database);
      }
    });
  });

  describe('sample count', () => {
    it('uses default count of 5 when not specified', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
      };

      await executeGetSampleData(input, context);

      expect(leadsPleaseApi.getSamples).toHaveBeenCalledWith(
        expect.objectContaining({ count: 5 })
      );
    });

    it('accepts count of 1', async () => {
      vi.mocked(leadsPleaseApi.getSamples).mockResolvedValue([
        { first_name: 'John', last_name: 'Doe', address: '123 Main St', city: 'Phoenix', state: 'AZ', zip: '85001' },
      ]);

      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        count: 1,
      };

      const result = await executeGetSampleData(input, context);

      expect(result.data?.count).toBe(1);
      expect(leadsPleaseApi.getSamples).toHaveBeenCalledWith(
        expect.objectContaining({ count: 1 })
      );
    });

    it('accepts count of 10', async () => {
      vi.mocked(leadsPleaseApi.getSamples).mockResolvedValue(
        Array(10).fill({
          first_name: 'Test',
          last_name: 'User',
          address: '123 Main St',
          city: 'Phoenix',
          state: 'AZ',
          zip: '85001',
        })
      );

      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        count: 10,
      };

      const result = await executeGetSampleData(input, context);

      expect(result.data?.count).toBe(10);
      expect(leadsPleaseApi.getSamples).toHaveBeenCalledWith(
        expect.objectContaining({ count: 10 })
      );
    });

    it('throws ValidationError for count less than 1', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        count: 0,
      };

      await expect(executeGetSampleData(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for count greater than 10', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        count: 11,
      };

      await expect(executeGetSampleData(input, context)).rejects.toThrow();
    });
  });

  describe('input validation', () => {
    it('throws ValidationError for invalid database', async () => {
      const context = createTestContext();
      const input = {
        database: 'invalid_database',
        geography: { type: 'zip', values: ['85001'] },
      };

      await expect(executeGetSampleData(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for missing geography', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
      };

      await expect(executeGetSampleData(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for invalid geography type', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'invalid_type' },
      };

      await expect(executeGetSampleData(input, context)).rejects.toThrow();
    });
  });

  describe('disclaimer', () => {
    it('includes disclaimer in response', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
      };

      const result = await executeGetSampleData(input, context);

      expect(result.data?.disclaimer).toBeDefined();
      expect(result.data?.disclaimer).toContain('sample records');
      expect(result.data?.disclaimer).toContain('Email and phone are not included');
    });
  });

  describe('geography summary', () => {
    it('formats ZIP geography summary correctly', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001', '85002', '85003'] },
      };

      const result = await executeGetSampleData(input, context);

      expect(result.data?.geography_summary).toContain('ZIP Codes');
    });

    it('formats state geography summary correctly', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'state', values: ['AZ', 'CA'] },
      };

      const result = await executeGetSampleData(input, context);

      expect(result.data?.geography_summary).toContain('States');
      expect(result.data?.geography_summary).toContain('AZ');
    });

    it('formats city geography summary correctly', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'city', values: ['Phoenix', 'Scottsdale'] },
      };

      const result = await executeGetSampleData(input, context);

      expect(result.data?.geography_summary).toContain('Cities');
    });

    it('formats county geography summary correctly', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'county', values: ['Maricopa County'] },
      };

      const result = await executeGetSampleData(input, context);

      expect(result.data?.geography_summary).toContain('Counties');
    });

    it('formats radius geography summary correctly', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: {
          type: 'radius',
          center: { lat: 33.4484, lng: -112.074 },
          radiusMiles: 25,
        },
      };

      const result = await executeGetSampleData(input, context);

      expect(result.data?.geography_summary).toContain('25 mile radius');
    });

    it('formats nationwide geography summary correctly', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'nationwide' },
      };

      const result = await executeGetSampleData(input, context);

      expect(result.data?.geography_summary).toBe('Nationwide');
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

      await expect(executeGetSampleData(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('throws AuthorizationError when database not allowed', async () => {
      const context = createTestContext();
      context.subscription!.allowedDatabases = ['NHO'];

      const input = {
        database: 'business',
        geography: { type: 'zip', values: ['85001'] },
      };

      await expect(executeGetSampleData(input, context)).rejects.toThrow(AuthorizationError);
    });
  });

  describe('sample data content', () => {
    it('returns records without email addresses', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
      };

      const result = await executeGetSampleData(input, context);

      // Samples should not contain email
      result.data?.samples.forEach((sample) => {
        expect(sample).not.toHaveProperty('email');
      });
    });

    it('returns records without phone numbers', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
      };

      const result = await executeGetSampleData(input, context);

      // Samples should not contain phone
      result.data?.samples.forEach((sample) => {
        expect(sample).not.toHaveProperty('phone');
      });
    });

    it('returns records with basic address fields', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
      };

      const result = await executeGetSampleData(input, context);

      result.data?.samples.forEach((sample) => {
        expect(sample).toHaveProperty('first_name');
        expect(sample).toHaveProperty('last_name');
        expect(sample).toHaveProperty('address');
        expect(sample).toHaveProperty('city');
        expect(sample).toHaveProperty('state');
        expect(sample).toHaveProperty('zip');
      });
    });
  });

  describe('API integration', () => {
    it('calls API with correct parameters', async () => {
      const context = createTestContext();
      const input = {
        database: 'new_mover',
        geography: {
          type: 'state',
          values: ['AZ', 'CA'],
        },
        count: 7,
      };

      await executeGetSampleData(input, context);

      expect(leadsPleaseApi.getSamples).toHaveBeenCalledTimes(1);
      expect(leadsPleaseApi.getSamples).toHaveBeenCalledWith({
        database: 'new_mover',
        geography: { type: 'state', values: ['AZ', 'CA'] },
        count: 7,
      });
    });

    it('handles API errors gracefully', async () => {
      vi.mocked(leadsPleaseApi.getSamples).mockRejectedValue(new Error('API Error'));

      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
      };

      await expect(executeGetSampleData(input, context)).rejects.toThrow('API Error');
    });
  });
});
