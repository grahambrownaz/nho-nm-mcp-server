/**
 * Tests for SFTP Delivery Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SftpDeliveryService, getSftpDeliveryService, type SftpConfig } from '../../../src/services/sftp-delivery.js';
import SftpClient from 'ssh2-sftp-client';

// Mock ssh2-sftp-client
const mockSftpClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  end: vi.fn().mockResolvedValue(undefined),
  put: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ size: 12345, isDirectory: true }),
  delete: vi.fn().mockResolvedValue(undefined),
  list: vi.fn().mockResolvedValue([]),
};

vi.mock('ssh2-sftp-client', () => {
  return {
    default: vi.fn(() => mockSftpClient),
  };
});

// Mock fs module
vi.mock('fs', () => ({
  statSync: vi.fn(() => ({ size: 1000 })),
  readFileSync: vi.fn(() => Buffer.from('test content')),
}));

// Create mock SFTP config
function createMockSftpConfig(overrides: Partial<SftpConfig> = {}): SftpConfig {
  return {
    host: 'sftp.example.com',
    port: 22,
    username: 'testuser',
    password: 'testpass',
    folderPath: '/incoming',
    ...overrides,
  };
}

describe('SftpDeliveryService', () => {
  let service: SftpDeliveryService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SftpDeliveryService();

    // Reset mock implementations
    mockSftpClient.connect.mockResolvedValue(undefined);
    mockSftpClient.end.mockResolvedValue(undefined);
    mockSftpClient.put.mockResolvedValue(undefined);
    mockSftpClient.mkdir.mockResolvedValue(undefined);
    mockSftpClient.stat.mockResolvedValue({ size: 12345, isDirectory: true });
    mockSftpClient.delete.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  describe('testConnection', () => {
    it('validates config with successful connection', async () => {
      const config = createMockSftpConfig();

      const result = await service.testConnection(config);

      expect(result.success).toBe(true);
      expect(mockSftpClient.connect).toHaveBeenCalled();
      expect(mockSftpClient.end).toHaveBeenCalled();
    });

    it('returns failure for invalid config', async () => {
      const config = createMockSftpConfig();
      mockSftpClient.connect.mockRejectedValue(new Error('Connection refused'));

      const result = await service.testConnection(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection refused');
    });

    it('validates remote folder exists', async () => {
      const config = createMockSftpConfig();

      const result = await service.testConnection(config);

      expect(mockSftpClient.stat).toHaveBeenCalledWith('/incoming');
      expect(result.folderExists).toBe(true);
    });

    it('returns folderExists false if folder does not exist', async () => {
      const config = createMockSftpConfig();
      mockSftpClient.stat.mockRejectedValue(new Error('No such file'));

      const result = await service.testConnection(config);

      expect(result.success).toBe(true);
      expect(result.folderExists).toBe(false);
    });

    it('tests write access to folder', async () => {
      const config = createMockSftpConfig();
      mockSftpClient.stat.mockResolvedValue({ isDirectory: true });
      mockSftpClient.put.mockResolvedValue(undefined);
      mockSftpClient.delete.mockResolvedValue(undefined);

      const result = await service.testConnection(config);

      expect(result.folderWritable).toBe(true);
    });

    it('returns folderWritable false if write fails', async () => {
      const config = createMockSftpConfig();
      mockSftpClient.stat.mockResolvedValue({ isDirectory: true });
      mockSftpClient.put.mockRejectedValue(new Error('Permission denied'));

      const result = await service.testConnection(config);

      expect(result.success).toBe(true);
      expect(result.folderWritable).toBe(false);
    });

    it('closes connection after test', async () => {
      const config = createMockSftpConfig();

      await service.testConnection(config);

      expect(mockSftpClient.end).toHaveBeenCalled();
    });

    it('handles authentication failure', async () => {
      const config = createMockSftpConfig();
      mockSftpClient.connect.mockRejectedValue(new Error('Authentication failed'));

      const result = await service.testConnection(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Authentication failed');
    });

    it('handles timeout', async () => {
      const config = createMockSftpConfig();
      mockSftpClient.connect.mockRejectedValue(new Error('Connection timeout'));

      const result = await service.testConnection(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection timeout');
    });
  });

  describe('uploadFile', () => {
    it('uploads file to correct path', async () => {
      const config = createMockSftpConfig();
      const localPath = '/tmp/data.csv';

      const result = await service.uploadFile(config, localPath);

      expect(result.success).toBe(true);
      expect(mockSftpClient.put).toHaveBeenCalledWith(localPath, '/incoming/data.csv');
    });

    it('uses custom remote path when provided', async () => {
      const config = createMockSftpConfig();
      const localPath = '/tmp/data.csv';
      const remotePath = 'custom_folder/custom_name.csv';

      const result = await service.uploadFile(config, localPath, remotePath);

      expect(result.success).toBe(true);
      expect(mockSftpClient.put).toHaveBeenCalledWith(
        localPath,
        '/incoming/custom_folder/custom_name.csv'
      );
    });

    it('creates directory if not exists', async () => {
      const config = createMockSftpConfig();
      const localPath = '/tmp/data.csv';

      await service.uploadFile(config, localPath, 'new_folder/data.csv');

      expect(mockSftpClient.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('new_folder'),
        true
      );
    });

    it('handles upload failure', async () => {
      const config = createMockSftpConfig();
      mockSftpClient.put.mockRejectedValue(new Error('Upload failed: disk full'));

      const result = await service.uploadFile(config, '/tmp/data.csv');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Upload failed');
    });

    it('handles permission denied', async () => {
      const config = createMockSftpConfig();
      mockSftpClient.put.mockRejectedValue(new Error('Permission denied'));

      const result = await service.uploadFile(config, '/tmp/data.csv');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });

    it('retries on transient errors', async () => {
      const config = createMockSftpConfig();
      mockSftpClient.put
        .mockRejectedValueOnce(new Error('Connection reset'))
        .mockRejectedValueOnce(new Error('Connection reset'))
        .mockResolvedValueOnce(undefined);

      const result = await service.uploadFile(config, '/tmp/data.csv');

      expect(result.success).toBe(true);
      expect(mockSftpClient.put).toHaveBeenCalledTimes(3);
    });

    it('gives up after max retries', async () => {
      const config = createMockSftpConfig();
      mockSftpClient.put.mockRejectedValue(new Error('Connection reset'));

      const result = await service.uploadFile(config, '/tmp/data.csv');

      expect(result.success).toBe(false);
      expect(result.error).toContain('after 3 attempts');
    });

    it('returns file size in result', async () => {
      const config = createMockSftpConfig();

      const result = await service.uploadFile(config, '/tmp/data.csv');

      expect(result.fileSize).toBe(1000);
    });
  });

  describe('uploadBuffer', () => {
    it('uploads buffer directly to SFTP', async () => {
      const config = createMockSftpConfig();
      const buffer = Buffer.from('test content');
      const remotePath = 'test.csv';

      const result = await service.uploadBuffer(config, buffer, remotePath);

      expect(result.success).toBe(true);
      expect(mockSftpClient.put).toHaveBeenCalledWith(buffer, '/incoming/test.csv');
      expect(result.fileSize).toBe(buffer.length);
    });

    it('retries on transient errors', async () => {
      const config = createMockSftpConfig();
      const buffer = Buffer.from('test');
      mockSftpClient.put
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(undefined);

      const result = await service.uploadBuffer(config, buffer, 'test.csv');

      expect(result.success).toBe(true);
    });
  });

  describe('uploadBatch', () => {
    it('uploads multiple files', async () => {
      const config = createMockSftpConfig();
      const files = [
        { localPath: '/tmp/file1.csv' },
        { localPath: '/tmp/file2.pdf' },
        { localPath: '/tmp/file3.jdf' },
      ];

      const result = await service.uploadBatch(config, files);

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(3);
      expect(result.failedCount).toBe(0);
      expect(mockSftpClient.put).toHaveBeenCalledTimes(3);
    });

    it('continues on individual failures', async () => {
      const config = createMockSftpConfig();
      const files = [
        { localPath: '/tmp/file1.csv' },
        { localPath: '/tmp/file2.pdf' },
      ];

      mockSftpClient.put
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Upload failed'))
        .mockRejectedValueOnce(new Error('Upload failed'))
        .mockRejectedValueOnce(new Error('Upload failed'));

      const result = await service.uploadBatch(config, files);

      expect(result.successCount).toBe(1);
      expect(result.failedCount).toBe(1);
    });

    it('respects custom remote paths', async () => {
      const config = createMockSftpConfig();
      const files = [
        { localPath: '/tmp/file1.csv', remotePath: 'custom/path.csv' },
      ];

      await service.uploadBatch(config, files);

      expect(mockSftpClient.put).toHaveBeenCalledWith(
        '/tmp/file1.csv',
        '/incoming/custom/path.csv'
      );
    });
  });

  describe('singleton instance', () => {
    it('returns singleton instance', () => {
      const instance1 = getSftpDeliveryService();
      const instance2 = getSftpDeliveryService();

      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(SftpDeliveryService);
    });
  });
});
