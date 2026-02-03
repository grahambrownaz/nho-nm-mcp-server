/**
 * Tests for SFTP Delivery Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SftpDeliveryService, sftpDeliveryService } from '../../../src/services/sftp-delivery.js';
import SftpClient from 'ssh2-sftp-client';

// Mock ssh2-sftp-client
vi.mock('ssh2-sftp-client', () => {
  const mockSftp = {
    connect: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
    stat: vi.fn().mockResolvedValue({ size: 12345, isDirectory: false }),
    list: vi.fn().mockResolvedValue([]),
  };

  return {
    default: vi.fn(() => mockSftp),
  };
});

// Mock crypto for encryption tests
vi.mock('crypto', () => ({
  createCipheriv: vi.fn(() => ({
    update: vi.fn(() => Buffer.from('encrypted-part1')),
    final: vi.fn(() => Buffer.from('encrypted-part2')),
    getAuthTag: vi.fn(() => Buffer.from('auth-tag')),
  })),
  createDecipheriv: vi.fn(() => ({
    update: vi.fn(() => Buffer.from('decrypted-part1')),
    final: vi.fn(() => Buffer.from('decrypted-part2')),
    setAuthTag: vi.fn(),
  })),
  randomBytes: vi.fn(() => Buffer.from('0123456789abcdef')),
  scryptSync: vi.fn(() => Buffer.from('derived-key-32-bytes-long-here!')),
}));

// Create mock SFTP config
function createMockSftpConfig(overrides: Record<string, unknown> = {}) {
  return {
    host: 'sftp.example.com',
    port: 22,
    username: 'testuser',
    password: 'testpass',
    remotePath: '/incoming',
    ...overrides,
  };
}

describe('SftpDeliveryService', () => {
  let service: SftpDeliveryService;
  let mockSftpClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SftpDeliveryService();
    mockSftpClient = new SftpClient();
  });

  afterEach(async () => {
    // Cleanup any connections
  });

  describe('connect', () => {
    it('connects with valid credentials', async () => {
      const config = createMockSftpConfig();

      await service.connect(config);

      expect(mockSftpClient.connect).toHaveBeenCalledWith({
        host: 'sftp.example.com',
        port: 22,
        username: 'testuser',
        password: 'testpass',
      });
    });

    it('connects with SSH key authentication', async () => {
      const config = createMockSftpConfig({
        password: undefined,
        privateKey: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----',
      });

      await service.connect(config);

      expect(mockSftpClient.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          privateKey: expect.any(String),
        })
      );
    });

    it('uses default port 22 if not specified', async () => {
      const config = createMockSftpConfig({ port: undefined });

      await service.connect(config);

      expect(mockSftpClient.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 22,
        })
      );
    });

    it('handles connection failure', async () => {
      const config = createMockSftpConfig();
      mockSftpClient.connect.mockRejectedValue(new Error('Connection refused'));

      await expect(service.connect(config)).rejects.toThrow('Connection refused');
    });

    it('handles authentication failure', async () => {
      const config = createMockSftpConfig();
      mockSftpClient.connect.mockRejectedValue(new Error('Authentication failed'));

      await expect(service.connect(config)).rejects.toThrow('Authentication failed');
    });

    it('handles timeout', async () => {
      const config = createMockSftpConfig();
      mockSftpClient.connect.mockRejectedValue(new Error('Connection timeout'));

      await expect(service.connect(config)).rejects.toThrow('Connection timeout');
    });
  });

  describe('upload', () => {
    it('uploads file to correct path', async () => {
      const config = createMockSftpConfig();
      const localPath = '/tmp/data.csv';
      const remotePath = '/incoming/data.csv';

      await service.connect(config);
      await service.upload(localPath, remotePath);

      expect(mockSftpClient.put).toHaveBeenCalledWith(localPath, remotePath);
    });

    it('creates directory if not exists', async () => {
      const config = createMockSftpConfig();
      mockSftpClient.exists.mockResolvedValue(false);

      await service.connect(config);
      await service.upload('/tmp/data.csv', '/incoming/new_folder/data.csv');

      expect(mockSftpClient.mkdir).toHaveBeenCalledWith('/incoming/new_folder', true);
    });

    it('handles upload failure', async () => {
      const config = createMockSftpConfig();
      mockSftpClient.put.mockRejectedValue(new Error('Upload failed: disk full'));

      await service.connect(config);
      await expect(service.upload('/tmp/data.csv', '/incoming/data.csv')).rejects.toThrow(
        'Upload failed'
      );
    });

    it('handles permission denied', async () => {
      const config = createMockSftpConfig();
      mockSftpClient.put.mockRejectedValue(new Error('Permission denied'));

      await service.connect(config);
      await expect(service.upload('/tmp/data.csv', '/incoming/data.csv')).rejects.toThrow(
        'Permission denied'
      );
    });

    it('throws error if not connected', async () => {
      await expect(service.upload('/tmp/data.csv', '/incoming/data.csv')).rejects.toThrow();
    });
  });

  describe('uploadWithRetry', () => {
    it('retries on transient errors', async () => {
      const config = createMockSftpConfig();
      mockSftpClient.put
        .mockRejectedValueOnce(new Error('Connection reset'))
        .mockRejectedValueOnce(new Error('Connection reset'))
        .mockResolvedValueOnce(undefined);

      await service.connect(config);
      await service.uploadWithRetry('/tmp/data.csv', '/incoming/data.csv', { maxRetries: 3 });

      expect(mockSftpClient.put).toHaveBeenCalledTimes(3);
    });

    it('gives up after max retries', async () => {
      const config = createMockSftpConfig();
      mockSftpClient.put.mockRejectedValue(new Error('Connection reset'));

      await service.connect(config);
      await expect(
        service.uploadWithRetry('/tmp/data.csv', '/incoming/data.csv', { maxRetries: 3 })
      ).rejects.toThrow();

      expect(mockSftpClient.put).toHaveBeenCalledTimes(3);
    });

    it('respects retry delay', async () => {
      const config = createMockSftpConfig();
      mockSftpClient.put
        .mockRejectedValueOnce(new Error('Connection reset'))
        .mockResolvedValueOnce(undefined);

      const startTime = Date.now();
      await service.connect(config);
      await service.uploadWithRetry('/tmp/data.csv', '/incoming/data.csv', {
        maxRetries: 2,
        retryDelay: 100,
      });

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });

    it('uses exponential backoff', async () => {
      const config = createMockSftpConfig();
      mockSftpClient.put
        .mockRejectedValueOnce(new Error('Connection reset'))
        .mockRejectedValueOnce(new Error('Connection reset'))
        .mockResolvedValueOnce(undefined);

      await service.connect(config);
      await service.uploadWithRetry('/tmp/data.csv', '/incoming/data.csv', {
        maxRetries: 3,
        retryDelay: 50,
        exponentialBackoff: true,
      });

      expect(mockSftpClient.put).toHaveBeenCalledTimes(3);
    });
  });

  describe('testConnection', () => {
    it('validates config with successful connection', async () => {
      const config = createMockSftpConfig();

      const result = await service.testConnection(config);

      expect(result).toBe(true);
      expect(mockSftpClient.connect).toHaveBeenCalled();
      expect(mockSftpClient.end).toHaveBeenCalled();
    });

    it('returns false for invalid config', async () => {
      const config = createMockSftpConfig();
      mockSftpClient.connect.mockRejectedValue(new Error('Connection refused'));

      const result = await service.testConnection(config);

      expect(result).toBe(false);
    });

    it('validates remote path exists', async () => {
      const config = createMockSftpConfig();

      await service.testConnection(config);

      expect(mockSftpClient.exists).toHaveBeenCalledWith('/incoming');
    });

    it('returns false if remote path does not exist', async () => {
      const config = createMockSftpConfig();
      mockSftpClient.exists.mockResolvedValue(false);

      const result = await service.testConnection(config);

      expect(result).toBe(false);
    });

    it('closes connection after test', async () => {
      const config = createMockSftpConfig();

      await service.testConnection(config);

      expect(mockSftpClient.end).toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('closes connection', async () => {
      const config = createMockSftpConfig();

      await service.connect(config);
      await service.disconnect();

      expect(mockSftpClient.end).toHaveBeenCalled();
    });

    it('handles disconnect without connection', async () => {
      await expect(service.disconnect()).resolves.not.toThrow();
    });
  });

  describe('listFiles', () => {
    it('lists files in remote directory', async () => {
      const config = createMockSftpConfig();
      mockSftpClient.list.mockResolvedValue([
        { name: 'file1.csv', type: '-', size: 1000 },
        { name: 'file2.csv', type: '-', size: 2000 },
        { name: 'subdir', type: 'd', size: 0 },
      ]);

      await service.connect(config);
      const files = await service.listFiles('/incoming');

      expect(files).toHaveLength(3);
      expect(files[0].name).toBe('file1.csv');
    });

    it('filters by pattern', async () => {
      const config = createMockSftpConfig();
      mockSftpClient.list.mockResolvedValue([
        { name: 'data.csv', type: '-', size: 1000 },
        { name: 'data.pdf', type: '-', size: 2000 },
        { name: 'data.jdf', type: '-', size: 500 },
      ]);

      await service.connect(config);
      const files = await service.listFiles('/incoming', '*.csv');

      expect(files).toHaveLength(1);
      expect(files[0].name).toBe('data.csv');
    });
  });

  describe('getFileInfo', () => {
    it('returns file info', async () => {
      const config = createMockSftpConfig();
      mockSftpClient.stat.mockResolvedValue({
        size: 12345,
        modifyTime: Date.now(),
        isDirectory: false,
      });

      await service.connect(config);
      const info = await service.getFileInfo('/incoming/data.csv');

      expect(info.size).toBe(12345);
      expect(info.isDirectory).toBe(false);
    });
  });

  describe('encryptCredentials', () => {
    it('encrypts credentials', () => {
      const credentials = {
        password: 'secret-password',
        privateKey: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...',
      };

      const encrypted = service.encryptCredentials(credentials);

      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toContain('secret-password');
    });

    it('returns consistent format', () => {
      const credentials = { password: 'test123' };

      const encrypted = service.encryptCredentials(credentials);

      // Should be base64 or hex encoded
      expect(encrypted).toMatch(/^[a-zA-Z0-9+/=]+$/);
    });
  });

  describe('decryptCredentials', () => {
    it('decrypts credentials', () => {
      const credentials = { password: 'secret-password' };
      const encrypted = service.encryptCredentials(credentials);

      const decrypted = service.decryptCredentials(encrypted);

      expect(decrypted).toBeDefined();
      expect(decrypted.password).toBeDefined();
    });

    it('throws on invalid encrypted data', () => {
      expect(() => service.decryptCredentials('invalid-data')).toThrow();
    });
  });

  describe('uploadMultiple', () => {
    it('uploads multiple files', async () => {
      const config = createMockSftpConfig();
      const files = [
        { localPath: '/tmp/file1.csv', remotePath: '/incoming/file1.csv' },
        { localPath: '/tmp/file2.pdf', remotePath: '/incoming/file2.pdf' },
        { localPath: '/tmp/file3.jdf', remotePath: '/incoming/file3.jdf' },
      ];

      await service.connect(config);
      const results = await service.uploadMultiple(files);

      expect(results.success).toHaveLength(3);
      expect(results.failed).toHaveLength(0);
      expect(mockSftpClient.put).toHaveBeenCalledTimes(3);
    });

    it('continues on individual failures', async () => {
      const config = createMockSftpConfig();
      const files = [
        { localPath: '/tmp/file1.csv', remotePath: '/incoming/file1.csv' },
        { localPath: '/tmp/file2.pdf', remotePath: '/incoming/file2.pdf' },
      ];

      mockSftpClient.put
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Upload failed'));

      await service.connect(config);
      const results = await service.uploadMultiple(files);

      expect(results.success).toHaveLength(1);
      expect(results.failed).toHaveLength(1);
      expect(results.failed[0].error).toBe('Upload failed');
    });
  });

  describe('singleton instance', () => {
    it('exports singleton instance', () => {
      expect(sftpDeliveryService).toBeDefined();
      expect(sftpDeliveryService).toBeInstanceOf(SftpDeliveryService);
    });
  });
});
