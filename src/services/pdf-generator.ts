/**
 * PDF Generation Service
 * Uses Puppeteer to render HTML templates into print-ready PDFs
 */

import puppeteer, { Browser, PDFOptions } from 'puppeteer';
import Handlebars from 'handlebars';
import { prisma } from '../db/client.js';
import { v4 as uuid } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Postcard dimensions in inches
 */
export const POSTCARD_SIZES = {
  SIZE_4X6: { width: 6, height: 4, name: '4x6' },
  SIZE_6X9: { width: 9, height: 6, name: '6x9' },
  SIZE_6X11: { width: 11, height: 6, name: '6x11' },
} as const;

/**
 * PDF quality settings
 */
export const QUALITY_SETTINGS = {
  draft: { scale: 1, printBackground: true },
  standard: { scale: 1.5, printBackground: true },
  high: { scale: 2, printBackground: true },
} as const;

/**
 * Bleed settings (additional margin for trimming)
 */
const BLEED_MARGIN = 0.125; // 1/8 inch bleed

/**
 * PDF generation options
 */
export interface PdfGenerationOptions {
  templateId: string;
  records: Array<Record<string, unknown>>;
  outputFormat: 'single_pdf' | 'individual_pdfs' | 'print_ready';
  includeBack: boolean;
  quality: 'draft' | 'standard' | 'high';
  bleed: boolean;
  outputDir?: string;
}

/**
 * PDF generation result
 */
export interface PdfGenerationResult {
  success: boolean;
  jobId: string;
  files: string[];
  recordCount: number;
  pageCount: number;
  errors: Array<{ recordIndex: number; error: string }>;
}

/**
 * PDFGenerator class
 * Manages Puppeteer browser instance and generates PDFs
 */
export class PDFGenerator {
  private browser: Browser | null = null;
  private outputDir: string;

  constructor(outputDir?: string) {
    this.outputDir = outputDir || path.join(process.cwd(), 'generated-pdfs');
  }

