/**
 * Tests for get_filter_options Tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeGetFilterOptions } from '../../../../src/tools/data/get-filter-options.js';
import type { TenantContext } from '../../../../src/utils/auth.js';

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

describe('get_filter_options tool', () => {
  const mockContext = createTestContext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('returns Consumer filters', () => {
    it('returns filter categories for consumer database', async () => {
      const result = await executeGetFilterOptions(
        { database: 'consumer' },
        mockContext
      );

      expect(result.database).toBe('consumer');
      expect(result.categories).toBeDefined();
      expect(Array.isArray(result.categories)).toBe(true);
    });

    it('includes consumer-specific reference data like interests', async () => {
      const result = await executeGetFilterOptions(
        { database: 'consumer' },
        mockContext
      );

      expect(result.reference_data).toBeDefined();
      expect(result.reference_data.interests).toBeDefined();
      expect(result.reference_data.pet_types).toBeDefined();
      expect(result.reference_data.children_age_ranges).toBeDefined();
    });
  });

  describe('returns Business filters', () => {
    it('returns filter categories for business database', async () => {
      const result = await executeGetFilterOptions(
        { database: 'business' },
        mockContext
      );

      expect(result.database).toBe('business');
      expect(result.categories).toBeDefined();
      expect(Array.isArray(result.categories)).toBe(true);
    });

    it('includes business-specific reference data', async () => {
      const result = await executeGetFilterOptions(
        { database: 'business' },
        mockContext
      );

      expect(result.reference_data).toBeDefined();
      expect(result.reference_data.sic_groups).toBeDefined();
      expect(result.reference_data.business_titles).toBeDefined();
      expect(result.reference_data.employee_ranges).toBeDefined();
      expect(result.reference_data.revenue_ranges).toBeDefined();
      expect(result.reference_data.contact_levels).toBeDefined();
    });
  });

  describe('returns NHO filters', () => {
    it('returns filter categories for new homeowner database', async () => {
      const result = await executeGetFilterOptions(
        { database: 'nho' },
        mockContext
      );

      expect(result.database).toBe('nho');
      expect(result.categories).toBeDefined();
      expect(Array.isArray(result.categories)).toBe(true);
    });

    it('includes NHO-specific reference data like dwelling types', async () => {
      const result = await executeGetFilterOptions(
        { database: 'nho' },
        mockContext
      );

      expect(result.reference_data).toBeDefined();
      expect(result.reference_data.dwelling_types).toBeDefined();
      expect(Array.isArray(result.reference_data.dwelling_types)).toBe(true);
    });
  });

  describe('returns New Mover filters', () => {
    it('returns filter categories for new mover database', async () => {
      const result = await executeGetFilterOptions(
        { database: 'new_mover' },
        mockContext
      );

      expect(result.database).toBe('new_mover');
      expect(result.categories).toBeDefined();
      expect(Array.isArray(result.categories)).toBe(true);
    });

    it('includes new mover-specific reference data like move types', async () => {
      const result = await executeGetFilterOptions(
        { database: 'new_mover' },
        mockContext
      );

      expect(result.reference_data).toBeDefined();
      expect(result.reference_data.dwelling_types).toBeDefined();
      expect(result.reference_data.move_types).toBeDefined();
    });
  });

  describe('common selections', () => {
    it('returns common selections for quick access', async () => {
      const result = await executeGetFilterOptions(
        { database: 'nho' },
        mockContext
      );

      expect(result.common_selections).toBeDefined();
      expect(Array.isArray(result.common_selections)).toBe(true);
    });

    it('returns common selections for consumer database', async () => {
      const result = await executeGetFilterOptions(
        { database: 'consumer' },
        mockContext
      );

      expect(result.common_selections).toBeDefined();
      expect(Array.isArray(result.common_selections)).toBe(true);
    });
  });

  describe('pricing information', () => {
    it('includes pricing information in response', async () => {
      const result = await executeGetFilterOptions(
        { database: 'nho' },
        mockContext
      );

      expect(result.pricing).toBeDefined();
    });

    it('returns pricing for all database types', async () => {
      const databases = ['consumer', 'business', 'nho', 'new_mover'];

      for (const database of databases) {
        const result = await executeGetFilterOptions({ database }, mockContext);
        expect(result.pricing).toBeDefined();
      }
    });
  });

  describe('reference data', () => {
    it('includes state list for all databases', async () => {
      const databases = ['consumer', 'business', 'nho', 'new_mover'];

      for (const database of databases) {
        const result = await executeGetFilterOptions({ database }, mockContext);
        expect(result.reference_data.states).toBeDefined();
        expect(Array.isArray(result.reference_data.states)).toBe(true);
        expect(result.reference_data.states).toContain('AZ');
        expect(result.reference_data.states).toContain('CA');
      }
    });
  });

  describe('category filtering', () => {
    it('filters to specific category when requested', async () => {
      const result = await executeGetFilterOptions(
        { database: 'consumer', category: 'Demographics' },
        mockContext
      );

      expect(result.database).toBe('consumer');
      expect(result.categories).toBeDefined();
      // When filtered, should only return matching categories
      if (result.categories.length > 0) {
        result.categories.forEach((cat: any) => {
          expect(cat.name.toLowerCase()).toBe('demographics');
        });
      }
    });

    it('returns empty categories array when category not found', async () => {
      const result = await executeGetFilterOptions(
        { database: 'consumer', category: 'NonExistentCategory' },
        mockContext
      );

      expect(result.categories).toEqual([]);
    });
  });

  describe('validation', () => {
    it('throws error for invalid database parameter', async () => {
      await expect(
        executeGetFilterOptions({ database: 'invalid' }, mockContext)
      ).rejects.toThrow();
    });

    it('accepts all valid database values', async () => {
      const validDatabases = ['consumer', 'business', 'nho', 'new_mover'];

      for (const database of validDatabases) {
        const result = await executeGetFilterOptions({ database }, mockContext);
        expect(result.database).toBe(database);
      }
    });

    it('throws error when database is missing', async () => {
      await expect(
        executeGetFilterOptions({}, mockContext)
      ).rejects.toThrow();
    });
  });

  describe('response structure', () => {
    it('returns all expected fields', async () => {
      const result = await executeGetFilterOptions(
        { database: 'consumer' },
        mockContext
      );

      expect(result).toHaveProperty('database');
      expect(result).toHaveProperty('categories');
      expect(result).toHaveProperty('common_selections');
      expect(result).toHaveProperty('pricing');
      expect(result).toHaveProperty('reference_data');
    });

    it('categories have expected structure', async () => {
      const result = await executeGetFilterOptions(
        { database: 'consumer' },
        mockContext
      );

      if (result.categories.length > 0) {
        const category = result.categories[0];
        expect(category).toHaveProperty('name');
        expect(category).toHaveProperty('filters');
      }
    });
  });
});
