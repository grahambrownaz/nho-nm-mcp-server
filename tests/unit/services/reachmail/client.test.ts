/**
 * Tests for ReachMail API Client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReachMailClient } from '../../../../src/services/reachmail/client.js';

// Mock the global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('ReachMailClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('creates client with token', () => {
      const client = new ReachMailClient({ token: 'test-token' });
      expect(client).toBeDefined();
    });

    it('uses default base URL', () => {
      const client = new ReachMailClient({ token: 'test-token' });
      // Test by making a request and checking the URL
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('{}'),
      });
      client.get('/test');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://services.reachmail.net/test'),
        expect.any(Object)
      );
    });

    it('accepts custom base URL', () => {
      const client = new ReachMailClient({
        token: 'test-token',
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
    it('sends bearer token in Authorization header', async () => {
      const client = new ReachMailClient({ token: 'my-secret-token' });
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('{}'),
      });

      await client.get('/test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'bearer my-secret-token',
          }),
        })
      );
    });
  });

  describe('GET requests', () => {
    it('makes GET request and parses JSON response', async () => {
      const client = new ReachMailClient({ token: 'token' });
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
      const client = new ReachMailClient({ token: 'token' });
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('{}'),
      });

      await client.get('/endpoint', { foo: 'bar', baz: 'qux' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('foo=bar'),
        expect.any(Object)
      );
    });
  });

  describe('POST requests', () => {
    it('makes POST request with JSON body', async () => {
      const client = new ReachMailClient({ token: 'token' });
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

  describe('PUT requests', () => {
    it('makes PUT request', async () => {
      const client = new ReachMailClient({ token: 'token' });
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('{}'),
      });

      await client.put('/endpoint', { updated: true });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'PUT' })
      );
    });
  });

  describe('DELETE requests', () => {
    it('makes DELETE request', async () => {
      const client = new ReachMailClient({ token: 'token' });
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(''),
      });

      await client.del('/endpoint');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('error handling', () => {
    it('throws ExternalServiceError on HTTP error', async () => {
      const client = new ReachMailClient({ token: 'token' });
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(client.get('/endpoint')).rejects.toThrow('ReachMail');
    });

    it('throws ExternalServiceError on network error', async () => {
      const client = new ReachMailClient({ token: 'token' });
      mockFetch.mockRejectedValue(new Error('Network failure'));

      await expect(client.get('/endpoint')).rejects.toThrow('ReachMail');
    });

    it('includes status code in error message', async () => {
      const client = new ReachMailClient({ token: 'token' });
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      });

      await expect(client.get('/endpoint')).rejects.toThrow('ReachMail');
    });
  });

  describe('testConnection', () => {
    it('returns success with account info', async () => {
      const client = new ReachMailClient({ token: 'token' });
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          AccountId: 'acct-123',
          AccountKey: 'key',
          Username: 'testuser',
          CompanyName: 'Test Co',
          Email: 'test@example.com',
          Name: 'Test User',
        })),
      });

      const result = await client.testConnection();

      expect(result.success).toBe(true);
      expect(result.accountId).toBe('acct-123');
      expect(result.email).toBe('test@example.com');
      expect(result.message).toContain('Test User');
    });

    it('returns failure on error', async () => {
      const client = new ReachMailClient({ token: 'bad-token' });
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      const result = await client.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });
  });

  describe('getAccountId', () => {
    it('returns cached account ID if set', async () => {
      const client = new ReachMailClient({ token: 'token', accountId: 'cached-123' });

      const result = await client.getAccountId();

      expect(result).toBe('cached-123');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('fetches account ID from API if not cached', async () => {
      const client = new ReachMailClient({ token: 'token' });
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          AccountId: 'fetched-456',
          AccountKey: 'key',
          Username: 'user',
          CompanyName: 'Co',
          Email: 'e@e.com',
          Name: 'User',
        })),
      });

      const result = await client.getAccountId();

      expect(result).toBe('fetched-456');
    });
  });

  describe('accountPath', () => {
    it('builds account-scoped path', async () => {
      const client = new ReachMailClient({ token: 'token', accountId: 'acct-123' });

      const path = await client.accountPath('Lists');

      expect(path).toBe('/Lists/acct-123');
    });
  });

  describe('empty responses', () => {
    it('handles empty response body', async () => {
      const client = new ReachMailClient({ token: 'token' });
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(''),
      });

      const result = await client.del('/endpoint');

      expect(result).toBeUndefined();
    });
  });
});
