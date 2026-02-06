/**
 * Tests for list_email_campaigns tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { AuthorizationError } from '../../../../src/utils/errors.js';

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    emailCampaign: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

// Import after mocks
import { executeListEmailCampaigns } from '../../../../src/tools/email/list-email-campaigns.js';
import { prisma } from '../../../../src/db/client.js';

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
    subscription: null,
    permissions: ['*'],
    ...overrides,
  };
}

const mockCampaigns = [
  {
    id: 'campaign-1',
    tenantId: 'test-tenant-id',
    name: 'Campaign A',
    subject: 'Hello A',
    fromAddress: 'send@example.com',
    replyTo: null,
    recipientCount: 1000,
    status: 'SENT',
    sent: 1000,
    delivered: 980,
    opens: 400,
    uniqueOpens: 300,
    clicks: 100,
    uniqueClicks: 80,
    bounces: 20,
    optOuts: 5,
    sentAt: new Date('2025-01-15T10:00:00Z'),
    scheduledAt: null,
    createdAt: new Date('2025-01-14T10:00:00Z'),
    updatedAt: new Date(),
  },
  {
    id: 'campaign-2',
    tenantId: 'test-tenant-id',
    name: 'Campaign B',
    subject: 'Hello B',
    fromAddress: 'send@example.com',
    replyTo: null,
    recipientCount: 500,
    status: 'DRAFT',
    sent: 0,
    delivered: 0,
    opens: 0,
    uniqueOpens: 0,
    clicks: 0,
    uniqueClicks: 0,
    bounces: 0,
    optOuts: 0,
    sentAt: null,
    scheduledAt: null,
    createdAt: new Date('2025-01-16T10:00:00Z'),
    updatedAt: new Date(),
  },
];

describe('list_email_campaigns tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(prisma.emailCampaign.findMany).mockResolvedValue(mockCampaigns as never);
    vi.mocked(prisma.emailCampaign.count).mockResolvedValue(2);
  });

  describe('listing campaigns', () => {
    it('returns all campaigns for tenant', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeListEmailCampaigns(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.campaigns).toHaveLength(2);
      expect(result.data?.total).toBe(2);
    });

    it('returns formatted campaign data', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeListEmailCampaigns(input, context);

      const campaign = result.data?.campaigns[0];
      expect(campaign?.id).toBe('campaign-1');
      expect(campaign?.name).toBe('Campaign A');
      expect(campaign?.subject).toBe('Hello A');
      expect(campaign?.status).toBe('SENT');
      expect(campaign?.recipient_count).toBe(1000);
      expect(campaign?.sent).toBe(1000);
      expect(campaign?.opens).toBe(300);
      expect(campaign?.clicks).toBe(80);
      expect(campaign?.bounces).toBe(20);
    });

    it('calculates open rate correctly', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeListEmailCampaigns(input, context);

      // uniqueOpens (300) / delivered (980) * 100 = 30.61%
      expect(result.data?.campaigns[0]?.open_rate).toBe('30.61%');
    });

    it('returns 0% open rate for campaigns with no deliveries', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeListEmailCampaigns(input, context);

      expect(result.data?.campaigns[1]?.open_rate).toBe('0.00%');
    });
  });

  describe('filtering', () => {
    it('filters by status', async () => {
      const context = createTestContext();
      const input = { status: 'SENT' };

      await executeListEmailCampaigns(input, context);

      expect(prisma.emailCampaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'test-tenant-id',
            status: 'SENT',
          }),
        })
      );
    });

    it('queries only tenant campaigns', async () => {
      const context = createTestContext();
      const input = {};

      await executeListEmailCampaigns(input, context);

      expect(prisma.emailCampaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'test-tenant-id',
          }),
        })
      );
    });
  });

  describe('pagination', () => {
    it('uses default limit and offset', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeListEmailCampaigns(input, context);

      expect(result.data?.limit).toBe(20);
      expect(result.data?.offset).toBe(0);
    });

    it('respects custom limit and offset', async () => {
      const context = createTestContext();
      const input = { limit: 10, offset: 5 };

      await executeListEmailCampaigns(input, context);

      expect(prisma.emailCampaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 5,
        })
      );
    });

    it('calculates has_more correctly', async () => {
      vi.mocked(prisma.emailCampaign.count).mockResolvedValue(50);

      const context = createTestContext();
      const input = { limit: 20, offset: 0 };

      const result = await executeListEmailCampaigns(input, context);

      expect(result.data?.has_more).toBe(true);
    });

    it('returns has_more false when at end', async () => {
      vi.mocked(prisma.emailCampaign.count).mockResolvedValue(2);

      const context = createTestContext();
      const input = { limit: 20, offset: 0 };

      const result = await executeListEmailCampaigns(input, context);

      expect(result.data?.has_more).toBe(false);
    });
  });

  describe('input validation', () => {
    it('throws error for invalid status', async () => {
      const context = createTestContext();
      const input = { status: 'INVALID_STATUS' };

      await expect(executeListEmailCampaigns(input, context)).rejects.toThrow();
    });

    it('throws error for limit over 100', async () => {
      const context = createTestContext();
      const input = { limit: 200 };

      await expect(executeListEmailCampaigns(input, context)).rejects.toThrow();
    });

    it('throws error for negative offset', async () => {
      const context = createTestContext();
      const input = { offset: -1 };

      await expect(executeListEmailCampaigns(input, context)).rejects.toThrow();
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing email:read permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {};

      await expect(executeListEmailCampaigns(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with email:read permission', async () => {
      const context = createTestContext({
        permissions: ['email:read'],
      });
      const input = {};

      const result = await executeListEmailCampaigns(input, context);
      expect(result.success).toBe(true);
    });
  });
});
