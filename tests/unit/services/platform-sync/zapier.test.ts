/**
 * Tests for Zapier Webhook Platform Sync Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import {
  ZapierService,
  zapierService,
} from '../../../../src/services/platform-sync/zapier.js';

// Mock axios
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}));

// Create mock record
function createMockRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'record-123',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Smith',
    address: '123 Main Street',
    city: 'Phoenix',
    state: 'AZ',
    zip: '85001',
    phone: '6025551234',
    saleDate: '2026-02-03',
    salePrice: 450000,
    propertyType: 'Single Family',
    ...overrides,
  };
}

describe('Zapier Service', () => {
  let service: ZapierService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ZapierService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendWebhook', () => {
    it('sends webhook POST request', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        status: 200,
        data: { status: 'success' },
      });

      const record = createMockRecord();
      const result = await service.sendWebhook(
        'https://hooks.zapier.com/hooks/catch/123456/abcdef/',
        record
      );

      expect(result).toBe(true);
      expect(axios.post).toHaveBeenCalledWith(
        'https://hooks.zapier.com/hooks/catch/123456/abcdef/',
        expect.objectContaining({
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Smith',
        }),
        expect.objectContaining({
          timeout: expect.any(Number),
        })
      );
    });

    it('includes all record data in webhook', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        status: 200,
        data: {},
      });

      const record = createMockRecord({
        customField1: 'custom value 1',
        customField2: 'custom value 2',
      });

      await service.sendWebhook(
        'https://hooks.zapier.com/hooks/catch/123456/abcdef/',
        record
      );

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          id: 'record-123',
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Smith',
          address: '123 Main Street',
          city: 'Phoenix',
          state: 'AZ',
          zip: '85001',
          phone: '6025551234',
          saleDate: '2026-02-03',
          salePrice: 450000,
          propertyType: 'Single Family',
          customField1: 'custom value 1',
          customField2: 'custom value 2',
        }),
        expect.any(Object)
      );
    });

    it('includes metadata in webhook', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        status: 200,
        data: {},
      });

      const record = createMockRecord();
      await service.sendWebhook(
        'https://hooks.zapier.com/hooks/catch/123456/abcdef/',
        record,
        {
          metadata: {
            subscriptionId: 'sub-123',
            deliveryId: 'delivery-456',
            tenantId: 'tenant-789',
          },
        }
      );

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          _metadata: expect.objectContaining({
            subscriptionId: 'sub-123',
            deliveryId: 'delivery-456',
          }),
        }),
        expect.any(Object)
      );
    });
  });

  describe('webhook timeout handling', () => {
    it('handles webhook timeout', async () => {
      const timeoutError = new Error('timeout of 30000ms exceeded');
      (timeoutError as any).code = 'ECONNABORTED';
      vi.mocked(axios.post).mockRejectedValue(timeoutError);

      const record = createMockRecord();

      await expect(
        service.sendWebhook('https://hooks.zapier.com/hooks/catch/123456/abcdef/', record)
      ).rejects.toThrow('timeout');
    });

    it('uses configurable timeout', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        status: 200,
        data: {},
      });

      const record = createMockRecord();
      await service.sendWebhook(
        'https://hooks.zapier.com/hooks/catch/123456/abcdef/',
        record,
        { timeout: 60000 }
      );

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          timeout: 60000,
        })
      );
    });
  });

  describe('webhook error handling', () => {
    it('handles webhook error response', async () => {
      vi.mocked(axios.post).mockRejectedValue({
        response: {
          status: 500,
          data: {
            error: 'Internal server error',
          },
        },
      });

      const record = createMockRecord();

      await expect(
        service.sendWebhook('https://hooks.zapier.com/hooks/catch/123456/abcdef/', record)
      ).rejects.toThrow();
    });

    it('handles 4xx errors', async () => {
      vi.mocked(axios.post).mockRejectedValue({
        response: {
          status: 400,
          data: {
            error: 'Bad request',
          },
        },
      });

      const record = createMockRecord();

      await expect(
        service.sendWebhook('https://hooks.zapier.com/hooks/catch/123456/abcdef/', record)
      ).rejects.toThrow();
    });

    it('handles network errors', async () => {
      vi.mocked(axios.post).mockRejectedValue(new Error('Network Error'));

      const record = createMockRecord();

      await expect(
        service.sendWebhook('https://hooks.zapier.com/hooks/catch/123456/abcdef/', record)
      ).rejects.toThrow('Network Error');
    });

    it('handles DNS errors', async () => {
      const dnsError = new Error('getaddrinfo ENOTFOUND');
      (dnsError as any).code = 'ENOTFOUND';
      vi.mocked(axios.post).mockRejectedValue(dnsError);

      const record = createMockRecord();

      await expect(
        service.sendWebhook('https://invalid.webhook.url/', record)
      ).rejects.toThrow();
    });
  });

  describe('sendBatch', () => {
    it('sends multiple records to webhook', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        status: 200,
        data: {},
      });

      const records = [
        createMockRecord({ id: 'record-1', email: 'user1@example.com' }),
        createMockRecord({ id: 'record-2', email: 'user2@example.com' }),
        createMockRecord({ id: 'record-3', email: 'user3@example.com' }),
      ];

      const result = await service.sendBatch({
        webhookUrl: 'https://hooks.zapier.com/hooks/catch/123456/abcdef/',
        records,
      });

      expect(result.sent).toBe(3);
      expect(result.failed).toBe(0);
    });

    it('sends records individually by default', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        status: 200,
        data: {},
      });

      const records = [
        createMockRecord({ id: 'record-1' }),
        createMockRecord({ id: 'record-2' }),
      ];

      await service.sendBatch({
        webhookUrl: 'https://hooks.zapier.com/hooks/catch/123456/abcdef/',
        records,
      });

      expect(axios.post).toHaveBeenCalledTimes(2);
    });

    it('sends records as array when batched', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        status: 200,
        data: {},
      });

      const records = [
        createMockRecord({ id: 'record-1' }),
        createMockRecord({ id: 'record-2' }),
        createMockRecord({ id: 'record-3' }),
      ];

      await service.sendBatch({
        webhookUrl: 'https://hooks.zapier.com/hooks/catch/123456/abcdef/',
        records,
        batchMode: true,
      });

      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          records: expect.arrayContaining([
            expect.objectContaining({ id: 'record-1' }),
            expect.objectContaining({ id: 'record-2' }),
            expect.objectContaining({ id: 'record-3' }),
          ]),
        }),
        expect.any(Object)
      );
    });

    it('continues on individual failures', async () => {
      vi.mocked(axios.post)
        .mockResolvedValueOnce({ status: 200, data: {} })
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ status: 200, data: {} });

      const records = [
        createMockRecord({ id: 'record-1' }),
        createMockRecord({ id: 'record-2' }),
        createMockRecord({ id: 'record-3' }),
      ];

      const result = await service.sendBatch({
        webhookUrl: 'https://hooks.zapier.com/hooks/catch/123456/abcdef/',
        records,
      });

      expect(result.sent).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('includes error details for failures', async () => {
      vi.mocked(axios.post)
        .mockResolvedValueOnce({ status: 200, data: {} })
        .mockRejectedValueOnce(new Error('Connection refused'));

      const records = [
        createMockRecord({ id: 'record-1', email: 'success@example.com' }),
        createMockRecord({ id: 'record-2', email: 'failed@example.com' }),
      ];

      const result = await service.sendBatch({
        webhookUrl: 'https://hooks.zapier.com/hooks/catch/123456/abcdef/',
        records,
      });

      expect(result.errors[0]).toEqual(
        expect.objectContaining({
          recordId: 'record-2',
          error: expect.stringContaining('Connection refused'),
        })
      );
    });
  });

  describe('testWebhook', () => {
    it('tests webhook connectivity', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        status: 200,
        data: { status: 'success' },
      });

      const result = await service.testWebhook(
        'https://hooks.zapier.com/hooks/catch/123456/abcdef/'
      );

      expect(result).toBe(true);
      expect(axios.post).toHaveBeenCalledWith(
        'https://hooks.zapier.com/hooks/catch/123456/abcdef/',
        expect.objectContaining({
          _test: true,
        }),
        expect.any(Object)
      );
    });

    it('returns false for unreachable webhook', async () => {
      vi.mocked(axios.post).mockRejectedValue(new Error('Connection refused'));

      const result = await service.testWebhook('https://invalid.webhook.url/');

      expect(result).toBe(false);
    });

    it('returns false for non-200 response', async () => {
      vi.mocked(axios.post).mockRejectedValue({
        response: {
          status: 404,
        },
      });

      const result = await service.testWebhook(
        'https://hooks.zapier.com/hooks/catch/invalid/'
      );

      expect(result).toBe(false);
    });
  });

  describe('retry logic', () => {
    it('retries on transient errors', async () => {
      vi.mocked(axios.post)
        .mockRejectedValueOnce(new Error('Connection reset'))
        .mockResolvedValueOnce({ status: 200, data: {} });

      const record = createMockRecord();
      const result = await service.sendWebhook(
        'https://hooks.zapier.com/hooks/catch/123456/abcdef/',
        record,
        { retries: 2 }
      );

      expect(result).toBe(true);
      expect(axios.post).toHaveBeenCalledTimes(2);
    });

    it('gives up after max retries', async () => {
      vi.mocked(axios.post).mockRejectedValue(new Error('Connection refused'));

      const record = createMockRecord();

      await expect(
        service.sendWebhook(
          'https://hooks.zapier.com/hooks/catch/123456/abcdef/',
          record,
          { retries: 3 }
        )
      ).rejects.toThrow('Connection refused');

      expect(axios.post).toHaveBeenCalledTimes(3);
    });
  });

  describe('URL validation', () => {
    it('validates webhook URL format', () => {
      expect(service.isValidWebhookUrl('https://hooks.zapier.com/hooks/catch/123/abc')).toBe(true);
      expect(service.isValidWebhookUrl('http://example.com')).toBe(false);
      expect(service.isValidWebhookUrl('not-a-url')).toBe(false);
    });

    it('requires HTTPS', () => {
      expect(service.isValidWebhookUrl('http://hooks.zapier.com/hooks/catch/123/abc')).toBe(false);
    });
  });

  describe('singleton instance', () => {
    it('exports singleton instance', () => {
      expect(zapierService).toBeDefined();
      expect(zapierService).toBeInstanceOf(ZapierService);
    });
  });
});
