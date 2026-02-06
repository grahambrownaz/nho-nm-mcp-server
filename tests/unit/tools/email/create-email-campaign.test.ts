/**
 * Tests for create_email_campaign tool
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

// Mock ReachMail services
vi.mock('../../../../src/services/reachmail/lists.js', () => ({
  createList: vi.fn().mockResolvedValue({ Id: 'list-rm-123' }),
  importRecipients: vi.fn().mockResolvedValue({
    ImportedCount: 100,
    DuplicateCount: 0,
    InvalidCount: 0,
  }),
  toReachMailRecipients: vi.fn((records: any[]) => records),
}));

vi.mock('../../../../src/services/reachmail/mailings.js', () => ({
  createMailing: vi.fn().mockResolvedValue({ Id: 'mailing-rm-456' }),
}));

vi.mock('../../../../src/services/reachmail/campaigns.js', () => ({
  createCampaign: vi.fn().mockResolvedValue({ Id: 'campaign-rm-789' }),
}));

// Import after mocks
import { executeCreateEmailCampaign } from '../../../../src/tools/email/create-email-campaign.js';
import { prisma } from '../../../../src/db/client.js';
import { createList, importRecipients } from '../../../../src/services/reachmail/lists.js';
import { createMailing } from '../../../../src/services/reachmail/mailings.js';
import { createCampaign } from '../../../../src/services/reachmail/campaigns.js';

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

const mockEmailConfig = {
  id: 'config-123',
  tenantId: 'test-tenant-id',
  reachmailToken: 'encrypted:test-token',
  reachmailAccountId: 'acct-123',
  defaultFromAddress: 'default@example.com',
  defaultReplyTo: 'reply@example.com',
  physicalAddress: '123 Main St',
  dkimDomain: null,
  isVerified: true,
  lastTestAt: new Date(),
  lastTestSuccess: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('create_email_campaign tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(prisma.emailConfig.findUnique).mockResolvedValue(mockEmailConfig as never);
    vi.mocked(prisma.emailCampaign.create).mockResolvedValue({
      id: 'campaign-db-123',
      tenantId: 'test-tenant-id',
      name: 'Test Campaign',
      subject: 'Hello!',
      fromAddress: 'default@example.com',
      replyTo: null,
      reachmailCampaignId: 'campaign-rm-789',
      reachmailMailingId: 'mailing-rm-456',
      reachmailListId: 'list-rm-123',
      recipientCount: 100,
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
    } as never);
  });

  describe('campaign creation with records', () => {
    it('creates campaign with inline records', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Campaign',
        subject: 'Hello!',
        html_body: '<h1>Hello {{FirstName}}!</h1>',
        records: [
          { email: 'user1@example.com', firstName: 'John' },
          { email: 'user2@example.com', firstName: 'Jane' },
        ],
      };

      const result = await executeCreateEmailCampaign(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.campaign_id).toBe('campaign-db-123');
      expect(result.data?.reachmail_campaign_id).toBe('campaign-rm-789');
      expect(result.data?.reachmail_mailing_id).toBe('mailing-rm-456');
      expect(result.data?.reachmail_list_id).toBe('list-rm-123');
      expect(result.data?.status).toBe('DRAFT');
    });

    it('creates list and imports recipients when records provided', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Campaign',
        subject: 'Hello!',
        html_body: '<p>Content</p>',
        records: [{ email: 'user@example.com' }],
      };

      await executeCreateEmailCampaign(input, context);

      expect(createList).toHaveBeenCalled();
      expect(importRecipients).toHaveBeenCalled();
    });

    it('creates mailing with correct parameters', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Campaign',
        subject: 'My Subject',
        html_body: '<p>Body</p>',
        from_address: 'custom@example.com',
        from_name: 'Custom Sender',
        records: [{ email: 'user@example.com' }],
      };

      await executeCreateEmailCampaign(input, context);

      expect(createMailing).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          subject: 'My Subject',
          fromAddress: 'custom@example.com',
          fromName: 'Custom Sender',
          htmlBody: '<p>Body</p>',
        })
      );
    });

    it('creates campaign linking list and mailing', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Campaign',
        subject: 'Hello!',
        html_body: '<p>Content</p>',
        records: [{ email: 'user@example.com' }],
      };

      await executeCreateEmailCampaign(input, context);

      expect(createCampaign).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          name: 'Test Campaign',
          mailingId: 'mailing-rm-456',
          listIds: ['list-rm-123'],
        })
      );
    });
  });

  describe('campaign creation with existing list', () => {
    it('uses existing list_id without creating new list', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Campaign',
        subject: 'Hello!',
        html_body: '<p>Content</p>',
        list_id: 'existing-list-id',
      };

      await executeCreateEmailCampaign(input, context);

      expect(createList).not.toHaveBeenCalled();
      expect(importRecipients).not.toHaveBeenCalled();
    });
  });

  describe('defaults and overrides', () => {
    it('uses default from_address from config', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Campaign',
        subject: 'Hello!',
        html_body: '<p>Content</p>',
        list_id: 'list-123',
      };

      await executeCreateEmailCampaign(input, context);

      expect(createMailing).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          fromAddress: 'default@example.com',
        })
      );
    });

    it('sets status to SCHEDULED when schedule_at is provided', async () => {
      vi.mocked(prisma.emailCampaign.create).mockResolvedValue({
        id: 'campaign-db-123',
        status: 'SCHEDULED',
      } as never);

      const context = createTestContext();
      const input = {
        name: 'Scheduled Campaign',
        subject: 'Hello!',
        html_body: '<p>Content</p>',
        list_id: 'list-123',
        schedule_at: '2025-12-01T10:00:00Z',
      };

      const result = await executeCreateEmailCampaign(input, context);

      expect(result.data?.status).toBe('SCHEDULED');
      expect(result.data?.scheduled_at).toBe('2025-12-01T10:00:00Z');
    });
  });

  describe('email config required', () => {
    it('throws NotFoundError when no email config exists', async () => {
      vi.mocked(prisma.emailConfig.findUnique).mockResolvedValue(null);

      const context = createTestContext();
      const input = {
        name: 'Test Campaign',
        subject: 'Hello!',
        html_body: '<p>Content</p>',
        list_id: 'list-123',
      };

      await expect(executeCreateEmailCampaign(input, context)).rejects.toThrow('Email configuration');
    });
  });

  describe('input validation', () => {
    it('throws error when neither records nor list_id provided', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test Campaign',
        subject: 'Hello!',
        html_body: '<p>Content</p>',
      };

      await expect(executeCreateEmailCampaign(input, context)).rejects.toThrow();
    });

    it('throws error for missing name', async () => {
      const context = createTestContext();
      const input = {
        subject: 'Hello!',
        html_body: '<p>Content</p>',
        list_id: 'list-123',
      };

      await expect(executeCreateEmailCampaign(input, context)).rejects.toThrow();
    });

    it('throws error for missing subject', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test',
        html_body: '<p>Content</p>',
        list_id: 'list-123',
      };

      await expect(executeCreateEmailCampaign(input, context)).rejects.toThrow();
    });

    it('throws error for missing html_body', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test',
        subject: 'Hello!',
        list_id: 'list-123',
      };

      await expect(executeCreateEmailCampaign(input, context)).rejects.toThrow();
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing email:write permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {
        name: 'Test',
        subject: 'Hello!',
        html_body: '<p>Content</p>',
        list_id: 'list-123',
      };

      await expect(executeCreateEmailCampaign(input, context)).rejects.toThrow(AuthorizationError);
    });
  });
});
