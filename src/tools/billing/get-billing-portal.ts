/**
 * Tool: get_billing_portal
 * Generate Stripe Customer Portal URL for self-service billing management
 */

import { z } from 'zod';
import { validateInput } from '../../utils/validation.js';
import { requirePermission, type TenantContext } from '../../utils/auth.js';
import { createPortalSession, getOrCreateCustomer } from '../../services/stripe-billing.js';

/**
 * Input schema for get_billing_portal
 */
const GetBillingPortalInputSchema = z.object({
  return_url: z.string().url(),
});

export type GetBillingPortalInput = z.infer<typeof GetBillingPortalInputSchema>;

/**
 * Tool definition for MCP server registration
 */
export const getBillingPortalTool = {
  name: 'get_billing_portal',
  description: `Generate a Stripe Customer Portal URL.

The portal allows customers to:
- View and download invoices
- Update payment methods
- View subscription details
- Cancel or modify subscription

Returns a temporary URL (valid for ~1 hour) that redirects to the Stripe-hosted portal.`,

  inputSchema: {
    type: 'object',
    properties: {
      return_url: {
        type: 'string',
        description: 'URL to redirect back to after portal session',
      },
    },
    required: ['return_url'],
  },
};

/**
 * Execute the get_billing_portal tool
 */
export async function executeGetBillingPortal(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    portal_url: string;
    expires_in: string;
  };
  error?: string;
}> {
  // Validate input
  const params = validateInput(GetBillingPortalInputSchema, input);

  // Check permissions
  requirePermission(context, 'subscription:read');

  try {
    // Get or create Stripe customer
    const customerId = await getOrCreateCustomer(context.tenant.id);

    // Create portal session
    const session = await createPortalSession({
      customerId,
      returnUrl: params.return_url,
    });

    return {
      success: true,
      data: {
        portal_url: session.url,
        expires_in: '1 hour',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create billing portal session',
    };
  }
}
