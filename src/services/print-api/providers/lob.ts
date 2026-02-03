/**
 * LOB Print API Provider
 * Full implementation using the Lob SDK
 *
 * LOB API Documentation: https://docs.lob.com/
 */

import Lob from 'lob';
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
 * Map LOB status to our standard status
 */
function mapLobStatus(lobStatus: string): PrintJobStatusCode {
  const statusMap: Record<string, PrintJobStatusCode> = {
    // LOB postcard statuses
    processing: 'processing',
    rendered: 'processing',
    printed: 'printed',
    'in_transit': 'in_transit',
    'in_local_area': 'in_transit',
    delivered: 'delivered',
    'returned_to_sender': 'returned',
    re_routed: 'in_transit',
    failed: 'failed',
    cancelled: 'cancelled',
    canceled: 'cancelled',
  };

  return statusMap[lobStatus?.toLowerCase()] || 'pending';
}

/**
 * LOB Print API Provider
 */
export class LobProvider implements PrintApiProvider {
  readonly name = 'lob';
  readonly displayName = 'Lob';

  private apiKey: string | null = null;
  private lob: ReturnType<typeof Lob> | null = null;
  private defaultReturnAddress: PrintReturnAddress | null = null;

  /**
   * Initialize the provider with configuration
   */
  initialize(config: PrintApiConfig): void {
    this.apiKey = config.apiKey;
    this.lob = Lob(config.apiKey);
    if (config.defaultReturnAddress) {
      this.defaultReturnAddress = config.defaultReturnAddress;
    }
  }

  /**
   * Check if provider is configured
   */
  isConfigured(): boolean {
    return this.apiKey !== null && this.lob !== null;
  }

  /**
   * Get the LOB client, throwing if not configured
   */
  private getClient(): ReturnType<typeof Lob> {
    if (!this.lob) {
      throw new Error('LOB client not initialized. Call initialize() first.');
    }
    return this.lob;
  }

  /**
   * Map postcard size to LOB size
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
   * Map mail class to LOB mail type
   */
  private mapMailClass(mailClass?: string): 'usps_first_class' | 'usps_standard' {
    if (mailClass === 'first_class') {
      return 'usps_first_class';
    }
    return 'usps_standard';
  }

