/**
 * Tool: get_billing_status
 * Get current billing status including usage and upcoming invoice
 */

import { z } from 'zod';
import { validateInput } from '../../utils/validation.js';
import { requirePermission, type TenantContext } from '../../utils/auth.js';
import {
  getBillingStatus,
  getOrCreateCustomer,
  getUpcomingInvoice,
} from '../../services/stripe-billing.js';

/**
 * Input schema for get_billing_status
 */
const GetBillingStatusInputSchema = z.object({
  include_invoice_details: z.boolean().default(false),
});

export type GetBillingStatusInput = z.infer<typeof GetBillingStatusInputSchema>;

/**
 * Tool definition for MCP server registration
 */
export const getBillingStatusTool = {
  name: 'get_billing_status',
  description: `Get billing status for the current tenant.

Returns:
- Current subscription details (plan, status, period)
- Usage this billing period (data records, PDFs, print jobs)
- Upcoming invoice amount
- Payment method on file

Use include_invoice_details=true to get line-item breakdown of upcoming invoice.`,

  inputSchema: {
    type: 'object',
    properties: {
      include_invoice_details: {
        type: 'boolean',
        description: 'Include line-item details of upcoming invoice',
      },
    },
  },
};

/**
 * Execute the get_billing_status tool
 */
export async function executeGetBillingStatus(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    subscription: {
      id: string;
      status: string;
      plan: string;
      current_period: {
        start: string;
        end: string;
      };
    } | null;
    usage_this_period: {
      data_records: number;
      pdf_generation: number;
      print_jobs: number;
      estimated_cost: {
        data_records: number;
        pdf_generation: number;
        print_jobs: number;
        total: number;
      };
    };
    upcoming_invoice: {
      amount_due: number;
      currency: string;
      line_items?: Array<{
        description: string;
        amount: number;
        quantity: number;
      }>;
    } | null;
    payment_method: {
      type: string;
      last4?: string;
      brand?: string;
      expires?: string;
    } | null;
    account: {
      email: string;
      name: string;
    };
  };
  error?: string;
}> {
  // Validate input
  const params = validateInput(GetBillingStatusInputSchema, input);

  // Check permissions
  requirePermission(context, 'subscription:read');

  try {
    // Get or create Stripe customer
    const customerId = await getOrCreateCustomer(context.tenant.id);

    // Get billing status
    const status = await getBillingStatus(customerId);

    // Calculate estimated costs (these should match Stripe price configuration)
    const DATA_RECORD_PRICE = 0.04;
    const PDF_PRICE = 0.04;
    const PRINT_PRICE = 0.75; // Average/4x6

    const estimatedCost = {
      data_records: status.usageThisPeriod.dataRecords * DATA_RECORD_PRICE,
      pdf_generation: status.usageThisPeriod.pdfGeneration * PDF_PRICE,
      print_jobs: status.usageThisPeriod.printJobs * PRINT_PRICE,
      total: 0,
    };
    estimatedCost.total =
      estimatedCost.data_records + estimatedCost.pdf_generation + estimatedCost.print_jobs;

    // Format response
    const response: {
      success: boolean;
      data: {
        subscription: {
          id: string;
          status: string;
          plan: string;
          current_period: { start: string; end: string };
        } | null;
        usage_this_period: {
          data_records: number;
          pdf_generation: number;
          print_jobs: number;
          estimated_cost: {
            data_records: number;
            pdf_generation: number;
            print_jobs: number;
            total: number;
          };
        };
        upcoming_invoice: {
          amount_due: number;
          currency: string;
          line_items?: Array<{ description: string; amount: number; quantity: number }>;
        } | null;
        payment_method: {
          type: string;
          last4?: string;
          brand?: string;
          expires?: string;
        } | null;
        account: { email: string; name: string };
      };
    } = {
      success: true,
      data: {
        subscription: status.subscription
          ? {
              id: status.subscription.id,
              status: status.subscription.status,
              plan: status.subscription.plan,
              current_period: {
                start: status.subscription.currentPeriodStart.toISOString(),
                end: status.subscription.currentPeriodEnd.toISOString(),
              },
            }
          : null,
        usage_this_period: {
          data_records: status.usageThisPeriod.dataRecords,
          pdf_generation: status.usageThisPeriod.pdfGeneration,
          print_jobs: status.usageThisPeriod.printJobs,
          estimated_cost: estimatedCost,
        },
        upcoming_invoice: status.upcomingInvoice
          ? {
              amount_due: status.upcomingInvoice.amountDue,
              currency: status.upcomingInvoice.currency,
            }
          : null,
        payment_method: status.paymentMethod
          ? {
              type: status.paymentMethod.type,
              last4: status.paymentMethod.last4,
              brand: status.paymentMethod.brand,
              expires: status.paymentMethod.expMonth && status.paymentMethod.expYear
                ? `${status.paymentMethod.expMonth}/${status.paymentMethod.expYear}`
                : undefined,
            }
          : null,
        account: {
          email: status.customer.email,
          name: status.customer.name,
        },
      },
    };

    // Include invoice details if requested
    if (params.include_invoice_details && response.data.upcoming_invoice) {
      const invoiceDetails = await getUpcomingInvoice(customerId);
      response.data.upcoming_invoice.line_items = invoiceDetails.lineItems;
    }

    return response;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get billing status',
    };
  }
}
