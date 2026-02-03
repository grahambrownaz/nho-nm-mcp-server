/**
 * PostGrid Print API Provider
 * Full implementation using PostGrid's REST API
 *
 * PostGrid API Documentation: https://docs.postgrid.com/
 * Particularly good for Canada support
 */

import type {
  PrintApiProvider,
  PrintApiConfig,
  PrintJob,
  PrintJobResult,
  PrintJobStatus,
  PrintJobStatusCode,
  PrintProductInfo,
  PrintReturnAddress,
} from '../types.js';

/**
 * Map PostGrid status to our standard status
 */
function mapPostGridStatus(pgStatus: string): PrintJobStatusCode {
  const statusMap: Record<string, PrintJobStatusCode> = {
    draft: 'pending',
    ready: 'pending',
    printing: 'processing',
    processed: 'printed',
    completed: 'printed',
    mailed: 'in_transit',
    in_transit: 'in_transit',
    delivered: 'delivered',
    returned: 'returned',
    failed: 'failed',
    cancelled: 'cancelled',
  };

  return statusMap[pgStatus?.toLowerCase()] || 'pending';
}

/**
 * PostGrid Print API Provider
 */
export class PostGridProvider implements PrintApiProvider {
  readonly name = 'postgrid';
  readonly displayName = 'PostGrid';

  private apiKey: string | null = null;
  private apiUrl: string = 'https://api.postgrid.com/print-mail/v1';
  private defaultReturnAddress: PrintReturnAddress | null = null;

  /**
   * Initialize the provider with configuration
   */
  initialize(config: PrintApiConfig): void {
    this.apiKey = config.apiKey;
    if (config.apiUrl) {
      this.apiUrl = config.apiUrl.replace(/\/$/, '');
    }
    if (config.defaultReturnAddress) {
      this.defaultReturnAddress = config.defaultReturnAddress;
    }
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
      throw new Error('PostGrid API key not configured');
    }

