/**
 * Export Generator Service
 * Generates CSV, Excel, and JSON exports with S3 storage
 */

import ExcelJS from 'exceljs';
import { stringify } from 'csv-stringify/sync';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

/**
 * Export format types
 */
export type ExportFormat = 'csv' | 'excel' | 'json';

/**
 * Export generation options
 */
export interface ExportOptions {
  records: Record<string, unknown>[];
  format: ExportFormat;
  columns?: string[];
  filename?: string;
  includeHeaders?: boolean;
}

/**
 * Export result
 */
export interface ExportResult {
  s3Key: string;
  fileSizeBytes: number;
  downloadUrl: string;
  downloadExpires: Date;
  recordCount: number;
  format: ExportFormat;
  columns: string[];
}

/**
 * Get S3 client
 */
function getS3Client(): S3Client {
  return new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: process.env.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        }
      : undefined,
  });
}

/**
 * Get S3 bucket name
 */
function getS3Bucket(): string {
  return process.env.S3_BUCKET || 'nho-nm-exports';
}

/**
 * Generate export file and upload to S3
 */
export async function generateExport(options: ExportOptions): Promise<ExportResult> {
  const { records, format, columns, filename, includeHeaders = true } = options;

  // Determine columns to export
  const exportColumns = columns || (records.length > 0 ? Object.keys(records[0]) : []);

  // Generate unique filename
  const exportId = uuidv4();
  const baseFilename = filename || `export_${exportId}`;

  let buffer: Buffer;
  let contentType: string;
  let extension: string;

  switch (format) {
    case 'csv':
      buffer = generateCSV(records, exportColumns, includeHeaders);
      contentType = 'text/csv';
      extension = 'csv';
      break;
    case 'excel':
      buffer = await generateExcel(records, exportColumns, includeHeaders);
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      extension = 'xlsx';
      break;
    case 'json':
      buffer = generateJSON(records, exportColumns);
      contentType = 'application/json';
      extension = 'json';
      break;
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }

  const s3Key = `exports/${new Date().toISOString().slice(0, 10)}/${baseFilename}.${extension}`;

  // Upload to S3
  const s3 = getS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: getS3Bucket(),
      Key: s3Key,
      Body: buffer,
      ContentType: contentType,
      ContentDisposition: `attachment; filename="${baseFilename}.${extension}"`,
    })
  );

  // Generate signed download URL (7 days)
  const downloadExpires = new Date();
  downloadExpires.setDate(downloadExpires.getDate() + 7);

  const downloadUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: getS3Bucket(),
      Key: s3Key,
    }),
    { expiresIn: 7 * 24 * 60 * 60 }
  );

  return {
    s3Key,
    fileSizeBytes: buffer.length,
    downloadUrl,
    downloadExpires,
    recordCount: records.length,
    format,
    columns: exportColumns,
  };
}

/**
 * Generate CSV buffer
 */
function generateCSV(
  records: Record<string, unknown>[],
  columns: string[],
  includeHeaders: boolean
): Buffer {
  // Convert records to rows
  const rows = records.map((record) =>
    columns.map((col) => {
      const value = record[col];
      if (value === null || value === undefined) {
        return '';
      }
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return String(value);
    })
  );

  // Add headers if requested
  const data = includeHeaders ? [columns, ...rows] : rows;

  return Buffer.from(stringify(data));
}

/**
 * Generate Excel buffer
 */
async function generateExcel(
  records: Record<string, unknown>[],
  columns: string[],
  includeHeaders: boolean
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'NHO/NM Data Platform';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Data');

  // Add headers
  if (includeHeaders) {
    const headerRow = worksheet.addRow(columns);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
  }

  // Add data rows
  for (const record of records) {
    const rowData = columns.map((col) => {
      const value = record[col];
      if (value === null || value === undefined) {
        return '';
      }
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return value;
    });
    worksheet.addRow(rowData);
  }

  // Auto-fit columns (approximate)
  worksheet.columns.forEach((column: Partial<ExcelJS.Column>) => {
    let maxLength = 10;
    column.eachCell?.({ includeEmpty: false }, (cell: ExcelJS.Cell) => {
      const cellLength = cell.value ? String(cell.value).length : 0;
      if (cellLength > maxLength) {
        maxLength = Math.min(cellLength, 50);
      }
    });
    column.width = maxLength + 2;
  });

  // Freeze header row
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Generate JSON buffer
 */
function generateJSON(records: Record<string, unknown>[], columns: string[]): Buffer {
  // Filter to only include specified columns
  const filtered = records.map((record) =>
    Object.fromEntries(columns.map((col) => [col, record[col]]))
  );

  return Buffer.from(JSON.stringify(filtered, null, 2));
}

/**
 * Get column names from records
 */
export function getColumnNames(records: Record<string, unknown>[]): string[] {
  if (records.length === 0) return [];

  // Get all unique keys from all records
  const allKeys = new Set<string>();
  for (const record of records) {
    Object.keys(record).forEach((key) => allKeys.add(key));
  }

  // Sort columns in a logical order
  const priorityColumns = [
    'first_name',
    'last_name',
    'company_name',
    'title',
    'address',
    'address2',
    'city',
    'state',
    'zip',
    'email',
    'phone',
    'move_date',
  ];

  const sortedColumns: string[] = [];
  for (const col of priorityColumns) {
    if (allKeys.has(col)) {
      sortedColumns.push(col);
      allKeys.delete(col);
    }
  }

  // Add remaining columns alphabetically
  const remaining = Array.from(allKeys).sort();
  return [...sortedColumns, ...remaining];
}

/**
 * Generate a signed download URL for an existing S3 key
 */
export async function getDownloadUrl(s3Key: string, expiresInSeconds = 7 * 24 * 60 * 60): Promise<string> {
  const s3 = getS3Client();

  return await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: getS3Bucket(),
      Key: s3Key,
    }),
    { expiresIn: expiresInSeconds }
  );
}

/**
 * Check if S3 is configured
 */
export function isS3Configured(): boolean {
  return !!(process.env.S3_BUCKET || process.env.AWS_REGION);
}

/**
 * Generate export locally (for testing or when S3 is not configured)
 */
export async function generateLocalExport(options: ExportOptions): Promise<{
  buffer: Buffer;
  format: ExportFormat;
  contentType: string;
  filename: string;
}> {
  const { records, format, columns, filename, includeHeaders = true } = options;

  const exportColumns = columns || (records.length > 0 ? Object.keys(records[0]) : []);
  const baseFilename = filename || `export_${Date.now()}`;

  let buffer: Buffer;
  let contentType: string;
  let extension: string;

  switch (format) {
    case 'csv':
      buffer = generateCSV(records, exportColumns, includeHeaders);
      contentType = 'text/csv';
      extension = 'csv';
      break;
    case 'excel':
      buffer = await generateExcel(records, exportColumns, includeHeaders);
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      extension = 'xlsx';
      break;
    case 'json':
      buffer = generateJSON(records, exportColumns);
      contentType = 'application/json';
      extension = 'json';
      break;
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }

  return {
    buffer,
    format,
    contentType,
    filename: `${baseFilename}.${extension}`,
  };
}