  /**
   * Initialize the browser instance
   */
  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
        ],
      });
    }

    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Close the browser instance
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Generate PDFs from a template and records
   */
  async generate(options: PdfGenerationOptions): Promise<PdfGenerationResult> {
    await this.initialize();

    const jobId = uuid();
    const files: string[] = [];
    const errors: Array<{ recordIndex: number; error: string }> = [];
    let pageCount = 0;

    // Fetch template
    const template = await prisma.template.findUnique({
      where: { id: options.templateId },
    });

    if (!template) {
      throw new Error(`Template not found: ${options.templateId}`);
    }

    // Get dimensions
    const size = POSTCARD_SIZES[template.size as keyof typeof POSTCARD_SIZES] || POSTCARD_SIZES.SIZE_4X6;
    const quality = QUALITY_SETTINGS[options.quality] || QUALITY_SETTINGS.standard;

    // Calculate dimensions with optional bleed
    const width = size.width + (options.bleed ? BLEED_MARGIN * 2 : 0);
    const height = size.height + (options.bleed ? BLEED_MARGIN * 2 : 0);

    // Compile Handlebars templates
    const frontTemplate = Handlebars.compile(template.htmlFront);
    const backTemplate = template.htmlBack ? Handlebars.compile(template.htmlBack) : null;

    // Create job output directory
    const jobDir = path.join(this.outputDir, jobId);
    fs.mkdirSync(jobDir, { recursive: true });

    // Generate PDFs based on output format
    if (options.outputFormat === 'individual_pdfs') {
      // Generate individual PDFs for each record
      for (let i = 0; i < options.records.length; i++) {
        try {
          const record = options.records[i];
          const filename = `postcard-${i + 1}.pdf`;
          const filepath = path.join(jobDir, filename);

          await this.generateSinglePostcard(
            frontTemplate,
            backTemplate,
            record,
            filepath,
            { width, height, quality, includeBack: options.includeBack, bleed: options.bleed, css: template.cssStyles }
          );

          files.push(filepath);
          pageCount += options.includeBack && backTemplate ? 2 : 1;
        } catch (error) {
          errors.push({
            recordIndex: i,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    } else {
      // Generate single combined PDF or print-ready PDF
      const filename = options.outputFormat === 'print_ready' ? 'postcards-print-ready.pdf' : 'postcards.pdf';
      const filepath = path.join(jobDir, filename);

      const result = await this.generateCombinedPdf(
        frontTemplate,
        backTemplate,
        options.records,
        filepath,
        { width, height, quality, includeBack: options.includeBack, bleed: options.bleed, css: template.cssStyles, printReady: options.outputFormat === 'print_ready' }
      );

      files.push(filepath);
      pageCount = result.pageCount;
      errors.push(...result.errors);
    }

    return {
      success: errors.length === 0,
      jobId,
      files,
      recordCount: options.records.length,
      pageCount,
      errors,
    };
  }

  /**
   * Generate a single postcard PDF
   */
  private async generateSinglePostcard(
    frontTemplate: Handlebars.TemplateDelegate,
    backTemplate: Handlebars.TemplateDelegate | null,
    record: Record<string, unknown>,
    filepath: string,
    options: {
      width: number;
      height: number;
      quality: { scale: number; printBackground: boolean };
      includeBack: boolean;
      bleed: boolean;
      css: string | null;
    }
  ): Promise<void> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const page = await this.browser.newPage();

    try {
      // Render front
      const frontHtml = this.wrapHtml(frontTemplate(record), options);
      await page.setContent(frontHtml, { waitUntil: 'networkidle0' });

      const pdfOptions: PDFOptions = {
        width: `${options.width}in`,
        height: `${options.height}in`,
        printBackground: options.quality.printBackground,
        scale: options.quality.scale,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      };

      if (options.includeBack && backTemplate) {
        // For front + back, we need to create a multi-page PDF
        const frontBuffer = await page.pdf(pdfOptions);

        // Render back
        const backHtml = this.wrapHtml(backTemplate(record), options);
        await page.setContent(backHtml, { waitUntil: 'networkidle0' });
        // TODO: Combine front and back PDFs using pdf-lib
        // For now, render back but don't use it; in production would merge PDFs
        await page.pdf(pdfOptions);

        // Combine PDFs (simplified - in production use pdf-lib)
        // For now, just save front; in real implementation would merge
        fs.writeFileSync(filepath, frontBuffer);
      } else {
        // Just front
        await page.pdf({ ...pdfOptions, path: filepath });
      }
    } finally {
      await page.close();
    }
  }

  /**
   * Generate a combined PDF with all postcards
   */
  private async generateCombinedPdf(
    frontTemplate: Handlebars.TemplateDelegate,
    backTemplate: Handlebars.TemplateDelegate | null,
    records: Array<Record<string, unknown>>,
    filepath: string,
    options: {
      width: number;
      height: number;
      quality: { scale: number; printBackground: boolean };
      includeBack: boolean;
      bleed: boolean;
      css: string | null;
      printReady: boolean;
    }
  ): Promise<{ pageCount: number; errors: Array<{ recordIndex: number; error: string }> }> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const errors: Array<{ recordIndex: number; error: string }> = [];
    let pageCount = 0;

    // Build combined HTML with page breaks
    let combinedHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          @page {
            size: ${options.width}in ${options.height}in;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
          }
          .postcard-page {
            width: ${options.width}in;
            height: ${options.height}in;
            page-break-after: always;
            overflow: hidden;
            position: relative;
          }
          .postcard-page:last-child {
            page-break-after: avoid;
          }
          ${options.bleed ? `
          .bleed-marks {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            pointer-events: none;
          }
          .bleed-marks::before,
          .bleed-marks::after {
            content: '';
            position: absolute;
            background: #000;
          }
          ` : ''}
          ${options.css || ''}
        </style>
      </head>
      <body>
    `;

    for (let i = 0; i < records.length; i++) {
      try {
        const record = records[i];

        // Add front page
        combinedHtml += `
          <div class="postcard-page">
            ${frontTemplate(record)}
            ${options.bleed ? '<div class="bleed-marks"></div>' : ''}
          </div>
        `;
        pageCount++;

        // Add back page if needed
        if (options.includeBack && backTemplate) {
          combinedHtml += `
            <div class="postcard-page">
              ${backTemplate(record)}
              ${options.bleed ? '<div class="bleed-marks"></div>' : ''}
            </div>
          `;
          pageCount++;
        }
      } catch (error) {
        errors.push({
          recordIndex: i,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    combinedHtml += '</body></html>';

    // Generate PDF
    const page = await this.browser.newPage();

    try {
      await page.setContent(combinedHtml, { waitUntil: 'networkidle0' });

      await page.pdf({
        path: filepath,
        width: `${options.width}in`,
        height: `${options.height}in`,
        printBackground: options.quality.printBackground,
        scale: options.quality.scale,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      });
    } finally {
      await page.close();
    }

    return { pageCount, errors };
  }

  /**
   * Wrap HTML content with necessary boilerplate
   */
  private wrapHtml(
    content: string,
    options: { width: number; height: number; bleed: boolean; css: string | null }
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          @page {
            size: ${options.width}in ${options.height}in;
            margin: 0;
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            width: ${options.width}in;
            height: ${options.height}in;
            overflow: hidden;
          }
          ${options.css || ''}
        </style>
      </head>
      <body>
        ${content}
      </body>
      </html>
    `;
  }

  /**
   * Generate a preview image of a template
   */
  async generatePreview(
    templateId: string,
    sampleData: Record<string, unknown>,
    outputPath: string
  ): Promise<string> {
    await this.initialize();

    const template = await prisma.template.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const size = POSTCARD_SIZES[template.size as keyof typeof POSTCARD_SIZES] || POSTCARD_SIZES.SIZE_4X6;
    const frontTemplate = Handlebars.compile(template.htmlFront);
    const html = this.wrapHtml(frontTemplate(sampleData), {
      width: size.width,
      height: size.height,
      bleed: false,
      css: template.cssStyles,
    });

    const page = await this.browser.newPage();

    try {
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.setViewport({
        width: Math.round(size.width * 96), // 96 DPI for screen
        height: Math.round(size.height * 96),
      });

      await page.screenshot({
        path: outputPath,
        type: 'png',
        fullPage: true,
      });

      return outputPath;
    } finally {
      await page.close();
    }
  }
}

// Singleton instance for reuse
let pdfGeneratorInstance: PDFGenerator | null = null;

/**
 * Get the singleton PDF generator instance
 */
export function getPdfGenerator(): PDFGenerator {
  if (!pdfGeneratorInstance) {
    pdfGeneratorInstance = new PDFGenerator();
  }
  return pdfGeneratorInstance;
}

/**
 * Cleanup: close the browser on process exit
 */
process.on('exit', () => {
  if (pdfGeneratorInstance) {
    pdfGeneratorInstance.close();
  }
});

process.on('SIGINT', () => {
  if (pdfGeneratorInstance) {
    pdfGeneratorInstance.close();
  }
  process.exit();
});

process.on('SIGTERM', () => {
  if (pdfGeneratorInstance) {
    pdfGeneratorInstance.close();
  }
  process.exit();
});