    const url = `${this.apiUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const body = await response.text();

    if (!response.ok) {
      let errorMessage: string;
      try {
        const errorJson = JSON.parse(body);
        errorMessage = errorJson.error?.message || errorJson.message || body;
      } catch {
        errorMessage = body || `HTTP ${response.status}`;
      }
      throw new Error(`PostGrid API error: ${errorMessage}`);
    }

    return JSON.parse(body) as T;
  }

  /**
   * Map postcard size to PostGrid size
   */
  private mapSize(size: string): '4x6' | '6x9' | '6x11' {
    const sizeMap: Record<string, '4x6' | '6x9' | '6x11'> = {
      '4x6': '4x6',
      '6x9': '6x9',
      '6x11': '6x11',
    };
    return sizeMap[size] || '4x6';
  }

  /**
   * Submit a print job
   */
  async submitJob(job: PrintJob): Promise<PrintJobResult> {
    try {
      // For batch jobs, create multiple postcards
      if (job.recipients.length > 1) {
        return this.submitBatchJob(job);
      }

      // Single recipient
      const recipient = job.recipients[0];

      const payload: Record<string, unknown> = {
        description: `Job ${job.id}`,
        to: {
          firstName: recipient.name.split(' ')[0],
          lastName: recipient.name.split(' ').slice(1).join(' ') || recipient.name,
          companyName: recipient.company,
          addressLine1: recipient.addressLine1,
          addressLine2: recipient.addressLine2,
          city: recipient.city,
          provinceOrState: recipient.state,
          postalOrZip: recipient.zip,
          country: recipient.country || 'US',
        },
        size: this.mapSize(job.product.size),
        metadata: {
          internalJobId: job.id,
          ...job.metadata,
        },
      };

      // Add return address
      const returnAddress = job.returnAddress || this.defaultReturnAddress;
      if (returnAddress) {
        payload.from = {
          firstName: returnAddress.name.split(' ')[0],
          lastName: returnAddress.name.split(' ').slice(1).join(' ') || returnAddress.name,
          companyName: returnAddress.company,
          addressLine1: returnAddress.addressLine1,
          addressLine2: returnAddress.addressLine2,
          city: returnAddress.city,
          provinceOrState: returnAddress.state,
          postalOrZip: returnAddress.zip,
          country: 'US',
        };
      }

      // Add template content
      if (job.template.frontUrl) {
        payload.frontHTML = `<img src="${job.template.frontUrl}" style="width:100%;height:100%;object-fit:cover;">`;
      } else if (job.template.frontHtml) {
        payload.frontHTML = job.template.frontHtml;
      }

      if (job.template.backUrl) {
        payload.backHTML = `<img src="${job.template.backUrl}" style="width:100%;height:100%;object-fit:cover;">`;
      } else if (job.template.backHtml) {
        payload.backHTML = job.template.backHtml;
      }

      // Send date
      if (job.sendDate) {
        payload.sendDate = job.sendDate;
      }

      const response = await this.request<{
        id: string;
        expectedDeliveryDate?: string;
      }>('/postcards', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      return {
        success: true,
        externalJobId: response.id,
        estimatedDelivery: response.expectedDeliveryDate,
        recipientCount: 1,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'PostGrid submission failed',
        errorCode: 'POSTGRID_SUBMIT_FAILED',
      };
    }
  }

  /**
   * Submit a batch job
   */
  private async submitBatchJob(job: PrintJob): Promise<PrintJobResult> {
    const jobIds: string[] = [];
    const errors: string[] = [];

    for (const recipient of job.recipients) {
      try {
        const payload: Record<string, unknown> = {
          description: `Batch ${job.id} - ${recipient.name}`,
          to: {
            firstName: recipient.name.split(' ')[0],
            lastName: recipient.name.split(' ').slice(1).join(' ') || recipient.name,
            companyName: recipient.company,
            addressLine1: recipient.addressLine1,
            addressLine2: recipient.addressLine2,
            city: recipient.city,
            provinceOrState: recipient.state,
            postalOrZip: recipient.zip,
            country: recipient.country || 'US',
          },
          size: this.mapSize(job.product.size),
          metadata: {
            internalJobId: job.id,
            batch: true,
            ...job.metadata,
          },
        };

        // Add return address
        const returnAddress = job.returnAddress || this.defaultReturnAddress;
        if (returnAddress) {
          payload.from = {
            firstName: returnAddress.name.split(' ')[0],
            lastName: returnAddress.name.split(' ').slice(1).join(' ') || returnAddress.name,
            companyName: returnAddress.company,
            addressLine1: returnAddress.addressLine1,
            addressLine2: returnAddress.addressLine2,
            city: returnAddress.city,
            provinceOrState: returnAddress.state,
            postalOrZip: returnAddress.zip,
            country: 'US',
          };
        }

        // Add template content
        if (job.template.frontUrl) {
          payload.frontHTML = `<img src="${job.template.frontUrl}" style="width:100%;height:100%;object-fit:cover;">`;
        } else if (job.template.frontHtml) {
          payload.frontHTML = job.template.frontHtml;
        }

        if (job.template.backUrl) {
          payload.backHTML = `<img src="${job.template.backUrl}" style="width:100%;height:100%;object-fit:cover;">`;
        } else if (job.template.backHtml) {
          payload.backHTML = job.template.backHtml;
        }

        const response = await this.request<{ id: string }>('/postcards', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        jobIds.push(response.id);
      } catch (err) {
        errors.push(`Failed for ${recipient.name}: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }

    if (jobIds.length === 0) {
      return {
        success: false,
        error: `All ${job.recipients.length} postcards failed`,
        errorCode: 'POSTGRID_BATCH_FAILED',
        details: { errors },
      };
    }

    return {
      success: true,
      externalJobId: jobIds.join(','),
      recipientCount: jobIds.length,
      details: {
        successCount: jobIds.length,
        failureCount: errors.length,
        errors: errors.length > 0 ? errors : undefined,
      },
    };
  }

  /**
   * Get job status
   */
  async getJobStatus(externalJobId: string): Promise<PrintJobStatus> {
    // Handle batch jobs
    if (externalJobId.includes(',')) {
      const jobIds = externalJobId.split(',');
      const statuses: PrintJobStatusCode[] = [];

      for (const id of jobIds) {
        try {
          const response = await this.request<{
            id: string;
            status: string;
            trackingNumber?: string;
            expectedDeliveryDate?: string;
          }>(`/postcards/${id}`);
          statuses.push(mapPostGridStatus(response.status));
        } catch {
          statuses.push('failed');
        }
      }

      // Determine overall status
      let overallStatus: PrintJobStatusCode = 'delivered';
      if (statuses.includes('failed')) overallStatus = 'failed';
      else if (statuses.includes('processing')) overallStatus = 'processing';
      else if (statuses.includes('printed')) overallStatus = 'printed';
      else if (statuses.includes('in_transit')) overallStatus = 'in_transit';

      return {
        status: overallStatus,
        externalJobId,
        recipientStatuses: statuses.map((status, index) => ({
          recipientIndex: index,
          status,
        })),
      };
    }

    // Single job
    const response = await this.request<{
      id: string;
      status: string;
      trackingNumber?: string;
      expectedDeliveryDate?: string;
      mailedDate?: string;
    }>(`/postcards/${externalJobId}`);

    return {
      status: mapPostGridStatus(response.status),
      externalJobId: response.id,
      trackingNumber: response.trackingNumber,
      estimatedDelivery: response.expectedDeliveryDate,
      mailedAt: response.mailedDate,
    };
  }

  /**
   * Cancel a job
   */
  async cancelJob(externalJobId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Handle batch jobs
      if (externalJobId.includes(',')) {
        const jobIds = externalJobId.split(',');
        const errors: string[] = [];

        for (const id of jobIds) {
          try {
            await this.request(`/postcards/${id}/cancel`, { method: 'POST' });
          } catch (err) {
            errors.push(`Failed to cancel ${id}: ${err instanceof Error ? err.message : 'Unknown'}`);
          }
        }

        if (errors.length > 0) {
          return {
            success: false,
            error: `Some cancellations failed: ${errors.join('; ')}`,
          };
        }

        return { success: true };
      }

      // Single job
      await this.request(`/postcards/${externalJobId}/cancel`, { method: 'POST' });
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
      // List postcards to verify credentials
      const response = await this.request<{
        data: unknown[];
        totalCount: number;
      }>('/postcards?limit=1');

      return {
        success: true,
        details: {
          postcardCount: response.totalCount,
          apiVersion: 'v1',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed',
      };
    }
  }

  /**
   * Get available products
   */
  async getProducts(): Promise<PrintProductInfo[]> {
    // PostGrid pricing
    return [
      {
        id: 'postcard_4x6',
        name: '4x6 Postcard',
        size: '4x6',
        description: 'Standard 4x6 postcard via PostGrid - US & Canada support',
        pricePerPiece: 0.70,
        minimumQuantity: 1,
        turnaroundDays: 4,
      },
      {
        id: 'postcard_6x9',
        name: '6x9 Postcard',
        size: '6x9',
        description: 'Large 6x9 postcard via PostGrid - US & Canada support',
        pricePerPiece: 0.90,
        minimumQuantity: 1,
        turnaroundDays: 4,
      },
      {
        id: 'postcard_6x11',
        name: '6x11 Postcard',
        size: '6x11',
        description: 'Jumbo 6x11 postcard via PostGrid - US & Canada support',
        pricePerPiece: 1.10,
        minimumQuantity: 1,
        turnaroundDays: 4,
      },
    ];
  }
}

export const postGridProvider = new PostGridProvider();
