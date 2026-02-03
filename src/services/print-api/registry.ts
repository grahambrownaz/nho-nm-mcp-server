/**
 * Print API Provider Registry
 * Manages registration and retrieval of print API providers
 */

import type { PrintApiProvider, ProviderRegistration } from './types.js';

/**
 * Registry for managing print API providers
 * Allows runtime registration and switching between providers
 */
export class PrintApiRegistry {
  private providers: Map<string, ProviderRegistration> = new Map();
  private defaultProviderName: string | null = null;

  /**
   * Register a new provider
   * @param provider - The provider instance to register
   * @param isDefault - Whether this should be the default provider
   */
  register(provider: PrintApiProvider, isDefault: boolean = false): void {
    const name = provider.name.toLowerCase();

    if (this.providers.has(name)) {
      console.warn(`[PrintApiRegistry] Replacing existing provider: ${name}`);
    }

    this.providers.set(name, { provider, isDefault });

    // Set as default if requested or if it's the first provider
    if (isDefault || this.defaultProviderName === null) {
      this.defaultProviderName = name;
    }

    console.log(`[PrintApiRegistry] Registered provider: ${provider.displayName} (${name})`);
  }

  /**
   * Unregister a provider
   * @param name - Provider name to remove
   */
  unregister(name: string): boolean {
    const normalizedName = name.toLowerCase();
    const existed = this.providers.delete(normalizedName);

    if (existed && this.defaultProviderName === normalizedName) {
      // Set a new default if available
      const firstProvider = this.providers.keys().next().value;
      this.defaultProviderName = firstProvider || null;
    }

    return existed;
  }

  /**
   * Get a specific provider by name
   * @param name - Provider name
   * @throws Error if provider not found
   */
  get(name: string): PrintApiProvider {
    const normalizedName = name.toLowerCase();
    const registration = this.providers.get(normalizedName);

    if (!registration) {
      const available = this.list().join(', ') || 'none';
      throw new Error(
        `Print API provider '${name}' not found. Available providers: ${available}`
      );
    }

    return registration.provider;
  }

  /**
   * Get a provider if it exists, otherwise return undefined
   * @param name - Provider name
   */
  getOptional(name: string): PrintApiProvider | undefined {
    const normalizedName = name.toLowerCase();
    return this.providers.get(normalizedName)?.provider;
  }

  /**
   * Get the default provider
   * @throws Error if no providers registered
   */
  getDefault(): PrintApiProvider {
    if (!this.defaultProviderName) {
      throw new Error('No print API providers registered');
    }

    return this.get(this.defaultProviderName);
  }

  /**
   * Get the default provider if available
   */
  getDefaultOptional(): PrintApiProvider | undefined {
    if (!this.defaultProviderName) {
      return undefined;
    }
    return this.getOptional(this.defaultProviderName);
  }

  /**
   * Set the default provider
   * @param name - Provider name to set as default
   * @throws Error if provider not found
   */
  setDefault(name: string): void {
    const normalizedName = name.toLowerCase();

    if (!this.providers.has(normalizedName)) {
      throw new Error(`Cannot set default: provider '${name}' not found`);
    }

    // Update registration flags
    for (const [key, registration] of this.providers) {
      registration.isDefault = key === normalizedName;
    }

    this.defaultProviderName = normalizedName;
    console.log(`[PrintApiRegistry] Default provider set to: ${normalizedName}`);
  }

  /**
   * Get the name of the default provider
   */
  getDefaultName(): string | null {
    return this.defaultProviderName;
  }

  /**
   * List all registered provider names
   */
  list(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * List all registered providers with details
   */
  listDetailed(): Array<{
    name: string;
    displayName: string;
    isDefault: boolean;
    isConfigured: boolean;
  }> {
    return Array.from(this.providers.entries()).map(([name, reg]) => ({
      name,
      displayName: reg.provider.displayName,
      isDefault: reg.isDefault,
      isConfigured: reg.provider.isConfigured(),
    }));
  }

  /**
   * Check if a provider is registered
   * @param name - Provider name to check
   */
  has(name: string): boolean {
    return this.providers.has(name.toLowerCase());
  }

  /**
   * Get the count of registered providers
   */
  count(): number {
    return this.providers.size;
  }

  /**
   * Clear all registered providers
   */
  clear(): void {
    this.providers.clear();
    this.defaultProviderName = null;
  }
}

/**
 * Singleton registry instance
 */
export const printApiRegistry = new PrintApiRegistry();
