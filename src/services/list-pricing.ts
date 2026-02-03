/**
 * List Pricing Service
 * Calculates pricing for one-time list purchases with volume discounts
 */

import type { DatabaseType } from '../schemas/filters.js';

/**
 * Base pricing per database type (price per record in dollars)
 */
export const LIST_PRICING: Record<string, {
  base: number;
  email_append: number;
  phone_append: number;
  executive_contact?: number;
}> = {
  consumer: { base: 0.03, email_append: 0.02, phone_append: 0.02 },
  business: { base: 0.05, email_append: 0.02, phone_append: 0.02, executive_contact: 0.03 },
  nho: { base: 0.04, email_append: 0.02, phone_append: 0.02 },
  new_mover: { base: 0.04, email_append: 0.02, phone_append: 0.02 },
};

/**
 * Volume discount tiers
 */
export const VOLUME_DISCOUNTS = [
  { min: 1, max: 999, discount: 0, label: 'Standard' },
  { min: 1000, max: 4999, discount: 0.10, label: '10% Volume Discount' },
  { min: 5000, max: 9999, discount: 0.15, label: '15% Volume Discount' },
  { min: 10000, max: 24999, discount: 0.20, label: '20% Volume Discount' },
  { min: 25000, max: 49999, discount: 0.25, label: '25% Volume Discount' },
  { min: 50000, max: Infinity, discount: 0.30, label: '30% Volume Discount' },
];

/**
 * Minimum order amounts per database
 */
export const MINIMUM_ORDER: Record<string, number> = {
  consumer: 10.00,
  business: 25.00,
  nho: 15.00,
  new_mover: 15.00,
};

/**
 * List pricing calculation parameters
 */
export interface ListPricingParams {
  database: DatabaseType;
  recordCount: number;
  withEmailCount: number;
  withPhoneCount: number;
  includeEmail: boolean;
  includePhone: boolean;
  includeExecutiveContacts?: boolean;
  executiveContactCount?: number;
}

/**
 * List pricing result
 */
export interface ListPricingResult {
  // Base pricing
  baseAmount: number;
  pricePerRecord: number;

  // Append pricing
  emailAppendAmount: number;
  emailAppendRate: number;
  phoneAppendAmount: number;
  phoneAppendRate: number;
  executiveAppendAmount: number;

  // Subtotals
  subtotal: number;

  // Discounts
  discountPercent: number;
  discountLabel: string;
  discountAmount: number;

  // Final
  total: number;
  minimumOrder: number;
  meetsMinimum: boolean;

  // Per-record breakdown
  effectivePerRecord: number;

  // Summary for display
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
}

/**
 * Calculate list purchase pricing
 */
