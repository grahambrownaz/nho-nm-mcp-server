/**
 * Platform Sync Services Index
 * Exports all platform sync providers and registry
 */

export * from './interface.js';
export { mailchimpProvider, MailchimpSyncProvider } from './mailchimp.js';
export { hubspotProvider, HubSpotSyncProvider } from './hubspot.js';
export { zapierProvider, ZapierSyncProvider } from './zapier.js';

import { mailchimpProvider } from './mailchimp.js';
import { hubspotProvider } from './hubspot.js';
import { zapierProvider } from './zapier.js';
import type {
  PlatformType,
  PlatformSyncProvider,
  PlatformCredentials,
  SyncRecord,
  SyncOptions,
  SyncResult,
} from './interface.js';

/**
 * Platform provider registry
 */
const providers = new Map<PlatformType, PlatformSyncProvider>();
providers.set('mailchimp', mailchimpProvider);
providers.set('hubspot', hubspotProvider);
providers.set('zapier', zapierProvider);

/**
 * Get a platform provider by type
 */
export function getPlatformProvider(platform: PlatformType): PlatformSyncProvider | undefined {
  return providers.get(platform);
}

/**
 * Check if a platform is supported
 */
export function isPlatformSupported(platform: string): platform is PlatformType {
  return providers.has(platform as PlatformType);
}

/**
 * Get all supported platforms
 */
export function getSupportedPlatforms(): PlatformType[] {
  return Array.from(providers.keys());
}

/**
 * Test connection for any platform
 */
export async function testPlatformConnection(
  platform: PlatformType,
  credentials: PlatformCredentials
): Promise<{
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}> {
  const provider = getPlatformProvider(platform);
  if (!provider) {
    return {
      success: false,
      message: `Unsupported platform: ${platform}`,
    };
  }

  return provider.testConnection(credentials);
}

/**
 * Sync records to any platform
 */
export async function syncToPlatform(
  platform: PlatformType,
  credentials: PlatformCredentials,
  records: SyncRecord[],
  options?: SyncOptions
): Promise<SyncResult> {
  const provider = getPlatformProvider(platform);
  if (!provider) {
    return {
      success: false,
      platform,
      created: 0,
      updated: 0,
      skipped: records.length,
      errors: [{
        errorCode: 'UNSUPPORTED_PLATFORM',
        message: `Unsupported platform: ${platform}`,
      }],
    };
  }

  return provider.syncRecords(credentials, records, options);
}
