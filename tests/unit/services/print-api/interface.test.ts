/**
 * Tests for Print API Interface Types
 */

import { describe, it, expect } from 'vitest';
import type {
  PrintApiAdapter,
  PostcardRequest,
  PostcardResponse,
  BatchRequest,
  BatchResponse,
  JobStatus,
  JobStatusResponse,
  PrintApiConfig,
  PrintApiError,
} from '../../../../src/services/print-api/interface.js';

describe('Print API Interface Types', () => {
  describe('PostcardRequest', () => {
    it('defines required fields', () => {
      const request: PostcardRequest = {
        front: 'https://example.com/front.pdf',
        back: 'https://example.com/back.pdf',
        size: '4x6',
        recipient: {
          name: 'John Smith',
          address: '123 Main St',
          city: 'Phoenix',
          state: 'AZ',
          zip: '85001',
        },
      };

      expect(request.front).toBeDefined();
      expect(request.back).toBeDefined();
      expect(request.size).toBeDefined();
      expect(request.recipient).toBeDefined();
    });

    it('allows optional return address', () => {
      const request: PostcardRequest = {
        front: 'https://example.com/front.pdf',
        back: 'https://example.com/back.pdf',
        size: '4x6',
        recipient: {
          name: 'John Smith',
          address: '123 Main St',
          city: 'Phoenix',
          state: 'AZ',
          zip: '85001',
        },
        returnAddress: {
          name: 'Acme Realty',
          address: '456 Oak Ave',
          city: 'Tempe',
          state: 'AZ',
          zip: '85281',
        },
      };

      expect(request.returnAddress).toBeDefined();
      expect(request.returnAddress?.name).toBe('Acme Realty');
    });

    it('allows optional metadata', () => {
      const request: PostcardRequest = {
        front: 'https://example.com/front.pdf',
        back: 'https://example.com/back.pdf',
        size: '6x9',
        recipient: {
          name: 'Jane Doe',
          address: '789 Pine Blvd',
          city: 'Mesa',
          state: 'AZ',
          zip: '85201',
        },
        metadata: {
          subscriptionId: 'sub-123',
          tenantId: 'tenant-456',
          batchId: 'batch-789',
        },
      };

      expect(request.metadata).toBeDefined();
      expect(request.metadata?.subscriptionId).toBe('sub-123');
    });

    it('supports all postcard sizes', () => {
      const sizes: Array<'4x6' | '6x9' | '6x11'> = ['4x6', '6x9', '6x11'];

      sizes.forEach((size) => {
        const request: PostcardRequest = {
          front: 'https://example.com/front.pdf',
          back: 'https://example.com/back.pdf',
          size,
          recipient: {
            name: 'Test',
            address: '123 Test St',
            city: 'Test City',
            state: 'AZ',
            zip: '85001',
          },
        };

        expect(request.size).toBe(size);
      });
    });
  });

  describe('PostcardResponse', () => {
    it('defines response fields', () => {
      const response: PostcardResponse = {
        id: 'postcard-123',
        status: 'pending',
        createdAt: new Date(),
        expectedDeliveryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      };

      expect(response.id).toBeDefined();
      expect(response.status).toBeDefined();
      expect(response.createdAt).toBeInstanceOf(Date);
    });

    it('allows optional tracking info', () => {
      const response: PostcardResponse = {
        id: 'postcard-123',
        status: 'in_transit',
        createdAt: new Date(),
        trackingNumber: 'TRK123456789',
        carrier: 'USPS',
      };

      expect(response.trackingNumber).toBe('TRK123456789');
      expect(response.carrier).toBe('USPS');
    });
  });

  describe('BatchRequest', () => {
    it('defines batch of postcards', () => {
      const batch: BatchRequest = {
        postcards: [
          {
            front: 'https://example.com/front.pdf',
            back: 'https://example.com/back.pdf',
            size: '4x6',
            recipient: {
              name: 'John Smith',
              address: '123 Main St',
              city: 'Phoenix',
              state: 'AZ',
              zip: '85001',
            },
          },
          {
            front: 'https://example.com/front.pdf',
            back: 'https://example.com/back.pdf',
            size: '4x6',
            recipient: {
              name: 'Jane Doe',
              address: '456 Oak Ave',
              city: 'Tempe',
              state: 'AZ',
              zip: '85281',
            },
          },
        ],
      };

      expect(batch.postcards).toHaveLength(2);
    });

    it('allows batch metadata', () => {
      const batch: BatchRequest = {
        postcards: [],
        metadata: {
          batchId: 'batch-123',
          subscriptionId: 'sub-456',
        },
      };

      expect(batch.metadata?.batchId).toBe('batch-123');
    });
  });

  describe('BatchResponse', () => {
    it('defines batch response fields', () => {
      const response: BatchResponse = {
        batchId: 'batch-123',
        totalCount: 100,
        successCount: 98,
        failedCount: 2,
        postcards: [],
        failedPostcards: [],
      };

      expect(response.batchId).toBeDefined();
      expect(response.totalCount).toBe(100);
      expect(response.successCount).toBe(98);
      expect(response.failedCount).toBe(2);
    });

    it('includes individual postcard results', () => {
      const response: BatchResponse = {
        batchId: 'batch-123',
        totalCount: 2,
        successCount: 2,
        failedCount: 0,
        postcards: [
          { id: 'pc-1', status: 'pending', createdAt: new Date() },
          { id: 'pc-2', status: 'pending', createdAt: new Date() },
        ],
        failedPostcards: [],
      };

      expect(response.postcards).toHaveLength(2);
    });

    it('includes failed postcard details', () => {
      const response: BatchResponse = {
        batchId: 'batch-123',
        totalCount: 3,
        successCount: 2,
        failedCount: 1,
        postcards: [
          { id: 'pc-1', status: 'pending', createdAt: new Date() },
          { id: 'pc-2', status: 'pending', createdAt: new Date() },
        ],
        failedPostcards: [
          {
            index: 2,
            error: 'Invalid address',
            originalRequest: {
              front: 'https://example.com/front.pdf',
              back: 'https://example.com/back.pdf',
              size: '4x6',
              recipient: {
                name: 'Bad Address',
                address: '',
                city: '',
                state: '',
                zip: '',
              },
            },
          },
        ],
      };

      expect(response.failedPostcards).toHaveLength(1);
      expect(response.failedPostcards[0].error).toBe('Invalid address');
    });
  });

  describe('JobStatus enum', () => {
    it('defines all status values', () => {
      const statuses: JobStatus[] = [
        'pending',
        'processing',
        'printed',
        'in_transit',
        'delivered',
        'returned',
        'cancelled',
        'failed',
      ];

      expect(statuses).toContain('pending');
      expect(statuses).toContain('delivered');
      expect(statuses).toContain('failed');
    });
  });

  describe('JobStatusResponse', () => {
    it('defines status response fields', () => {
      const response: JobStatusResponse = {
        id: 'job-123',
        status: 'in_transit',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(response.id).toBeDefined();
      expect(response.status).toBe('in_transit');
    });

    it('includes delivery details when available', () => {
      const response: JobStatusResponse = {
        id: 'job-123',
        status: 'delivered',
        createdAt: new Date(),
        updatedAt: new Date(),
        deliveredAt: new Date(),
        trackingEvents: [
          { timestamp: new Date(), location: 'Phoenix, AZ', event: 'Delivered' },
        ],
      };

      expect(response.deliveredAt).toBeDefined();
      expect(response.trackingEvents).toHaveLength(1);
    });
  });

  describe('PrintApiConfig', () => {
    it('defines configuration fields', () => {
      const config: PrintApiConfig = {
        apiKey: 'test-api-key',
        baseUrl: 'https://api.remindermedia.com',
        timeout: 30000,
      };

      expect(config.apiKey).toBeDefined();
      expect(config.baseUrl).toBeDefined();
    });

    it('allows optional webhook URL', () => {
      const config: PrintApiConfig = {
        apiKey: 'test-api-key',
        baseUrl: 'https://api.remindermedia.com',
        webhookUrl: 'https://myapp.com/webhooks/print',
      };

      expect(config.webhookUrl).toBeDefined();
    });
  });

  describe('PrintApiError', () => {
    it('defines error structure', () => {
      const error: PrintApiError = {
        code: 'INVALID_ADDRESS',
        message: 'The recipient address is invalid',
        details: {
          field: 'recipient.zip',
          value: '123',
        },
      };

      expect(error.code).toBeDefined();
      expect(error.message).toBeDefined();
    });

    it('allows retryable flag', () => {
      const error: PrintApiError = {
        code: 'RATE_LIMITED',
        message: 'Too many requests',
        retryable: true,
        retryAfter: 60,
      };

      expect(error.retryable).toBe(true);
      expect(error.retryAfter).toBe(60);
    });
  });

  describe('PrintApiAdapter interface', () => {
    it('defines required methods', () => {
      // This test verifies the interface structure by creating a mock implementation
      const mockAdapter: PrintApiAdapter = {
        createPostcard: async (request: PostcardRequest) => ({
          id: 'pc-123',
          status: 'pending' as JobStatus,
          createdAt: new Date(),
        }),
        createBatch: async (request: BatchRequest) => ({
          batchId: 'batch-123',
          totalCount: request.postcards.length,
          successCount: request.postcards.length,
          failedCount: 0,
          postcards: [],
          failedPostcards: [],
        }),
        getStatus: async (jobId: string) => ({
          id: jobId,
          status: 'pending' as JobStatus,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        cancelJob: async (jobId: string) => true,
      };

      expect(mockAdapter.createPostcard).toBeDefined();
      expect(mockAdapter.createBatch).toBeDefined();
      expect(mockAdapter.getStatus).toBeDefined();
      expect(mockAdapter.cancelJob).toBeDefined();
    });
  });
});
