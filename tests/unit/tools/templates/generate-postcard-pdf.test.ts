/**
 * Tests for generate_postcard_pdf tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeGeneratePostcardPdf } from '../../../../src/tools/templates/generate-postcard-pdf.js';
import { prisma } from '../../../../src/db/client.js';
import { getPdfGenerator } from '../../../../src/services/pdf-generator.js';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { ValidationError, AuthorizationError, NotFoundError } from '../../../../src/utils/errors.js';

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    template: {
      findUnique: vi.fn(),
    },
    usageRecord: {
      create: vi.fn(),
    },
  },
}));

// Mock PDF generator
vi.mock('../../../../src/services/pdf-generator.js', () => ({
  getPdfGenerator: vi.fn(() => ({
    initialize: vi.fn(),
    generate: vi.fn(),
    close: vi.fn(),
  })),
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
    id: 'template-123',
    name: 'Test Template',
    tenantId: 'test-tenant-id',
    category: 'realtor',
    size: 'SIZE_4X6',
    htmlFront: '<div>Hello {{first_name}} {{last_name}}</div>',
    htmlBack: '<div>Address: {{address}}</div>',
    cssStyles: '.container { margin: 0; }',
    mergeFields: ['first_name', 'last_name', 'address'],
    isPublic: false,
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
    vi.mocked(prisma.template.findUnique).mockResolvedValue(createMockTemplate());
    vi.mocked(prisma.usageRecord.create).mockResolvedValue({ id: 'usage-1' } as any);

    const mockGenerator = {
      initialize: vi.fn(),
      generate: vi.fn().mockResolvedValue({
        success: true,
        jobId: 'job-123',
        files: ['/path/to/postcards.pdf'],
        recordCount: 5,
        pageCount: 10,
        errors: [],
      }),
      close: vi.fn(),
    };
    vi.mocked(getPdfGenerator).mockReturnValue(mockGenerator as any);
  });

  describe('valid input', () => {
    it('generates PDF with minimal required fields', async () => {
      const context = createTestContext();
      const input = {
        template_id: 'template-123',
        records: createMockRecords(5),
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.job_id).toBe('job-123');
      expect(result.data?.files).toBeDefined();
    });

    it('generates PDF with all options', async () => {
      const context = createTestContext();
      const input = {
        template_id: 'template-123',
        records: createMockRecords(10),
        output_format: 'print_ready',
        include_back: true,
        quality: 'high',
        bleed: true,
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
      const generator = getPdfGenerator();
      expect(generator.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: 'template-123',
          outputFormat: 'print_ready',
          includeBack: true,
          quality: 'high',
          bleed: true,
        })
      );
    });
  });

  describe('output formats', () => {
    it('generates single_pdf format', async () => {
      const context = createTestContext();
      const input = {
        template_id: 'template-123',
        records: createMockRecords(5),
        output_format: 'single_pdf',
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
      const generator = getPdfGenerator();
      expect(generator.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          outputFormat: 'single_pdf',
        })
      );
    });

    it('generates individual_pdfs format', async () => {
      const context = createTestContext();
      const input = {
        template_id: 'template-123',
        records: createMockRecords(5),
        output_format: 'individual_pdfs',
      };

      const mockGenerator = getPdfGenerator();
      vi.mocked(mockGenerator.generate).mockResolvedValue({
        success: true,
        jobId: 'job-123',
        files: [
          '/path/to/postcard-1.pdf',
          '/path/to/postcard-2.pdf',
          '/path/to/postcard-3.pdf',
          '/path/to/postcard-4.pdf',
          '/path/to/postcard-5.pdf',
        ],
        recordCount: 5,
        pageCount: 5,
        errors: [],
      });

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.files).toHaveLength(5);
    });

    it('generates print_ready format', async () => {
      const context = createTestContext();
      const input = {
        template_id: 'template-123',
        records: createMockRecords(5),
        output_format: 'print_ready',
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
      const generator = getPdfGenerator();
      expect(generator.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          outputFormat: 'print_ready',
        })
      );
    });
  });

  describe('quality settings', () => {
    it('uses draft quality', async () => {
      const context = createTestContext();
      const input = {
        template_id: 'template-123',
        records: createMockRecords(5),
        quality: 'draft',
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
      const generator = getPdfGenerator();
      expect(generator.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          quality: 'draft',
        })
      );
    });

    it('uses standard quality by default', async () => {
      const context = createTestContext();
      const input = {
        template_id: 'template-123',
        records: createMockRecords(5),
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
      const generator = getPdfGenerator();
      expect(generator.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          quality: 'standard',
        })
      );
    });

    it('uses high quality', async () => {
      const context = createTestContext();
      const input = {
        template_id: 'template-123',
        records: createMockRecords(5),
        quality: 'high',
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
      const generator = getPdfGenerator();
      expect(generator.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          quality: 'high',
        })
      );
    });
  });

  describe('front and back options', () => {
    it('includes back when specified', async () => {
      const context = createTestContext();
      const input = {
        template_id: 'template-123',
        records: createMockRecords(5),
        include_back: true,
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
      const generator = getPdfGenerator();
      expect(generator.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          includeBack: true,
        })
      );
    });

    it('excludes back when false', async () => {
      const context = createTestContext();
      const input = {
        template_id: 'template-123',
        records: createMockRecords(5),
        include_back: false,
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
      const generator = getPdfGenerator();
      expect(generator.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          includeBack: false,
        })
      );
    });
  });

  describe('bleed margin options', () => {
    it('includes bleed when specified', async () => {
      const context = createTestContext();
      const input = {
        template_id: 'template-123',
        records: createMockRecords(5),
        bleed: true,
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
      const generator = getPdfGenerator();
      expect(generator.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          bleed: true,
        })
      );
    });

    it('excludes bleed by default', async () => {
      const context = createTestContext();
      const input = {
        template_id: 'template-123',
        records: createMockRecords(5),
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
      const generator = getPdfGenerator();
      expect(generator.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          bleed: false,
        })
      );
    });
  });

  describe('merge field validation', () => {
    it('validates records have required merge fields', async () => {
      const context = createTestContext();
      const input = {
        template_id: 'template-123',
        records: [
          { first_name: 'John', last_name: 'Doe', address: '123 Main St' },
          { first_name: 'Jane', last_name: 'Smith', address: '456 Oak Ave' },
        ],
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.success).toBe(true);
    });

    it('warns about missing merge fields in records', async () => {
      const context = createTestContext();
      const input = {
        template_id: 'template-123',
        records: [
          { first_name: 'John' }, // Missing last_name and address
          { first_name: 'Jane', last_name: 'Smith' }, // Missing address
        ],
      };

      const result = await executeGeneratePostcardPdf(input, context);

      // Should still generate but may include warnings
      expect(result.data?.warnings).toBeDefined();
    });

    it('rejects when >50% of records missing required fields', async () => {
      const context = createTestContext();
      const input = {
        template_id: 'template-123',
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
        template_id: 'nonexistent-template',
        records: createMockRecords(5),
      };

      vi.mocked(prisma.template.findUnique).mockResolvedValue(null);

      await expect(executeGeneratePostcardPdf(input, context)).rejects.toThrow(NotFoundError);
    });

    it('throws AuthorizationError when template belongs to different tenant', async () => {
      const context = createTestContext();
      const input = {
        template_id: 'other-tenant-template',
        records: createMockRecords(5),
      };

      vi.mocked(prisma.template.findUnique).mockResolvedValue(
        createMockTemplate({ tenantId: 'other-tenant-id', isPublic: false })
      );

      await expect(executeGeneratePostcardPdf(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows using public templates from other tenants', async () => {
      const context = createTestContext();
      const input = {
        template_id: 'public-template',
        records: createMockRecords(5),
      };

      vi.mocked(prisma.template.findUnique).mockResolvedValue(
        createMockTemplate({ tenantId: 'system', isPublic: true })
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
        template_id: 'template-123',
      };

      await expect(executeGeneratePostcardPdf(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for empty records array', async () => {
      const context = createTestContext();
      const input = {
        template_id: 'template-123',
        records: [],
      };

      await expect(executeGeneratePostcardPdf(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for invalid output_format', async () => {
      const context = createTestContext();
      const input = {
        template_id: 'template-123',
        records: createMockRecords(5),
        output_format: 'invalid_format',
      };

      await expect(executeGeneratePostcardPdf(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for invalid quality', async () => {
      const context = createTestContext();
      const input = {
        template_id: 'template-123',
        records: createMockRecords(5),
        quality: 'ultra_high',
      };

      await expect(executeGeneratePostcardPdf(input, context)).rejects.toThrow();
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing template:use permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {
        template_id: 'template-123',
        records: createMockRecords(5),
      };

      await expect(executeGeneratePostcardPdf(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with template:use permission', async () => {
      const context = createTestContext({
        permissions: ['template:use'],
      });
      const input = {
        template_id: 'template-123',
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
        template_id: 'template-123',
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
        template_id: 'template-123',
        records: createMockRecords(5),
      };

      await executeGeneratePostcardPdf(input, context);

      expect(prisma.usageRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'test-tenant-id',
            type: 'PDF_GENERATION',
            count: 5,
          }),
        })
      );
    });

    it('returns estimated cost in response', async () => {
      const context = createTestContext();
      const input = {
        template_id: 'template-123',
        records: createMockRecords(5),
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.usage?.estimatedCost).toBe(0.5); // 5 * $0.10
    });
  });

  describe('response format', () => {
    it('returns job details', async () => {
      const context = createTestContext();
      const input = {
        template_id: 'template-123',
        records: createMockRecords(5),
      };

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.data?.job_id).toBe('job-123');
      expect(result.data?.files).toBeDefined();
      expect(result.data?.record_count).toBe(5);
      expect(result.data?.page_count).toBe(10);
    });

    it('includes errors when some records fail', async () => {
      const context = createTestContext();
      const input = {
        template_id: 'template-123',
        records: createMockRecords(5),
      };

      const mockGenerator = getPdfGenerator();
      vi.mocked(mockGenerator.generate).mockResolvedValue({
        success: false,
        jobId: 'job-123',
        files: ['/path/to/postcards.pdf'],
        recordCount: 5,
        pageCount: 8,
        errors: [
          { recordIndex: 2, error: 'Invalid data' },
          { recordIndex: 4, error: 'Missing field' },
        ],
      });

      const result = await executeGeneratePostcardPdf(input, context);

      expect(result.data?.errors).toHaveLength(2);
      expect(result.data?.errors[0].record_index).toBe(2);
    });
  });

  describe('error handling', () => {
    it('handles PDF generator errors gracefully', async () => {
      const context = createTestContext();
      const input = {
        template_id: 'template-123',
        records: createMockRecords(5),
      };

      const mockGenerator = getPdfGenerator();
      vi.mocked(mockGenerator.generate).mockRejectedValue(new Error('PDF generation failed'));

      await expect(executeGeneratePostcardPdf(input, context)).rejects.toThrow('PDF generation failed');
    });

    it('handles database errors gracefully', async () => {
      const context = createTestContext();
      const input = {
        template_id: 'template-123',
        records: createMockRecords(5),
      };

      vi.mocked(prisma.template.findUnique).mockRejectedValue(new Error('Database error'));

      await expect(executeGeneratePostcardPdf(input, context)).rejects.toThrow('Database error');
    });
  });
});
