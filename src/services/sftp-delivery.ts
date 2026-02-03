/**
 * SFTP Delivery Service
 * Handles file uploads to printer hot folders via SFTP
 */

import SftpClient from 'ssh2-sftp-client';
import * as fs from 'fs';
import * as path from 'path';

/**
 * SFTP connection configuration
 */
export interface SftpConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  folderPath: string;
}

/**
 * File upload result
 */
export interface UploadResult {
  success: boolean;
  localPath: string;
  remotePath: string;
  fileSize: number;
  uploadedAt: Date;
  error?: string;
}

/**
 * Batch upload result
 */
export interface BatchUploadResult {
  success: boolean;
  totalFiles: number;
  successCount: number;
  failedCount: number;
  results: UploadResult[];
  errors: string[];
}

/**
 * Connection test result
 */
export interface ConnectionTestResult {
  success: boolean;
  message: string;
  serverInfo?: {
    serverVersion: string;
  };
  folderExists?: boolean;
  folderWritable?: boolean;
  latencyMs?: number;
  error?: string;
}

/**
 * Retry configuration
 */
const RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
function getBackoffDelay(attempt: number): number {
  const delay = RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt - 1);
  return Math.min(delay, RETRY_CONFIG.maxDelayMs);
}

/**
 * SftpDeliveryService class
 * Manages SFTP connections and file uploads
 */
export class SftpDeliveryService {
  /**
   * Test SFTP connection and folder accessibility
   */
  async testConnection(config: SftpConfig): Promise<ConnectionTestResult> {
    const sftp = new SftpClient();
    const startTime = Date.now();

    try {
      // Connect to SFTP server
      await sftp.connect({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        privateKey: config.privateKey,
        readyTimeout: 10000,
        retries: 1,
      });

      const latencyMs = Date.now() - startTime;

      // Check if folder exists
      let folderExists = false;
      let folderWritable = false;

      try {
        const stat = await sftp.stat(config.folderPath);
        folderExists = stat.isDirectory;

        if (folderExists) {
          // Test write access by creating and deleting a test file
          const testFileName = `.connection_test_${Date.now()}.tmp`;
          const testPath = path.posix.join(config.folderPath, testFileName);

          try {
            // Create a small test file
            const testBuffer = Buffer.from('connection test');
            await sftp.put(testBuffer, testPath);
            await sftp.delete(testPath);
            folderWritable = true;
          } catch {
            folderWritable = false;
          }
        }
      } catch {
        folderExists = false;
      }

      await sftp.end();

      return {
        success: true,
        message: folderWritable
          ? 'Connection successful. Folder exists and is writable.'
          : folderExists
            ? 'Connection successful but folder is not writable.'
            : 'Connection successful but folder does not exist.',
        folderExists,
        folderWritable,
        latencyMs,
      };
    } catch (error) {
      try {
        await sftp.end();
      } catch {
        // Ignore cleanup errors
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        message: 'Connection failed',
        error: errorMessage,
      };
    }
  }

  /**
   * Upload a single file to SFTP server with retry logic
   */
  async uploadFile(
    config: SftpConfig,
    localPath: string,
    remotePath?: string
  ): Promise<UploadResult> {
    // Determine remote path
    const fileName = path.basename(localPath);
    const fullRemotePath = remotePath
      ? path.posix.join(config.folderPath, remotePath)
      : path.posix.join(config.folderPath, fileName);

    // Get file size
    let fileSize = 0;
    try {
      const stats = fs.statSync(localPath);
      fileSize = stats.size;
    } catch (error) {
      return {
        success: false,
        localPath,
        remotePath: fullRemotePath,
        fileSize: 0,
        uploadedAt: new Date(),
        error: `Cannot read local file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }

    // Attempt upload with retries
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
      const sftp = new SftpClient();

      try {
        await sftp.connect({
          host: config.host,
          port: config.port,
          username: config.username,
          password: config.password,
          privateKey: config.privateKey,
          readyTimeout: 10000,
        });

        // Ensure directory exists
        const remoteDir = path.posix.dirname(fullRemotePath);
        try {
          await sftp.mkdir(remoteDir, true);
        } catch {
          // Directory might already exist
        }

        // Upload file
        await sftp.put(localPath, fullRemotePath);

        await sftp.end();

        return {
          success: true,
          localPath,
          remotePath: fullRemotePath,
          fileSize,
          uploadedAt: new Date(),
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';

        try {
          await sftp.end();
        } catch {
          // Ignore cleanup errors
        }

        // If not the last attempt, wait and retry
        if (attempt < RETRY_CONFIG.maxAttempts) {
          const delay = getBackoffDelay(attempt);
          console.log(
            `[SFTP] Upload attempt ${attempt} failed, retrying in ${delay}ms: ${lastError}`
          );
          await sleep(delay);
        }
      }
    }

    return {
      success: false,
      localPath,
      remotePath: fullRemotePath,
      fileSize,
      uploadedAt: new Date(),
      error: `Upload failed after ${RETRY_CONFIG.maxAttempts} attempts: ${lastError}`,
    };
  }

  /**
   * Upload multiple files to SFTP server
   */
  async uploadBatch(
    config: SftpConfig,
    files: Array<{ localPath: string; remotePath?: string }>
  ): Promise<BatchUploadResult> {
    const results: UploadResult[] = [];
    const errors: string[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (const file of files) {
      const result = await this.uploadFile(config, file.localPath, file.remotePath);
      results.push(result);

      if (result.success) {
        successCount++;
      } else {
        failedCount++;
        if (result.error) {
          errors.push(`${file.localPath}: ${result.error}`);
        }
      }
    }

    return {
      success: failedCount === 0,
      totalFiles: files.length,
      successCount,
      failedCount,
      results,
      errors,
    };
  }

  /**
   * Upload a buffer directly to SFTP (for dynamically generated content)
   */
  async uploadBuffer(
    config: SftpConfig,
    buffer: Buffer,
    remotePath: string
  ): Promise<UploadResult> {
    const fullRemotePath = path.posix.join(config.folderPath, remotePath);
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
      const sftp = new SftpClient();

      try {
        await sftp.connect({
          host: config.host,
          port: config.port,
          username: config.username,
          password: config.password,
          privateKey: config.privateKey,
          readyTimeout: 10000,
        });

        // Ensure directory exists
        const remoteDir = path.posix.dirname(fullRemotePath);
        try {
          await sftp.mkdir(remoteDir, true);
        } catch {
          // Directory might already exist
        }

        // Upload buffer
        await sftp.put(buffer, fullRemotePath);

        await sftp.end();

        return {
          success: true,
          localPath: '[buffer]',
          remotePath: fullRemotePath,
          fileSize: buffer.length,
          uploadedAt: new Date(),
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';

        try {
          await sftp.end();
        } catch {
          // Ignore cleanup errors
        }

        if (attempt < RETRY_CONFIG.maxAttempts) {
          const delay = getBackoffDelay(attempt);
          await sleep(delay);
        }
      }
    }

    return {
      success: false,
      localPath: '[buffer]',
      remotePath: fullRemotePath,
      fileSize: buffer.length,
      uploadedAt: new Date(),
      error: `Upload failed after ${RETRY_CONFIG.maxAttempts} attempts: ${lastError}`,
    };
  }
}

// Singleton instance
let sftpServiceInstance: SftpDeliveryService | null = null;

/**
 * Get the singleton SFTP delivery service instance
 */
export function getSftpDeliveryService(): SftpDeliveryService {
  if (!sftpServiceInstance) {
    sftpServiceInstance = new SftpDeliveryService();
  }
  return sftpServiceInstance;
}
