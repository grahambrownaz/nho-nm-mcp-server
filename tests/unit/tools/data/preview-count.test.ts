/**
 * Tests for preview_count tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executePreviewCount } from '../../../../src/tools/data/preview-count.js';
import { leadsPleaseApi } from '../../../../src/services/leadsplease-api.js';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { ValidationError, AuthorizationError } from '../../../../src/utils/errors.js';

// Mock the LeadsPlease API
vi.mock('../../../../src/services/leadsplease-api.js', () => ({
  leadsPleaseApi: {
    getCount: vi.fn(),
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

describe('preview_count tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock response
    vi.mocked(leadsPleaseApi.getCount).mockResolvedValue({
      total_available: 15420,
      estimated_weekly: 385,
      estimated_monthly: 1540,
      geography_summary: 'ZIP Codes: 85001, 85002',
      filters_applied: false,
    });
  });

  describe('valid input', () => {
    it('returns count for valid ZIP geography', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: {
          type: 'zip',
          values: ['85001', '85002'],
        },
      };

      const result = await executePreviewCount(input, context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.total_available).toBe(15420);
      expect(result.data?.estimated_weekly).toBe(385);
      expect(result.data?.estimated_monthly).toBe(1540);
      expect(result.data?.database).toBe('nho');
    });

    it('returns count for state geography', async () => {
      const context = createTestContext();
      const input = {
        database: 'new_mover',
        geography: {
          type: 'state',
          values: ['AZ', 'CA'],
        },
      };

      const result = await executePreviewCount(input, context);

      expect(result.success).toBe(true);
      expect(leadsPleaseApi.getCount).toHaveBeenCalledWith({
        database: 'new_mover',
        geography: { type: 'state', values: ['AZ', 'CA'] },
        filters: undefined,
      });
    });

    it('returns count for city geography', async () => {
      const context = createTestContext();
      const input = {
        database: 'consumer',
        geography: {
          type: 'city',
          values: ['Phoenix', 'Scottsdale'],
        },
      };

      const result = await executePreviewCount(input, context);

      expect(result.success).toBe(true);
      expect(leadsPleaseApi.getCount).toHaveBeenCalledWith(
        expect.objectContaining({
          geography: { type: 'city', values: ['Phoenix', 'Scottsdale'] },
        })
      );
    });

    it('returns count for county geography', async () => {
      const context = createTestContext();
      const input = {
        database: 'business',
        geography: {
          type: 'county',
          values: ['Maricopa County'],
        },
      };

      const result = await executePreviewCount(input, context);

      expect(result.success).toBe(true);
    });

    it('returns count for radius geography', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: {
          type: 'radius',
          center: { lat: 33.4484, lng: -112.074 },
          radiusMiles: 25,
        },
      };

      const result = await executePreviewCount(input, context);

      expect(result.success).toBe(true);
      expect(leadsPleaseApi.getCount).toHaveBeenCalledWith(
        expect.objectContaining({
          geography: {
            type: 'radius',
            center: { lat: 33.4484, lng: -112.074 },
            radiusMiles: 25,
          },
        })
      );
    });

    it('returns count for nationwide geography', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: {
          type: 'nationwide',
        },
      };

      const result = await executePreviewCount(input, context);

      expect(result.success).toBe(true);
    });
  });

  describe('input validation', () => {
    it('throws ValidationError for invalid database', async () => {
      const context = createTestContext();
      const input = {
        database: 'invalid_db',
        geography: { type: 'zip', values: ['85001'] },
      };

      await expect(executePreviewCount(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for missing geography', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
      };

      await expect(executePreviewCount(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for invalid geography type', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'invalid_geo' },
      };

      await expect(executePreviewCount(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for missing database', async () => {
      const context = createTestContext();
      const input = {
        geography: { type: 'zip', values: ['85001'] },
      };

      await expect(executePreviewCount(input, context)).rejects.toThrow();
    });
  });

  describe('pricing estimates', () => {
    it('includes pricing estimate in response', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
      };

      const result = await executePreviewCount(input, context);

      expect(result.data?.pricing_estimate).toBeDefined();
      expect(result.data?.pricing_estimate?.per_record).toBe(0.05);
      expect(result.data?.pricing_estimate?.for_100_records).toBe(5);
      expect(result.data?.pricing_estimate?.for_1000_records).toBe(50);
    });

    it('includes email and phone append pricing', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
      };

      const result = await executePreviewCount(input, context);

      expect(result.data?.pricing_estimate?.email_append_per_record).toBe(0.02);
      expect(result.data?.pricing_estimate?.phone_append_per_record).toBe(0.03);
    });

    it('uses custom subscription pricing when available', async () => {
      const context = createTestContext();
      context.subscription!.pricePerRecord = mockDecimal(0.03);

      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
      };

      const result = await executePreviewCount(input, context);

      expect(result.data?.pricing_estimate?.per_record).toBe(0.03);
      expect(result.data?.pricing_estimate?.for_100_records).toBe(3);
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

      await expect(executePreviewCount(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('throws AuthorizationError when database not allowed', async () => {
      const context = createTestContext();
      context.subscription!.allowedDatabases = ['NHO'];

      const input = {
        database: 'consumer',
        geography: { type: 'zip', values: ['85001'] },
      };

      await expect(executePreviewCount(input, context)).rejects.toThrow(AuthorizationError);
    });
  });

  describe('filters', () => {
    it('passes demographic filters to API', async () => {
      vi.mocked(leadsPleaseApi.getCount).mockResolvedValue({
        total_available: 5000,
        estimated_weekly: 125,
        estimated_monthly: 500,
        geography_summary: 'ZIP Codes: 85001',
        filters_applied: true,
      });

      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        filters: {
          income: { min: 75000, max: 200000 },
          homeValue: { min: 300000 },
          ownerOccupied: true,
        },
      };

      const result = await executePreviewCount(input, context);

      expect(leadsPleaseApi.getCount).toHaveBeenCalledWith({
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        filters: {
          income: { min: 75000, max: 200000 },
          homeValue: { min: 300000 },
          ownerOccupied: true,
        },
      });
      expect(result.data?.filters_applied).toBe(true);
    });

    it('returns filters_applied as false when no filters', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
      };

      const result = await executePreviewCount(input, context);

      expect(result.data?.filters_applied).toBe(false);
    });
  });

  describe('geography summary', () => {
    it('includes geography summary in response', async () => {
      vi.mocked(leadsPleaseApi.getCount).mockResolvedValue({
        total_available: 15420,
        estimated_weekly: 385,
        estimated_monthly: 1540,
        geography_summary: 'States: AZ, CA',
        filters_applied: false,
      });

      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'state', values: ['AZ', 'CA'] },
      };

      const result = await executePreviewCount(input, context);

      expect(result.data?.geography_summary).toBe('States: AZ, CA');
    });
  });

  describe('API integration', () => {
    it('calls API with correct parameters', async () => {
      const context = createTestContext();
      const input = {
        database: 'new_mover',
        geography: {
          type: 'zip',
          values: ['85001', '85002', '85003'],
        },
        filters: {
          age: { min: 25, max: 45 },
        },
      };

      await executePreviewCount(input, context);

      expect(leadsPleaseApi.getCount).toHaveBeenCalledTimes(1);
      expect(leadsPleaseApi.getCount).toHaveBeenCalledWith({
        database: 'new_mover',
        geography: {
          type: 'zip',
          values: ['85001', '85002', '85003'],
        },
        filters: {
          age: { min: 25, max: 45 },
        },
      });
    });

    it('handles API errors gracefully', async () => {
      vi.mocked(leadsPleaseApi.getCount).mockRejectedValue(new Error('API Error'));

      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
      };

      await expect(executePreviewCount(input, context)).rejects.toThrow('API Error');
    });
  });
});
