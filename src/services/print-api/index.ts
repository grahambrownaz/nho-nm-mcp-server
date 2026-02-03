/**
 * Print API Service
 * Main entry point for print API functionality
 */

import { printApiRegistry } from './registry.js';
import {
  reminderMediaProvider,
  lobProvider,
  stannpProvider,
  postGridProvider,
} from './providers/index.js';
import type { PrintApiProvider, PrintApiConfig } from './types.js';

// Re-export types
export * from './types.js';
export { printApiRegistry, PrintApiRegistry } from './registry.js';

/**
 * Initialize and register all available providers based on environment variables
 */
export function initializePrintApiProviders(): void {
  // Register ReminderMedia if configured
  if (process.env.REMINDER_MEDIA_API_KEY) {
    reminderMediaProvider.initialize({
      apiKey: process.env.REMINDER_MEDIA_API_KEY,
      apiUrl: process.env.REMINDER_MEDIA_API_URL,
      webhookSecret: process.env.REMINDER_MEDIA_WEBHOOK_SECRET,
    });
    printApiRegistry.register(reminderMediaProvider);
    console.log('[PrintApi] Registered ReminderMedia provider');
  }

  // Register LOB if configured
  if (process.env.LOB_API_KEY) {
    lobProvider.initialize({
      apiKey: process.env.LOB_API_KEY,
    });
    printApiRegistry.register(lobProvider);
    console.log('[PrintApi] Registered LOB provider');
  }

  // Register Stannp if configured
  if (process.env.STANNP_API_KEY) {
    stannpProvider.initialize({
      apiKey: process.env.STANNP_API_KEY,
      apiUrl: process.env.STANNP_API_URL,
    });
    printApiRegistry.register(stannpProvider);
    console.log('[PrintApi] Registered Stannp provider');
  }

  // Register PostGrid if configured
  if (process.env.POSTGRID_API_KEY) {
    postGridProvider.initialize({
      apiKey: process.env.POSTGRID_API_KEY,
      apiUrl: process.env.POSTGRID_API_URL,
    });
    printApiRegistry.register(postGridProvider);
    console.log('[PrintApi] Registered PostGrid provider');
  }

  // Set default provider if specified
  const defaultProvider = process.env.PRINT_API_DEFAULT_PROVIDER;
  if (defaultProvider && printApiRegistry.has(defaultProvider)) {
    printApiRegistry.setDefault(defaultProvider);
  }

  console.log(`[PrintApi] Initialized with ${printApiRegistry.count()} provider(s)`);
  if (printApiRegistry.getDefaultName()) {
    console.log(`[PrintApi] Default provider: ${printApiRegistry.getDefaultName()}`);
  }
}

/**
 * Get a print API provider by name
 * @param name - Provider name (optional, returns default if not specified)
 */
export function getPrintApiProvider(name?: string): PrintApiProvider {
  if (name) {
    return printApiRegistry.get(name);
  }
  return printApiRegistry.getDefault();
}

/**
 * Get a print API provider by name, or undefined if not found
 */
export function getPrintApiProviderOptional(name?: string): PrintApiProvider | undefined {
  if (name) {
    return printApiRegistry.getOptional(name);
  }
  return printApiRegistry.getDefaultOptional();
}

/**
 * Register a custom provider
 */
export function registerPrintApiProvider(
  provider: PrintApiProvider,
  isDefault: boolean = false
): void {
  printApiRegistry.register(provider, isDefault);
}

/**
 * Configure and register a provider at runtime
 */
export function configureAndRegisterProvider(
  providerName: string,
  config: PrintApiConfig,
  setAsDefault: boolean = false
): PrintApiProvider {
  let provider: PrintApiProvider;

  switch (providerName.toLowerCase()) {
    case 'reminder_media':
    case 'remindermedia':
      provider = reminderMediaProvider;
      break;
    case 'lob':
      provider = lobProvider;
      break;
    case 'stannp':
      provider = stannpProvider;
      break;
    case 'postgrid':
      provider = postGridProvider;
      break;
    default:
      throw new Error(`Unknown print API provider: ${providerName}`);
  }

  provider.initialize(config);
  printApiRegistry.register(provider, setAsDefault);

  return provider;
}

/**
 * List all registered providers
 */
export function listPrintApiProviders(): Array<{
  name: string;
  displayName: string;
  isDefault: boolean;
  isConfigured: boolean;
}> {
  return printApiRegistry.listDetailed();
}

/**
 * Get the name of the default provider
 */
export function getDefaultPrintApiProviderName(): string | null {
  return printApiRegistry.getDefaultName();
}

/**
 * Check if any print API providers are available
 */
export function hasPrintApiProviders(): boolean {
  return printApiRegistry.count() > 0;
}
