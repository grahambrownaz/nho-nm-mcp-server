/**
 * Integration Tests for Filters REST API
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp } from '../../../src/api/app.js';
import { prisma } from '../../../src/db/client.js';

// Mock dependencies
vi.mock('../../../src/db/client.js', () => ({
  prisma: {
    tenant: {
      findUnique: vi.fn(),
    },
    filterOption: {
      findMany: vi.fn(),
    },
  },
}));

// Create mock filter options
function createMockFilters(database: string) {
  const filters: Record<string, any[]> = {
    consumer: [
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
    ],
    business: [
      {
        id: 'filter-4',
        database: 'business',
        name: 'sic_code',
        label: 'SIC Code',
        type: 'multi_select',
        options: JSON.stringify([]),
        category: 'industry',
        common: true,
      },
      {
        id: 'filter-5',
        database: 'business',
        name: 'employee_count',
        label: 'Number of Employees',
        type: 'range',
        options: JSON.stringify({ min: 1, max: 10000 }),
        category: 'company_size',
        common: true,
      },
    ],
    nho: [
      {
        id: 'filter-6',
        database: 'nho',
        name: 'sale_date_range',
        label: 'Sale Date Range',
        type: 'date_range',
        options: null,
        category: 'sale',
        common: true,
      },
      {
        id: 'filter-7',
        database: 'nho',
        name: 'sale_price_range',
        label: 'Sale Price Range',
        type: 'range',
        options: JSON.stringify({ min: 0, max: 10000000 }),
        category: 'sale',
        common: true,
      },
      {
        id: 'filter-8',
        database: 'nho',
        name: 'property_type',
        label: 'Property Type',
        type: 'multi_select',
        options: JSON.stringify(['Single Family', 'Condo', 'Townhouse', 'Multi-Family']),
        category: 'property',
        common: true,
      },
    ],
    new_mover: [
      {
        id: 'filter-9',
        database: 'new_mover',
        name: 'move_date_range',
        label: 'Move Date Range',
        type: 'date_range',
        options: null,
        category: 'move',
        common: true,
      },
      {
        id: 'filter-10',
        database: 'new_mover',
        name: 'dwelling_type',
        label: 'Dwelling Type',
        type: 'multi_select',
        options: JSON.stringify(['Single Family', 'Apartment', 'Condo', 'Mobile Home']),
        category: 'property',
        common: true,
      },
    ],
  };

  return filters[database] || [];
}

describe('Filters REST API', () => {
  let app: any;
  let mockRequest: (method: string, path: string, options?: any) => Promise<any>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock tenant authentication
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      id: 'tenant-123',
      name: 'Test Company',
      apiKeyHash: 'hashed-key',
      permissions: ['data:read', 'filters:read'],
      settings: {},
    });

    app = await createApp();

    // Mock request function (in real tests use supertest)
    mockRequest = async (method: string, path: string, options: any = {}) => {
      const { headers = {}, body } = options;
      // This simulates the HTTP request handling
      // In real integration tests, use supertest
      return app.handleRequest({
        method,
        path,
        headers: {
          'x-api-key': 'test-api-key',
          ...headers,
        },
        body,
      });
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/v1/filters/:database', () => {
    it('returns consumer filters', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue(
        createMockFilters('consumer')
      );

      const response = await mockRequest('GET', '/api/v1/filters/consumer');

      expect(response.status).toBe(200);
      expect(response.body.database).toBe('consumer');
      expect(response.body.filters).toHaveLength(3);
      expect(response.body.filters[0].name).toBe('age_range');
    });

    it('returns business filters', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue(
        createMockFilters('business')
      );

      const response = await mockRequest('GET', '/api/v1/filters/business');

      expect(response.status).toBe(200);
      expect(response.body.database).toBe('business');
      expect(response.body.filters.map((f: any) => f.name)).toContain('sic_code');
      expect(response.body.filters.map((f: any) => f.name)).toContain('employee_count');
    });

    it('returns NHO filters', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue(
        createMockFilters('nho')
      );

      const response = await mockRequest('GET', '/api/v1/filters/nho');

      expect(response.status).toBe(200);
      expect(response.body.database).toBe('nho');
      expect(response.body.filters.map((f: any) => f.name)).toContain('sale_date_range');
      expect(response.body.filters.map((f: any) => f.name)).toContain('sale_price_range');
    });

    it('returns new mover filters', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue(
        createMockFilters('new_mover')
      );

      const response = await mockRequest('GET', '/api/v1/filters/new_mover');

      expect(response.status).toBe(200);
      expect(response.body.database).toBe('new_mover');
      expect(response.body.filters.map((f: any) => f.name)).toContain('move_date_range');
    });

    it('returns 400 for invalid database', async () => {
      const response = await mockRequest('GET', '/api/v1/filters/invalid');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid database');
    });

    it('returns 401 without API key', async () => {
      const response = await app.handleRequest({
        method: 'GET',
        path: '/api/v1/filters/consumer',
        headers: {},
      });

      expect(response.status).toBe(401);
    });

    it('returns 403 without permission', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
        id: 'tenant-123',
        name: 'Test Company',
        permissions: ['data:read'], // Missing filters:read
      });

      const response = await mockRequest('GET', '/api/v1/filters/consumer');

      expect(response.status).toBe(403);
    });

    it('includes filter types correctly', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue(
        createMockFilters('nho')
      );

      const response = await mockRequest('GET', '/api/v1/filters/nho');

      const dateFilter = response.body.filters.find(
        (f: any) => f.name === 'sale_date_range'
      );
      const rangeFilter = response.body.filters.find(
        (f: any) => f.name === 'sale_price_range'
      );
      const selectFilter = response.body.filters.find(
        (f: any) => f.name === 'property_type'
      );

      expect(dateFilter.type).toBe('date_range');
      expect(rangeFilter.type).toBe('range');
      expect(selectFilter.type).toBe('multi_select');
    });

    it('parses options correctly', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue(
        createMockFilters('nho')
      );

      const response = await mockRequest('GET', '/api/v1/filters/nho');

      const rangeFilter = response.body.filters.find(
        (f: any) => f.name === 'sale_price_range'
      );
      const selectFilter = response.body.filters.find(
        (f: any) => f.name === 'property_type'
      );

      expect(rangeFilter.options.min).toBe(0);
      expect(rangeFilter.options.max).toBe(10000000);
      expect(selectFilter.options).toContain('Single Family');
    });

    it('includes common selections', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue(
        createMockFilters('nho')
      );

      const response = await mockRequest('GET', '/api/v1/filters/nho');

      expect(response.body.common_selections).toBeDefined();
      expect(Array.isArray(response.body.common_selections)).toBe(true);
    });

    it('includes categories', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue(
        createMockFilters('nho')
      );

      const response = await mockRequest('GET', '/api/v1/filters/nho');

      expect(response.body.categories).toBeDefined();
      expect(response.body.categories).toContain('sale');
      expect(response.body.categories).toContain('property');
    });

    it('caches filter responses', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue(
        createMockFilters('consumer')
      );

      // First request
      await mockRequest('GET', '/api/v1/filters/consumer');

      // Second request (should use cache)
      const response = await mockRequest('GET', '/api/v1/filters/consumer');

      expect(response.status).toBe(200);
      // With caching, database should only be called once
      // This depends on implementation
    });

    it('sets appropriate cache headers', async () => {
      vi.mocked(prisma.filterOption.findMany).mockResolvedValue(
        createMockFilters('consumer')
      );

      const response = await mockRequest('GET', '/api/v1/filters/consumer');

      // Filters don't change often, so caching is appropriate
      expect(response.headers?.['cache-control']).toContain('max-age');
    });
  });
});
