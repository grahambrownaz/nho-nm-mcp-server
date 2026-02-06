/**
 * Tests for get_email_analytics tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { AuthorizationError } from '../../../../src/utils/errors.js';

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    emailConfig: {
      findUnique: vi.fn(),
    },
    emailCampaign: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock encryption
vi.mock('../../../../src/services/encryption.js', () => ({
  decrypt: vi.fn((val: string) => val.replace('encrypted:', '')),
}));

// Mock ReachMail client
vi.mock('../../../../src/services/reachmail/client.js', () => ({
  ReachMailClient: vi.fn().mockImplementation(() => ({})),
}));

// Mock ReachMail reports service
vi.mock('../../../../src/services/reachmail/reports.js', () => ({
  getCampaignSummary: vi.fn().mockResolvedValue({
    Sent: 1000,
    Delivered: 980,
    Opens: 450,
    UniqueOpens: 320,
    Clicks: 150,
    UniqueClicks: 100,
    Bounces: 20,
    HardBounces: 15,
    SoftBounces: 5,
    OptOuts: 10,
    SpamComplaints: 2,
    Forwards: 5,
  }),
  formatAnalytics: vi.fn((summary: any) => ({
    sent: summary.Sent,
    delivered: summary.Delivered,
    opens: summary.Opens,
    unique_opens: summary.UniqueOpens,
    clicks: summary.Clicks,
    unique_clicks: summary.UniqueClicks,
    bounces: summary.Bounces,
    opt_outs: summary.OptOuts,
    delivery_rate: '98.00%',
    open_rate: '32.65%',
    click_rate: '10.20%',
    bounce_rate: '2.00%',
    opt_out_rate: '1.00%',
  })),
}));

// Import after mocks
import { executeGetEmailAnalytics } from '../../../../src/tools/email/get-email-analytics.js';
import { prisma } from '../../../../src/db/client.js';
import { getCampaignSummary } from '../../../../src/services/reachmail/reports.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

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

const mockSentCampaign = {
  id: VALID_UUID,
  tenantId: 'test-tenant-id',
  name: 'Sent Campaign',
  subject: 'Hello!',
  fromAddress: 'send@example.com',
  replyTo: null,
  reachmailCampaignId: 'rm-campaign-123',
  reachmailMailingId: 'rm-mailing-456',
  reachmailListId: 'rm-list-789',
  recipientCount: 1000,
  status: 'SENT',
  scheduledAt: null,
  sentAt: new Date(),
  sent: 900,
  delivered: 880,
  opens: 300,
  uniqueOpens: 200,
  clicks: 80,
  uniqueClicks: 50,
  bounces: 20,
  optOuts: 5,
  lastStatsUpdate: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockEmailConfig = {
  id: 'config-123',
  tenantId: 'test-tenant-id',
  reachmailToken: 'encrypted:test-token',
  reachmailAccountId: 'acct-123',
  defaultFromAddress: 'send@example.com',
  defaultReplyTo: null,
  physicalAddress: '123 Main St',
  dkimDomain: null,
  isVerified: true,
  lastTestAt: new Date(),
  lastTestSuccess: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('get_email_analytics tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(prisma.emailCampaign.findFirst).mockResolvedValue(mockSentCampaign as never);
    vi.mocked(prisma.emailConfig.findUnique).mockResolvedValue(mockEmailConfig as never);
    vi.mocked(prisma.emailCampaign.update).mockResolvedValue(mockSentCampaign as never);
  });

  describe('fetching analytics with refresh', () => {
    it('fetches fresh analytics from ReachMail', async () => {
      const context = createTestContext();
      const input = { campaign_id: VALID_UUID };

      const result = await executeGetEmailAnalytics(input, context);

      expect(result.success).toBe(true);
      expect(getCampaignSummary).toHaveBeenCalledWith(expect.anything(), 'rm-mailing-456');
      expect(result.data?.analytics).toBeDefined();
      expect(result.data?.campaign_name).toBe('Sent Campaign');
    });

    it('updates cached analytics in database', async () => {
      const context = createTestContext();
      const input = { campaign_id: VALID_UUID };

      await executeGetEmailAnalytics(input, context);

      expect(prisma.emailCampaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: VALID_UUID },
          data: expect.objectContaining({
            sent: 1000,
            delivered: 980,
            opens: 450,
            uniqueOpens: 320,
            clicks: 150,
            uniqueClicks: 100,
            bounces: 20,
            optOuts: 10,
          }),
        })
      );
    });
  });

  describe('cached analytics', () => {
    it('returns cached data when refresh=false', async () => {
      const context = createTestContext();
      const input = { campaign_id: VALID_UUID, refresh: false };

      const result = await executeGetEmailAnalytics(input, context);

      expect(result.success).toBe(true);
      expect(getCampaignSummary).not.toHaveBeenCalled();
    });

    it('returns cached data for DRAFT campaigns', async () => {
      vi.mocked(prisma.emailCampaign.findFirst).mockResolvedValue({
        ...mockSentCampaign,
        status: 'DRAFT',
      } as never);

      const context = createTestContext();
      const input = { campaign_id: VALID_UUID };

      const result = await executeGetEmailAnalytics(input, context);

      expect(result.success).toBe(true);
      expect(getCampaignSummary).not.toHaveBeenCalled();
    });

    it('falls back to cached data when API fails', async () => {
      vi.mocked(getCampaignSummary).mockRejectedValue(new Error('API error'));

      const context = createTestContext();
      const input = { campaign_id: VALID_UUID };

      const result = await executeGetEmailAnalytics(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.analytics).toBeDefined();
    });
  });

  describe('not found errors', () => {
    it('throws NotFoundError when campaign does not exist', async () => {
      vi.mocked(prisma.emailCampaign.findFirst).mockResolvedValue(null);

      const context = createTestContext();
      const input = { campaign_id: VALID_UUID };

      await expect(executeGetEmailAnalytics(input, context)).rejects.toThrow('Email campaign');
    });
  });

  describe('input validation', () => {
    it('throws error for invalid campaign_id format', async () => {
      const context = createTestContext();
      const input = { campaign_id: 'not-a-uuid' };

      await expect(executeGetEmailAnalytics(input, context)).rejects.toThrow();
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing email:read permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = { campaign_id: VALID_UUID };

      await expect(executeGetEmailAnalytics(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with email:read permission', async () => {
      const context = createTestContext({
        permissions: ['email:read'],
      });
      const input = { campaign_id: VALID_UUID, refresh: false };

      const result = await executeGetEmailAnalytics(input, context);
      expect(result.success).toBe(true);
    });
  });
});
