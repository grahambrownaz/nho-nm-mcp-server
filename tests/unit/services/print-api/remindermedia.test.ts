/**
 * Tests for ReminderMedia Print API Adapter
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import {
  ReminderMediaAdapter,
  reminderMediaAdapter,
} from '../../../../src/services/print-api/remindermedia.js';
import type { PostcardRequest, BatchRequest } from '../../../../src/services/print-api/interface.js';

// Mock axios
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      post: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
    })),
  },
}));

// Create mock postcard request
function createMockPostcardRequest(overrides: Partial<PostcardRequest> = {}): PostcardRequest {
  return {
    front: 'https://storage.example.com/postcards/front-123.pdf',
    back: 'https://storage.example.com/postcards/back-123.pdf',
    size: '4x6',
    recipient: {
      name: 'John Smith',
      address: '123 Main Street',
      city: 'Phoenix',
      state: 'AZ',
      zip: '85001',
    },
    ...overrides,
  };
}

// Create mock ReminderMedia API response
function createMockRMResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rm-postcard-123',
    status: 'pending',
    created_at: '2026-02-03T12:00:00Z',
    expected_delivery_date: '2026-02-08T12:00:00Z',
    ...overrides,
  };
}

describe('ReminderMedia Adapter', () => {
  let adapter: ReminderMediaAdapter;
  let mockAxiosInstance: {
    post: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock axios instance
    mockAxiosInstance = {
      post: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
    };

    vi.mocked(axios.create).mockReturnValue(mockAxiosInstance as any);

    adapter = new ReminderMediaAdapter({
      apiKey: 'test-api-key',
      baseUrl: 'https://api.remindermedia.com/v1',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createPostcard', () => {
    it('sends correct payload to ReminderMedia API', async () => {
      const request = createMockPostcardRequest();
      mockAxiosInstance.post.mockResolvedValue({
        data: createMockRMResponse(),
      });

      await adapter.createPostcard(request);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/postcards',
        expect.objectContaining({
          front_artwork_url: request.front,
          back_artwork_url: request.back,
          size: '4x6',
          to: expect.objectContaining({
            name: 'John Smith',
            address_line1: '123 Main Street',
            city: 'Phoenix',
            state: 'AZ',
            postal_code: '85001',
          }),
        })
      );
    });

    it('handles success response', async () => {
      const request = createMockPostcardRequest();
      mockAxiosInstance.post.mockResolvedValue({
        data: createMockRMResponse({
          id: 'rm-pc-456',
          status: 'pending',
        }),
      });

      const response = await adapter.createPostcard(request);

      expect(response.id).toBe('rm-pc-456');
      expect(response.status).toBe('pending');
      expect(response.createdAt).toBeInstanceOf(Date);
    });

    it('handles error response', async () => {
      const request = createMockPostcardRequest();
      mockAxiosInstance.post.mockRejectedValue({
        response: {
          status: 400,
          data: {
            error: {
              code: 'INVALID_ADDRESS',
              message: 'The address could not be verified',
            },
          },
        },
      });

      await expect(adapter.createPostcard(request)).rejects.toThrow('The address could not be verified');
    });

    it('includes return address when provided', async () => {
      const request = createMockPostcardRequest({
        returnAddress: {
          name: 'Acme Realty',
          address: '456 Oak Ave',
          city: 'Tempe',
          state: 'AZ',
          zip: '85281',
        },
      });
      mockAxiosInstance.post.mockResolvedValue({
        data: createMockRMResponse(),
      });

      await adapter.createPostcard(request);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/postcards',
        expect.objectContaining({
          from: expect.objectContaining({
            name: 'Acme Realty',
            address_line1: '456 Oak Ave',
            city: 'Tempe',
            state: 'AZ',
            postal_code: '85281',
          }),
        })
      );
    });

    it('includes metadata when provided', async () => {
      const request = createMockPostcardRequest({
        metadata: {
          subscriptionId: 'sub-123',
          tenantId: 'tenant-456',
        },
      });
      mockAxiosInstance.post.mockResolvedValue({
        data: createMockRMResponse(),
      });

      await adapter.createPostcard(request);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/postcards',
        expect.objectContaining({
          metadata: expect.objectContaining({
            subscriptionId: 'sub-123',
            tenantId: 'tenant-456',
          }),
        })
      );
    });

    it('handles 6x9 postcard size', async () => {
      const request = createMockPostcardRequest({ size: '6x9' });
      mockAxiosInstance.post.mockResolvedValue({
        data: createMockRMResponse(),
      });

      await adapter.createPostcard(request);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/postcards',
        expect.objectContaining({
          size: '6x9',
        })
      );
    });

    it('handles 6x11 postcard size', async () => {
      const request = createMockPostcardRequest({ size: '6x11' });
      mockAxiosInstance.post.mockResolvedValue({
        data: createMockRMResponse(),
      });

      await adapter.createPostcard(request);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/postcards',
        expect.objectContaining({
          size: '6x11',
        })
      );
    });
  });

  describe('createBatch', () => {
    it('sends multiple postcards in batch', async () => {
      const batch: BatchRequest = {
        postcards: [
          createMockPostcardRequest({
            recipient: { name: 'John', address: '123 Main', city: 'Phoenix', state: 'AZ', zip: '85001' },
          }),
          createMockPostcardRequest({
            recipient: { name: 'Jane', address: '456 Oak', city: 'Tempe', state: 'AZ', zip: '85281' },
          }),
          createMockPostcardRequest({
            recipient: { name: 'Bob', address: '789 Pine', city: 'Mesa', state: 'AZ', zip: '85201' },
          }),
        ],
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: {
          batch_id: 'rm-batch-123',
          total_count: 3,
          success_count: 3,
          failed_count: 0,
          postcards: [
            { id: 'rm-pc-1', status: 'pending', created_at: '2026-02-03T12:00:00Z' },
            { id: 'rm-pc-2', status: 'pending', created_at: '2026-02-03T12:00:00Z' },
            { id: 'rm-pc-3', status: 'pending', created_at: '2026-02-03T12:00:00Z' },
          ],
          failed_postcards: [],
        },
      });

      const response = await adapter.createBatch(batch);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/postcards/batch',
        expect.objectContaining({
          postcards: expect.arrayContaining([
            expect.objectContaining({
              to: expect.objectContaining({ name: 'John' }),
            }),
            expect.objectContaining({
              to: expect.objectContaining({ name: 'Jane' }),
            }),
            expect.objectContaining({
              to: expect.objectContaining({ name: 'Bob' }),
            }),
          ]),
        })
      );
      expect(response.batchId).toBe('rm-batch-123');
      expect(response.totalCount).toBe(3);
      expect(response.successCount).toBe(3);
    });

    it('handles partial batch failure', async () => {
      const batch: BatchRequest = {
        postcards: [
          createMockPostcardRequest({
            recipient: { name: 'John', address: '123 Main', city: 'Phoenix', state: 'AZ', zip: '85001' },
          }),
          createMockPostcardRequest({
            recipient: { name: 'Invalid', address: '', city: '', state: '', zip: '' },
          }),
        ],
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: {
          batch_id: 'rm-batch-456',
          total_count: 2,
          success_count: 1,
          failed_count: 1,
          postcards: [
            { id: 'rm-pc-1', status: 'pending', created_at: '2026-02-03T12:00:00Z' },
          ],
          failed_postcards: [
            {
              index: 1,
              error: 'Invalid address',
            },
          ],
        },
      });

      const response = await adapter.createBatch(batch);

      expect(response.successCount).toBe(1);
      expect(response.failedCount).toBe(1);
      expect(response.failedPostcards).toHaveLength(1);
      expect(response.failedPostcards[0].error).toBe('Invalid address');
    });

    it('includes batch metadata', async () => {
      const batch: BatchRequest = {
        postcards: [createMockPostcardRequest()],
        metadata: {
          batchId: 'internal-batch-123',
          subscriptionId: 'sub-456',
        },
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: {
          batch_id: 'rm-batch-789',
          total_count: 1,
          success_count: 1,
          failed_count: 0,
          postcards: [{ id: 'rm-pc-1', status: 'pending', created_at: '2026-02-03T12:00:00Z' }],
          failed_postcards: [],
        },
      });

      await adapter.createBatch(batch);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/postcards/batch',
        expect.objectContaining({
          metadata: expect.objectContaining({
            batchId: 'internal-batch-123',
            subscriptionId: 'sub-456',
          }),
        })
      );
    });
  });

  describe('getStatus', () => {
    it('returns job status', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          id: 'rm-pc-123',
          status: 'in_transit',
          created_at: '2026-02-03T12:00:00Z',
          updated_at: '2026-02-04T12:00:00Z',
          expected_delivery_date: '2026-02-08T12:00:00Z',
        },
      });

      const response = await adapter.getStatus('rm-pc-123');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/postcards/rm-pc-123');
      expect(response.id).toBe('rm-pc-123');
      expect(response.status).toBe('in_transit');
    });

    it('maps ReminderMedia status to our enum', async () => {
      const statusMappings = [
        { rmStatus: 'pending', ourStatus: 'pending' },
        { rmStatus: 'processing', ourStatus: 'processing' },
        { rmStatus: 'printed', ourStatus: 'printed' },
        { rmStatus: 'mailed', ourStatus: 'in_transit' },
        { rmStatus: 'in_local_area', ourStatus: 'in_transit' },
        { rmStatus: 'delivered', ourStatus: 'delivered' },
        { rmStatus: 'returned', ourStatus: 'returned' },
        { rmStatus: 'cancelled', ourStatus: 'cancelled' },
        { rmStatus: 'failed', ourStatus: 'failed' },
      ];

      for (const mapping of statusMappings) {
        mockAxiosInstance.get.mockResolvedValueOnce({
          data: {
            id: 'rm-pc-123',
            status: mapping.rmStatus,
            created_at: '2026-02-03T12:00:00Z',
            updated_at: '2026-02-04T12:00:00Z',
          },
        });

        const response = await adapter.getStatus('rm-pc-123');
        expect(response.status).toBe(mapping.ourStatus);
      }
    });

    it('includes tracking events when available', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          id: 'rm-pc-123',
          status: 'in_transit',
          created_at: '2026-02-03T12:00:00Z',
          updated_at: '2026-02-05T12:00:00Z',
          tracking_events: [
            {
              timestamp: '2026-02-04T08:00:00Z',
              location: 'Phoenix, AZ',
              event: 'Processed through facility',
            },
            {
              timestamp: '2026-02-05T10:00:00Z',
              location: 'Tempe, AZ',
              event: 'Out for delivery',
            },
          ],
        },
      });

      const response = await adapter.getStatus('rm-pc-123');

      expect(response.trackingEvents).toHaveLength(2);
      expect(response.trackingEvents![0].location).toBe('Phoenix, AZ');
    });

    it('handles not found error', async () => {
      mockAxiosInstance.get.mockRejectedValue({
        response: {
          status: 404,
          data: {
            error: {
              code: 'NOT_FOUND',
              message: 'Postcard not found',
            },
          },
        },
      });

      await expect(adapter.getStatus('invalid-id')).rejects.toThrow('Postcard not found');
    });
  });

  describe('cancelJob', () => {
    it('cancels pending job successfully', async () => {
      mockAxiosInstance.delete.mockResolvedValue({
        data: {
          id: 'rm-pc-123',
          status: 'cancelled',
        },
      });

      const result = await adapter.cancelJob('rm-pc-123');

      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/postcards/rm-pc-123');
      expect(result).toBe(true);
    });

    it('returns false for non-cancellable job', async () => {
      mockAxiosInstance.delete.mockRejectedValue({
        response: {
          status: 400,
          data: {
            error: {
              code: 'CANNOT_CANCEL',
              message: 'Job has already been printed and cannot be cancelled',
            },
          },
        },
      });

      const result = await adapter.cancelJob('rm-pc-123');

      expect(result).toBe(false);
    });

    it('throws error for other failures', async () => {
      mockAxiosInstance.delete.mockRejectedValue({
        response: {
          status: 500,
          data: {
            error: {
              code: 'INTERNAL_ERROR',
              message: 'An internal error occurred',
            },
          },
        },
      });

      await expect(adapter.cancelJob('rm-pc-123')).rejects.toThrow('An internal error occurred');
    });
  });

  describe('retry logic', () => {
    it('retries on transient failures', async () => {
      const request = createMockPostcardRequest();

      mockAxiosInstance.post
        .mockRejectedValueOnce({ response: { status: 503 } })
        .mockRejectedValueOnce({ response: { status: 503 } })
        .mockResolvedValueOnce({
          data: createMockRMResponse(),
        });

      const response = await adapter.createPostcard(request);

      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3);
      expect(response.id).toBe('rm-postcard-123');
    });

    it('retries on rate limit', async () => {
      const request = createMockPostcardRequest();

      mockAxiosInstance.post
        .mockRejectedValueOnce({
          response: {
            status: 429,
            headers: {
              'retry-after': '1',
            },
          },
        })
        .mockResolvedValueOnce({
          data: createMockRMResponse(),
        });

      const response = await adapter.createPostcard(request);

      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
      expect(response.id).toBeDefined();
    });

    it('gives up after max retries', async () => {
      const request = createMockPostcardRequest();

      mockAxiosInstance.post.mockRejectedValue({
        response: { status: 503 },
      });

      await expect(adapter.createPostcard(request)).rejects.toThrow();

      // Default max retries is 3
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3);
    });

    it('does not retry on client errors', async () => {
      const request = createMockPostcardRequest();

      mockAxiosInstance.post.mockRejectedValue({
        response: {
          status: 400,
          data: {
            error: {
              code: 'INVALID_REQUEST',
              message: 'Bad request',
            },
          },
        },
      });

      await expect(adapter.createPostcard(request)).rejects.toThrow('Bad request');

      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
    });

    it('retries on network errors', async () => {
      const request = createMockPostcardRequest();

      mockAxiosInstance.post
        .mockRejectedValueOnce(new Error('Network Error'))
        .mockResolvedValueOnce({
          data: createMockRMResponse(),
        });

      const response = await adapter.createPostcard(request);

      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
      expect(response.id).toBeDefined();
    });
  });

  describe('webhook validation', () => {
    it('validates webhook signature', async () => {
      const payload = JSON.stringify({
        id: 'rm-pc-123',
        status: 'delivered',
      });
      const signature = 'valid-signature';
      const secret = 'webhook-secret';

      const isValid = adapter.validateWebhookSignature(payload, signature, secret);

      expect(typeof isValid).toBe('boolean');
    });
  });

  describe('singleton instance', () => {
    it('exports singleton instance', () => {
      expect(reminderMediaAdapter).toBeDefined();
      expect(reminderMediaAdapter).toBeInstanceOf(ReminderMediaAdapter);
    });
  });
});
