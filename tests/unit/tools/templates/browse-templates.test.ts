/**
 * Tests for browse_templates tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeBrowseTemplates } from '../../../../src/tools/templates/browse-templates.js';
import { prisma } from '../../../../src/db/client.js';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { AuthorizationError } from '../../../../src/utils/errors.js';

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    template: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
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

// Create mock templates
function createMockTemplates() {
  return [
    {
      id: 'template-1',
      name: 'Realtor Welcome',
      tenantId: 'test-tenant-id',
      category: 'realtor',
      size: 'SIZE_4X6',
      htmlFront: '<div>Welcome to the neighborhood!</div>',
      htmlBack: '<div>Contact info</div>',
      cssStyles: null,
      mergeFields: ['first_name', 'address'],
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'template-2',
      name: 'HVAC Promo',
      tenantId: 'test-tenant-id',
      category: 'hvac',
      size: 'SIZE_6X9',
      htmlFront: '<div>HVAC Services</div>',
      htmlBack: null,
      cssStyles: '.promo { color: red; }',
      mergeFields: ['first_name', 'city'],
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'template-3',
      name: 'Public Insurance Template',
      tenantId: 'system',
      category: 'insurance',
      size: 'SIZE_4X6',
      htmlFront: '<div>Insurance Offer</div>',
      htmlBack: '<div>Terms and conditions</div>',
      cssStyles: null,
      mergeFields: ['first_name', 'last_name'],
      isPublic: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'template-4',
      name: 'Mortgage Rates',
      tenantId: 'test-tenant-id',
      category: 'mortgage',
      size: 'SIZE_6X11',
      htmlFront: '<div>Great rates!</div>',
      htmlBack: null,
      cssStyles: null,
      mergeFields: [],
      isPublic: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
}

describe('browse_templates tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock responses
    vi.mocked(prisma.template.findMany).mockResolvedValue(createMockTemplates());
    vi.mocked(prisma.template.count).mockResolvedValue(4);
    vi.mocked(prisma.template.groupBy).mockResolvedValue([
      { category: 'realtor', _count: { id: 1 } },
      { category: 'hvac', _count: { id: 1 } },
      { category: 'insurance', _count: { id: 1 } },
      { category: 'mortgage', _count: { id: 1 } },
    ] as any);
  });

  describe('basic browsing', () => {
    it('returns all available templates', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeBrowseTemplates(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.templates).toHaveLength(4);
      expect(result.data?.total).toBe(4);
    });

    it('returns templates with correct fields', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeBrowseTemplates(input, context);

      const template = result.data?.templates[0];
      expect(template).toHaveProperty('id');
      expect(template).toHaveProperty('name');
      expect(template).toHaveProperty('category');
      expect(template).toHaveProperty('size');
      expect(template).toHaveProperty('merge_fields');
      expect(template).toHaveProperty('is_public');
    });

    it('returns empty list when no templates exist', async () => {
      const context = createTestContext();
      const input = {};

      vi.mocked(prisma.template.findMany).mockResolvedValue([]);
      vi.mocked(prisma.template.count).mockResolvedValue(0);

      const result = await executeBrowseTemplates(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.templates).toHaveLength(0);
      expect(result.data?.total).toBe(0);
    });
  });

  describe('category filtering', () => {
    it('filters by specific category', async () => {
      const context = createTestContext();
      const input = { category: 'realtor' };

      const realtorTemplates = createMockTemplates().filter(t => t.category === 'realtor');
      vi.mocked(prisma.template.findMany).mockResolvedValue(realtorTemplates);
      vi.mocked(prisma.template.count).mockResolvedValue(realtorTemplates.length);

      const result = await executeBrowseTemplates(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.templates.every(t => t.category === 'realtor')).toBe(true);
    });

    it('returns all categories when filter is "all"', async () => {
      const context = createTestContext();
      const input = { category: 'all' };

      const result = await executeBrowseTemplates(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.templates).toHaveLength(4);
    });

    it('accepts all valid categories', async () => {
      const context = createTestContext();
      const categories = ['realtor', 'hvac', 'insurance', 'mortgage', 'solar', 'roofing', 'general', 'custom'];

      for (const category of categories) {
        vi.mocked(prisma.template.findMany).mockResolvedValue([]);

        const input = { category };

        const result = await executeBrowseTemplates(input, context);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('size filtering', () => {
    it('filters by 4x6 size', async () => {
      const context = createTestContext();
      const input = { size: '4x6' };

      const sizedTemplates = createMockTemplates().filter(t => t.size === 'SIZE_4X6');
      vi.mocked(prisma.template.findMany).mockResolvedValue(sizedTemplates);
      vi.mocked(prisma.template.count).mockResolvedValue(sizedTemplates.length);

      const result = await executeBrowseTemplates(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.templates.every(t => t.size === '4x6')).toBe(true);
    });

    it('filters by 6x9 size', async () => {
      const context = createTestContext();
      const input = { size: '6x9' };

      const sizedTemplates = createMockTemplates().filter(t => t.size === 'SIZE_6X9');
      vi.mocked(prisma.template.findMany).mockResolvedValue(sizedTemplates);

      const result = await executeBrowseTemplates(input, context);

      expect(result.success).toBe(true);
    });

    it('filters by 6x11 size', async () => {
      const context = createTestContext();
      const input = { size: '6x11' };

      const sizedTemplates = createMockTemplates().filter(t => t.size === 'SIZE_6X11');
      vi.mocked(prisma.template.findMany).mockResolvedValue(sizedTemplates);

      const result = await executeBrowseTemplates(input, context);

      expect(result.success).toBe(true);
    });

    it('returns all sizes when filter is "all"', async () => {
      const context = createTestContext();
      const input = { size: 'all' };

      const result = await executeBrowseTemplates(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.templates).toHaveLength(4);
    });
  });

  describe('public/private filtering', () => {
    it('includes public templates by default', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeBrowseTemplates(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.templates.some(t => t.is_public)).toBe(true);
    });

    it('includes private templates by default', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeBrowseTemplates(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.templates.some(t => !t.is_public)).toBe(true);
    });

    it('excludes public templates when include_public is false', async () => {
      const context = createTestContext();
      const input = { include_public: false };

      const privateTemplates = createMockTemplates().filter(t => !t.isPublic);
      vi.mocked(prisma.template.findMany).mockResolvedValue(privateTemplates);

      const result = await executeBrowseTemplates(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.templates.every(t => !t.is_public)).toBe(true);
    });

    it('excludes private templates when include_private is false', async () => {
      const context = createTestContext();
      const input = { include_private: false };

      const publicTemplates = createMockTemplates().filter(t => t.isPublic);
      vi.mocked(prisma.template.findMany).mockResolvedValue(publicTemplates);

      const result = await executeBrowseTemplates(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.templates.every(t => t.is_public)).toBe(true);
    });
  });

  describe('search functionality', () => {
    it('searches by template name', async () => {
      const context = createTestContext();
      const input = { search: 'HVAC' };

      const matchingTemplates = createMockTemplates().filter(t =>
        t.name.toLowerCase().includes('hvac')
      );
      vi.mocked(prisma.template.findMany).mockResolvedValue(matchingTemplates);
      vi.mocked(prisma.template.count).mockResolvedValue(matchingTemplates.length);

      const result = await executeBrowseTemplates(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.templates[0].name).toContain('HVAC');
    });

    it('searches case-insensitively', async () => {
      const context = createTestContext();
      const input = { search: 'hvac' }; // lowercase

      const matchingTemplates = createMockTemplates().filter(t =>
        t.name.toLowerCase().includes('hvac')
      );
      vi.mocked(prisma.template.findMany).mockResolvedValue(matchingTemplates);

      const result = await executeBrowseTemplates(input, context);

      expect(result.success).toBe(true);
    });

    it('returns empty when no matches found', async () => {
      const context = createTestContext();
      const input = { search: 'nonexistent' };

      vi.mocked(prisma.template.findMany).mockResolvedValue([]);
      vi.mocked(prisma.template.count).mockResolvedValue(0);

      const result = await executeBrowseTemplates(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.templates).toHaveLength(0);
    });
  });

  describe('pagination', () => {
    it('respects limit parameter', async () => {
      const context = createTestContext();
      const input = { limit: 2 };

      await executeBrowseTemplates(input, context);

      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 2,
        })
      );
    });

    it('respects offset parameter', async () => {
      const context = createTestContext();
      const input = { offset: 10 };

      await executeBrowseTemplates(input, context);

      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
        })
      );
    });

    it('returns pagination info', async () => {
      const context = createTestContext();
      const input = { limit: 2, offset: 0 };

      const result = await executeBrowseTemplates(input, context);

      expect(result.data?.pagination).toBeDefined();
      expect(result.data?.pagination?.limit).toBe(2);
      expect(result.data?.pagination?.offset).toBe(0);
      expect(result.data?.pagination?.total).toBe(4);
    });

    it('indicates when more results available', async () => {
      const context = createTestContext();
      const input = { limit: 2, offset: 0 };

      const result = await executeBrowseTemplates(input, context);

      expect(result.data?.pagination?.has_more).toBe(true);
    });

    it('indicates no more results when at end', async () => {
      const context = createTestContext();
      const input = { limit: 50, offset: 0 };

      const result = await executeBrowseTemplates(input, context);

      expect(result.data?.pagination?.has_more).toBe(false);
    });

    it('enforces maximum limit of 100', async () => {
      const context = createTestContext();
      const input = { limit: 150 };

      await expect(executeBrowseTemplates(input, context)).rejects.toThrow();
    });

    it('uses default limit of 50', async () => {
      const context = createTestContext();
      const input = {};

      await executeBrowseTemplates(input, context);

      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        })
      );
    });
  });

  describe('category counts', () => {
    it('returns category counts', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeBrowseTemplates(input, context);

      expect(result.data?.category_counts).toBeDefined();
      expect(result.data?.category_counts?.realtor).toBe(1);
      expect(result.data?.category_counts?.hvac).toBe(1);
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing template:read permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {};

      await expect(executeBrowseTemplates(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with template:read permission', async () => {
      const context = createTestContext({
        permissions: ['template:read'],
      });
      const input = {};

      const result = await executeBrowseTemplates(input, context);
      expect(result.success).toBe(true);
    });

    it('allows access with wildcard permission', async () => {
      const context = createTestContext({
        permissions: ['*'],
      });
      const input = {};

      const result = await executeBrowseTemplates(input, context);
      expect(result.success).toBe(true);
    });
  });

  describe('tenant isolation', () => {
    it('queries templates for current tenant and public templates', async () => {
      const context = createTestContext();
      const input = {};

      await executeBrowseTemplates(input, context);

      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { tenantId: 'test-tenant-id' },
              { isPublic: true },
            ]),
          }),
        })
      );
    });
  });

  describe('null input handling', () => {
    it('handles null input', async () => {
      const context = createTestContext();

      const result = await executeBrowseTemplates(null, context);

      expect(result.success).toBe(true);
    });

    it('handles undefined input', async () => {
      const context = createTestContext();

      const result = await executeBrowseTemplates(undefined, context);

      expect(result.success).toBe(true);
    });

    it('handles empty object input', async () => {
      const context = createTestContext();

      const result = await executeBrowseTemplates({}, context);

      expect(result.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('handles database errors gracefully', async () => {
      const context = createTestContext();
      const input = {};

      vi.mocked(prisma.template.findMany).mockRejectedValue(new Error('Database error'));

      await expect(executeBrowseTemplates(input, context)).rejects.toThrow('Database error');
    });
  });
});
