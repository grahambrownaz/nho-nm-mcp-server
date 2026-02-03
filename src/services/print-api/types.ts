/**
 * Print API Types and Interfaces
 * Defines the contract for print API providers
 */

/**
 * Recipient address for mailing
 */
export interface PrintRecipient {
  name: string;
  company?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
}

/**
 * Return address for mailings
 */
export interface PrintReturnAddress {
  name: string;
  company?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zip: string;
}

/**
 * Print job template content
 */
export interface PrintTemplate {
  frontUrl?: string;      // URL to front PDF/image
  backUrl?: string;       // URL to back PDF/image
  frontHtml?: string;     // Or HTML content
  backHtml?: string;
  frontBase64?: string;   // Or base64 encoded content
  backBase64?: string;
}

/**
 * Print product configuration
 */
export interface PrintProduct {
  size: '4x6' | '6x9' | '6x11';
  paperWeight?: string;
  finish?: 'gloss' | 'matte';
  mailClass?: 'first_class' | 'standard' | 'marketing';
  doubleSided?: boolean;
}

/**
 * Print job submission request
 */
export interface PrintJob {
  id: string;                           // Our internal job ID
  template: PrintTemplate;
  recipients: PrintRecipient[];
  product: PrintProduct;
  returnAddress?: PrintReturnAddress;
  sendDate?: string;                    // ISO date for scheduled send
  metadata?: Record<string, unknown>;   // Custom metadata
}

/**
 * Result from submitting a print job
 */
export interface PrintJobResult {
  success: boolean;
  externalJobId?: string;               // Provider's job ID
  estimatedDelivery?: string;           // ISO date
  cost?: number;                        // Total cost in dollars
  costPerPiece?: number;                // Cost per piece
  recipientCount?: number;              // Number of recipients accepted
  error?: string;
  errorCode?: string;
  details?: Record<string, unknown>;
}

/**
 * Standardized job status
 */
export type PrintJobStatusCode =
  | 'pending'       // Job received, not yet processing
  | 'processing'    // Being processed/printed
  | 'printed'       // Printed, awaiting mail
  | 'in_transit'    // In postal system
  | 'delivered'     // Delivered
  | 'failed'        // Failed to process
  | 'cancelled'     // Job was cancelled
  | 'returned';     // Mail returned undeliverable

/**
 * Print job status response
 */
export interface PrintJobStatus {
  status: PrintJobStatusCode;
  externalJobId: string;
  trackingNumber?: string;
  trackingUrl?: string;
  estimatedDelivery?: string;
  printedAt?: string;
  mailedAt?: string;
  deliveredAt?: string;
  failureReason?: string;
  recipientStatuses?: Array<{
    recipientIndex: number;
    status: PrintJobStatusCode;
    trackingNumber?: string;
  }>;
}

/**
 * Available print product from provider
 */
export interface PrintProductInfo {
  id: string;
  name: string;
  size: string;
  description: string;
  pricePerPiece: number;
  minimumQuantity?: number;
  maximumQuantity?: number;
  turnaroundDays?: number;
}

/**
 * Provider configuration
 */
export interface PrintApiConfig {
  apiKey: string;
  apiUrl?: string;
  webhookSecret?: string;
  defaultReturnAddress?: PrintReturnAddress;
  settings?: Record<string, unknown>;
}

/**
 * Print API Provider interface
 * All providers must implement this interface
 */
export interface PrintApiProvider {
  /** Provider name identifier (e.g., 'reminder_media', 'lob') */
  readonly name: string;

  /** Human-readable display name */
  readonly displayName: string;

  /**
   * Initialize the provider with configuration
   */
  initialize(config: PrintApiConfig): void;

  /**
   * Submit a print job to the provider
   */
  submitJob(job: PrintJob): Promise<PrintJobResult>;

  /**
   * Get the current status of a job
   */
  getJobStatus(externalJobId: string): Promise<PrintJobStatus>;

  /**
   * Cancel a job (if supported by provider)
   */
  cancelJob(externalJobId: string): Promise<{ success: boolean; error?: string }>;

  /**
   * Test the connection/credentials
   */
  testConnection(): Promise<{ success: boolean; error?: string; details?: Record<string, unknown> }>;

  /**
   * Get available products from this provider
   */
  getProducts(): Promise<PrintProductInfo[]>;

  /**
   * Check if the provider is properly configured
   */
  isConfigured(): boolean;
}

/**
 * Provider registration entry
 */
export interface ProviderRegistration {
  provider: PrintApiProvider;
  isDefault: boolean;
}
