/**
 * Tests for create_subscription tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeCreateSubscription } from '../../../../src/tools/subscriptions/create-subscription.js';
import { prisma } from '../../../../src/db/client.js';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { ValidationError, AuthorizationError } from '../../../../src/utils/errors.js';

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    template: {
      findUnique: vi.fn(),
    },
    subscription: {
      create: vi.fn(),
    },
  },
}));

// Mock Decimal type that matches Prisma's Decimal behavior
function mockDecimal(value: number) {
  return {
    toNumber: () => value,
    toString: () => String(value),
    valueOf: () => value,
  } as any;
}

// Create a valid tenant context for tests
function createTestContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenant: {
      id: 'test-tenant-id',
      name: 'Test Tenant',
      email: 'test@example.com',
      company: 'Test Company',
      phone: null,
      status: 'ACTIVE',
      stripeCustomerId: null,
      parentTenantId: null,
      isReseller: false,
      wholesalePricing: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    apiKey: {
      id: 'test-api-key-id',
      key: 'test-key',
      name: 'Test Key',
      tenantId: 'test-tenant-id',
      permissions: ['*'],
      isActive: true,
      lastUsedAt: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    subscription: {
      id: 'test-subscription-id',
      tenantId: 'test-tenant-id',
      plan: 'PROFESSIONAL',
      status: 'ACTIVE',
      monthlyRecordLimit: 10000,
      monthlyEmailAppends: 5000,
      monthlyPhoneAppends: 5000,
      allowedDatabases: ['NHO', 'NEW_MOVER', 'CONSUMER', 'BUSINESS'],
      allowedGeographies: null,
      allowedStates: [],
      allowedZipCodes: [],
      pricePerRecord: mockDecimal(0.05),
      priceEmailAppend: mockDecimal(0.02),
      pricePhoneAppend: mockDecimal(0.03),
      pricePdfGeneration: mockDecimal(0.10),
      pricePrintPerPiece: mockDecimal(0.65),
      billingCycleStart: new Date(),
      billingCycleEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    permissions: ['*'],
    ...overrides,
  };
}

describe('create_subscription tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock response for subscription creation
    vi.mocked(prisma.subscription.create).mockResolvedValue({
      id: 'new-subscription-id',
      name: 'Test Subscription',
      tenantId: 'test-tenant-id',
      database: 'NHO',
      geography: { type: 'zip', values: ['85001', '85002'] },
      filters: {},
      frequency: 'WEEKLY',
      status: 'ACTIVE',
      templateId: null,
      fulfillmentMethod: 'DOWNLOAD',
      fulfillmentConfig: {},
      syncChannels: [],
      clientInfo: null,
      nextDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      lastDelivery: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
  });

  describe('valid input', () => {
    it('creates subscription with minimal required fields', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Subscription',
        database: 'nho',
        geography: {
          type: 'zip',
          values: ['85001', '85002'],
        },
        frequency: 'weekly',
      };

      const result = await executeCreateSubscription(input, context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.subscription_id).toBe('new-subscription-id');
      expect(prisma.subscription.create).toHaveBeenCalledTimes(1);
    });

    it('creates subscription with all fields', async () => {
      const context = createTestContext();
      const input = {
        name: 'Full Test Subscription',
        database: 'new_mover',
        geography: {
          type: 'state',
          values: ['AZ', 'CA'],
        },
        filters: {
          income: { min: 50000, max: 150000 },
          homeValue: { min: 200000 },
        },
        frequency: 'monthly',
        template_id: 'template-123',
        fulfillment_method: 'email',
        fulfillment_config: {
          email: 'delivery@example.com',
        },
        client_info: {
          name: 'Test Client',
          identifier: 'TC001',
        },
      };

      vi.mocked(prisma.template.findUnique).mockResolvedValue({
        id: 'template-123',
        tenantId: 'test-tenant-id',
      } as any);

      const result = await executeCreateSubscription(input, context);

      expect(result.success).toBe(true);
      expect(prisma.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Full Test Subscription',
            database: 'NEW_MOVER',
            frequency: 'MONTHLY',
            templateId: 'template-123',
            fulfillmentMethod: 'EMAIL',
          }),
        })
      );
    });

    it('accepts all database types', async () => {
      const context = createTestContext();
      const databases = ['nho', 'new_mover', 'consumer', 'business'];

      for (const database of databases) {
        vi.mocked(prisma.subscription.create).mockResolvedValue({
          id: `subscription-${database}`,
          database: database.toUpperCase(),
        } as any);

        const input = {
          name: `${database} Subscription`,
          database,
          geography: { type: 'nationwide' },
          frequency: 'weekly',
        };

        const result = await executeCreateSubscription(input, context);
        expect(result.success).toBe(true);
      }
    });

    it('accepts all frequency types', async () => {
      const context = createTestContext();
      const frequencies = ['daily', 'weekly', 'biweekly', 'monthly'];

      for (const frequency of frequencies) {
        vi.mocked(prisma.subscription.create).mockResolvedValue({
          id: `subscription-${frequency}`,
          frequency: frequency.toUpperCase(),
        } as any);

        const input = {
          name: `${frequency} Subscription`,
          database: 'nho',
          geography: { type: 'nationwide' },
          frequency,
        };

        const result = await executeCreateSubscription(input, context);
        expect(result.success).toBe(true);
      }
    });

    it('accepts all fulfillment methods', async () => {
      const context = createTestContext();
      const methods = ['download', 'email', 'print_mail', 'webhook', 'ftp'];

      for (const method of methods) {
        vi.mocked(prisma.subscription.create).mockResolvedValue({
          id: `subscription-${method}`,
          fulfillmentMethod: method.toUpperCase().replace('_', ''),
        } as any);

        const input = {
          name: `${method} Subscription`,
          database: 'nho',
          geography: { type: 'nationwide' },
          frequency: 'weekly',
          fulfillment_method: method,
        };

        const result = await executeCreateSubscription(input, context);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('geography types', () => {
    it('creates subscription with ZIP geography', async () => {
      const context = createTestContext();
      const input = {
        name: 'ZIP Subscription',
        database: 'nho',
        geography: {
          type: 'zip',
          values: ['85001', '85002', '85003'],
        },
        frequency: 'weekly',
      };

      const result = await executeCreateSubscription(input, context);

      expect(result.success).toBe(true);
      expect(prisma.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            geography: { type: 'zip', values: ['85001', '85002', '85003'] },
          }),
        })
      );
    });

    it('creates subscription with state geography', async () => {
      const context = createTestContext();
      const input = {
        name: 'State Subscription',
        database: 'nho',
        geography: {
          type: 'state',
          values: ['AZ', 'CA', 'TX'],
        },
        frequency: 'weekly',
      };

      const result = await executeCreateSubscription(input, context);

      expect(result.success).toBe(true);
    });

    it('creates subscription with radius geography', async () => {
      const context = createTestContext();
      const input = {
        name: 'Radius Subscription',
        database: 'nho',
        geography: {
          type: 'radius',
          center: { lat: 33.4484, lng: -112.074 },
          radiusMiles: 25,
        },
        frequency: 'weekly',
      };

      const result = await executeCreateSubscription(input, context);

      expect(result.success).toBe(true);
    });

    it('creates subscription with nationwide geography', async () => {
      const context = createTestContext();
      const input = {
        name: 'Nationwide Subscription',
        database: 'nho',
        geography: {
          type: 'nationwide',
        },
        frequency: 'weekly',
      };

      const result = await executeCreateSubscription(input, context);

      expect(result.success).toBe(true);
    });
  });

  describe('input validation', () => {
    it('throws ValidationError for missing name', async () => {
      const context = createTestContext();
      const input = {
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        frequency: 'weekly',
      };

      await expect(executeCreateSubscription(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for invalid database', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Subscription',
        database: 'invalid_database',
        geography: { type: 'zip', values: ['85001'] },
        frequency: 'weekly',
      };

      await expect(executeCreateSubscription(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for invalid frequency', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Subscription',
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        frequency: 'hourly', // Invalid
      };

      await expect(executeCreateSubscription(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for missing geography', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Subscription',
        database: 'nho',
        frequency: 'weekly',
      };

      await expect(executeCreateSubscription(input, context)).rejects.toThrow();
    });

    it('throws ValidationError for name exceeding max length', async () => {
      const context = createTestContext();
      const input = {
        name: 'A'.repeat(201), // Exceeds 200 char limit
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        frequency: 'weekly',
      };

      await expect(executeCreateSubscription(input, context)).rejects.toThrow();
    });
  });

  describe('template validation', () => {
    it('validates template exists when template_id provided', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Subscription',
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        frequency: 'weekly',
        template_id: 'nonexistent-template',
      };

      vi.mocked(prisma.template.findUnique).mockResolvedValue(null);

      await expect(executeCreateSubscription(input, context)).rejects.toThrow();
    });

    it('validates template belongs to tenant', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Subscription',
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        frequency: 'weekly',
        template_id: 'other-tenant-template',
      };

      vi.mocked(prisma.template.findUnique).mockResolvedValue({
        id: 'other-tenant-template',
        tenantId: 'other-tenant-id', // Different tenant
      } as any);

      await expect(executeCreateSubscription(input, context)).rejects.toThrow(AuthorizationError);
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing subscription:create permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {
        name: 'Test Subscription',
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        frequency: 'weekly',
      };

      await expect(executeCreateSubscription(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with subscription:create permission', async () => {
      const context = createTestContext({
        permissions: ['subscription:create'],
      });
      const input = {
        name: 'Test Subscription',
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        frequency: 'weekly',
      };

      const result = await executeCreateSubscription(input, context);
      expect(result.success).toBe(true);
    });

    it('allows access with wildcard permission', async () => {
      const context = createTestContext({
        permissions: ['*'],
      });
      const input = {
        name: 'Test Subscription',
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        frequency: 'weekly',
      };

      const result = await executeCreateSubscription(input, context);
      expect(result.success).toBe(true);
    });

    it('throws AuthorizationError when database not allowed', async () => {
      const context = createTestContext();
      context.subscription!.allowedDatabases = ['NHO'];

      const input = {
        name: 'Test Subscription',
        database: 'business', // Not in allowed list
        geography: { type: 'zip', values: ['85001'] },
        frequency: 'weekly',
      };

      await expect(executeCreateSubscription(input, context)).rejects.toThrow(AuthorizationError);
    });
  });

  describe('next delivery calculation', () => {
    it('sets next delivery for daily frequency', async () => {
      const context = createTestContext();
      const input = {
        name: 'Daily Subscription',
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        frequency: 'daily',
      };

      await executeCreateSubscription(input, context);

      expect(prisma.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nextDelivery: expect.any(Date),
          }),
        })
      );
    });

    it('sets next delivery for weekly frequency', async () => {
      const context = createTestContext();
      const input = {
        name: 'Weekly Subscription',
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        frequency: 'weekly',
      };

      await executeCreateSubscription(input, context);

      expect(prisma.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nextDelivery: expect.any(Date),
          }),
        })
      );
    });
  });

  describe('cost estimates', () => {
    it('includes estimated cost in response', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Subscription',
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        frequency: 'weekly',
      };

      const result = await executeCreateSubscription(input, context);

      expect(result.data?.estimated_cost_per_delivery).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('handles database errors gracefully', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Subscription',
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        frequency: 'weekly',
      };

      vi.mocked(prisma.subscription.create).mockRejectedValue(new Error('Database error'));

      await expect(executeCreateSubscription(input, context)).rejects.toThrow('Database error');
    });
  });
});
