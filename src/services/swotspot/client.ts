/**
 * SWOTSPOT.ai API Client
 *
 * HTTP client for the SWOTSPOT local business audit API.
 *
 * TODO: SWOTSPOT API — This client currently uses mock responses.
 * Replace mock implementations with real API calls once SWOTSPOT
 * provides API documentation and credentials.
 */

import { ExternalServiceError } from '../../utils/errors.js';

export interface SwotspotClientConfig {
  apiKey: string;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = 'https://api.swotspot.ai';

export class SwotspotClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: SwotspotClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || process.env.SWOTSPOT_API_URL || DEFAULT_BASE_URL;
  }

  /**
   * Test the API connection
   *
   * TODO: SWOTSPOT API — Replace with real connection test endpoint
   */
  async testConnection(): Promise<{
    success: boolean;
    message: string;
    accountId?: string;
  }> {
    try {
      // TODO: SWOTSPOT API — Replace mock with real API call
      // const result = await this.get<AccountInfo>('/account');
      return {
        success: true,
        message: 'Connected to SWOTSPOT.ai (mock mode)',
        accountId: 'swotspot-mock-account',
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * Make a GET request
   */
  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new ExternalServiceError(
          'SWOTSPOT',
          new Error(`API GET ${path} returned ${response.status}: ${errorBody}`)
        );
      }

      const text = await response.text();
      return text ? JSON.parse(text) as T : undefined as T;
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      throw new ExternalServiceError(
        'SWOTSPOT',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Make a POST request
   */
  async post<T>(path: string, body?: unknown): Promise<T> {
    const url = new URL(path, this.baseUrl);

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Accept': 'application/json',
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new ExternalServiceError(
          'SWOTSPOT',
          new Error(`API POST ${path} returned ${response.status}: ${errorBody}`)
        );
      }

      const text = await response.text();
      return text ? JSON.parse(text) as T : undefined as T;
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      throw new ExternalServiceError(
        'SWOTSPOT',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
}