export function calculateListPrice(params: ListPricingParams): ListPricingResult {
  const {
    database,
    recordCount,
    withEmailCount,
    withPhoneCount,
    includeEmail,
    includePhone,
    includeExecutiveContacts = false,
    executiveContactCount = 0,
  } = params;

  const pricing = LIST_PRICING[database] || LIST_PRICING.consumer;
  const lineItems: ListPricingResult['lineItems'] = [];

  // Base record pricing
  const baseAmount = recordCount * pricing.base;
  lineItems.push({
    description: `${database.toUpperCase()} Records`,
    quantity: recordCount,
    unitPrice: pricing.base,
    amount: baseAmount,
  });

  // Email append pricing
  let emailAppendAmount = 0;
  if (includeEmail && withEmailCount > 0) {
    emailAppendAmount = withEmailCount * pricing.email_append;
    lineItems.push({
      description: 'Email Append',
      quantity: withEmailCount,
      unitPrice: pricing.email_append,
      amount: emailAppendAmount,
    });
  }

  // Phone append pricing
  let phoneAppendAmount = 0;
  if (includePhone && withPhoneCount > 0) {
    phoneAppendAmount = withPhoneCount * pricing.phone_append;
    lineItems.push({
      description: 'Phone Append',
      quantity: withPhoneCount,
      unitPrice: pricing.phone_append,
      amount: phoneAppendAmount,
    });
  }

  // Executive contact append (business only)
  let executiveAppendAmount = 0;
  if (database === 'business' && includeExecutiveContacts && executiveContactCount > 0 && pricing.executive_contact) {
    executiveAppendAmount = executiveContactCount * pricing.executive_contact;
    lineItems.push({
      description: 'Executive Contacts',
      quantity: executiveContactCount,
      unitPrice: pricing.executive_contact,
      amount: executiveAppendAmount,
    });
  }

  // Calculate subtotal
  const subtotal = baseAmount + emailAppendAmount + phoneAppendAmount + executiveAppendAmount;

  // Determine volume discount
  const tier = VOLUME_DISCOUNTS.find((d) => recordCount >= d.min && recordCount <= d.max);
  const discountPercent = tier?.discount || 0;
  const discountLabel = tier?.label || 'Standard';
  const discountAmount = subtotal * discountPercent;

  if (discountAmount > 0) {
    lineItems.push({
      description: discountLabel,
      quantity: 1,
      unitPrice: -discountAmount,
      amount: -discountAmount,
    });
  }

  // Calculate total
  const total = Math.max(0, subtotal - discountAmount);

  // Check minimum order
  const minimumOrder = MINIMUM_ORDER[database] || 10.00;
  const meetsMinimum = total >= minimumOrder;

  // Effective per-record price
  const effectivePerRecord = recordCount > 0 ? total / recordCount : 0;

  return {
    baseAmount: roundCurrency(baseAmount),
    pricePerRecord: pricing.base,
    emailAppendAmount: roundCurrency(emailAppendAmount),
    emailAppendRate: pricing.email_append,
    phoneAppendAmount: roundCurrency(phoneAppendAmount),
    phoneAppendRate: pricing.phone_append,
    executiveAppendAmount: roundCurrency(executiveAppendAmount),
    subtotal: roundCurrency(subtotal),
    discountPercent: discountPercent * 100,
    discountLabel,
    discountAmount: roundCurrency(discountAmount),
    total: roundCurrency(total),
    minimumOrder,
    meetsMinimum,
    effectivePerRecord: roundCurrency(effectivePerRecord, 4),
    lineItems: lineItems.map((item) => ({
      ...item,
      unitPrice: roundCurrency(item.unitPrice, 4),
      amount: roundCurrency(item.amount),
    })),
  };
}

/**
 * Round to currency (2 decimal places by default)
 */
function roundCurrency(amount: number, decimals = 2): number {
  return Math.round(amount * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

/**
 * Get pricing info for a database (for display purposes)
 */
export function getDatabasePricing(database: DatabaseType): {
  database: string;
  basePrice: number;
  emailAppendPrice: number;
  phoneAppendPrice: number;
  executiveContactPrice?: number;
  minimumOrder: number;
  volumeDiscounts: typeof VOLUME_DISCOUNTS;
} {
  const pricing = LIST_PRICING[database] || LIST_PRICING.consumer;

  return {
    database,
    basePrice: pricing.base,
    emailAppendPrice: pricing.email_append,
    phoneAppendPrice: pricing.phone_append,
    executiveContactPrice: pricing.executive_contact,
    minimumOrder: MINIMUM_ORDER[database] || 10.00,
    volumeDiscounts: VOLUME_DISCOUNTS,
  };
}

/**
 * Estimate pricing based on count (for preview)
 */
export function estimateListPrice(
  database: DatabaseType,
  estimatedCount: number,
  options: {
    includeEmail?: boolean;
    includePhone?: boolean;
    emailAvailabilityPercent?: number;
    phoneAvailabilityPercent?: number;
  } = {}
): ListPricingResult {
  const {
    includeEmail = false,
    includePhone = false,
    emailAvailabilityPercent = 60,
    phoneAvailabilityPercent = 70,
  } = options;

  const withEmailCount = includeEmail ? Math.floor(estimatedCount * (emailAvailabilityPercent / 100)) : 0;
  const withPhoneCount = includePhone ? Math.floor(estimatedCount * (phoneAvailabilityPercent / 100)) : 0;

  return calculateListPrice({
    database,
    recordCount: estimatedCount,
    withEmailCount,
    withPhoneCount,
    includeEmail,
    includePhone,
  });
}
