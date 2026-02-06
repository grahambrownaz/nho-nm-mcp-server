/**
 * Tests for SWOTSPOT API Client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SwotspotClient } from '../../../../src/services/swotspot/client.js';

// Mock the global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('SwotspotClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('creates client with API key', () => {
      const client = new SwotspotClient({ apiKey: 'test-key' });
      expect(client).toBeDefined();
    });

    it('uses default base URL', () => {
      const client = new SwotspotClient({ apiKey: 'test-key' });
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('{}'),
      });
      client.get('/test');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://api.swotspot.ai/test'),
        expect.any(Object)
      );
    });

    it('accepts custom base URL', () => {
      const client = new SwotspotClient({
        apiKey: 'test-key',
        baseUrl: 'https://custom.api.com',
      });
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('{}'),
      });
      client.get('/test');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://custom.api.com/test'),
        expect.any(Object)
      );
    });
  });

  describe('authentication', () => {
    it('sends Bearer token in Authorization header', async () => {
      const client = new SwotspotClient({ apiKey: 'my-api-key' });
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('{}'),
      });

      await client.get('/test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer my-api-key',
          }),
        })
      );
    });
  });

  describe('testConnection', () => {
    it('returns success (mock mode)', async () => {
      const client = new SwotspotClient({ apiKey: 'test-key' });

      const result = await client.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
      expect(result.accountId).toBeDefined();
    });
  });

  describe('GET requests', () => {
    it('makes GET request and parses JSON response', async () => {
      const client = new SwotspotClient({ apiKey: 'key' });
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ data: 'test' })),
      });

      const result = await client.get('/endpoint');

      expect(result).toEqual({ data: 'test' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('appends query parameters', async () => {
      const client = new SwotspotClient({ apiKey: 'key' });
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('{}'),
      });

      await client.get('/endpoint', { foo: 'bar' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('foo=bar'),
        expect.any(Object)
      );
    });
  });

  describe('POST requests', () => {
    it('makes POST request with JSON body', async () => {
      const client = new SwotspotClient({ apiKey: 'key' });
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ id: '123' })),
      });

      const result = await client.post('/endpoint', { name: 'test' });

      expect(result).toEqual({ id: '123' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'test' }),
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  describe('error handling', () => {
    it('throws ExternalServiceError on HTTP error', async () => {
      const client = new SwotspotClient({ apiKey: 'key' });
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(client.get('/endpoint')).rejects.toThrow('SWOTSPOT');
    });

    it('throws ExternalServiceError on network error', async () => {
      const client = new SwotspotClient({ apiKey: 'key' });
      mockFetch.mockRejectedValue(new Error('Network failure'));

      await expect(client.get('/endpoint')).rejects.toThrow('SWOTSPOT');
    });
  });
});
