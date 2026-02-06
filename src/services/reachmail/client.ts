/**
 * ReachMail API Client
 * HTTP client for ReachMail REST API (https://services.reachmail.net/)
 */

import { ExternalServiceError } from '../../utils/errors.js';

const DEFAULT_BASE_URL = 'https://services.reachmail.net';

export interface ReachMailClientConfig {
  token: string;
  accountId?: string;
  baseUrl?: string;
}

export interface ReachMailUser {
  AccountId: string;
  AccountKey: string;
  Username: string;
  CompanyName: string;
  Email: string;
  Name: string;
}

/**
 * ReachMail API client with bearer token auth and error handling
 */
export class ReachMailClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private accountId: string | null;

  constructor(config: ReachMailClientConfig) {
    this.token = config.token;
    this.baseUrl = config.baseUrl || process.env.REACHMAIL_API_URL || DEFAULT_BASE_URL;
    this.accountId = config.accountId || null;
  }

  /**
   * Get the account ID, fetching from API if not set
   */
  async getAccountId(): Promise<string> {
    if (this.accountId) {
      return this.accountId;
    }

    const user = await this.getCurrentUser();
    this.accountId = user.AccountId;
    return this.accountId;
  }

  /**
   * Get current user info (also retrieves account ID)
   */
  async getCurrentUser(): Promise<ReachMailUser> {
    return this.get<ReachMailUser>('/Administration/Users/Current');
  }

  /**
   * Test the connection by fetching current user
   */
  async testConnection(): Promise<{ success: boolean; message: string; accountId?: string; email?: string }> {
    try {
      const user = await this.getCurrentUser();
      this.accountId = user.AccountId;
      return {
        success: true,
        message: `Connected as ${user.Name} (${user.Email})`,
        accountId: user.AccountId,
        email: user.Email,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * GET request
   */
  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    return this.request<T>('GET', url.toString());
  }

  /**
   * POST request
   */
  async post<T>(path: string, body?: unknown): Promise<T> {
    const url = new URL(path, this.baseUrl);
    return this.request<T>('POST', url.toString(), body);
  }

  /**
   * PUT request
   */
  async put<T>(path: string, body?: unknown): Promise<T> {
    const url = new URL(path, this.baseUrl);
    return this.request<T>('PUT', url.toString(), body);
  }

  /**
   * DELETE request
   */
  async del<T>(path: string): Promise<T> {
    const url = new URL(path, this.baseUrl);
    return this.request<T>('DELETE', url.toString());
  }

  /**
   * Build an account-scoped path
   */
  async accountPath(resource: string): Promise<string> {
    const accountId = await this.getAccountId();
    return `/${resource}/${accountId}`;
  }

  /**
   * Core HTTP request with error handling
   */
  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      'Authorization': `bearer ${this.token}`,
      'Accept': 'application/json',
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      throw new ExternalServiceError(
        'ReachMail',
        error instanceof Error ? error : new Error('Network error')
      );
    }

    if (!response.ok) {
      let errorBody: string;
      try {
        errorBody = await response.text();
      } catch {
        errorBody = 'Unable to read error response';
      }

      throw new ExternalServiceError(
        'ReachMail',
        new Error(`API ${method} ${url} returned ${response.status}: ${errorBody}`)
      );
    }

    // Some endpoints return no content
    const text = await response.text();
    if (!text) {
      return undefined as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }
}
