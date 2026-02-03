/**
 * ReminderMedia Print API Provider
 * Implementation of PrintApiProvider for ReminderMedia's API
 */

import type {
  PrintApiProvider,
  PrintApiConfig,
  PrintJob,
  PrintJobResult,
  PrintJobStatus,
  PrintJobStatusCode,
  PrintProductInfo,
} from '../types.js';

/**
 * ReminderMedia API response types
 */
interface ReminderMediaJobResponse {
  id: string;
  status: string;
  estimated_delivery_date?: string;
  cost?: number;
  piece_count?: number;
  error?: string;
}

interface ReminderMediaStatusResponse {
  id: string;
  status: string;
  tracking_number?: string;
  tracking_url?: string;
  printed_at?: string;
  mailed_at?: string;
  delivered_at?: string;
  failure_reason?: string;
}

/**
 * Map ReminderMedia status to our standard status
 */
function mapStatus(rmStatus: string): PrintJobStatusCode {
  const statusMap: Record<string, PrintJobStatusCode> = {
    pending: 'pending',
    queued: 'pending',
    processing: 'processing',
    printing: 'processing',
    printed: 'printed',
    mailed: 'in_transit',
    in_transit: 'in_transit',
    delivered: 'delivered',
    failed: 'failed',
    error: 'failed',
    cancelled: 'cancelled',
    canceled: 'cancelled',
    returned: 'returned',
  };

  return statusMap[rmStatus.toLowerCase()] || 'pending';
}

/**
 * ReminderMedia Print API Provider
 */
export class ReminderMediaProvider implements PrintApiProvider {
  readonly name = 'reminder_media';
  readonly displayName = 'ReminderMedia';

  private apiKey: string | null = null;
  private apiUrl: string = 'https://api.remindermedia.com/v1';
  // Reserved for webhook signature verification
  private webhookSecret: string | null = null;

  /**
   * Initialize the provider with configuration
   */
  initialize(config: PrintApiConfig): void {
    this.apiKey = config.apiKey;
    if (config.apiUrl) {
      this.apiUrl = config.apiUrl.replace(/\/$/, ''); // Remove trailing slash
    }
    if (config.webhookSecret) {
      this.webhookSecret = config.webhookSecret;
    }
  }

  /**
   * Get webhook secret for signature verification (for future use)
   */
  getWebhookSecret(): string | null {
    return this.webhookSecret;
  }

  /**
   * Check if provider is configured
   */
  isConfigured(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0;
  }

  /**
   * Make an authenticated API request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.apiKey) {
      throw new Error('ReminderMedia API key not configured');
    }

    const url = `${this.apiUrl}${endpoint}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers as Record<string, string>),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let errorMessage: string;
      try {
        const errorJson = JSON.parse(errorBody);
        errorMessage = errorJson.message || errorJson.error || errorBody;
      } catch {
        errorMessage = errorBody || `HTTP ${response.status}`;
      }
      throw new Error(`ReminderMedia API error: ${errorMessage}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Submit a print job
   */
  async submitJob(job: PrintJob): Promise<PrintJobResult> {
    try {
      // Build the request payload for ReminderMedia
      const payload = {
        external_id: job.id,
        template: {
          front_url: job.template.frontUrl,
          back_url: job.template.backUrl,
          front_html: job.template.frontHtml,
          back_html: job.template.backHtml,
        },
        recipients: job.recipients.map((r) => ({
          name: r.name,
          company: r.company,
          address_line_1: r.addressLine1,
          address_line_2: r.addressLine2,
          city: r.city,
          state: r.state,
          zip: r.zip,
          country: r.country || 'US',
        })),
        product: {
          size: job.product.size,
          paper_weight: job.product.paperWeight,
          finish: job.product.finish,
          mail_class: job.product.mailClass,
          double_sided: job.product.doubleSided ?? true,
        },
        return_address: job.returnAddress
          ? {
              name: job.returnAddress.name,
              company: job.returnAddress.company,
              address_line_1: job.returnAddress.addressLine1,
              address_line_2: job.returnAddress.addressLine2,
              city: job.returnAddress.city,
              state: job.returnAddress.state,
              zip: job.returnAddress.zip,
            }
          : undefined,
        send_date: job.sendDate,
        metadata: job.metadata,
      };

      const response = await this.request<ReminderMediaJobResponse>(
        '/postcards',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      return {
        success: true,
        externalJobId: response.id,
        estimatedDelivery: response.estimated_delivery_date,
        cost: response.cost,
        recipientCount: response.piece_count || job.recipients.length,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: 'SUBMIT_FAILED',
      };
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(externalJobId: string): Promise<PrintJobStatus> {
    const response = await this.request<ReminderMediaStatusResponse>(
      `/postcards/${externalJobId}`
    );

    return {
      status: mapStatus(response.status),
      externalJobId: response.id,
      trackingNumber: response.tracking_number,
      trackingUrl: response.tracking_url,
      printedAt: response.printed_at,
      mailedAt: response.mailed_at,
      deliveredAt: response.delivered_at,
      failureReason: response.failure_reason,
    };
  }

  /**
   * Cancel a job
   */
  async cancelJob(
    externalJobId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.request(`/postcards/${externalJobId}/cancel`, {
        method: 'POST',
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Cancel failed',
      };
    }
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<{
    success: boolean;
    error?: string;
    details?: Record<string, unknown>;
  }> {
    try {
      // Try to fetch account info or products to verify credentials
      const response = await this.request<{ account_id?: string; name?: string }>(
        '/account'
      );
      return {
        success: true,
        details: {
          accountId: response.account_id,
          accountName: response.name,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * Get available products
   */
  async getProducts(): Promise<PrintProductInfo[]> {
    try {
      const response = await this.request<
        Array<{
          id: string;
          name: string;
          size: string;
          description: string;
          price_per_piece: number;
          min_quantity?: number;
          max_quantity?: number;
          turnaround_days?: number;
        }>
      >('/products');

      return response.map((p) => ({
        id: p.id,
        name: p.name,
        size: p.size,
        description: p.description,
        pricePerPiece: p.price_per_piece,
        minimumQuantity: p.min_quantity,
        maximumQuantity: p.max_quantity,
        turnaroundDays: p.turnaround_days,
      }));
    } catch {
      // Return default products if API doesn't support this endpoint
      return [
        {
          id: 'postcard_4x6',
          name: '4x6 Postcard',
          size: '4x6',
          description: 'Standard 4x6 postcard',
          pricePerPiece: 0.65,
        },
        {
          id: 'postcard_6x9',
          name: '6x9 Postcard',
          size: '6x9',
          description: 'Large 6x9 postcard',
          pricePerPiece: 0.85,
        },
        {
          id: 'postcard_6x11',
          name: '6x11 Postcard',
          size: '6x11',
          description: 'Jumbo 6x11 postcard',
          pricePerPiece: 1.05,
        },
      ];
    }
  }
}

/**
 * Create and export a singleton instance
 */
export const reminderMediaProvider = new ReminderMediaProvider();
