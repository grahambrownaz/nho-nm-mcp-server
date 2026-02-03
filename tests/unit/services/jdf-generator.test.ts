/**
 * Tests for JDF Generator Service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JdfGenerator, jdfGenerator, MEDIA_PRESETS } from '../../../src/services/jdf-generator.js';
import { DOMParser } from '@xmldom/xmldom';

describe('JDF Generator Service', () => {
  let generator: JdfGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new JdfGenerator();
  });

  describe('MEDIA_PRESETS constant', () => {
    it('defines 4x6 100lb gloss preset', () => {
      expect(MEDIA_PRESETS['4x6_100lb_gloss_fc']).toBeDefined();
      expect(MEDIA_PRESETS['4x6_100lb_gloss_fc'].width).toBe(6);
      expect(MEDIA_PRESETS['4x6_100lb_gloss_fc'].height).toBe(4);
    });

    it('defines 6x9 preset', () => {
      expect(MEDIA_PRESETS['6x9_100lb_gloss_fc']).toBeDefined();
      expect(MEDIA_PRESETS['6x9_100lb_gloss_fc'].width).toBe(9);
      expect(MEDIA_PRESETS['6x9_100lb_gloss_fc'].height).toBe(6);
    });

    it('defines 6x11 preset', () => {
      expect(MEDIA_PRESETS['6x11_100lb_gloss_fc']).toBeDefined();
      expect(MEDIA_PRESETS['6x11_100lb_gloss_fc'].width).toBe(11);
      expect(MEDIA_PRESETS['6x11_100lb_gloss_fc'].height).toBe(6);
    });
  });

  describe('createJobTicket', () => {
    it('generates valid JDF for 4x6 postcard job', () => {
      const jdf = generator.createJobTicket({
        jobName: 'TestRealty_NHO_2026-02-03',
        quantity: 85,
        postcardSize: '4x6',
        mediaPreset: '4x6_100lb_gloss_fc',
        pdfPath: 'postcards_batch_001.pdf',
      });

      expect(jdf).toContain('<?xml version="1.0"');
      expect(jdf).toContain('JobID="TestRealty_NHO_2026-02-03"');
      expect(jdf).toContain('Amount="85"');
      expect(jdf).toContain('postcards_batch_001.pdf');

      // Validate XML is well-formed
      const parser = new DOMParser();
      const doc = parser.parseFromString(jdf, 'text/xml');
      const parseErrors = doc.getElementsByTagName('parsererror');
      expect(parseErrors.length).toBe(0);
    });

    it('generates valid JDF for 6x9 postcard job', () => {
      const jdf = generator.createJobTicket({
        jobName: 'HVACPro_NewMover_2026-02-03',
        quantity: 250,
        postcardSize: '6x9',
        mediaPreset: '6x9_100lb_gloss_fc',
        pdfPath: 'hvac_postcards.pdf',
      });

      expect(jdf).toContain('6x9');
      expect(jdf).toContain('Amount="250"');

      // Validate XML is well-formed
      const parser = new DOMParser();
      const doc = parser.parseFromString(jdf, 'text/xml');
      const parseErrors = doc.getElementsByTagName('parsererror');
      expect(parseErrors.length).toBe(0);
    });

    it('generates valid JDF for 6x11 postcard job', () => {
      const jdf = generator.createJobTicket({
        jobName: 'Insurance_Consumer_2026-02-03',
        quantity: 1000,
        postcardSize: '6x11',
        mediaPreset: '6x11_100lb_gloss_fc',
        pdfPath: 'insurance_mailers.pdf',
      });

      expect(jdf).toContain('6x11');
      expect(jdf).toContain('Amount="1000"');

      // Validate XML is well-formed
      const parser = new DOMParser();
      const doc = parser.parseFromString(jdf, 'text/xml');
      const parseErrors = doc.getElementsByTagName('parsererror');
      expect(parseErrors.length).toBe(0);
    });

    it('includes correct job name', () => {
      const jdf = generator.createJobTicket({
        jobName: 'MyCompany_Weekly_Batch',
        quantity: 100,
        postcardSize: '4x6',
        mediaPreset: '4x6_100lb_gloss_fc',
        pdfPath: 'batch.pdf',
      });

      expect(jdf).toContain('JobID="MyCompany_Weekly_Batch"');
      expect(jdf).toContain('DescriptiveName="MyCompany_Weekly_Batch"');
    });

    it('includes correct quantity', () => {
      const jdf = generator.createJobTicket({
        jobName: 'Test',
        quantity: 500,
        postcardSize: '4x6',
        mediaPreset: '4x6_100lb_gloss_fc',
        pdfPath: 'test.pdf',
      });

      expect(jdf).toContain('Amount="500"');
    });

    it('includes media specification', () => {
      const jdf = generator.createJobTicket({
        jobName: 'Test',
        quantity: 100,
        postcardSize: '4x6',
        mediaPreset: '4x6_100lb_gloss_fc',
        pdfPath: 'test.pdf',
      });

      expect(jdf).toContain('MediaType');
      expect(jdf).toContain('Weight');
      expect(jdf).toContain('Dimension');
    });

    it('includes file references', () => {
      const jdf = generator.createJobTicket({
        jobName: 'Test',
        quantity: 100,
        postcardSize: '4x6',
        mediaPreset: '4x6_100lb_gloss_fc',
        pdfPath: 'my_artwork.pdf',
      });

      expect(jdf).toContain('my_artwork.pdf');
      expect(jdf).toContain('FileSpec');
    });

    it('output is well-formed XML', () => {
      const jdf = generator.createJobTicket({
        jobName: 'Test',
        quantity: 100,
        postcardSize: '4x6',
        mediaPreset: '4x6_100lb_gloss_fc',
        pdfPath: 'test.pdf',
      });

      const parser = new DOMParser();
      const doc = parser.parseFromString(jdf, 'text/xml');

      // Check for root element
      expect(doc.documentElement).toBeDefined();
      expect(doc.documentElement.tagName).toBe('JDF');
    });
  });

  describe('4x6 preset dimensions', () => {
    it('produces correct dimensions', () => {
      const jdf = generator.createJobTicket({
        jobName: 'Test_4x6',
        quantity: 100,
        postcardSize: '4x6',
        mediaPreset: '4x6_100lb_gloss_fc',
        pdfPath: 'test.pdf',
      });

      // 4x6 inches = 288x432 points (at 72 dpi)
      expect(jdf).toMatch(/Dimension[^>]*432/); // Width in points
      expect(jdf).toMatch(/Dimension[^>]*288/); // Height in points
    });
  });

  describe('6x9 preset dimensions', () => {
    it('produces correct dimensions', () => {
      const jdf = generator.createJobTicket({
        jobName: 'Test_6x9',
        quantity: 100,
        postcardSize: '6x9',
        mediaPreset: '6x9_100lb_gloss_fc',
        pdfPath: 'test.pdf',
      });

      // 6x9 inches = 432x648 points
      expect(jdf).toMatch(/Dimension[^>]*648/); // Width in points
      expect(jdf).toMatch(/Dimension[^>]*432/); // Height in points
    });
  });

  describe('6x11 preset dimensions', () => {
    it('produces correct dimensions', () => {
      const jdf = generator.createJobTicket({
        jobName: 'Test_6x11',
        quantity: 100,
        postcardSize: '6x11',
        mediaPreset: '6x11_100lb_gloss_fc',
        pdfPath: 'test.pdf',
      });

      // 6x11 inches = 432x792 points
      expect(jdf).toMatch(/Dimension[^>]*792/); // Width in points
      expect(jdf).toMatch(/Dimension[^>]*432/); // Height in points
    });
  });

  describe('duplex settings', () => {
    it('includes duplex specification when enabled', () => {
      const jdf = generator.createJobTicket({
        jobName: 'Test',
        quantity: 100,
        postcardSize: '4x6',
        mediaPreset: '4x6_100lb_gloss_fc',
        pdfPath: 'test.pdf',
        duplex: true,
      });

      expect(jdf).toContain('Sides="TwoSided"');
    });

    it('uses simplex by default', () => {
      const jdf = generator.createJobTicket({
        jobName: 'Test',
        quantity: 100,
        postcardSize: '4x6',
        mediaPreset: '4x6_100lb_gloss_fc',
        pdfPath: 'test.pdf',
      });

      expect(jdf).toContain('Sides="OneSided"');
    });
  });

  describe('coating settings', () => {
    it('includes UV coating specification', () => {
      const jdf = generator.createJobTicket({
        jobName: 'Test',
        quantity: 100,
        postcardSize: '4x6',
        mediaPreset: '4x6_100lb_gloss_fc',
        pdfPath: 'test.pdf',
        coating: 'uv',
      });

      expect(jdf).toContain('CoatingType="UV"');
    });

    it('includes aqueous coating specification', () => {
      const jdf = generator.createJobTicket({
        jobName: 'Test',
        quantity: 100,
        postcardSize: '4x6',
        mediaPreset: '4x6_100lb_gloss_fc',
        pdfPath: 'test.pdf',
        coating: 'aqueous',
      });

      expect(jdf).toContain('CoatingType="Aqueous"');
    });
  });

  describe('customer info', () => {
    it('includes customer information when provided', () => {
      const jdf = generator.createJobTicket({
        jobName: 'Test',
        quantity: 100,
        postcardSize: '4x6',
        mediaPreset: '4x6_100lb_gloss_fc',
        pdfPath: 'test.pdf',
        customerInfo: {
          name: 'Acme Realty',
          id: 'CUST-001',
          contact: 'john@acmerealty.com',
        },
      });

      expect(jdf).toContain('Acme Realty');
      expect(jdf).toContain('CUST-001');
    });
  });

  describe('shipping info', () => {
    it('includes shipping information when provided', () => {
      const jdf = generator.createJobTicket({
        jobName: 'Test',
        quantity: 100,
        postcardSize: '4x6',
        mediaPreset: '4x6_100lb_gloss_fc',
        pdfPath: 'test.pdf',
        shippingInfo: {
          method: 'USPS_First_Class',
          returnAddress: {
            name: 'Acme Realty',
            street: '123 Main St',
            city: 'Phoenix',
            state: 'AZ',
            zip: '85001',
          },
        },
      });

      expect(jdf).toContain('USPS');
      expect(jdf).toContain('Phoenix');
    });
  });

  describe('job priority', () => {
    it('sets high priority', () => {
      const jdf = generator.createJobTicket({
        jobName: 'Test',
        quantity: 100,
        postcardSize: '4x6',
        mediaPreset: '4x6_100lb_gloss_fc',
        pdfPath: 'test.pdf',
        priority: 'high',
      });

      expect(jdf).toContain('Priority="High"');
    });

    it('uses normal priority by default', () => {
      const jdf = generator.createJobTicket({
        jobName: 'Test',
        quantity: 100,
        postcardSize: '4x6',
        mediaPreset: '4x6_100lb_gloss_fc',
        pdfPath: 'test.pdf',
      });

      expect(jdf).toContain('Priority="Normal"');
    });
  });

  describe('due date', () => {
    it('includes due date when provided', () => {
      const dueDate = new Date('2026-02-10T12:00:00Z');
      const jdf = generator.createJobTicket({
        jobName: 'Test',
        quantity: 100,
        postcardSize: '4x6',
        mediaPreset: '4x6_100lb_gloss_fc',
        pdfPath: 'test.pdf',
        dueDate,
      });

      expect(jdf).toContain('2026-02-10');
    });
  });

  describe('special characters', () => {
    it('escapes XML special characters in job name', () => {
      const jdf = generator.createJobTicket({
        jobName: 'Test & Company <Special>',
        quantity: 100,
        postcardSize: '4x6',
        mediaPreset: '4x6_100lb_gloss_fc',
        pdfPath: 'test.pdf',
      });

      // XML entities should be escaped
      expect(jdf).not.toContain('Test & Company <Special>');
      expect(jdf).toContain('&amp;');
      expect(jdf).toContain('&lt;');
      expect(jdf).toContain('&gt;');
    });

    it('handles unicode characters', () => {
      const jdf = generator.createJobTicket({
        jobName: 'Test_日本語',
        quantity: 100,
        postcardSize: '4x6',
        mediaPreset: '4x6_100lb_gloss_fc',
        pdfPath: 'test.pdf',
      });

      // Should be valid XML with UTF-8 encoding
      expect(jdf).toContain('encoding="UTF-8"');
    });
  });

  describe('multiple PDF references', () => {
    it('handles multiple PDF files', () => {
      const jdf = generator.createJobTicket({
        jobName: 'Test',
        quantity: 100,
        postcardSize: '4x6',
        mediaPreset: '4x6_100lb_gloss_fc',
        pdfPath: 'front.pdf',
        backPdfPath: 'back.pdf',
      });

      expect(jdf).toContain('front.pdf');
      expect(jdf).toContain('back.pdf');
    });
  });

  describe('imposition settings', () => {
    it('includes gang-up settings', () => {
      const jdf = generator.createJobTicket({
        jobName: 'Test',
        quantity: 1000,
        postcardSize: '4x6',
        mediaPreset: '4x6_100lb_gloss_fc',
        pdfPath: 'test.pdf',
        imposition: {
          layout: '4-up',
          cutMarks: true,
          bleed: 0.125,
        },
      });

      expect(jdf).toContain('4-up');
      expect(jdf).toContain('CutMarks');
    });
  });

  describe('ink settings', () => {
    it('specifies CMYK color mode', () => {
      const jdf = generator.createJobTicket({
        jobName: 'Test',
        quantity: 100,
        postcardSize: '4x6',
        mediaPreset: '4x6_100lb_gloss_fc',
        pdfPath: 'test.pdf',
      });

      expect(jdf).toContain('CMYK');
    });
  });

  describe('validation', () => {
    it('throws error for missing job name', () => {
      expect(() =>
        generator.createJobTicket({
          jobName: '',
          quantity: 100,
          postcardSize: '4x6',
          mediaPreset: '4x6_100lb_gloss_fc',
          pdfPath: 'test.pdf',
        })
      ).toThrow();
    });

    it('throws error for zero quantity', () => {
      expect(() =>
        generator.createJobTicket({
          jobName: 'Test',
          quantity: 0,
          postcardSize: '4x6',
          mediaPreset: '4x6_100lb_gloss_fc',
          pdfPath: 'test.pdf',
        })
      ).toThrow();
    });

    it('throws error for negative quantity', () => {
      expect(() =>
        generator.createJobTicket({
          jobName: 'Test',
          quantity: -1,
          postcardSize: '4x6',
          mediaPreset: '4x6_100lb_gloss_fc',
          pdfPath: 'test.pdf',
        })
      ).toThrow();
    });

    it('throws error for missing PDF path', () => {
      expect(() =>
        generator.createJobTicket({
          jobName: 'Test',
          quantity: 100,
          postcardSize: '4x6',
          mediaPreset: '4x6_100lb_gloss_fc',
          pdfPath: '',
        })
      ).toThrow();
    });

    it('throws error for invalid postcard size', () => {
      expect(() =>
        generator.createJobTicket({
          jobName: 'Test',
          quantity: 100,
          postcardSize: '3x5' as any,
          mediaPreset: '4x6_100lb_gloss_fc',
          pdfPath: 'test.pdf',
        })
      ).toThrow();
    });
  });

  describe('singleton instance', () => {
    it('exports singleton instance', () => {
      expect(jdfGenerator).toBeDefined();
      expect(jdfGenerator).toBeInstanceOf(JdfGenerator);
    });
  });
});
