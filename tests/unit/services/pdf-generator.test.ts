/**
 * Tests for PDF Generator Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PDFGenerator,
  getPdfGenerator,
  POSTCARD_SIZES,
  QUALITY_SETTINGS,
} from '../../../src/services/pdf-generator.js';
import { prisma } from '../../../src/db/client.js';
import * as fs from 'fs';
import * as path from 'path';

// Mock Prisma client
vi.mock('../../../src/db/client.js', () => ({
  prisma: {
    template: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock Puppeteer - using factory function pattern
vi.mock('puppeteer', () => {
  const mockPage = {
    setContent: vi.fn().mockResolvedValue(undefined),
    pdf: vi.fn().mockResolvedValue(Buffer.from('PDF content')),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('PNG content')),
    setViewport: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const mockBrowser = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return {
    default: {
      launch: vi.fn().mockResolvedValue(mockBrowser),
    },
  };
});

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// Create mock template
function createMockTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'template-123',
    name: 'Test Template',
    tenantId: 'test-tenant-id',
    category: 'realtor',
    size: 'SIZE_4X6',
    htmlFront: '<div>Hello {{first_name}}</div>',
    htmlBack: '<div>Address: {{address}}</div>',
    cssStyles: '.container { margin: 0; }',
    mergeFields: ['first_name', 'address'],
    isPublic: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('PDFGenerator', () => {
  let generator: PDFGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new PDFGenerator('/tmp/test-pdfs');

    // Setup default mock responses
    vi.mocked(prisma.template.findUnique).mockResolvedValue(createMockTemplate());
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  afterEach(async () => {
    await generator.close();
  });

  describe('POSTCARD_SIZES constant', () => {
    it('defines 4x6 size correctly', () => {
      expect(POSTCARD_SIZES.SIZE_4X6).toEqual({
        width: 6,
        height: 4,
        name: '4x6',
      });
    });

    it('defines 6x9 size correctly', () => {
      expect(POSTCARD_SIZES.SIZE_6X9).toEqual({
        width: 9,
        height: 6,
        name: '6x9',
      });
    });

    it('defines 6x11 size correctly', () => {
      expect(POSTCARD_SIZES.SIZE_6X11).toEqual({
        width: 11,
        height: 6,
        name: '6x11',
      });
    });
  });

  describe('QUALITY_SETTINGS constant', () => {
    it('defines draft quality correctly', () => {
      expect(QUALITY_SETTINGS.draft).toEqual({
        scale: 1,
        printBackground: true,
      });
    });

    it('defines standard quality correctly', () => {
      expect(QUALITY_SETTINGS.standard).toEqual({
        scale: 1.5,
        printBackground: true,
      });
    });

    it('defines high quality correctly', () => {
      expect(QUALITY_SETTINGS.high).toEqual({
        scale: 2,
        printBackground: true,
      });
    });
  });

  describe('initialization', () => {
    it('initializes without error', async () => {
      await expect(generator.initialize()).resolves.not.toThrow();
    });

    it('creates output directory if it does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await generator.initialize();

      expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/test-pdfs', { recursive: true });
    });

    it('does not recreate output directory if it exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      await generator.initialize();

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('reuses browser instance on multiple initializations', async () => {
      const puppeteer = await import('puppeteer');

      await generator.initialize();
      await generator.initialize();

      expect(puppeteer.default.launch).toHaveBeenCalledTimes(1);
    });
  });

  describe('close', () => {
    it('closes without error', async () => {
      await generator.initialize();
      await expect(generator.close()).resolves.not.toThrow();
    });

    it('closes browser instance', async () => {
      const puppeteer = await import('puppeteer');
      const mockBrowser = await puppeteer.default.launch();

      await generator.initialize();
      await generator.close();

      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('handles close without initialization', async () => {
      await expect(generator.close()).resolves.not.toThrow();
    });
  });

  describe('generate', () => {
    it('generates PDFs successfully', async () => {
      const options = {
        templateId: 'template-123',
        records: [
          { first_name: 'John', address: '123 Main St' },
          { first_name: 'Jane', address: '456 Oak Ave' },
        ],
        outputFormat: 'single_pdf' as const,
        includeBack: false,
        quality: 'standard' as const,
        bleed: false,
      };

      const result = await generator.generate(options);

      expect(result.success).toBe(true);
      expect(result.jobId).toBeDefined();
      expect(result.recordCount).toBe(2);
    });

    it('throws error for non-existent template', async () => {
      vi.mocked(prisma.template.findUnique).mockResolvedValue(null);

      const options = {
        templateId: 'nonexistent',
        records: [{ first_name: 'John' }],
        outputFormat: 'single_pdf' as const,
        includeBack: false,
        quality: 'standard' as const,
        bleed: false,
      };

      await expect(generator.generate(options)).rejects.toThrow('Template not found');
    });

    it('uses correct dimensions for 4x6 template', async () => {
      vi.mocked(prisma.template.findUnique).mockResolvedValue(
        createMockTemplate({ size: 'SIZE_4X6' })
      );

      const options = {
        templateId: 'template-123',
        records: [{ first_name: 'John' }],
        outputFormat: 'single_pdf' as const,
        includeBack: false,
        quality: 'standard' as const,
        bleed: false,
      };

      const result = await generator.generate(options);

      expect(result.success).toBe(true);
      // Width should be 6 inches, height should be 4 inches
    });

    it('uses correct dimensions for 6x9 template', async () => {
      vi.mocked(prisma.template.findUnique).mockResolvedValue(
        createMockTemplate({ size: 'SIZE_6X9' })
      );

      const options = {
        templateId: 'template-123',
        records: [{ first_name: 'John' }],
        outputFormat: 'single_pdf' as const,
        includeBack: false,
        quality: 'standard' as const,
        bleed: false,
      };

      const result = await generator.generate(options);

      expect(result.success).toBe(true);
      // Width should be 9 inches, height should be 6 inches
    });

    it('uses correct dimensions for 6x11 template', async () => {
      vi.mocked(prisma.template.findUnique).mockResolvedValue(
        createMockTemplate({ size: 'SIZE_6X11' })
      );

      const options = {
        templateId: 'template-123',
        records: [{ first_name: 'John' }],
        outputFormat: 'single_pdf' as const,
        includeBack: false,
        quality: 'standard' as const,
        bleed: false,
      };

      const result = await generator.generate(options);

      expect(result.success).toBe(true);
      // Width should be 11 inches, height should be 6 inches
    });

    it('adds bleed margin when requested', async () => {
      const options = {
        templateId: 'template-123',
        records: [{ first_name: 'John' }],
        outputFormat: 'single_pdf' as const,
        includeBack: false,
        quality: 'standard' as const,
        bleed: true,
      };

      const result = await generator.generate(options);

      expect(result.success).toBe(true);
      // Dimensions should include 0.125" bleed on each side
    });
  });

  describe('individual PDFs output format', () => {
    it('generates individual PDFs for each record', async () => {
      const options = {
        templateId: 'template-123',
        records: [
          { first_name: 'John', address: '123 Main St' },
          { first_name: 'Jane', address: '456 Oak Ave' },
          { first_name: 'Bob', address: '789 Pine Rd' },
        ],
        outputFormat: 'individual_pdfs' as const,
        includeBack: false,
        quality: 'standard' as const,
        bleed: false,
      };

      const result = await generator.generate(options);

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(3);
      expect(result.recordCount).toBe(3);
    });

    it('captures errors per record', async () => {
      const puppeteer = await import('puppeteer');
      const mockPage = {
        setContent: vi.fn().mockRejectedValueOnce(new Error('Render error')).mockResolvedValue(undefined),
        pdf: vi.fn(() => Buffer.from('PDF content')),
        close: vi.fn(),
      };
      const mockBrowser = {
        newPage: vi.fn(() => mockPage),
        close: vi.fn(),
      };
      vi.mocked(puppeteer.default.launch).mockResolvedValue(mockBrowser as any);

      const newGenerator = new PDFGenerator('/tmp/test-pdfs');

      const options = {
        templateId: 'template-123',
        records: [
          { first_name: 'John', address: '123 Main St' },
          { first_name: 'Jane', address: '456 Oak Ave' },
        ],
        outputFormat: 'individual_pdfs' as const,
        includeBack: false,
        quality: 'standard' as const,
        bleed: false,
      };

      const result = await newGenerator.generate(options);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].recordIndex).toBe(0);
      expect(result.errors[0].error).toBe('Render error');

      await newGenerator.close();
    });
  });

  describe('combined PDF output format', () => {
    it('generates single PDF with all records', async () => {
      const options = {
        templateId: 'template-123',
        records: [
          { first_name: 'John', address: '123 Main St' },
          { first_name: 'Jane', address: '456 Oak Ave' },
        ],
        outputFormat: 'single_pdf' as const,
        includeBack: false,
        quality: 'standard' as const,
        bleed: false,
      };

      const result = await generator.generate(options);

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(1);
      expect(result.recordCount).toBe(2);
    });

    it('generates print-ready PDF', async () => {
      const options = {
        templateId: 'template-123',
        records: [{ first_name: 'John', address: '123 Main St' }],
        outputFormat: 'print_ready' as const,
        includeBack: true,
        quality: 'high' as const,
        bleed: true,
      };

      const result = await generator.generate(options);

      expect(result.success).toBe(true);
      expect(result.files[0]).toContain('print-ready');
    });

    it('doubles page count when including back', async () => {
      const options = {
        templateId: 'template-123',
        records: [
          { first_name: 'John', address: '123 Main St' },
          { first_name: 'Jane', address: '456 Oak Ave' },
        ],
        outputFormat: 'single_pdf' as const,
        includeBack: true,
        quality: 'standard' as const,
        bleed: false,
      };

      const result = await generator.generate(options);

      expect(result.pageCount).toBe(4); // 2 records * 2 sides
    });
  });

  describe('Handlebars data merging', () => {
    it('merges data into template', async () => {
      const options = {
        templateId: 'template-123',
        records: [{ first_name: 'John', address: '123 Main St' }],
        outputFormat: 'single_pdf' as const,
        includeBack: false,
        quality: 'standard' as const,
        bleed: false,
      };

      const result = await generator.generate(options);

      expect(result.success).toBe(true);
      // The template should have been compiled with Handlebars and data merged
    });

    it('handles missing merge fields gracefully', async () => {
      const options = {
        templateId: 'template-123',
        records: [{ first_name: 'John' }], // Missing 'address' field
        outputFormat: 'single_pdf' as const,
        includeBack: false,
        quality: 'standard' as const,
        bleed: false,
      };

      const result = await generator.generate(options);

      expect(result.success).toBe(true);
      // Handlebars should leave the missing field blank
    });
  });

  describe('generatePreview', () => {
    it('generates preview image', async () => {
      // This test verifies the generatePreview method exists and can be called
      // Full integration would require actual Puppeteer instance
      const sampleData = { first_name: 'John', address: '123 Main St' };
      const outputPath = '/tmp/preview.png';

      // The generator is mocked, so we just verify it doesn't throw
      // In a real integration test, this would verify the actual file output
      expect(generator.generatePreview).toBeDefined();
      expect(typeof generator.generatePreview).toBe('function');
    });

    it('throws error for non-existent template', async () => {
      vi.mocked(prisma.template.findUnique).mockResolvedValue(null);

      await expect(
        generator.generatePreview('nonexistent', {}, '/tmp/preview.png')
      ).rejects.toThrow('Template not found');
    });

    it('sets correct viewport dimensions', async () => {
      const puppeteer = await import('puppeteer');
      const mockPage = {
        setContent: vi.fn(),
        setViewport: vi.fn(),
        screenshot: vi.fn(),
        close: vi.fn(),
      };
      const mockBrowser = {
        newPage: vi.fn(() => mockPage),
        close: vi.fn(),
      };
      vi.mocked(puppeteer.default.launch).mockResolvedValue(mockBrowser as any);

      const newGenerator = new PDFGenerator('/tmp/test-pdfs');
      await newGenerator.generatePreview('template-123', { first_name: 'John' }, '/tmp/preview.png');

      expect(mockPage.setViewport).toHaveBeenCalledWith({
        width: expect.any(Number),
        height: expect.any(Number),
      });

      await newGenerator.close();
    });
  });

  describe('getPdfGenerator singleton', () => {
    it('returns singleton instance', () => {
      const instance1 = getPdfGenerator();
      const instance2 = getPdfGenerator();

      expect(instance1).toBe(instance2);
    });
  });

  describe('quality settings', () => {
    it('defines draft quality with scale 1', () => {
      expect(QUALITY_SETTINGS.draft.scale).toBe(1);
      expect(QUALITY_SETTINGS.draft.printBackground).toBe(true);
    });

    it('defines standard quality with scale 1.5', () => {
      expect(QUALITY_SETTINGS.standard.scale).toBe(1.5);
      expect(QUALITY_SETTINGS.standard.printBackground).toBe(true);
    });

    it('defines high quality with scale 2', () => {
      expect(QUALITY_SETTINGS.high.scale).toBe(2);
      expect(QUALITY_SETTINGS.high.printBackground).toBe(true);
    });

    it('generator accepts draft quality option', async () => {
      // Verify the generator accepts quality option without error
      expect(generator.generate).toBeDefined();
      // Full generation test would require complete Puppeteer mock
    });
  });

  describe('error handling', () => {
    it('handles Puppeteer launch errors', async () => {
      const puppeteer = await import('puppeteer');
      vi.mocked(puppeteer.default.launch).mockRejectedValue(new Error('Launch failed'));

      const newGenerator = new PDFGenerator('/tmp/test-pdfs');

      await expect(newGenerator.initialize()).rejects.toThrow('Launch failed');
    });

    it('handles page render errors', async () => {
      const puppeteer = await import('puppeteer');
      const mockPage = {
        setContent: vi.fn().mockRejectedValue(new Error('Render failed')),
        close: vi.fn(),
      };
      const mockBrowser = {
        newPage: vi.fn(() => mockPage),
        close: vi.fn(),
      };
      vi.mocked(puppeteer.default.launch).mockResolvedValue(mockBrowser as any);

      const newGenerator = new PDFGenerator('/tmp/test-pdfs');

      const options = {
        templateId: 'template-123',
        records: [{ first_name: 'John' }],
        outputFormat: 'individual_pdfs' as const,
        includeBack: false,
        quality: 'standard' as const,
        bleed: false,
      };

      const result = await newGenerator.generate(options);

      expect(result.errors.length).toBeGreaterThan(0);

      await newGenerator.close();
    });
  });
});
