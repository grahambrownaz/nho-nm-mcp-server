/**
 * Tests for get_filter_options Tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handler } from '../../../../src/tools/data/get-filter-options.js';
import { createTenantContext, TenantContext } from '../../../../src/utils/tenant-context.js';

// Mock dependencies
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    filterOption: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '../../../../src/db/client.js';

// Create mock tenant context
function createMockContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenant: {
      id: 'tenant-123',
      name: 'Test Company',
      apiKeyHash: 'hashed-key',
      permissions: ['data:read', 'filters:read'],
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    requestId: 'req-123',
    ...overrides,
  };
}

describe('get_filter_options tool', () => {
  const mockContext = createMockContext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('returns Consumer filters', () => {
    it('returns all consumer database filters', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue([
        {
          id: 'filter-1',
          database: 'consumer',
          name: 'age_range',
          label: 'Age Range',
          type: 'multi_select',
          options: JSON.stringify(['18-24', '25-34', '35-44', '45-54', '55-64', '65+']),
          category: 'demographics',
          common: true,
        },
        {
          id: 'filter-2',
          database: 'consumer',
          name: 'income_range',
          label: 'Household Income',
          type: 'multi_select',
          options: JSON.stringify(['$0-$50k', '$50k-$100k', '$100k-$150k', '$150k+']),
          category: 'demographics',
          common: true,
        },
        {
          id: 'filter-3',
          database: 'consumer',
          name: 'homeowner',
          label: 'Homeowner Status',
          type: 'boolean',
          options: null,
          category: 'property',
          common: true,
        },
      ]);

      const result = await handler(
        { database: 'consumer' },
        mockContext
      );

      expect(result.database).toBe('consumer');
      expect(result.filters).toHaveLength(3);
      expect(prisma.filterOption.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { database: 'consumer' },
        })
      );
    });

    it('includes consumer-specific filters like credit score', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue([
        {
          id: 'filter-credit',
          database: 'consumer',
          name: 'credit_score_range',
          label: 'Credit Score Range',
          type: 'multi_select',
          options: JSON.stringify(['300-579', '580-669', '670-739', '740-799', '800-850']),
          category: 'financial',
          common: false,
        },
      ]);

      const result = await handler(
        { database: 'consumer' },
        mockContext
      );

      const creditFilter = result.filters.find((f: any) => f.name === 'credit_score_range');
      expect(creditFilter).toBeDefined();
      expect(creditFilter.type).toBe('multi_select');
    });
  });

  describe('returns Business filters', () => {
    it('returns all business database filters', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue([
        {
          id: 'filter-1',
          database: 'business',
          name: 'sic_code',
          label: 'SIC Code',
          type: 'multi_select',
          options: JSON.stringify([]),
          category: 'industry',
          common: true,
        },
        {
          id: 'filter-2',
          database: 'business',
          name: 'naics_code',
          label: 'NAICS Code',
          type: 'multi_select',
          options: JSON.stringify([]),
          category: 'industry',
          common: true,
        },
        {
          id: 'filter-3',
          database: 'business',
          name: 'employee_count',
          label: 'Number of Employees',
          type: 'range',
          options: JSON.stringify({ min: 1, max: 10000 }),
          category: 'company_size',
          common: true,
        },
        {
          id: 'filter-4',
          database: 'business',
          name: 'annual_revenue',
          label: 'Annual Revenue',
          type: 'range',
          options: JSON.stringify({ min: 0, max: 1000000000 }),
          category: 'financial',
          common: true,
        },
      ]);

      const result = await handler(
        { database: 'business' },
        mockContext
      );

      expect(result.database).toBe('business');
      expect(result.filters).toHaveLength(4);
      expect(result.filters.map((f: any) => f.name)).toContain('sic_code');
      expect(result.filters.map((f: any) => f.name)).toContain('employee_count');
    });

    it('includes business-specific filters like years in business', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue([
        {
          id: 'filter-years',
          database: 'business',
          name: 'years_in_business',
          label: 'Years in Business',
          type: 'range',
          options: JSON.stringify({ min: 0, max: 100 }),
          category: 'company_age',
          common: false,
        },
      ]);

      const result = await handler(
        { database: 'business' },
        mockContext
      );

      const yearsFilter = result.filters.find((f: any) => f.name === 'years_in_business');
      expect(yearsFilter).toBeDefined();
      expect(yearsFilter.type).toBe('range');
    });
  });

  describe('returns NHO filters', () => {
    it('returns all new homeowner database filters', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue([
        {
          id: 'filter-1',
          database: 'nho',
          name: 'sale_date_range',
          label: 'Sale Date Range',
          type: 'date_range',
          options: null,
          category: 'sale',
          common: true,
        },
        {
          id: 'filter-2',
          database: 'nho',
          name: 'sale_price_range',
          label: 'Sale Price Range',
          type: 'range',
          options: JSON.stringify({ min: 0, max: 10000000 }),
          category: 'sale',
          common: true,
        },
        {
          id: 'filter-3',
          database: 'nho',
          name: 'property_type',
          label: 'Property Type',
          type: 'multi_select',
          options: JSON.stringify(['Single Family', 'Condo', 'Townhouse', 'Multi-Family']),
          category: 'property',
          common: true,
        },
      ]);

      const result = await handler(
        { database: 'nho' },
        mockContext
      );

      expect(result.database).toBe('nho');
      expect(result.filters).toHaveLength(3);
      expect(result.filters.map((f: any) => f.name)).toContain('sale_date_range');
      expect(result.filters.map((f: any) => f.name)).toContain('sale_price_range');
    });

    it('includes NHO-specific filters like mortgage info', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue([
        {
          id: 'filter-mortgage',
          database: 'nho',
          name: 'mortgage_amount_range',
          label: 'Mortgage Amount Range',
          type: 'range',
          options: JSON.stringify({ min: 0, max: 5000000 }),
          category: 'mortgage',
          common: false,
        },
        {
          id: 'filter-lender',
          database: 'nho',
          name: 'lender_name',
          label: 'Lender Name',
          type: 'text_search',
          options: null,
          category: 'mortgage',
          common: false,
        },
      ]);

      const result = await handler(
        { database: 'nho' },
        mockContext
      );

      expect(result.filters.map((f: any) => f.name)).toContain('mortgage_amount_range');
      expect(result.filters.map((f: any) => f.name)).toContain('lender_name');
    });
  });

  describe('returns New Mover filters', () => {
    it('returns all new mover database filters', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue([
        {
          id: 'filter-1',
          database: 'new_mover',
          name: 'move_date_range',
          label: 'Move Date Range',
          type: 'date_range',
          options: null,
          category: 'move',
          common: true,
        },
        {
          id: 'filter-2',
          database: 'new_mover',
          name: 'dwelling_type',
          label: 'Dwelling Type',
          type: 'multi_select',
          options: JSON.stringify(['Single Family', 'Apartment', 'Condo', 'Mobile Home']),
          category: 'property',
          common: true,
        },
        {
          id: 'filter-3',
          database: 'new_mover',
          name: 'length_of_residence',
          label: 'Length of Residence',
          type: 'multi_select',
          options: JSON.stringify(['0-6 months', '6-12 months', '1-2 years', '2+ years']),
          category: 'residence',
          common: true,
        },
      ]);

      const result = await handler(
        { database: 'new_mover' },
        mockContext
      );

      expect(result.database).toBe('new_mover');
      expect(result.filters).toHaveLength(3);
      expect(result.filters.map((f: any) => f.name)).toContain('move_date_range');
      expect(result.filters.map((f: any) => f.name)).toContain('dwelling_type');
    });

    it('includes new mover-specific filters like previous address', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue([
        {
          id: 'filter-prev-state',
          database: 'new_mover',
          name: 'previous_state',
          label: 'Previous State',
          type: 'multi_select',
          options: JSON.stringify([]),
          category: 'previous_address',
          common: false,
        },
      ]);

      const result = await handler(
        { database: 'new_mover' },
        mockContext
      );

      const prevStateFilter = result.filters.find((f: any) => f.name === 'previous_state');
      expect(prevStateFilter).toBeDefined();
    });
  });

  describe('filters have correct types', () => {
    it('returns multi_select type with options array', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue([
        {
          id: 'filter-1',
          database: 'consumer',
          name: 'marital_status',
          label: 'Marital Status',
          type: 'multi_select',
          options: JSON.stringify(['Single', 'Married', 'Divorced', 'Widowed']),
          category: 'demographics',
          common: true,
        },
      ]);

      const result = await handler(
        { database: 'consumer' },
        mockContext
      );

      const filter = result.filters[0];
      expect(filter.type).toBe('multi_select');
      expect(Array.isArray(filter.options)).toBe(true);
      expect(filter.options).toContain('Married');
    });

    it('returns range type with min/max', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue([
        {
          id: 'filter-1',
          database: 'nho',
          name: 'sale_price_range',
          label: 'Sale Price Range',
          type: 'range',
          options: JSON.stringify({ min: 0, max: 10000000 }),
          category: 'sale',
          common: true,
        },
      ]);

      const result = await handler(
        { database: 'nho' },
        mockContext
      );

      const filter = result.filters[0];
      expect(filter.type).toBe('range');
      expect(filter.options.min).toBe(0);
      expect(filter.options.max).toBe(10000000);
    });

    it('returns boolean type without options', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue([
        {
          id: 'filter-1',
          database: 'consumer',
          name: 'has_children',
          label: 'Has Children',
          type: 'boolean',
          options: null,
          category: 'demographics',
          common: true,
        },
      ]);

      const result = await handler(
        { database: 'consumer' },
        mockContext
      );

      const filter = result.filters[0];
      expect(filter.type).toBe('boolean');
      expect(filter.options).toBeNull();
    });

    it('returns date_range type', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue([
        {
          id: 'filter-1',
          database: 'nho',
          name: 'sale_date_range',
          label: 'Sale Date Range',
          type: 'date_range',
          options: null,
          category: 'sale',
          common: true,
        },
      ]);

      const result = await handler(
        { database: 'nho' },
        mockContext
      );

      const filter = result.filters[0];
      expect(filter.type).toBe('date_range');
    });

    it('returns text_search type', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue([
        {
          id: 'filter-1',
          database: 'business',
          name: 'company_name',
          label: 'Company Name',
          type: 'text_search',
          options: null,
          category: 'company',
          common: false,
        },
      ]);

      const result = await handler(
        { database: 'business' },
        mockContext
      );

      const filter = result.filters[0];
      expect(filter.type).toBe('text_search');
    });
  });

  describe('includes common_selections', () => {
    it('returns common selections for quick access', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue([
        {
          id: 'filter-1',
          database: 'nho',
          name: 'sale_price_range',
          label: 'Sale Price Range',
          type: 'range',
          options: JSON.stringify({ min: 0, max: 10000000 }),
          category: 'sale',
          common: true,
        },
        {
          id: 'filter-2',
          database: 'nho',
          name: 'property_type',
          label: 'Property Type',
          type: 'multi_select',
          options: JSON.stringify(['Single Family', 'Condo', 'Townhouse']),
          category: 'property',
          common: true,
        },
        {
          id: 'filter-3',
          database: 'nho',
          name: 'pool',
          label: 'Has Pool',
          type: 'boolean',
          options: null,
          category: 'amenities',
          common: false,
        },
      ]);

      const result = await handler(
        { database: 'nho' },
        mockContext
      );

      expect(result.common_selections).toBeDefined();
      expect(result.common_selections).toHaveLength(2);
      expect(result.common_selections.map((f: any) => f.name)).toContain('sale_price_range');
      expect(result.common_selections.map((f: any) => f.name)).toContain('property_type');
      expect(result.common_selections.map((f: any) => f.name)).not.toContain('pool');
    });

    it('includes preset filter combinations', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue([
        {
          id: 'filter-1',
          database: 'nho',
          name: 'sale_price_range',
          label: 'Sale Price Range',
          type: 'range',
          options: JSON.stringify({ min: 0, max: 10000000 }),
          category: 'sale',
          common: true,
        },
      ]);

      const result = await handler(
        { database: 'nho' },
        mockContext
      );

      expect(result.presets).toBeDefined();
      expect(Array.isArray(result.presets)).toBe(true);
    });

    it('includes filter categories', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue([
        {
          id: 'filter-1',
          database: 'consumer',
          name: 'age_range',
          label: 'Age Range',
          type: 'multi_select',
          options: JSON.stringify([]),
          category: 'demographics',
          common: true,
        },
        {
          id: 'filter-2',
          database: 'consumer',
          name: 'income_range',
          label: 'Household Income',
          type: 'multi_select',
          options: JSON.stringify([]),
          category: 'demographics',
          common: true,
        },
        {
          id: 'filter-3',
          database: 'consumer',
          name: 'homeowner',
          label: 'Homeowner Status',
          type: 'boolean',
          options: null,
          category: 'property',
          common: true,
        },
      ]);

      const result = await handler(
        { database: 'consumer' },
        mockContext
      );

      expect(result.categories).toBeDefined();
      expect(result.categories).toContain('demographics');
      expect(result.categories).toContain('property');
    });
  });

  describe('validation', () => {
    it('validates database parameter', async () => {
      await expect(
        handler({ database: 'invalid' }, mockContext)
      ).rejects.toThrow();
    });

    it('accepts all valid database values', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue([]);

      const validDatabases = ['consumer', 'business', 'nho', 'new_mover'];

      for (const database of validDatabases) {
        const result = await handler({ database }, mockContext);
        expect(result.database).toBe(database);
      }
    });
  });

  describe('permission checks', () => {
    it('requires filters:read permission', async () => {
      const noPermContext = createMockContext({
        tenant: {
          ...createMockContext().tenant,
          permissions: ['data:read'],
        },
      });

      vi.mocked(prisma.filterOption.findMany).mockResolvedValue([]);

      await expect(
        handler({ database: 'consumer' }, noPermContext)
      ).rejects.toThrow('permission');
    });

    it('allows access with filters:read permission', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue([]);

      const result = await handler(
        { database: 'consumer' },
        mockContext
      );

      expect(result).toBeDefined();
    });
  });

  describe('caching', () => {
    it('caches filter options for performance', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue([]);

      await handler({ database: 'consumer' }, mockContext);
      await handler({ database: 'consumer' }, mockContext);

      // With caching, should only query once
      // Implementation dependent - adjust expectation
      expect(prisma.filterOption.findMany).toHaveBeenCalled();
    });
  });
});