  /**
   * Submit a print job
   * For LOB, we create individual postcards or use batch API
   */
  async submitJob(job: PrintJob): Promise<PrintJobResult> {
    try {
      const client = this.getClient();

      // For multiple recipients, we'll create a batch
      if (job.recipients.length > 1) {
        return this.submitBatchJob(job);
      }

      // Single recipient - create one postcard
      const recipient = job.recipients[0];

      const postcardParams: Record<string, unknown> = {
        description: `Job ${job.id}`,
        to: {
          name: recipient.name,
          company: recipient.company,
          address_line1: recipient.addressLine1,
          address_line2: recipient.addressLine2,
          address_city: recipient.city,
          address_state: recipient.state,
          address_zip: recipient.zip,
          address_country: recipient.country || 'US',
        },
        size: this.mapSize(job.product.size),
        mail_type: this.mapMailClass(job.product.mailClass),
        metadata: {
          internal_job_id: job.id,
          ...job.metadata,
        },
      };

      // Add return address
      const returnAddress = job.returnAddress || this.defaultReturnAddress;
      if (returnAddress) {
        postcardParams.from = {
          name: returnAddress.name,
          company: returnAddress.company,
          address_line1: returnAddress.addressLine1,
          address_line2: returnAddress.addressLine2,
          address_city: returnAddress.city,
          address_state: returnAddress.state,
          address_zip: returnAddress.zip,
        };
      }

      // Add template content
      if (job.template.frontUrl) {
        postcardParams.front = job.template.frontUrl;
      } else if (job.template.frontHtml) {
        postcardParams.front = job.template.frontHtml;
      }

      if (job.template.backUrl) {
        postcardParams.back = job.template.backUrl;
      } else if (job.template.backHtml) {
        postcardParams.back = job.template.backHtml;
      }

      // Send date if specified
      if (job.sendDate) {
        postcardParams.send_date = job.sendDate;
      }

      const postcard = await new Promise<{
        id: string;
        expected_delivery_date?: string;
      }>((resolve, reject) => {
        // Cast through unknown to allow flexible postcard params construction
        client.postcards.create(postcardParams as unknown as Parameters<typeof client.postcards.create>[0], (err: Error | null, res: unknown) => {
          if (err) reject(err);
          else resolve(res as { id: string; expected_delivery_date?: string });
        });
      });

      return {
        success: true,
        externalJobId: postcard.id,
        estimatedDelivery: postcard.expected_delivery_date,
        recipientCount: 1,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'LOB submission failed';
      return {
        success: false,
        error: message,
        errorCode: 'LOB_SUBMIT_FAILED',
      };
    }
  }

  /**
   * Submit a batch job for multiple recipients
   */
  private async submitBatchJob(job: PrintJob): Promise<PrintJobResult> {
    try {
      const client = this.getClient();
      const jobIds: string[] = [];
      const errors: string[] = [];
      const totalCost = 0;

      // LOB doesn't have a true batch API for postcards, so we create individually
      // but track them together
      for (const recipient of job.recipients) {
        try {
          const postcardParams: Record<string, unknown> = {
            description: `Batch ${job.id} - ${recipient.name}`,
            to: {
              name: recipient.name,
              company: recipient.company,
              address_line1: recipient.addressLine1,
              address_line2: recipient.addressLine2,
              address_city: recipient.city,
              address_state: recipient.state,
              address_zip: recipient.zip,
              address_country: recipient.country || 'US',
            },
            size: this.mapSize(job.product.size),
            mail_type: this.mapMailClass(job.product.mailClass),
            metadata: {
              internal_job_id: job.id,
              batch: true,
              ...job.metadata,
            },
          };

          // Add return address
          const returnAddress = job.returnAddress || this.defaultReturnAddress;
          if (returnAddress) {
            postcardParams.from = {
              name: returnAddress.name,
              company: returnAddress.company,
              address_line1: returnAddress.addressLine1,
              address_line2: returnAddress.addressLine2,
              address_city: returnAddress.city,
              address_state: returnAddress.state,
              address_zip: returnAddress.zip,
            };
          }

          // Add template content
          if (job.template.frontUrl) {
            postcardParams.front = job.template.frontUrl;
          } else if (job.template.frontHtml) {
            postcardParams.front = job.template.frontHtml;
          }

          if (job.template.backUrl) {
            postcardParams.back = job.template.backUrl;
          } else if (job.template.backHtml) {
            postcardParams.back = job.template.backHtml;
          }

          const postcard = await new Promise<{ id: string }>((resolve, reject) => {
            // Cast through unknown to allow flexible postcard params construction
            client.postcards.create(postcardParams as unknown as Parameters<typeof client.postcards.create>[0], (err: Error | null, res: unknown) => {
              if (err) reject(err);
              else resolve(res as { id: string });
            });
          });

          jobIds.push(postcard.id);
        } catch (err) {
          errors.push(`Failed for ${recipient.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      if (jobIds.length === 0) {
        return {
          success: false,
          error: `All ${job.recipients.length} postcards failed to submit`,
          errorCode: 'LOB_BATCH_FAILED',
          details: { errors },
        };
      }

      return {
        success: true,
        externalJobId: jobIds.join(','), // Comma-separated list of job IDs
        recipientCount: jobIds.length,
        cost: totalCost,
        details: {
          successCount: jobIds.length,
          failureCount: errors.length,
          errors: errors.length > 0 ? errors : undefined,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Batch submission failed',
        errorCode: 'LOB_BATCH_FAILED',
      };
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(externalJobId: string): Promise<PrintJobStatus> {
    const client = this.getClient();

    // Handle batch jobs (comma-separated IDs)
    if (externalJobId.includes(',')) {
      const jobIds = externalJobId.split(',');
      const statuses: PrintJobStatusCode[] = [];

      for (const id of jobIds) {
        try {
          const postcard = await new Promise<{
            id: string;
            status: string;
            tracking_number?: string;
            expected_delivery_date?: string;
          }>((resolve, reject) => {
            client.postcards.retrieve(id, (err: Error | null, res: unknown) => {
              if (err) reject(err);
              else resolve(res as { id: string; status: string; tracking_number?: string; expected_delivery_date?: string });
            });
          });
          statuses.push(mapLobStatus(postcard.status));
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
    const postcard = await new Promise<{
      id: string;
      status: string;
      tracking_number?: string;
      expected_delivery_date?: string;
      send_date?: string;
    }>((resolve, reject) => {
      client.postcards.retrieve(externalJobId, (err: Error | null, res: unknown) => {
        if (err) reject(err);
        else resolve(res as { id: string; status: string; tracking_number?: string; expected_delivery_date?: string; send_date?: string });
      });
    });

    return {
      status: mapLobStatus(postcard.status),
      externalJobId: postcard.id,
      trackingNumber: postcard.tracking_number,
      estimatedDelivery: postcard.expected_delivery_date,
      mailedAt: postcard.send_date,
    };
  }

  /**
   * Cancel a job
   */
  async cancelJob(externalJobId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const client = this.getClient();

      // Handle batch jobs
      if (externalJobId.includes(',')) {
        const jobIds = externalJobId.split(',');
        const errors: string[] = [];

        for (const id of jobIds) {
          try {
            await new Promise<void>((resolve, reject) => {
              client.postcards.delete(id, (err: Error | null) => {
                if (err) reject(err);
                else resolve();
              });
            });
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
      await new Promise<void>((resolve, reject) => {
        client.postcards.delete(externalJobId, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
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
      const client = this.getClient();

      // Try to list postcards (limit 1) to verify credentials
      const result = await new Promise<{ count: number }>((resolve, reject) => {
        client.postcards.list({ limit: 1 }, (err: Error | null, res: unknown) => {
          if (err) reject(err);
          else resolve(res as { count: number });
        });
      });

      return {
        success: true,
        details: {
          postcardCount: result.count,
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
    // LOB pricing (as of 2024)
    return [
      {
        id: 'postcard_4x6',
        name: '4x6 Postcard',
        size: '4x6',
        description: 'Standard 4x6 postcard via LOB - First Class or Standard mail',
        pricePerPiece: 0.63,
        minimumQuantity: 1,
        turnaroundDays: 3,
      },
      {
        id: 'postcard_6x9',
        name: '6x9 Postcard',
        size: '6x9',
        description: 'Large 6x9 postcard via LOB - First Class or Standard mail',
        pricePerPiece: 0.78,
        minimumQuantity: 1,
        turnaroundDays: 3,
      },
      {
        id: 'postcard_6x11',
        name: '6x11 Postcard',
        size: '6x11',
        description: 'Jumbo 6x11 postcard via LOB - First Class or Standard mail',
        pricePerPiece: 0.98,
        minimumQuantity: 1,
        turnaroundDays: 3,
      },
    ];
  }
}

export const lobProvider = new LobProvider();
