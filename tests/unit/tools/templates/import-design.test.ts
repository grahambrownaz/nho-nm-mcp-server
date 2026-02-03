/**
 * Tests for import_design tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeImportDesign } from '../../../../src/tools/templates/import-design.js';
import { prisma } from '../../../../src/db/client.js';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { ValidationError, AuthorizationError } from '../../../../src/utils/errors.js';

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    template: {
      create: vi.fn(),
    },
  },
}));

// Mock fetch for URL imports
global.fetch = vi.fn();

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

describe('import_design tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock response
    vi.mocked(prisma.template.create).mockResolvedValue({
      id: 'imported-template-id',
      name: 'Imported Template',
      tenantId: 'test-tenant-id',
      category: 'custom',
      size: 'SIZE_4X6',
      htmlFront: '<div>Imported content</div>',
      htmlBack: null,
      cssStyles: null,
      mergeFields: [],
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
  });

  describe('HTML source import', () => {
    it('imports template from HTML content', async () => {
      const context = createTestContext();
      const input = {
        source: 'html',
        name: 'HTML Import',
        html_content: '<div style="color: blue;">Hello {{first_name}}</div>',
      };

      const result = await executeImportDesign(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.template_id).toBe('imported-template-id');
      expect(prisma.template.create).toHaveBeenCalledTimes(1);
    });

    it('extracts inline styles when extract_styles is true', async () => {
      const context = createTestContext();
      const input = {
        source: 'html',
        name: 'HTML Import',
        html_content: '<div style="color: blue; font-size: 14px;">Content</div>',
        extract_styles: true,
      };

      await executeImportDesign(input, context);

      expect(prisma.template.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cssStyles: expect.any(String),
          }),
        })
      );
    });

    it('preserves inline styles when extract_styles is false', async () => {
      const context = createTestContext();
      const input = {
        source: 'html',
        name: 'HTML Import',
        html_content: '<div style="color: blue;">Content</div>',
        extract_styles: false,
      };

      await executeImportDesign(input, context);

      const createCall = vi.mocked(prisma.template.create).mock.calls[0][0];
      expect(createCall.data.htmlFront).toContain('style=');
    });

    it('throws ValidationError when html_content is missing for html source', async () => {
      const context = createTestContext();
      const input = {
        source: 'html',
        name: 'HTML Import',
      };

      await expect(executeImportDesign(input, context)).rejects.toThrow();
    });
  });

  describe('email source import', () => {
    it('imports template from email HTML', async () => {
      const context = createTestContext();
      const input = {
        source: 'email',
        name: 'Email Import',
        email_html: '<html><body><div>Email content {{first_name}}</div></body></html>',
      };

      const result = await executeImportDesign(input, context);

      expect(result.success).toBe(true);
      expect(prisma.template.create).toHaveBeenCalledTimes(1);
    });

    it('removes tracking pixels from email HTML', async () => {
      const context = createTestContext();
      const input = {
        source: 'email',
        name: 'Email Import',
        email_html: '<div>Content<img src="https://track.example.com/pixel.gif" width="1" height="1"/></div>',
      };

      await executeImportDesign(input, context);

      const createCall = vi.mocked(prisma.template.create).mock.calls[0][0];
      // Tracking pixel should be removed
      expect(createCall.data.htmlFront).not.toContain('track.example.com');
    });

    it('removes unsubscribe links from email HTML', async () => {
      const context = createTestContext();
      const input = {
        source: 'email',
        name: 'Email Import',
        email_html: '<div>Content<a href="https://unsubscribe.example.com">Unsubscribe</a></div>',
      };

      await executeImportDesign(input, context);

      const createCall = vi.mocked(prisma.template.create).mock.calls[0][0];
      // Unsubscribe link should be removed
      expect(createCall.data.htmlFront).not.toContain('Unsubscribe');
    });

    it('throws ValidationError when email_html is missing for email source', async () => {
      const context = createTestContext();
      const input = {
        source: 'email',
        name: 'Email Import',
      };

      await expect(executeImportDesign(input, context)).rejects.toThrow();
    });
  });

  describe('URL source import', () => {
    it('imports template from URL', async () => {
      const context = createTestContext();
      const input = {
        source: 'url',
        name: 'URL Import',
        url: 'https://example.com/template.html',
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<div>Remote content {{first_name}}</div>'),
      } as Response);

      const result = await executeImportDesign(input, context);

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/template.html');
    });

    it('throws error when URL fetch fails', async () => {
      const context = createTestContext();
      const input = {
        source: 'url',
        name: 'URL Import',
        url: 'https://example.com/template.html',
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      await expect(executeImportDesign(input, context)).rejects.toThrow();
    });

    it('throws ValidationError when url is missing for url source', async () => {
      const context = createTestContext();
      const input = {
        source: 'url',
        name: 'URL Import',
      };

      await expect(executeImportDesign(input, context)).rejects.toThrow();
    });

    it('validates URL format', async () => {
      const context = createTestContext();
      const input = {
        source: 'url',
        name: 'URL Import',
        url: 'not-a-valid-url',
      };

      await expect(executeImportDesign(input, context)).rejects.toThrow();
    });
  });

  describe('Canva source import', () => {
    it('imports template from Canva export URL', async () => {
      const context = createTestContext();
      const input = {
        source: 'canva',
        name: 'Canva Import',
        canva_export_url: 'https://www.canva.com/design/ABC123/export',
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<div>Canva design content</div>'),
      } as Response);

      const result = await executeImportDesign(input, context);

      expect(result.success).toBe(true);
    });

    it('throws ValidationError when canva_export_url is missing for canva source', async () => {
      const context = createTestContext();
      const input = {
        source: 'canva',
        name: 'Canva Import',
      };

      await expect(executeImportDesign(input, context)).rejects.toThrow();
    });
  });

  describe('size configuration', () => {
    it('uses default size of 4x6', async () => {
      const context = createTestContext();
      const input = {
        source: 'html',
        name: 'HTML Import',
        html_content: '<div>Content</div>',
      };

      await executeImportDesign(input, context);

      expect(prisma.template.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            size: 'SIZE_4X6',
          }),
        })
      );
    });

    it('accepts 6x9 size', async () => {
      const context = createTestContext();
      const input = {
        source: 'html',
        name: 'HTML Import',
        html_content: '<div>Content</div>',
        size: '6x9',
      };

      await executeImportDesign(input, context);

      expect(prisma.template.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            size: 'SIZE_6X9',
          }),
        })
      );
    });

    it('accepts 6x11 size', async () => {
      const context = createTestContext();
      const input = {
        source: 'html',
        name: 'HTML Import',
        html_content: '<div>Content</div>',
        size: '6x11',
      };

      await executeImportDesign(input, context);

      expect(prisma.template.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            size: 'SIZE_6X11',
          }),
        })
      );
    });
  });

  describe('merge field extraction', () => {
    it('extracts merge fields from imported HTML', async () => {
      const context = createTestContext();
      const input = {
        source: 'html',
        name: 'HTML Import',
        html_content: '<div>Hello {{first_name}} {{last_name}}, welcome to {{city}}!</div>',
      };

      await executeImportDesign(input, context);

      expect(prisma.template.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mergeFields: expect.arrayContaining(['first_name', 'last_name', 'city']),
          }),
        })
      );
    });

    it('returns extracted merge fields in response', async () => {
      const context = createTestContext();
      const input = {
        source: 'html',
        name: 'HTML Import',
        html_content: '<div>{{first_name}} {{address}}</div>',
      };

      const result = await executeImportDesign(input, context);

      expect(result.data?.merge_fields).toBeDefined();
    });
  });

  describe('input validation', () => {
    it('throws ValidationError for missing source', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Import',
        html_content: '<div>Content</div>',
      };

      await expect(executeImportDesign(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for invalid source', async () => {
      const context = createTestContext();
      const input = {
        source: 'invalid_source',
        name: 'Test Import',
        html_content: '<div>Content</div>',
      };

      await expect(executeImportDesign(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for missing name', async () => {
      const context = createTestContext();
      const input = {
        source: 'html',
        html_content: '<div>Content</div>',
      };

      await expect(executeImportDesign(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for name exceeding max length', async () => {
      const context = createTestContext();
      const input = {
        source: 'html',
        name: 'A'.repeat(201),
        html_content: '<div>Content</div>',
      };

      await expect(executeImportDesign(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for invalid size', async () => {
      const context = createTestContext();
      const input = {
        source: 'html',
        name: 'Test Import',
        html_content: '<div>Content</div>',
        size: '5x7', // Invalid size
      };

      await expect(executeImportDesign(input, context)).rejects.toThrow();
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing template:create permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {
        source: 'html',
        name: 'Test Import',
        html_content: '<div>Content</div>',
      };

      await expect(executeImportDesign(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with template:create permission', async () => {
      const context = createTestContext({
        permissions: ['template:create'],
      });
      const input = {
        source: 'html',
        name: 'Test Import',
        html_content: '<div>Content</div>',
      };

      const result = await executeImportDesign(input, context);
      expect(result.success).toBe(true);
    });

    it('allows access with wildcard permission', async () => {
      const context = createTestContext({
        permissions: ['*'],
      });
      const input = {
        source: 'html',
        name: 'Test Import',
        html_content: '<div>Content</div>',
      };

      const result = await executeImportDesign(input, context);
      expect(result.success).toBe(true);
    });
  });

  describe('tenant association', () => {
    it('associates imported template with current tenant', async () => {
      const context = createTestContext();
      const input = {
        source: 'html',
        name: 'Test Import',
        html_content: '<div>Content</div>',
      };

      await executeImportDesign(input, context);

      expect(prisma.template.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'test-tenant-id',
          }),
        })
      );
    });
  });

  describe('response format', () => {
    it('returns import details', async () => {
      const context = createTestContext();
      const input = {
        source: 'html',
        name: 'Test Import',
        html_content: '<div>Content</div>',
      };

      const result = await executeImportDesign(input, context);

      expect(result.data?.template_id).toBeDefined();
      expect(result.data?.name).toBe('Test Import');
      expect(result.data?.source).toBe('html');
      expect(result.data?.size).toBeDefined();
    });

    it('includes style extraction status', async () => {
      const context = createTestContext();
      const input = {
        source: 'html',
        name: 'Test Import',
        html_content: '<div style="color: blue;">Content</div>',
        extract_styles: true,
      };

      const result = await executeImportDesign(input, context);

      expect(result.data?.styles_extracted).toBe(true);
    });
  });

  describe('error handling', () => {
    it('handles database errors gracefully', async () => {
      const context = createTestContext();
      const input = {
        source: 'html',
        name: 'Test Import',
        html_content: '<div>Content</div>',
      };

      vi.mocked(prisma.template.create).mockRejectedValue(new Error('Database error'));

      await expect(executeImportDesign(input, context)).rejects.toThrow('Database error');
    });

    it('handles network errors for URL import', async () => {
      const context = createTestContext();
      const input = {
        source: 'url',
        name: 'URL Import',
        url: 'https://example.com/template.html',
      };

      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

      await expect(executeImportDesign(input, context)).rejects.toThrow('Network error');
    });
  });
});
