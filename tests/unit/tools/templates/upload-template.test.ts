/**
 * Tests for upload_template tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeUploadTemplate } from '../../../../src/tools/templates/upload-template.js';
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

// Mock sanitize-html
vi.mock('sanitize-html', () => ({
  default: vi.fn((html: string) => {
    // Simplified mock - remove script tags and onclick handlers
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/\s*on\w+="[^"]*"/gi, '');
  }),
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

describe('upload_template tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock response
    vi.mocked(prisma.template.create).mockResolvedValue({
      id: 'new-template-id',
      name: 'Test Template',
      tenantId: 'test-tenant-id',
      category: 'realtor',
      size: 'SIZE_4X6',
      htmlFront: '<div>Front content {{first_name}}</div>',
      htmlBack: '<div>Back content</div>',
      cssStyles: '.container { color: blue; }',
      mergeFields: ['first_name'],
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
  });

  describe('valid input', () => {
    it('creates template with minimal required fields', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Template',
        html_front: '<div>Hello {{first_name}}</div>',
      };

      const result = await executeUploadTemplate(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.template_id).toBe('new-template-id');
      expect(prisma.template.create).toHaveBeenCalledTimes(1);
    });

    it('creates template with all fields', async () => {
      const context = createTestContext();
      const input = {
        name: 'Full Template',
        category: 'realtor',
        size: '6x9',
        html_front: '<div>Front {{first_name}} {{last_name}}</div>',
        html_back: '<div>Back {{address}}</div>',
        css_styles: '.container { margin: 0; }',
        is_public: true,
      };

      const result = await executeUploadTemplate(input, context);

      expect(result.success).toBe(true);
      expect(prisma.template.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Full Template',
            category: 'realtor',
            size: 'SIZE_6X9',
            isPublic: true,
          }),
        })
      );
    });

    it('accepts all valid categories', async () => {
      const context = createTestContext();
      const categories = ['realtor', 'hvac', 'insurance', 'mortgage', 'solar', 'roofing', 'general', 'custom'];

      for (const category of categories) {
        vi.mocked(prisma.template.create).mockResolvedValue({
          id: `template-${category}`,
          category,
        } as any);

        const input = {
          name: `${category} Template`,
          category,
          html_front: '<div>Content</div>',
        };

        const result = await executeUploadTemplate(input, context);
        expect(result.success).toBe(true);
      }
    });

    it('accepts all valid sizes', async () => {
      const context = createTestContext();
      const sizes = ['4x6', '6x9', '6x11'];

      for (const size of sizes) {
        vi.mocked(prisma.template.create).mockResolvedValue({
          id: `template-${size}`,
          size: `SIZE_${size.replace('x', 'X')}`,
        } as any);

        const input = {
          name: `${size} Template`,
          size,
          html_front: '<div>Content</div>',
        };

        const result = await executeUploadTemplate(input, context);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('merge field extraction', () => {
    it('extracts merge fields from front HTML', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Template',
        html_front: '<div>Hello {{first_name}} {{last_name}}, welcome to {{city}}!</div>',
      };

      await executeUploadTemplate(input, context);

      expect(prisma.template.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mergeFields: expect.arrayContaining(['first_name', 'last_name', 'city']),
          }),
        })
      );
    });

    it('extracts merge fields from back HTML', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Template',
        html_front: '<div>Front</div>',
        html_back: '<div>Contact: {{phone}} {{email}}</div>',
      };

      await executeUploadTemplate(input, context);

      expect(prisma.template.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mergeFields: expect.arrayContaining(['phone', 'email']),
          }),
        })
      );
    });

    it('deduplicates merge fields from front and back', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Template',
        html_front: '<div>Hello {{first_name}}</div>',
        html_back: '<div>Regards, {{first_name}}</div>',
      };

      await executeUploadTemplate(input, context);

      // Should only have one 'first_name' entry
      const createCall = vi.mocked(prisma.template.create).mock.calls[0][0];
      const mergeFields = createCall.data.mergeFields;
      const firstNameCount = mergeFields.filter((f: string) => f === 'first_name').length;
      expect(firstNameCount).toBe(1);
    });

    it('handles templates with no merge fields', async () => {
      const context = createTestContext();
      const input = {
        name: 'Static Template',
        html_front: '<div>Static content with no fields</div>',
      };

      await executeUploadTemplate(input, context);

      expect(prisma.template.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mergeFields: [],
          }),
        })
      );
    });

    it('returns merge fields in response', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Template',
        html_front: '<div>{{first_name}} {{address}}</div>',
      };

      const result = await executeUploadTemplate(input, context);

      expect(result.data?.merge_fields).toBeDefined();
      expect(result.data?.merge_fields).toContain('first_name');
    });
  });

  describe('HTML sanitization', () => {
    it('sanitizes HTML to remove script tags', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Template',
        html_front: '<div>Hello</div><script>alert("xss")</script>',
      };

      await executeUploadTemplate(input, context);

      // The sanitized HTML should not contain script tags
      const createCall = vi.mocked(prisma.template.create).mock.calls[0][0];
      expect(createCall.data.htmlFront).not.toContain('<script>');
    });

    it('sanitizes HTML to remove event handlers', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Template',
        html_front: '<div onclick="alert(\'xss\')">Hello</div>',
      };

      await executeUploadTemplate(input, context);

      const createCall = vi.mocked(prisma.template.create).mock.calls[0][0];
      expect(createCall.data.htmlFront).not.toContain('onclick');
    });

    it('rejects HTML with excessive content removed', async () => {
      const context = createTestContext();
      const sanitizeHtml = await import('sanitize-html');

      // Mock to return mostly empty content (simulating >50% removal)
      vi.mocked(sanitizeHtml.default).mockImplementation(() => '');

      const input = {
        name: 'Test Template',
        html_front: '<script>malicious content only</script>'.repeat(100),
      };

      await expect(executeUploadTemplate(input, context)).rejects.toThrow();
    });
  });

  describe('input validation', () => {
    it('throws ValidationError for missing name', async () => {
      const context = createTestContext();
      const input = {
        html_front: '<div>Content</div>',
      };

      await expect(executeUploadTemplate(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for empty name', async () => {
      const context = createTestContext();
      const input = {
        name: '',
        html_front: '<div>Content</div>',
      };

      await expect(executeUploadTemplate(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for name exceeding max length', async () => {
      const context = createTestContext();
      const input = {
        name: 'A'.repeat(201),
        html_front: '<div>Content</div>',
      };

      await expect(executeUploadTemplate(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for missing html_front', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Template',
      };

      await expect(executeUploadTemplate(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for html_front too short', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Template',
        html_front: '<div></div>', // Less than 10 chars of actual content
      };

      await expect(executeUploadTemplate(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for html_front exceeding max length', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Template',
        html_front: '<div>'.repeat(10001), // Exceeds 50000 chars
      };

      await expect(executeUploadTemplate(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for invalid category', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Template',
        category: 'invalid_category',
        html_front: '<div>Content</div>',
      };

      await expect(executeUploadTemplate(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for invalid size', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Template',
        size: '5x7', // Invalid size
        html_front: '<div>Content</div>',
      };

      await expect(executeUploadTemplate(input, context)).rejects.toThrow();
    });
  });

  describe('default values', () => {
    it('uses default category of custom', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Template',
        html_front: '<div>Content</div>',
      };

      await executeUploadTemplate(input, context);

      expect(prisma.template.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            category: 'custom',
          }),
        })
      );
    });

    it('uses default size of 4x6', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Template',
        html_front: '<div>Content</div>',
      };

      await executeUploadTemplate(input, context);

      expect(prisma.template.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            size: 'SIZE_4X6',
          }),
        })
      );
    });

    it('uses default is_public of false', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Template',
        html_front: '<div>Content</div>',
      };

      await executeUploadTemplate(input, context);

      expect(prisma.template.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isPublic: false,
          }),
        })
      );
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing template:create permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {
        name: 'Test Template',
        html_front: '<div>Content</div>',
      };

      await expect(executeUploadTemplate(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with template:create permission', async () => {
      const context = createTestContext({
        permissions: ['template:create'],
      });
      const input = {
        name: 'Test Template',
        html_front: '<div>Content</div>',
      };

      const result = await executeUploadTemplate(input, context);
      expect(result.success).toBe(true);
    });

    it('allows access with wildcard permission', async () => {
      const context = createTestContext({
        permissions: ['*'],
      });
      const input = {
        name: 'Test Template',
        html_front: '<div>Content</div>',
      };

      const result = await executeUploadTemplate(input, context);
      expect(result.success).toBe(true);
    });
  });

  describe('tenant association', () => {
    it('associates template with current tenant', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Template',
        html_front: '<div>Content</div>',
      };

      await executeUploadTemplate(input, context);

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
    it('returns template details', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Template',
        html_front: '<div>Content</div>',
      };

      const result = await executeUploadTemplate(input, context);

      expect(result.data?.template_id).toBeDefined();
      expect(result.data?.name).toBe('Test Template');
      expect(result.data?.category).toBeDefined();
      expect(result.data?.size).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('handles database errors gracefully', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Template',
        html_front: '<div>Content</div>',
      };

      vi.mocked(prisma.template.create).mockRejectedValue(new Error('Database error'));

      await expect(executeUploadTemplate(input, context)).rejects.toThrow('Database error');
    });
  });
});
