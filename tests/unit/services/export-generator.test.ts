/**
 * Tests for Export Generator Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ExportGenerator,
  exportGenerator,
} from '../../../src/services/export-generator.js';

// Mock AWS S3
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({
    send: vi.fn(),
  })),
  PutObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

// Mock xlsx library
vi.mock('xlsx', () => ({
  utils: {
    json_to_sheet: vi.fn(() => ({})),
    book_new: vi.fn(() => ({ SheetNames: [], Sheets: {} })),
    book_append_sheet: vi.fn(),
  },
  write: vi.fn(() => Buffer.from('xlsx data')),
}));

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as xlsx from 'xlsx';

// Create mock records
function createMockRecords(count: number = 5) {
  return Array.from({ length: count }, (_, i) => ({
    id: `record-${i + 1}`,
    firstName: `First${i + 1}`,
    lastName: `Last${i + 1}`,
    email: `user${i + 1}@example.com`,
    address: `${100 + i} Main Street`,
    city: 'Phoenix',
    state: 'AZ',
    zip: '85001',
    saleDate: '2026-01-15',
    salePrice: 350000 + i * 10000,
  }));
}

describe('Export Generator Service', () => {
  let generator: ExportGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new ExportGenerator({
      bucket: 'test-bucket',
      region: 'us-west-2',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('toCSV', () => {
    it('generates valid CSV', async () => {
      const records = createMockRecords(3);
      const result = await generator.toCSV(records);

      expect(result).toBeInstanceOf(Buffer);
      const csvString = result.toString();
      expect(csvString).toContain('firstName');
      expect(csvString).toContain('First1');
      expect(csvString).toContain('First2');
    });

    it('includes header row by default', async () => {
      const records = createMockRecords(2);
      const result = await generator.toCSV(records);

      const csvString = result.toString();
      const lines = csvString.split('\n');
      expect(lines[0]).toContain('firstName');
      expect(lines[0]).toContain('lastName');
      expect(lines[0]).toContain('email');
    });

    it('excludes header when specified', async () => {
      const records = createMockRecords(2);
      const result = await generator.toCSV(records, { includeHeader: false });

      const csvString = result.toString();
      const lines = csvString.split('\n').filter((l) => l.trim());
      expect(lines).toHaveLength(2);
      expect(lines[0]).not.toContain('firstName');
      expect(lines[0]).toContain('First1');
    });

    it('uses custom column order', async () => {
      const records = createMockRecords(2);
      const result = await generator.toCSV(records, {
        columns: ['lastName', 'firstName', 'city'],
      });

      const csvString = result.toString();
      const lines = csvString.split('\n');
      const headers = lines[0].split(',');
      expect(headers[0]).toBe('lastName');
      expect(headers[1]).toBe('firstName');
      expect(headers[2]).toBe('city');
    });

    it('applies column mapping', async () => {
      const records = createMockRecords(1);
      const result = await generator.toCSV(records, {
        columnMapping: {
          firstName: 'First Name',
          lastName: 'Last Name',
        },
      });

      const csvString = result.toString();
      expect(csvString).toContain('First Name');
      expect(csvString).toContain('Last Name');
    });

    it('escapes special characters', async () => {
      const records = [
        {
          id: '1',
          name: 'O\'Brien, John',
          description: 'Has "quotes" and, commas',
        },
      ];

      const result = await generator.toCSV(records);
      const csvString = result.toString();

      // Should properly quote fields with special chars
      expect(csvString).toContain('"');
    });

    it('handles newlines in fields', async () => {
      const records = [
        {
          id: '1',
          address: '123 Main St\nApt 4',
        },
      ];

      const result = await generator.toCSV(records);
      const csvString = result.toString();

      // Field with newline should be quoted
      expect(csvString).toContain('"123 Main St');
    });
  });

  describe('toExcel', () => {
    it('generates valid XLSX', async () => {
      const records = createMockRecords(3);
      const result = await generator.toExcel(records);

      expect(result).toBeInstanceOf(Buffer);
      expect(xlsx.utils.json_to_sheet).toHaveBeenCalledWith(records);
      expect(xlsx.write).toHaveBeenCalled();
    });

    it('uses custom sheet name', async () => {
      const records = createMockRecords(2);
      await generator.toExcel(records, { sheetName: 'NHO Data' });

      expect(xlsx.utils.book_append_sheet).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        'NHO Data'
      );
    });

    it('applies column headers', async () => {
      const records = createMockRecords(2);
      await generator.toExcel(records, {
        columnMapping: {
          firstName: 'First Name',
          lastName: 'Last Name',
        },
      });

      expect(xlsx.utils.json_to_sheet).toHaveBeenCalled();
    });

    it('supports multiple sheets', async () => {
      const nhoRecords = createMockRecords(5);
      const nmRecords = createMockRecords(3);

      await generator.toExcel(nhoRecords, {
        additionalSheets: [
          { name: 'New Movers', data: nmRecords },
        ],
      });

      expect(xlsx.utils.book_append_sheet).toHaveBeenCalledTimes(2);
    });
  });

  describe('toJSON', () => {
    it('generates valid JSON', async () => {
      const records = createMockRecords(3);
      const result = await generator.toJSON(records);

      expect(result).toBeInstanceOf(Buffer);
      const parsed = JSON.parse(result.toString());
      expect(parsed).toHaveLength(3);
      expect(parsed[0].firstName).toBe('First1');
    });

    it('generates pretty printed JSON', async () => {
      const records = createMockRecords(2);
      const result = await generator.toJSON(records, { pretty: true });

      const jsonString = result.toString();
      expect(jsonString).toContain('\n');
      expect(jsonString).toContain('  ');
    });

    it('generates minified JSON by default', async () => {
      const records = createMockRecords(2);
      const result = await generator.toJSON(records, { pretty: false });

      const jsonString = result.toString();
      // Minified JSON should be on single line (no newlines except in values)
      const lineCount = jsonString.split('\n').length;
      expect(lineCount).toBe(1);
    });

    it('wraps in object with metadata', async () => {
      const records = createMockRecords(2);
      const result = await generator.toJSON(records, {
        wrapInObject: true,
        metadata: {
          exportedAt: '2026-02-03T12:00:00Z',
          totalRecords: 2,
        },
      });

      const parsed = JSON.parse(result.toString());
      expect(parsed.metadata).toBeDefined();
      expect(parsed.metadata.exportedAt).toBe('2026-02-03T12:00:00Z');
      expect(parsed.records).toHaveLength(2);
    });

    it('filters columns', async () => {
      const records = createMockRecords(2);
      const result = await generator.toJSON(records, {
        columns: ['firstName', 'lastName'],
      });

      const parsed = JSON.parse(result.toString());
      expect(Object.keys(parsed[0])).toEqual(['firstName', 'lastName']);
    });
  });

  describe('handles special characters', () => {
    it('handles UTF-8 characters', async () => {
      const records = [
        { id: '1', name: 'José García', city: 'México' },
        { id: '2', name: '田中太郎', city: '東京' },
      ];

      const csvResult = await generator.toCSV(records);
      expect(csvResult.toString()).toContain('José');
      expect(csvResult.toString()).toContain('田中');

      const jsonResult = await generator.toJSON(records);
      const parsed = JSON.parse(jsonResult.toString());
      expect(parsed[0].name).toBe('José García');
      expect(parsed[1].name).toBe('田中太郎');
    });

    it('handles empty strings', async () => {
      const records = [
        { id: '1', firstName: 'John', lastName: '' },
      ];

      const result = await generator.toCSV(records);
      const csvString = result.toString();
      expect(csvString).toContain('John,,');
    });

    it('handles null values', async () => {
      const records = [
        { id: '1', firstName: 'John', lastName: null },
      ];

      const result = await generator.toCSV(records);
      const csvString = result.toString();
      // Null should be converted to empty
      expect(csvString).not.toContain('null');
    });

    it('handles undefined values', async () => {
      const records = [
        { id: '1', firstName: 'John' },
      ];

      const result = await generator.toCSV(records, {
        columns: ['id', 'firstName', 'lastName'],
      });
      const csvString = result.toString();
      // Undefined should be empty
      expect(csvString).not.toContain('undefined');
    });
  });

  describe('handles empty datasets', () => {
    it('returns empty CSV with headers only', async () => {
      const records: any[] = [];
      const result = await generator.toCSV(records, {
        columns: ['firstName', 'lastName', 'email'],
      });

      const csvString = result.toString();
      expect(csvString).toContain('firstName,lastName,email');
      const lines = csvString.split('\n').filter((l) => l.trim());
      expect(lines).toHaveLength(1);
    });

    it('returns empty JSON array', async () => {
      const records: any[] = [];
      const result = await generator.toJSON(records);

      const parsed = JSON.parse(result.toString());
      expect(parsed).toEqual([]);
    });

    it('returns empty Excel with headers', async () => {
      const records: any[] = [];
      await generator.toExcel(records, {
        columns: ['firstName', 'lastName'],
      });

      expect(xlsx.utils.json_to_sheet).toHaveBeenCalledWith([]);
    });
  });

  describe('uploads to S3', () => {
    it('uploads file to S3 bucket', async () => {
      const mockSend = vi.fn().mockResolvedValue({});
      vi.mocked(S3Client).mockImplementation(
        () => ({ send: mockSend }) as any
      );

      const generator = new ExportGenerator({
        bucket: 'test-bucket',
        region: 'us-west-2',
      });

      const buffer = Buffer.from('test data');
      const result = await generator.uploadToS3(buffer, 'exports/test.csv');

      expect(result).toBe('s3://test-bucket/exports/test.csv');
      expect(mockSend).toHaveBeenCalled();
    });

    it('sets correct content type for CSV', async () => {
      const mockSend = vi.fn().mockResolvedValue({});
      vi.mocked(S3Client).mockImplementation(
        () => ({ send: mockSend }) as any
      );

      const generator = new ExportGenerator({
        bucket: 'test-bucket',
        region: 'us-west-2',
      });

      const buffer = Buffer.from('csv,data');
      await generator.uploadToS3(buffer, 'exports/test.csv', {
        contentType: 'text/csv',
      });

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ContentType: 'text/csv',
        })
      );
    });

    it('sets correct content type for Excel', async () => {
      const mockSend = vi.fn().mockResolvedValue({});
      vi.mocked(S3Client).mockImplementation(
        () => ({ send: mockSend }) as any
      );

      const generator = new ExportGenerator({
        bucket: 'test-bucket',
        region: 'us-west-2',
      });

      const buffer = Buffer.from('xlsx data');
      await generator.uploadToS3(buffer, 'exports/test.xlsx', {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
      );
    });

    it('sets correct content type for JSON', async () => {
      const mockSend = vi.fn().mockResolvedValue({});
      vi.mocked(S3Client).mockImplementation(
        () => ({ send: mockSend }) as any
      );

      const generator = new ExportGenerator({
        bucket: 'test-bucket',
        region: 'us-west-2',
      });

      const buffer = Buffer.from('{}');
      await generator.uploadToS3(buffer, 'exports/test.json', {
        contentType: 'application/json',
      });

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ContentType: 'application/json',
        })
      );
    });
  });

  describe('generates signed download URL', () => {
    it('generates presigned URL for download', async () => {
      vi.mocked(getSignedUrl).mockResolvedValue(
        'https://test-bucket.s3.amazonaws.com/exports/test.csv?X-Amz-Signature=abc123'
      );

      const url = await generator.generateSignedUrl('exports/test.csv');

      expect(url).toContain('X-Amz-Signature');
      expect(getSignedUrl).toHaveBeenCalled();
    });

    it('sets URL expiration time', async () => {
      vi.mocked(getSignedUrl).mockResolvedValue('https://url');

      await generator.generateSignedUrl('exports/test.csv', {
        expiresIn: 7200, // 2 hours
      });

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({ expiresIn: 7200 })
      );
    });

    it('uses default expiration of 1 hour', async () => {
      vi.mocked(getSignedUrl).mockResolvedValue('https://url');

      await generator.generateSignedUrl('exports/test.csv');

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({ expiresIn: 3600 })
      );
    });
  });

  describe('streaming for large files', () => {
    it('supports streaming export for large datasets', async () => {
      const largeRecords = createMockRecords(10000);

      const stream = generator.toCSVStream(largeRecords);
      expect(stream).toBeDefined();
      expect(stream.readable).toBe(true);
    });

    it('streams chunks efficiently', async () => {
      const largeRecords = createMockRecords(1000);
      const stream = generator.toCSVStream(largeRecords, { chunkSize: 100 });

      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  describe('singleton instance', () => {
    it('exports singleton instance', () => {
      expect(exportGenerator).toBeDefined();
      expect(exportGenerator).toBeInstanceOf(ExportGenerator);
    });
  });
});
