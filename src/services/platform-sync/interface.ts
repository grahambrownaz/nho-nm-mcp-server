/**
 * Platform Sync Interface
 * Common types and interfaces for platform integrations
 */

/**
 * Supported platforms
 */
export type PlatformType =
  | 'mailchimp'
  | 'hubspot'
  | 'salesforce'
  | 'zapier'
  | 'google_sheets';

/**
 * Record to sync to a platform
 */
export interface SyncRecord {
  // Core identity
  email?: string;
  phone?: string;

  // Name fields
  firstName?: string;
  lastName?: string;
  fullName?: string;

  // Address fields
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;

  // Additional data
  company?: string;
  moveDate?: string;
  propertyType?: string;
  homeValue?: number;
  income?: string;
  age?: string;

  // Custom fields
  customFields?: Record<string, unknown>;

  // Source tracking
  source?: string;
  subscriptionId?: string;
  deliveryId?: string;
}

/**
 * Field mapping configuration
 */
export interface FieldMapping {
  // Map our field names to platform field names
  // e.g., { "firstName": "FNAME", "lastName": "LNAME" }
  [ourField: string]: string;
}

/**
 * Platform connection configuration
 */
export interface PlatformConnection {
  id: string;
  tenantId: string;
  platform: PlatformType;
  connectionName: string;
  credentials: PlatformCredentials;
  defaultSettings?: Record<string, unknown>;
  isActive: boolean;
  lastTestedAt?: Date;
  lastTestSuccess?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Platform-specific credentials
 */
export type PlatformCredentials =
  | MailchimpCredentials
  | HubSpotCredentials
  | SalesforceCredentials
  | ZapierCredentials
  | GoogleSheetsCredentials;

export interface MailchimpCredentials {
  type: 'mailchimp';
  apiKey: string;
  server: string; // e.g., 'us1', 'us2'
  audienceId?: string; // Default audience
}

export interface HubSpotCredentials {
  type: 'hubspot';
  accessToken: string;
  portalId?: string;
}

export interface SalesforceCredentials {
  type: 'salesforce';
  instanceUrl: string;
  accessToken: string;
  refreshToken?: string;
}

export interface ZapierCredentials {
  type: 'zapier';
  webhookUrl: string;
}

export interface GoogleSheetsCredentials {
  type: 'google_sheets';
  serviceAccountJson: string;
  spreadsheetId: string;
  sheetName?: string;
}

/**
 * Sync operation result
 */
export interface SyncResult {
  success: boolean;
  platform: PlatformType;
  created: number;
  updated: number;
  skipped: number;
  errors: SyncError[];
  metadata?: Record<string, unknown>;
}

/**
 * Individual sync error
 */
export interface SyncError {
  recordIndex?: number;
  email?: string;
  errorCode: string;
  message: string;
}

/**
 * Sync options
 */
export interface SyncOptions {
  // How to handle existing records
  duplicateHandling?: 'update' | 'skip' | 'create_new';

  // Field mapping override
  fieldMapping?: FieldMapping;

  // Tags/lists to apply
  tags?: string[];

  // List/audience to add to (platform-specific)
  listId?: string;
  audienceId?: string;

  // Additional platform-specific options
  platformOptions?: Record<string, unknown>;
}

/**
 * Platform sync provider interface
 */
export interface PlatformSyncProvider {
  /**
   * Platform identifier
   */
  readonly platform: PlatformType;

  /**
   * Test connection with provided credentials
   */
  testConnection(credentials: PlatformCredentials): Promise<{
    success: boolean;
    message: string;
    details?: Record<string, unknown>;
  }>;

  /**
   * Sync records to the platform
   */
  syncRecords(
    credentials: PlatformCredentials,
    records: SyncRecord[],
    options?: SyncOptions
  ): Promise<SyncResult>;

  /**
   * Get available lists/audiences (if applicable)
   */
  getLists?(credentials: PlatformCredentials): Promise<Array<{
    id: string;
    name: string;
    memberCount?: number;
  }>>;

  /**
   * Get available fields/properties (if applicable)
   */
  getFields?(credentials: PlatformCredentials): Promise<Array<{
    id: string;
    name: string;
    type: string;
    required?: boolean;
  }>>;
}

/**
 * Default field mappings for each platform
 */
export const DEFAULT_FIELD_MAPPINGS: Record<PlatformType, FieldMapping> = {
  mailchimp: {
    email: 'EMAIL',
    firstName: 'FNAME',
    lastName: 'LNAME',
    phone: 'PHONE',
    addressLine1: 'ADDRESS1',
    addressLine2: 'ADDRESS2',
    city: 'CITY',
    state: 'STATE',
    zip: 'ZIP',
    country: 'COUNTRY',
  },
  hubspot: {
    email: 'email',
    firstName: 'firstname',
    lastName: 'lastname',
    phone: 'phone',
    addressLine1: 'address',
    city: 'city',
    state: 'state',
    zip: 'zip',
    country: 'country',
    company: 'company',
  },
  salesforce: {
    email: 'Email',
    firstName: 'FirstName',
    lastName: 'LastName',
    phone: 'Phone',
    addressLine1: 'Street',
    city: 'City',
    state: 'State',
    zip: 'PostalCode',
    country: 'Country',
    company: 'Company',
  },
  zapier: {
    // Zapier uses our field names directly
    email: 'email',
    firstName: 'first_name',
    lastName: 'last_name',
    phone: 'phone',
    addressLine1: 'address_line_1',
    addressLine2: 'address_line_2',
    city: 'city',
    state: 'state',
    zip: 'zip',
    country: 'country',
  },
  google_sheets: {
    // Google Sheets uses column headers
    email: 'Email',
    firstName: 'First Name',
    lastName: 'Last Name',
    phone: 'Phone',
    addressLine1: 'Address',
    city: 'City',
    state: 'State',
    zip: 'ZIP',
  },
};
