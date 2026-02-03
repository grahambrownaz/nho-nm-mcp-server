/**
 * Integration tests for template and PDF generation flow
 * Tests the complete flow from template upload to PDF generation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeUploadTemplate } from '../../src/tools/templates/upload-template.js';
import { executeBrowseTemplates } from '../../src/tools/templates/browse-templates.js';
import { executeImportDesign } from '../../src/tools/templates/import-design.js';
import { executeGeneratePostcardPdf } from '../../src/tools/templates/generate-postcard-pdf.js';
import { prisma } from '../../src/db/client.js';
import { getPdfGenerator } from '../../src/services/pdf-generator.js';
import type { TenantContext } from '../../src/utils/auth.js';

// In-memory store for templates
const templates = new Map<string, any>();

// Mock Prisma client with connected behavior
vi.mock('../../src/db/client.js', () => ({
  prisma: {
    template: {
      create: vi.fn((args: any) => {
        const template = {
          id: `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        templates.set(template.id, template);
        return Promise.resolve(template);
      }),
      findUnique: vi.fn((args: any) => {
        return Promise.resolve(templates.get(args.where.id) || null);
      }),
      findMany: vi.fn((args: any) => {
        const results = Array.from(templates.values()).filter((t: any) => {
          if (args.where.OR) {
            return args.where.OR.some((condition: any) => {
              if (condition.tenantId) return t.tenantId === condition.tenantId;
              if (condition.isPublic) return t.isPublic === condition.isPublic;
              return false;
            });
          }
          return t.tenantId === args.where.tenantId;
        });
        return Promise.resolve(results);
      }),
      count: vi.fn(() => Promise.resolve(templates.size)),
      groupBy: vi.fn(() => Promise.resolve([])),
    },
    usageRecord: {
      create: vi.fn(() => Promise.resolve({ id: 'usage-1' })),
    },
  },
}));

// Mock PDF generator
vi.mock('../../src/services/pdf-generator.js', () => ({
  getPdfGenerator: vi.fn(() => ({
    initialize: vi.fn(),
    generate: vi.fn((options: any) => {
      const pageCount = options.includeBack ? options.records.length * 2 : options.records.length;
      return Promise.resolve({
        success: true,
        jobId: `job-${Date.now()}`,
        files: options.outputFormat === 'individual_pdfs'
          ? options.records.map((_: any, i: number) => `/tmp/postcard-${i + 1}.pdf`)
          : ['/tmp/postcards.pdf'],
        recordCount: options.records.length,
        pageCount,
        errors: [],
      });
    }),
    close: vi.fn(),
    generatePreview: vi.fn(() => Promise.resolve('/tmp/preview.png')),
  })),
}));

// Mock sanitize-html
vi.mock('sanitize-html', () => ({
  default: vi.fn((html: string) => html),
}));

// Mock fetch for URL imports
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    text: () => Promise.resolve('<div>Imported content</div>'),
  } as Response)
);

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

// Sample mailing list records
const sampleRecords = [
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
    city: 'Scottsdale',
    state: 'AZ',
    zip: '85251',
  },
  {
    first_name: 'Bob',
    last_name: 'Johnson',
    address: '789 Pine Rd',
    city: 'Mesa',
    state: 'AZ',
    zip: '85201',
  },
  {
    first_name: 'Alice',
    last_name: 'Williams',
    address: '321 Elm Dr',
    city: 'Tempe',
    state: 'AZ',
    zip: '85281',
  },
  {
    first_name: 'Charlie',
    last_name: 'Brown',
    address: '654 Cedar Ln',
    city: 'Chandler',
    state: 'AZ',
    zip: '85224',
  },
];

describe('Template and PDF Flow Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    templates.clear();
  });

  describe('complete template to PDF workflow', () => {
    it('uploads template and generates PDFs', async () => {
      const context = createTestContext();

      // Step 1: Upload template
      const uploadResult = await executeUploadTemplate(
        {
          name: 'Realtor Welcome Postcard',
          category: 'realtor',
          size: '4x6',
          html_front: `
            <div class="postcard-front">
              <h1>Welcome to Your New Home!</h1>
              <p>Dear {{first_name}} {{last_name}},</p>
              <p>Congratulations on your new home at {{address}}!</p>
            </div>
          `,
          html_back: `
            <div class="postcard-back">
              <p>{{first_name}}, I'd love to help with your next move.</p>
              <p>Call me at 555-1234</p>
            </div>
          `,
          css_styles: '.postcard-front { padding: 20px; } .postcard-back { padding: 20px; }',
        },
        context
      );

      expect(uploadResult.success).toBe(true);
      const templateId = uploadResult.data?.template_id;

      // Step 2: Verify template appears in browse
      const browseResult = await executeBrowseTemplates(
        { category: 'realtor' },
        context
      );

      expect(browseResult.success).toBe(true);
      expect(browseResult.data?.templates.some((t) => t.id === templateId)).toBe(true);

      // Step 3: Generate PDFs using the template
      const pdfResult = await executeGeneratePostcardPdf(
        {
          template_id: templateId,
          records: sampleRecords,
          output_format: 'single_pdf',
          include_back: true,
          quality: 'standard',
        },
        context
      );

      expect(pdfResult.success).toBe(true);
      expect(pdfResult.data?.record_count).toBe(5);
      expect(pdfResult.data?.page_count).toBe(10); // 5 records * 2 sides
      expect(pdfResult.data?.files).toHaveLength(1);
    });

    it('imports design and generates PDFs', async () => {
      const context = createTestContext();

      // Step 1: Import design from HTML
      const importResult = await executeImportDesign(
        {
          source: 'html',
          name: 'Imported HVAC Promo',
          size: '6x9',
          html_content: `
            <div style="padding: 20px; background: #fff;">
              <h1>HVAC Tune-Up Special</h1>
              <p>Hello {{first_name}}, your home at {{address}} in {{city}} may need a tune-up!</p>
              <p>Call now for a free estimate.</p>
            </div>
          `,
          extract_styles: true,
        },
        context
      );

      expect(importResult.success).toBe(true);
      const templateId = importResult.data?.template_id;

      // Step 2: Verify imported template
      const browseResult = await executeBrowseTemplates({}, context);

      expect(browseResult.success).toBe(true);
      expect(browseResult.data?.templates.some((t) => t.id === templateId)).toBe(true);

      // Step 3: Generate individual PDFs
      const pdfResult = await executeGeneratePostcardPdf(
        {
          template_id: templateId,
          records: sampleRecords,
          output_format: 'individual_pdfs',
          include_back: false,
          quality: 'high',
        },
        context
      );

      expect(pdfResult.success).toBe(true);
      expect(pdfResult.data?.files).toHaveLength(5);
    });
  });

  describe('multiple templates and batch PDF generation', () => {
    it('creates multiple templates and generates PDFs for each', async () => {
      const context = createTestContext();

      // Create multiple templates for different categories
      const templateConfigs = [
        {
          name: 'Realtor Welcome',
          category: 'realtor',
          html_front: '<div>Welcome home, {{first_name}}!</div>',
        },
        {
          name: 'HVAC Special',
          category: 'hvac',
          html_front: '<div>HVAC service for {{first_name}} at {{address}}</div>',
        },
        {
          name: 'Insurance Quote',
          category: 'insurance',
          html_front: '<div>{{first_name}}, get your free quote today!</div>',
        },
      ];

      const templateIds: string[] = [];

      for (const config of templateConfigs) {
        const result = await executeUploadTemplate(
          {
            ...config,
            size: '4x6',
          },
          context
        );

        expect(result.success).toBe(true);
        templateIds.push(result.data?.template_id);
      }

      // Verify all templates in browse
      const browseResult = await executeBrowseTemplates({}, context);
      expect(browseResult.data?.templates).toHaveLength(3);

      // Generate PDFs for each template
      for (const templateId of templateIds) {
        const pdfResult = await executeGeneratePostcardPdf(
          {
            template_id: templateId,
            records: sampleRecords.slice(0, 2), // Use subset for efficiency
            output_format: 'single_pdf',
            include_back: false,
            quality: 'draft',
          },
          context
        );

        expect(pdfResult.success).toBe(true);
        expect(pdfResult.data?.record_count).toBe(2);
      }
    });
  });

  describe('template size variations', () => {
    it('generates PDFs for all postcard sizes', async () => {
      const context = createTestContext();
      const sizes = ['4x6', '6x9', '6x11'];

      for (const size of sizes) {
        // Upload template with specific size
        const uploadResult = await executeUploadTemplate(
          {
            name: `Postcard ${size}`,
            size,
            html_front: `<div>{{first_name}} {{last_name}}<br>{{address}}<br>{{city}}, {{state}} {{zip}}</div>`,
          },
          context
        );

        expect(uploadResult.success).toBe(true);
        const templateId = uploadResult.data?.template_id;

        // Generate PDF
        const pdfResult = await executeGeneratePostcardPdf(
          {
            template_id: templateId,
            records: sampleRecords.slice(0, 1),
            output_format: 'single_pdf',
            include_back: false,
            quality: 'standard',
          },
          context
        );

        expect(pdfResult.success).toBe(true);
      }
    });
  });

  describe('print-ready PDF generation', () => {
    it('generates print-ready PDFs with bleed and high quality', async () => {
      const context = createTestContext();

      // Upload professional template
      const uploadResult = await executeUploadTemplate(
        {
          name: 'Print-Ready Template',
          category: 'realtor',
          size: '6x9',
          html_front: `
            <div class="front">
              <h1>Welcome to the Neighborhood</h1>
              <p>Dear {{first_name}} {{last_name}},</p>
              <p>We're excited to welcome you to {{address}}</p>
            </div>
          `,
          html_back: `
            <div class="back">
              <p>Contact your local realtor today!</p>
              <p>{{city}}, {{state}} {{zip}}</p>
            </div>
          `,
          css_styles: `
            .front, .back {
              padding: 0.25in;
              font-family: Arial, sans-serif;
            }
            h1 { color: #2c3e50; }
          `,
        },
        context
      );

      const templateId = uploadResult.data?.template_id;

      // Generate print-ready PDF
      const pdfResult = await executeGeneratePostcardPdf(
        {
          template_id: templateId,
          records: sampleRecords,
          output_format: 'print_ready',
          include_back: true,
          quality: 'high',
          bleed: true,
        },
        context
      );

      expect(pdfResult.success).toBe(true);
      expect(pdfResult.data?.files[0]).toContain('print-ready');
      expect(pdfResult.data?.page_count).toBe(10); // 5 records * 2 sides
    });
  });

  describe('template filtering and search', () => {
    it('filters templates by category and size', async () => {
      const context = createTestContext();

      // Create templates with different categories and sizes
      await executeUploadTemplate(
        { name: 'Realtor 4x6', category: 'realtor', size: '4x6', html_front: '<div>{{first_name}}</div>' },
        context
      );
      await executeUploadTemplate(
        { name: 'Realtor 6x9', category: 'realtor', size: '6x9', html_front: '<div>{{first_name}}</div>' },
        context
      );
      await executeUploadTemplate(
        { name: 'HVAC 4x6', category: 'hvac', size: '4x6', html_front: '<div>{{first_name}}</div>' },
        context
      );

      // Filter by category
      const realtorResult = await executeBrowseTemplates({ category: 'realtor' }, context);
      expect(realtorResult.data?.templates.length).toBe(2);
      expect(realtorResult.data?.templates.every((t) => t.category === 'realtor')).toBe(true);

      // Filter by size
      const size4x6Result = await executeBrowseTemplates({ size: '4x6' }, context);
      expect(size4x6Result.data?.templates.length).toBe(2);
      expect(size4x6Result.data?.templates.every((t) => t.size === '4x6')).toBe(true);

      // Filter by both
      const combinedResult = await executeBrowseTemplates(
        { category: 'realtor', size: '4x6' },
        context
      );
      expect(combinedResult.data?.templates.length).toBe(1);
    });

    it('searches templates by name', async () => {
      const context = createTestContext();

      await executeUploadTemplate(
        { name: 'Summer Sale Postcard', category: 'general', html_front: '<div>{{first_name}}</div>' },
        context
      );
      await executeUploadTemplate(
        { name: 'Winter Promo', category: 'general', html_front: '<div>{{first_name}}</div>' },
        context
      );

      const searchResult = await executeBrowseTemplates({ search: 'Summer' }, context);
      expect(searchResult.data?.templates.length).toBe(1);
      expect(searchResult.data?.templates[0].name).toContain('Summer');
    });
  });

  describe('merge field handling', () => {
    it('extracts and uses merge fields correctly', async () => {
      const context = createTestContext();

      // Upload template with multiple merge fields
      const uploadResult = await executeUploadTemplate(
        {
          name: 'Full Merge Test',
          html_front: `
            <div>
              <p>{{first_name}} {{last_name}}</p>
              <p>{{address}}</p>
              <p>{{city}}, {{state}} {{zip}}</p>
            </div>
          `,
        },
        context
      );

      expect(uploadResult.success).toBe(true);
      expect(uploadResult.data?.merge_fields).toContain('first_name');
      expect(uploadResult.data?.merge_fields).toContain('last_name');
      expect(uploadResult.data?.merge_fields).toContain('address');
      expect(uploadResult.data?.merge_fields).toContain('city');
      expect(uploadResult.data?.merge_fields).toContain('state');
      expect(uploadResult.data?.merge_fields).toContain('zip');

      // Generate PDF with records that have all merge fields
      const pdfResult = await executeGeneratePostcardPdf(
        {
          template_id: uploadResult.data?.template_id,
          records: sampleRecords,
          output_format: 'single_pdf',
          include_back: false,
          quality: 'standard',
        },
        context
      );

      expect(pdfResult.success).toBe(true);
    });
  });

  describe('usage tracking', () => {
    it('tracks PDF generation usage', async () => {
      const context = createTestContext();

      // Upload template
      const uploadResult = await executeUploadTemplate(
        { name: 'Usage Test', html_front: '<div>{{first_name}}</div>' },
        context
      );

      const templateId = uploadResult.data?.template_id;

      // Generate PDFs
      const pdfResult = await executeGeneratePostcardPdf(
        {
          template_id: templateId,
          records: sampleRecords,
          output_format: 'single_pdf',
          include_back: false,
          quality: 'standard',
        },
        context
      );

      expect(pdfResult.success).toBe(true);
      expect(pdfResult.usage?.estimatedCost).toBe(0.5); // 5 * $0.10

      // Verify usage record was created
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
  });
});
