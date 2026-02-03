/**
 * Stannp Print API Provider (Stub)
 * TODO: Implement when Stannp integration is needed
 *
 * Stannp API Documentation: https://www.stannp.com/us/direct-mail-api
 */

import type {
  PrintApiProvider,
  PrintApiConfig,
  PrintJob,
  PrintJobResult,
  PrintJobStatus,
  PrintProductInfo,
} from '../types.js';

/**
 * Stannp Print API Provider
 * Placeholder implementation - throws errors until implemented
 */
export class StannpProvider implements PrintApiProvider {
  readonly name = 'stannp';
  readonly displayName = 'Stannp';

  private apiKey: string | null = null;
  private apiUrl: string = 'https://us.stannp.com/api/v1';

  initialize(config: PrintApiConfig): void {
    this.apiKey = config.apiKey;
    if (config.apiUrl) {
      this.apiUrl = config.apiUrl;
    }
  }

  /**
   * Get the API URL (for future real API implementation)
   */
  getApiUrl(): string {
    return this.apiUrl;
  }

  isConfigured(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0;
  }

  async submitJob(_job: PrintJob): Promise<PrintJobResult> {
    // TODO: Implement Stannp postcard creation
    // See: https://www.stannp.com/us/direct-mail-api/postcards
    throw new Error('Stannp provider not yet implemented. See src/services/print-api/providers/stannp.ts');
  }

  async getJobStatus(_externalJobId: string): Promise<PrintJobStatus> {
    // TODO: Implement Stannp status retrieval
    throw new Error('Stannp provider not yet implemented');
  }

  async cancelJob(_externalJobId: string): Promise<{ success: boolean; error?: string }> {
    // TODO: Implement Stannp cancellation
    throw new Error('Stannp provider not yet implemented');
  }

  async testConnection(): Promise<{ success: boolean; error?: string; details?: Record<string, unknown> }> {
    // TODO: Verify Stannp API key
    if (!this.apiKey) {
      return { success: false, error: 'API key not configured' };
    }
    throw new Error('Stannp provider not yet implemented');
  }

  async getProducts(): Promise<PrintProductInfo[]> {
    // Stannp postcard products (US pricing)
    return [
      {
        id: 'postcard_4x6',
        name: '4x6 Postcard',
        size: '4x6',
        description: 'Standard 4x6 postcard via Stannp',
        pricePerPiece: 0.59,
      },
      {
        id: 'postcard_6x9',
        name: '6x9 Postcard',
        size: '6x9',
        description: 'Large 6x9 postcard via Stannp',
        pricePerPiece: 0.79,
      },
      {
        id: 'postcard_6x11',
        name: '6x11 Postcard',
        size: '6x11',
        description: 'Jumbo 6x11 postcard via Stannp',
        pricePerPiece: 0.99,
      },
    ];
  }
}

export const stannpProvider = new StannpProvider();
