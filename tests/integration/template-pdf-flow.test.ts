/**
 * Integration tests for template and PDF generation flow
 * Tests the complete flow from template upload to PDF generation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeUploadTemplate } from '../../src/tools/templates/upload-template.js';
import { executeBrowseTemplates } from '../../src/tools/templates/browse-templates.js';
import { executeImportDesign } from '../../src/tools/templates/import-design.js';
import { executeGeneratePostcardPdf } from '../../src/tools/templates/generate-postcard-pdf.js';
import { prisma } from '../../src/db/client.js';
import type { TenantContext } from '../../src/utils/auth.js';

// In-memory store for templates
const templates = new Map<string, any>();

// Helper to generate UUID
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Mock Prisma client with connected behavior
vi.mock('../../src/db/client.js', () => ({
  prisma: {
    template: {
      create: vi.fn((args: any) => {
        // Generate a proper UUID for the template ID
        const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
        const template = {
          id,
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
          thumbnailUrl: null,
          previewPdfUrl: null,
          _count: { dataSubscriptions: 0 },
        };
        templates.set(template.id, template);
        return Promise.resolve(template);
      }),
      findUnique: vi.fn((args: any) => {
        const template = templates.get(args.where.id);
        if (template) {
          return Promise.resolve({ ...template, _count: { dataSubscriptions: 0 } });
        }
        return Promise.resolve(null);
      }),
      findFirst: vi.fn((args: any) => {
        const template = templates.get(args.where.id);
        if (template) {
          return Promise.resolve({ ...template, _count: { dataSubscriptions: 0 } });
        }
        return Promise.resolve(null);
      }),
      findMany: vi.fn((args: any) => {
        const results = Array.from(templates.values()).filter((t: any) => {
          if (args.where?.OR) {
            return args.where.OR.some((condition: any) => {
              if (condition.tenantId) return t.tenantId === condition.tenantId;
              if (condition.isPublic) return t.isPublic === condition.isPublic;
              return false;
            });
          }
          if (args.where?.tenantId) {
            return t.tenantId === args.where.tenantId;
          }
          return true;
        }).map(t => ({ ...t, _count: { dataSubscriptions: 0 } }));
        return Promise.resolve(results);
      }),
      count: vi.fn(() => Promise.resolve(templates.size)),
      groupBy: vi.fn((args: any) => {
        const groups = new Map<string, number>();
        for (const template of templates.values()) {
          const key = template.category;
          groups.set(key, (groups.get(key) || 0) + 1);
        }
        return Promise.resolve(
          Array.from(groups.entries()).map(([category, count]) => ({
            category,
            _count: { category: count },
          }))
        );
      }),
    },
    usageRecord: {
      create: vi.fn(() => Promise.resolve({ id: 'usage-1' })),
    },
  },
}));

// Mock sanitize-html
vi.mock('sanitize-html', () => ({
  default: vi.fn((html: string) => html),
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
    it('uploads template and verifies it appears in browse', async () => {
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
      expect(uploadResult.data?.template.id).toBeDefined();

      // Step 2: Verify template appears in browse
      const browseResult = await executeBrowseTemplates({}, context);

      expect(browseResult.success).toBe(true);
      expect(browseResult.data?.templates.length).toBeGreaterThan(0);
    });

    it('imports design from HTML', async () => {
      const context = createTestContext();

      // Import design from HTML
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
      expect(importResult.data?.template.id).toBeDefined();
    });
  });

  describe('multiple templates and batch operations', () => {
    it('creates multiple templates and lists them', async () => {
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

      for (const config of templateConfigs) {
        const result = await executeUploadTemplate(
          {
            ...config,
            size: '4x6',
          },
          context
        );

        expect(result.success).toBe(true);
      }

      // Verify all templates in browse
      const browseResult = await executeBrowseTemplates({}, context);
      expect(browseResult.data?.templates).toHaveLength(3);
    });
  });

  describe('template size variations', () => {
    it('creates templates with different sizes', async () => {
      const context = createTestContext();
      const sizes = ['4x6', '6x9', '6x11'] as const;

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
        expect(uploadResult.data?.template.size).toBe(size);
      }
    });
  });

  describe('PDF generation', () => {
    it('generates PDFs from template with records', async () => {
      const context = createTestContext();

      // Upload template first
      const uploadResult = await executeUploadTemplate(
        {
          name: 'PDF Test Template',
          html_front: `<div>Hello {{first_name}} {{last_name}}</div>`,
        },
        context
      );

      expect(uploadResult.success).toBe(true);
      const templateId = uploadResult.data?.template.id;

      // Generate PDF
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
      expect(pdfResult.data?.job.recordCount).toBe(5);
    });

    it('calculates correct page count with back included', async () => {
      const context = createTestContext();

      // Upload template with back
      const uploadResult = await executeUploadTemplate(
        {
          name: 'Two-Sided Template',
          html_front: `<div>Front: {{first_name}}</div>`,
          html_back: `<div>Back: {{address}}</div>`,
        },
        context
      );

      const templateId = uploadResult.data?.template.id;

      // Generate PDF with back included
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
      // With back included, page count should be records * 2
      expect(pdfResult.data?.job.estimatedPages).toBe(10);
    });

    it('generates individual PDFs when requested', async () => {
      const context = createTestContext();

      const uploadResult = await executeUploadTemplate(
        {
          name: 'Individual PDF Template',
          html_front: `<div>{{first_name}} {{last_name}}</div>`,
        },
        context
      );

      const templateId = uploadResult.data?.template.id;

      const pdfResult = await executeGeneratePostcardPdf(
        {
          template_id: templateId,
          records: sampleRecords.slice(0, 3),
          output_format: 'individual_pdfs',
          include_back: false,
          quality: 'draft',
        },
        context
      );

      expect(pdfResult.success).toBe(true);
      expect(pdfResult.data?.download.urls).toHaveLength(3);
    });
  });

  describe('merge field handling', () => {
    it('extracts merge fields from template', async () => {
      const context = createTestContext();

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
      expect(uploadResult.data?.template.mergeFields).toContain('first_name');
      expect(uploadResult.data?.template.mergeFields).toContain('last_name');
      expect(uploadResult.data?.template.mergeFields).toContain('address');
      expect(uploadResult.data?.template.mergeFields).toContain('city');
      expect(uploadResult.data?.template.mergeFields).toContain('state');
      expect(uploadResult.data?.template.mergeFields).toContain('zip');
    });
  });

  describe('usage tracking', () => {
    it('creates usage record for PDF generation', async () => {
      const context = createTestContext();

      const uploadResult = await executeUploadTemplate(
        { name: 'Usage Test', html_front: '<div>{{first_name}}</div>' },
        context
      );

      const templateId = uploadResult.data?.template.id;

      await executeGeneratePostcardPdf(
        {
          template_id: templateId,
          records: sampleRecords,
          output_format: 'single_pdf',
          include_back: false,
          quality: 'standard',
        },
        context
      );

      expect(prisma.usageRecord.create).toHaveBeenCalled();
    });

    it('calculates costs correctly', async () => {
      const context = createTestContext();

      const uploadResult = await executeUploadTemplate(
        { name: 'Cost Test', html_front: '<div>{{first_name}}</div>' },
        context
      );

      const templateId = uploadResult.data?.template.id;

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
      // 5 records * $0.10 per PDF = $0.50
      expect(pdfResult.data?.costs.pdfCost).toBe(0.5);
    });
  });

  describe('template visibility', () => {
    it('creates private template by default', async () => {
      const context = createTestContext();

      const uploadResult = await executeUploadTemplate(
        {
          name: 'Private Template',
          html_front: '<div>{{first_name}}</div>',
        },
        context
      );

      expect(uploadResult.success).toBe(true);
      expect(uploadResult.data?.template.isPublic).toBe(false);
    });

    it('creates public template when requested', async () => {
      const context = createTestContext();

      const uploadResult = await executeUploadTemplate(
        {
          name: 'Public Template',
          html_front: '<div>{{first_name}}</div>',
          is_public: true,
        },
        context
      );

      expect(uploadResult.success).toBe(true);
      expect(uploadResult.data?.template.isPublic).toBe(true);
    });
  });

  describe('template categories', () => {
    it('assigns correct category to template', async () => {
      const context = createTestContext();

      const categories = ['realtor', 'hvac', 'insurance', 'landscaping', 'home_services', 'retail', 'general'] as const;

      for (const category of categories) {
        const uploadResult = await executeUploadTemplate(
          {
            name: `${category} Template`,
            category,
            html_front: '<div>{{first_name}}</div>',
          },
          context
        );

        expect(uploadResult.success).toBe(true);
        expect(uploadResult.data?.template.category).toBe(category);
      }
    });
  });
});
