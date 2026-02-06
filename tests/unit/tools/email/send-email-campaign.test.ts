/**
 * Tests for send_email_campaign tool
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
    usageRecord: {
      create: vi.fn(),
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

// Mock campaigns service
vi.mock('../../../../src/services/reachmail/campaigns.js', () => ({
  scheduleCampaign: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocks
import { executeSendEmailCampaign } from '../../../../src/tools/email/send-email-campaign.js';
import { prisma } from '../../../../src/db/client.js';
import { scheduleCampaign } from '../../../../src/services/reachmail/campaigns.js';

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

const mockCampaign = {
  id: VALID_UUID,
  tenantId: 'test-tenant-id',
  name: 'Test Campaign',
  subject: 'Hello!',
  fromAddress: 'send@example.com',
  replyTo: null,
  reachmailCampaignId: 'rm-campaign-123',
  reachmailMailingId: 'rm-mailing-456',
  reachmailListId: 'rm-list-789',
  recipientCount: 500,
  status: 'DRAFT',
  scheduledAt: null,
  sentAt: null,
  sent: 0,
  delivered: 0,
  opens: 0,
  uniqueOpens: 0,
  clicks: 0,
  uniqueClicks: 0,
  bounces: 0,
  optOuts: 0,
  lastStatsUpdate: null,
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

describe('send_email_campaign tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(prisma.emailCampaign.findFirst).mockResolvedValue(mockCampaign as never);
    vi.mocked(prisma.emailConfig.findUnique).mockResolvedValue(mockEmailConfig as never);
    vi.mocked(prisma.emailCampaign.update).mockResolvedValue({ ...mockCampaign, status: 'SENDING' } as never);
    vi.mocked(prisma.usageRecord.create).mockResolvedValue({} as never);
  });

  describe('immediate send', () => {
    it('sends campaign immediately when no send_at provided', async () => {
      const context = createTestContext();
      const input = { campaign_id: VALID_UUID };

      const result = await executeSendEmailCampaign(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('SENDING');
      expect(result.data?.scheduled_at).toBeNull();
      expect(result.data?.recipient_count).toBe(500);
    });

    it('calls scheduleCampaign with no date for immediate send', async () => {
      const context = createTestContext();
      const input = { campaign_id: VALID_UUID };

      await executeSendEmailCampaign(input, context);

      expect(scheduleCampaign).toHaveBeenCalledWith(
        expect.anything(),
        'rm-campaign-123',
        undefined
      );
    });
  });

  describe('scheduled send', () => {
    it('schedules campaign for future delivery', async () => {
      vi.mocked(prisma.emailCampaign.update).mockResolvedValue({
        ...mockCampaign,
        status: 'SCHEDULED',
      } as never);

      const context = createTestContext();
      const input = {
        campaign_id: VALID_UUID,
        send_at: '2025-12-01T10:00:00Z',
      };

      const result = await executeSendEmailCampaign(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('SCHEDULED');
      expect(result.data?.scheduled_at).toBe('2025-12-01T10:00:00Z');
    });
  });

  describe('usage billing', () => {
    it('creates usage record for billing', async () => {
      const context = createTestContext();
      const input = { campaign_id: VALID_UUID };

      await executeSendEmailCampaign(input, context);

      expect(prisma.usageRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'test-tenant-id',
          usageType: 'EMAIL_SEND',
          quantity: 500,
          toolName: 'send_email_campaign',
        }),
      });
    });

    it('skips usage record when recipient count is 0', async () => {
      vi.mocked(prisma.emailCampaign.findFirst).mockResolvedValue({
        ...mockCampaign,
        recipientCount: 0,
      } as never);

      const context = createTestContext();
      const input = { campaign_id: VALID_UUID };

      await executeSendEmailCampaign(input, context);

      expect(prisma.usageRecord.create).not.toHaveBeenCalled();
    });
  });

  describe('campaign status validation', () => {
    it('throws error when campaign is already SENT', async () => {
      vi.mocked(prisma.emailCampaign.findFirst).mockResolvedValue({
        ...mockCampaign,
        status: 'SENT',
      } as never);

      const context = createTestContext();
      const input = { campaign_id: VALID_UUID };

      await expect(executeSendEmailCampaign(input, context)).rejects.toThrow(
        'Campaign cannot be sent'
      );
    });

    it('throws error when campaign is SENDING', async () => {
      vi.mocked(prisma.emailCampaign.findFirst).mockResolvedValue({
        ...mockCampaign,
        status: 'SENDING',
      } as never);

      const context = createTestContext();
      const input = { campaign_id: VALID_UUID };

      await expect(executeSendEmailCampaign(input, context)).rejects.toThrow(
        'Campaign cannot be sent'
      );
    });

    it('allows sending SCHEDULED campaigns', async () => {
      vi.mocked(prisma.emailCampaign.findFirst).mockResolvedValue({
        ...mockCampaign,
        status: 'SCHEDULED',
      } as never);

      const context = createTestContext();
      const input = { campaign_id: VALID_UUID };

      const result = await executeSendEmailCampaign(input, context);

      expect(result.success).toBe(true);
    });

    it('throws error when campaign has no ReachMail ID', async () => {
      vi.mocked(prisma.emailCampaign.findFirst).mockResolvedValue({
        ...mockCampaign,
        reachmailCampaignId: null,
      } as never);

      const context = createTestContext();
      const input = { campaign_id: VALID_UUID };

      await expect(executeSendEmailCampaign(input, context)).rejects.toThrow(
        'no ReachMail campaign ID'
      );
    });
  });

  describe('not found errors', () => {
    it('throws NotFoundError when campaign does not exist', async () => {
      vi.mocked(prisma.emailCampaign.findFirst).mockResolvedValue(null);

      const context = createTestContext();
      const input = { campaign_id: VALID_UUID };

      await expect(executeSendEmailCampaign(input, context)).rejects.toThrow('Email campaign');
    });

    it('throws NotFoundError when email config does not exist', async () => {
      vi.mocked(prisma.emailConfig.findUnique).mockResolvedValue(null);

      const context = createTestContext();
      const input = { campaign_id: VALID_UUID };

      await expect(executeSendEmailCampaign(input, context)).rejects.toThrow('Email configuration');
    });
  });

  describe('input validation', () => {
    it('throws error for invalid campaign_id format', async () => {
      const context = createTestContext();
      const input = { campaign_id: 'not-a-uuid' };

      await expect(executeSendEmailCampaign(input, context)).rejects.toThrow();
    });

    it('throws error for missing campaign_id', async () => {
      const context = createTestContext();
      const input = {};

      await expect(executeSendEmailCampaign(input, context)).rejects.toThrow();
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing email:write permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = { campaign_id: VALID_UUID };

      await expect(executeSendEmailCampaign(input, context)).rejects.toThrow(AuthorizationError);
    });
  });
});
