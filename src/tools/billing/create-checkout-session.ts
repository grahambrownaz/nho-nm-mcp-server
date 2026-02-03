/**
 * Tool: create_checkout_session
 * Generate Stripe Checkout session for Direct Mode signup
 */

import { z } from 'zod';
import { validateInput } from '../../utils/validation.js';
import { requirePermission, type TenantContext } from '../../utils/auth.js';
import { createCheckoutSession, PLANS } from '../../services/stripe-billing.js';

/**
 * Input schema for create_checkout_session
 */
const CreateCheckoutSessionInputSchema = z.object({
  plan_type: z.enum(['starter', 'growth', 'pro']),
  success_url: z.string().url(),
  cancel_url: z.string().url(),
  tenant_name: z.string().optional(),
  tenant_email: z.string().email().optional(),
  metadata: z.record(z.string()).optional(),
});

export type CreateCheckoutSessionInput = z.infer<typeof CreateCheckoutSessionInputSchema>;

/**
 * Tool definition for MCP server registration
 */
export const createCheckoutSessionTool = {
  name: 'create_checkout_session',
  description: `Create a Stripe Checkout session for Direct Mode signup.

Returns a checkout URL where the customer can complete payment for:
- Platform subscription fee (monthly)
- Metered usage tracking (data records, PDFs, print jobs)

Available plans:
- starter: $29/month + usage - Up to 500 records/month, 1 subscription
- growth: $49/month + usage - Up to 2,500 records/month, 5 subscriptions
- pro: $99/month + usage - Unlimited records and subscriptions

Usage pricing:
- Data records: $0.04/record
- PDF generation: $0.04/PDF
- Print + mail 4x6: $0.75/postcard
- Print + mail 6x9: $0.95/postcard

Returns checkout URL to redirect the customer to.`,

  inputSchema: {
    type: 'object',
    properties: {
      plan_type: {
        type: 'string',
        enum: ['starter', 'growth', 'pro'],
        description: 'Subscription plan',
      },
      success_url: {
        type: 'string',
        description: 'URL to redirect after successful payment',
      },
      cancel_url: {
        type: 'string',
        description: 'URL to redirect if customer cancels',
      },
      tenant_name: {
        type: 'string',
        description: 'Customer/business name (optional, uses current tenant if not provided)',
      },
      tenant_email: {
        type: 'string',
        description: 'Customer email (optional, uses current tenant if not provided)',
      },
      metadata: {
        type: 'object',
        description: 'Additional metadata to attach to the subscription',
      },
    },
    required: ['plan_type', 'success_url', 'cancel_url'],
  },
};

/**
 * Execute the create_checkout_session tool
 */
export async function executeCreateCheckoutSession(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    checkout_url: string;
    session_id: string;
    plan: {
      name: string;
      monthly_fee: number;
      features: string[];
    };
    expires_at: string;
  };
  error?: string;
}> {
  // Validate input
  const params = validateInput(CreateCheckoutSessionInputSchema, input);

  // Check permissions
  requirePermission(context, 'subscription:write');

  const plan = PLANS[params.plan_type];

  try {
    const result = await createCheckoutSession({
      planType: params.plan_type,
      tenantEmail: params.tenant_email || context.tenant.email,
      tenantName: params.tenant_name || context.tenant.name,
      successUrl: params.success_url,
      cancelUrl: params.cancel_url,
      metadata: {
        tenantId: context.tenant.id,
        ...params.metadata,
      },
    });

    // Checkout sessions expire after 24 hours
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    return {
      success: true,
      data: {
        checkout_url: result.url,
        session_id: result.sessionId,
        plan: {
          name: plan.name,
          monthly_fee: plan.monthlyFee,
          features: plan.features,
        },
        expires_at: expiresAt.toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create checkout session',
    };
  }
}
