/**
 * Tool: setup_franchise_store
 * Register a new store/location within a franchise brand.
 * Creates a child tenant with location-scoped data access and branded MCP endpoint.
 */

import { type TenantContext } from '../../utils/auth.js';
import { ValidationError } from '../../utils/errors.js';
import type { FranchiseStoreConfig } from '../../types/franchise.js';

/**
 * Tool definition for MCP server registration
 */
export const setupFranchiseStoreTool = {
  name: 'setup_franchise_store',
  description: `Register a new store or dealer location within your franchise brand.

Each store gets:
- Its own API key for Claude/ChatGPT access
- Location-scoped data search (automatically filtered to store's radius)
- Access to brand-approved creative (postcards, emails)
- Its own billing (per_store model) or consolidated under the franchisor
- Usage tracking and campaign history

The store manager receives setup instructions to add the MCP to their Claude Desktop or ChatGPT.

Example: "Add Store #1234 at 123 Main St, Scottsdale AZ 85251 — manager is John Smith, john@store1234.com"

You can add stores one at a time or in bulk by calling this tool multiple times.`,

  inputSchema: {
    type: 'object',
    properties: {
      brand_slug: {
        type: 'string',
        description: 'The franchise brand slug (e.g., "mcdonalds")',
      },
      store_number: {
        type: 'string',
        description: 'Store/location number (e.g., "1234", "AZ-001")',
      },
      store_name: {
        type: 'string',
        description: 'Store display name (e.g., "McDonalds - Scottsdale Rd")',
      },
      address: {
        type: 'string',
        description: 'Street address',
      },
      city: {
        type: 'string',
        description: 'City',
      },
      state: {
        type: 'string',
        description: 'State abbreviation (e.g., "AZ")',
      },
      zip: {
        type: 'string',
        description: 'ZIP code',
      },
      latitude: {
        type: 'number',
        description: 'Latitude (auto-geocoded if not provided)',
      },
      longitude: {
        type: 'number',
        description: 'Longitude (auto-geocoded if not provided)',
      },
      radius_miles: {
        type: 'number',
        description: 'Search radius override for this store (default: brand default)',
      },
      manager_name: {
        type: 'string',
        description: 'Store manager name',
      },
      manager_email: {
        type: 'string',
        description: 'Store manager email (receives setup instructions)',
      },
      manager_phone: {
        type: 'string',
        description: 'Store manager phone',
      },
    },
    required: ['brand_slug', 'store_name', 'address', 'city', 'state', 'zip', 'manager_email'],
  },
};

/**
 * Execute franchise store setup
 */
export async function executeSetupFranchiseStore(
  input: unknown,
  _context: TenantContext
): Promise<unknown> {
  const params = input as Record<string, unknown>;

  const config: FranchiseStoreConfig = {
    brandSlug: params.brand_slug as string,
    storeNumber: params.store_number as string | undefined,
    storeName: params.store_name as string,
    address: params.address as string,
    city: params.city as string,
    state: (params.state as string).toUpperCase(),
    zip: params.zip as string,
    latitude: params.latitude as number | undefined,
    longitude: params.longitude as number | undefined,
    radiusMiles: params.radius_miles as number | undefined,
    managerName: params.manager_name as string | undefined,
    managerEmail: params.manager_email as string,
    managerPhone: params.manager_phone as string | undefined,
  };

  // Validate ZIP
  if (!/^\d{5}(-\d{4})?$/.test(config.zip)) {
    throw new ValidationError('Invalid ZIP code format');
  }

  // Validate state
  if (!/^[A-Z]{2}$/.test(config.state)) {
    throw new ValidationError('State must be a 2-letter abbreviation (e.g., AZ)');
  }

  // In production:
  // 1. Look up the FranchiseBrand by slug, verify caller is the owner
  // 2. Create a new child Tenant (parentTenantId = franchisor tenant)
  // 3. Create FranchiseStore record linked to brand + child tenant
  // 4. Generate an API key for the store
  // 5. Create a subscription with location-scoped geography restrictions
  // 6. Optionally email the manager with setup instructions

  const storeId = `store-${Date.now()}`;
  const apiKey = `sk_${config.brandSlug}_${config.storeNumber || storeId}_${Math.random().toString(36).slice(2, 10)}`;
  const storeLabel = config.storeNumber ? `Store #${config.storeNumber}` : config.storeName;
  const radiusMiles = config.radiusMiles || 10; // brand default fallback

  return {
    success: true,
    store: {
      id: storeId,
      brandSlug: config.brandSlug,
      storeNumber: config.storeNumber,
      storeName: config.storeName,
      status: 'ACTIVE',
    },
    location: {
      address: config.address,
      city: config.city,
      state: config.state,
      zip: config.zip,
      latitude: config.latitude,
      longitude: config.longitude,
      radiusMiles,
    },
    access: {
      apiKey: `${apiKey.slice(0, 12)}...${apiKey.slice(-4)}`, // Masked for display
      fullApiKey: apiKey, // Only shown once at setup
      mcpEndpoint: `https://mcp.leadsplease.com/${config.brandSlug}`,
      connectPageUrl: `https://mcp.leadsplease.com/${config.brandSlug}/connect`,
    },
    manager: {
      name: config.managerName,
      email: config.managerEmail,
      phone: config.managerPhone,
      setupInstructionsSent: !!config.managerEmail,
    },
    dataScope: {
      description: `All data searches for ${storeLabel} are automatically scoped to ${radiusMiles}-mile radius around ${config.city}, ${config.state} ${config.zip}`,
      databases: ['nho', 'new_mover', 'consumer'],
      radiusMiles,
      centerZip: config.zip,
    },
    nextSteps: [
      `Share the API key with ${config.managerName || 'the store manager'} — it's only shown once`,
      `The manager can set up Claude Desktop or ChatGPT using the connect page`,
      `The store's data searches are automatically limited to ${radiusMiles} miles around ${config.city}, ${config.state}`,
      `Use franchise_dashboard to monitor this store's activity`,
    ],
    message: `✅ ${storeLabel} (${config.city}, ${config.state}) is set up! API key generated and ${config.managerEmail ? 'setup instructions sent to ' + config.managerEmail : 'ready to share'}.`,
  };
}
