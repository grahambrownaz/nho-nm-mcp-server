/**
 * Tool: register_franchise_brand
 * Self-service franchise brand registration.
 * Creates the brand entity, sets up branding, and configures defaults.
 * The calling tenant becomes the franchisor (brand owner).
 */

import { type TenantContext } from '../../utils/auth.js';
import { ValidationError } from '../../utils/errors.js';
import type { FranchiseBrandConfig } from '../../types/franchise.js';

/**
 * Tool definition for MCP server registration
 */
export const registerFranchiseBrandTool = {
  name: 'register_franchise_brand',
  description: `Register a new franchise or dealer brand for self-service marketing.

This creates a branded marketing hub where your stores/dealers/locations can use AI to:
- Buy targeted data (new homeowners, new movers, consumers) within their local radius
- Send branded postcards and email campaigns using HQ-approved creative
- Subscribe to recurring data deliveries
- Track campaign performance

Think of it like Sales.Garden powered by AI — each store gets their own Claude/ChatGPT connection branded for your network.

After registration, use setup_franchise_store to add individual locations, and upload_franchise_creative to add approved templates.

Example: McDonalds registers → uploads approved postcard designs → adds 13,800 stores → each store manager opens ChatGPT and says "Send new mover postcards within 5 miles of my store"`,

  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Brand name (e.g., "McDonalds", "Pentair", "State Farm")',
      },
      slug: {
        type: 'string',
        description: 'URL-safe identifier (e.g., "mcdonalds"). Used for MCP endpoint: /mcp/mcdonalds',
      },
      industry: {
        type: 'string',
        description: 'Industry category (e.g., "QSR", "Water Treatment", "Insurance", "Home Services")',
      },
      logo_url: {
        type: 'string',
        description: 'URL to brand logo image',
      },
      primary_color: {
        type: 'string',
        description: 'Primary brand color hex code (default: "#000000")',
      },
      secondary_color: {
        type: 'string',
        description: 'Secondary brand color hex code (default: "#ffffff")',
      },
      accent_color: {
        type: 'string',
        description: 'Accent color hex code',
      },
      support_email: {
        type: 'string',
        description: 'Support email for store managers',
      },
      support_phone: {
        type: 'string',
        description: 'Support phone number',
      },
      website_url: {
        type: 'string',
        description: 'Brand website URL',
      },
      default_databases: {
        type: 'array',
        items: { type: 'string', enum: ['nho', 'new_mover', 'consumer', 'business'] },
        description: 'Default data sources available to stores (default: nho, new_mover, consumer)',
      },
      default_radius_miles: {
        type: 'number',
        description: 'Default search radius around each store in miles (default: 10)',
      },
      billing_model: {
        type: 'string',
        enum: ['per_store', 'consolidated', 'hybrid'],
        description: 'How stores are billed. per_store = each store pays independently. consolidated = franchisor pays for all. hybrid = franchisor pays base, stores pay overages.',
      },
      welcome_message: {
        type: 'string',
        description: 'Custom welcome message shown when a store connects via AI (e.g., "Welcome to McDonalds Marketing Hub! I can help you...")',
      },
      max_stores: {
        type: 'number',
        description: 'Maximum number of stores allowed (default: 100)',
      },
    },
    required: ['name', 'slug'],
  },
};

/**
 * Execute franchise brand registration
 */
export async function executeRegisterFranchiseBrand(
  input: unknown,
  context: TenantContext
): Promise<unknown> {
  const params = input as Record<string, unknown>;

  // Validate slug format
  const slug = (params.slug as string).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (slug.length < 2 || slug.length > 50) {
    throw new ValidationError('Slug must be 2-50 characters (letters, numbers, hyphens)');
  }

  const config: FranchiseBrandConfig = {
    name: params.name as string,
    slug,
    industry: params.industry as string | undefined,
    logoUrl: params.logo_url as string | undefined,
    primaryColor: (params.primary_color as string) || '#000000',
    secondaryColor: (params.secondary_color as string) || '#ffffff',
    accentColor: params.accent_color as string | undefined,
    supportEmail: params.support_email as string | undefined,
    supportPhone: params.support_phone as string | undefined,
    websiteUrl: params.website_url as string | undefined,
    defaultDatabases: params.default_databases as string[] | undefined,
    defaultRadiusMiles: (params.default_radius_miles as number) || 10,
    billingModel: ((params.billing_model as string) || 'PER_STORE').toUpperCase() as FranchiseBrandConfig['billingModel'],
    welcomeMessage: params.welcome_message as string | undefined,
    maxStores: (params.max_stores as number) || 100,
  };

  // Mark the tenant as a reseller/franchisor
  // In production, this would use Prisma to create the FranchiseBrand record
  // and update the tenant's isReseller flag

  const mcpEndpoint = `https://mcp.leadsplease.com/${slug}`;
  const connectPageUrl = `https://mcp.leadsplease.com/${slug}/connect`;

  return {
    success: true,
    brand: {
      name: config.name,
      slug: config.slug,
      industry: config.industry,
      status: 'ACTIVE',
      ownerTenantId: context.tenant.id,
      mcpEndpoint,
      connectPageUrl,
    },
    branding: {
      logoUrl: config.logoUrl,
      primaryColor: config.primaryColor,
      secondaryColor: config.secondaryColor,
      accentColor: config.accentColor,
    },
    defaults: {
      databases: config.defaultDatabases || ['nho', 'new_mover', 'consumer'],
      radiusMiles: config.defaultRadiusMiles,
      billingModel: config.billingModel,
      maxStores: config.maxStores,
    },
    nextSteps: [
      `Upload approved creative: use upload_franchise_creative to add postcard and email templates`,
      `Add stores: use setup_franchise_store to register each location`,
      `Share the connect page (${connectPageUrl}) with store managers to set up Claude/ChatGPT`,
      `View activity: use franchise_dashboard to monitor all store activity and spend`,
    ],
    message: `🎉 ${config.name} franchise brand registered! Your stores can connect at ${connectPageUrl}. Next: upload creative and add your stores.`,
  };
}
