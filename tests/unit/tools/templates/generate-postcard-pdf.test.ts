/**
 * Tests for generate_postcard_pdf tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeGeneratePostcardPdf } from '../../../../src/tools/templates/generate-postcard-pdf.js';
import { prisma } from '../../../../src/db/client.js';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { ValidationError, AuthorizationError, NotFoundError } from '../../../../src/utils/errors.js';

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    template: {
      findFirst: vi.fn(),
    },
    usageRecord: {
      create: vi.fn(),
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

// Create mock template
function createMockTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test Template',
    tenantId: 'test-tenant-id',
    category: 'REALTOR',
    size: 'SIZE_4X6',
    htmlFront: '<div>Hello {{first_name}} {{last_name}}</div>',
    htmlBack: '<div>Address: {{address}}</div>',
    cssStyles: '.container { margin: 0; }',
    mergeFields: ['first_name', 'last_name', 'address'],
    isPublic: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// Create mock records
function createMockRecords(count: number = 5) {
  return Array.from({ length: count }, (_, i) => ({
    first_name: `John${i}`,
    last_name: `Doe${i}`,
    address: `${100 + i} Main St`,
    city: 'Phoenix',
    state: 'AZ',
    zip: `8500${i}`,
  }));
}

describe('generate_postcard_pdf tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock responses
    vi.mocked(prisma.template.findFirst).mockResolvedValue(createMockTemplate() as any);
    vi.mocked(prisma.usageRecord.create).mockResolvedValue({ id: 'usage-1' } as any);
  });

  describe('valid input', () => {
    it('generates PDF with minimal required fields', async () => {
      const context = createTestContext();
      const input = {
        template_id: '00000000-0000-0000-0000-000000000001',
        records: createMockRecords(5),
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.job?.id).toBeDefined();
      expect(result.data?.job?.status).toBe('processing');
      expect(result.data?.download).toBeDefined();
    });

    it('generates PDF with all options', async () => {
      const context = createTestContext();
      const input = {
        template_id: '00000000-0000-0000-0000-000000000001',
        records: createMockRecords(10),
        output_format: 'print_ready',
        include_back: true,
        quality: 'high',
        bleed: true,
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.job?.outputFormat).toBe('print_ready');
      expect(result.data?.job?.quality).toBe('high');
      expect(result.data?.job?.includeBack).toBe(true);
      expect(result.data?.job?.bleed).toBe(true);
    });
  });

  describe('output formats', () => {
    it('generates single_pdf format', async () => {
      const context = createTestContext();
      const input = {
        template_id: '00000000-0000-0000-0000-000000000001',
        records: createMockRecords(5),
        output_format: 'single_pdf',
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.job?.outputFormat).toBe('single_pdf');
    });

    it('generates individual_pdfs format', async () => {
      const context = createTestContext();
      const input = {
        template_id: '00000000-0000-0000-0000-000000000001',
        records: createMockRecords(5),
        output_format: 'individual_pdfs',
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.job?.outputFormat).toBe('individual_pdfs');
    });

    it('generates print_ready format', async () => {
      const context = createTestContext();
      const input = {
        template_id: '00000000-0000-0000-0000-000000000001',
        records: createMockRecords(5),
        output_format: 'print_ready',
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.job?.outputFormat).toBe('print_ready');
    });
  });

  describe('quality settings', () => {
    it('uses draft quality', async () => {
      const context = createTestContext();
      const input = {
        template_id: '00000000-0000-0000-0000-000000000001',
        records: createMockRecords(5),
        quality: 'draft',
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.job?.quality).toBe('draft');
    });

    it('uses standard quality by default', async () => {
      const context = createTestContext();
      const input = {
        template_id: '00000000-0000-0000-0000-000000000001',
        records: createMockRecords(5),
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.job?.quality).toBe('standard');
    });

    it('uses high quality', async () => {
      const context = createTestContext();
      const input = {
        template_id: '00000000-0000-0000-0000-000000000001',
        records: createMockRecords(5),
        quality: 'high',
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.job?.quality).toBe('high');
    });
  });

  describe('front and back options', () => {
    it('includes back when specified', async () => {
      const context = createTestContext();
      const input = {
        template_id: '00000000-0000-0000-0000-000000000001',
        records: createMockRecords(5),
        include_back: true,
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.job?.includeBack).toBe(true);
    });

    it('excludes back when false', async () => {
      const context = createTestContext();
      const input = {
        template_id: '00000000-0000-0000-0000-000000000001',
        records: createMockRecords(5),
        include_back: false,
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.job?.includeBack).toBe(false);
    });
  });

  describe('bleed margin options', () => {
    it('includes bleed when specified', async () => {
      const context = createTestContext();
      const input = {
        template_id: '00000000-0000-0000-0000-000000000001',
        records: createMockRecords(5),
        bleed: true,
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.job?.bleed).toBe(true);
    });

    it('excludes bleed by default', async () => {
      const context = createTestContext();
      const input = {
        template_id: '00000000-0000-0000-0000-000000000001',
        records: createMockRecords(5),
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.job?.bleed).toBe(false);
    });
  });

  describe('merge field validation', () => {
    it('validates records have required merge fields', async () => {
      const context = createTestContext();
      const input = {
        template_id: '00000000-0000-0000-0000-000000000001',
        records: [
          { first_name: 'John', last_name: 'Doe', address: '123 Main St' },
          { first_name: 'Jane', last_name: 'Smith', address: '456 Oak Ave' },
        ],
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
    });

    it('rejects when >50% of records missing required fields', async () => {
      const context = createTestContext();
      const input = {
        template_id: '00000000-0000-0000-0000-000000000001',
        records: [
          {}, // All fields missing
          {}, // All fields missing
          {}, // All fields missing
          { first_name: 'John', last_name: 'Doe', address: '123 Main St' },
        ],
      };

      await expect(executeGeneratePostcardPdf(input, context)).rejects.toThrow(ValidationError);
    });
  });

  describe('template validation', () => {
    it('throws NotFoundError for non-existent template', async () => {
      const context = createTestContext();
      const input = {
        template_id: '00000000-0000-0000-0000-000000000002',
        records: createMockRecords(5),
      };

      vi.mocked(prisma.template.findFirst).mockResolvedValue(null);

      await expect(executeGeneratePostcardPdf(input, context)).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when template belongs to different tenant (not found by query)', async () => {
      const context = createTestContext();
      const input = {
        template_id: '00000000-0000-0000-0000-000000000003',
        records: createMockRecords(5),
      };

      // findFirst returns null when tenantId doesn't match and template is not public
      vi.mocked(prisma.template.findFirst).mockResolvedValue(null);

      await expect(executeGeneratePostcardPdf(input, context)).rejects.toThrow(NotFoundError);
    });

    it('allows using public templates from other tenants', async () => {
      const context = createTestContext();
      const input = {
        template_id: '00000000-0000-0000-0000-000000000004',
        records: createMockRecords(5),
      };

      vi.mocked(prisma.template.findFirst).mockResolvedValue(
        createMockTemplate({ id: '00000000-0000-0000-0000-000000000004', tenantId: 'system', isPublic: true }) as any
      );

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
    });
  });

  describe('input validation', () => {
    it('throws ValidationError for missing template_id', async () => {
      const context = createTestContext();
      const input = {
        records: createMockRecords(5),
      };

      await expect(executeGeneratePostcardPdf(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for invalid template_id format', async () => {
      const context = createTestContext();
      const input = {
        template_id: 'not-a-uuid',
        records: createMockRecords(5),
      };

      await expect(executeGeneratePostcardPdf(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for missing records', async () => {
      const context = createTestContext();
      const input = {
        template_id: '00000000-0000-0000-0000-000000000001',
      };

      await expect(executeGeneratePostcardPdf(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for empty records array', async () => {
      const context = createTestContext();
      const input = {
        template_id: '00000000-0000-0000-0000-000000000001',
        records: [],
      };

      await expect(executeGeneratePostcardPdf(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for invalid output_format', async () => {
      const context = createTestContext();
      const input = {
        template_id: '00000000-0000-0000-0000-000000000001',
        records: createMockRecords(5),
        output_format: 'invalid_format',
      };

      await expect(executeGeneratePostcardPdf(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for invalid quality', async () => {
      const context = createTestContext();
      const input = {
        template_id: '00000000-0000-0000-0000-000000000001',
        records: createMockRecords(5),
        quality: 'ultra_high',
      };

      await expect(executeGeneratePostcardPdf(input, context)).rejects.toThrow();
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing template:read permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {
        template_id: '00000000-0000-0000-0000-000000000001',
        records: createMockRecords(5),
      };

      await expect(executeGeneratePostcardPdf(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with template:read and data:write permissions', async () => {
      const context = createTestContext({
        permissions: ['template:read', 'data:write'],
      });
      const input = {
        template_id: '00000000-0000-0000-0000-000000000001',
        records: createMockRecords(5),
      };

      const result = await executeGeneratePostcardPdf(input, context);
      expect(result.success).toBe(true);
    });

    it('allows access with wildcard permission', async () => {
      const context = createTestContext({
        permissions: ['*'],
      });
      const input = {
        template_id: '00000000-0000-0000-0000-000000000001',
        records: createMockRecords(5),
      };

      const result = await executeGeneratePostcardPdf(input, context);
      expect(result.success).toBe(true);
    });
  });

  describe('usage tracking', () => {
    it('creates usage record for PDF generation', async () => {
      const context = createTestContext();
      const input = {
        template_id: '00000000-0000-0000-0000-000000000001',
        records: createMockRecords(5),
      };

      await executeGeneratePostcardPdf(input, context);

      expect(prisma.usageRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'test-tenant-id',
            usageType: 'PDF_GENERATION',
            quantity: 5,
          }),
        })
      );
    });

    it('returns cost estimates in response', async () => {
      const context = createTestContext();
      const input = {
        template_id: '00000000-0000-0000-0000-000000000001',
        records: createMockRecords(5),
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.data?.costs?.pdfCost).toBeDefined();
      expect(result.data?.costs?.totalCost).toBeDefined();
    });
  });

  describe('response format', () => {
    it('returns job details', async () => {
      const context = createTestContext();
      const input = {
        template_id: '00000000-0000-0000-0000-000000000001',
        records: createMockRecords(5),
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.data?.job?.id).toBeDefined();
      expect(result.data?.job?.status).toBe('processing');
      expect(result.data?.job?.recordCount).toBe(5);
      expect(result.data?.job?.templateId).toBe('00000000-0000-0000-0000-000000000001');
      expect(result.data?.job?.templateName).toBe('Test Template');
    });

    it('returns download info', async () => {
      const context = createTestContext();
      const input = {
        template_id: '00000000-0000-0000-0000-000000000001',
        records: createMockRecords(5),
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.data?.download).toBeDefined();
      expect(result.data?.download?.expiresAt).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('handles database errors gracefully', async () => {
      const context = createTestContext();
      const input = {
        template_id: '00000000-0000-0000-0000-000000000001',
        records: createMockRecords(5),
      };

      vi.mocked(prisma.template.findFirst).mockRejectedValue(new Error('Database error'));

      await expect(executeGeneratePostcardPdf(input, context)).rejects.toThrow('Database error');
    });
  });
});
