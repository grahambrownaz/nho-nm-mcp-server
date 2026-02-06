/**
 * Tests for ReachMail webhook handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as crypto from 'crypto';

// Mock Prisma client
vi.mock('../../../src/db/client.js', () => ({
  prisma: {
    emailCampaign: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Import after mocks
import { handleReachMailWebhook } from '../../../src/webhooks/reachmail.js';
import { prisma } from '../../../src/db/client.js';

function createMockReq(body: unknown, headers: Record<string, string> = {}) {
  return {
    body,
    headers,
  } as any;
}

function createMockRes() {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
}

function computeHmac(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  return hmac.digest('hex');
}

const mockCampaign = {
  id: 'campaign-123',
  tenantId: 'test-tenant-id',
  name: 'Test Campaign',
  reachmailMailingId: 'mailing-456',
  opens: 10,
  clicks: 5,
  bounces: 2,
  optOuts: 1,
};

describe('ReachMail webhook handler', () => {
  const originalEnv = process.env.REACHMAIL_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.REACHMAIL_WEBHOOK_SECRET;

    vi.mocked(prisma.emailCampaign.findFirst).mockResolvedValue(mockCampaign as never);
    vi.mocked(prisma.emailCampaign.update).mockResolvedValue(mockCampaign as never);
  });

  afterEach(() => {
    if (originalEnv) {
      process.env.REACHMAIL_WEBHOOK_SECRET = originalEnv;
    } else {
      delete process.env.REACHMAIL_WEBHOOK_SECRET;
    }
  });

  describe('event processing', () => {
    it('processes Open event', async () => {
      const req = createMockReq({
        EventType: 'Open',
        MailingId: 'mailing-456',
        EmailAddress: 'user@example.com',
        Timestamp: '2025-01-15T10:00:00Z',
      });
      const res = createMockRes();

      await handleReachMailWebhook(req, res);

      expect(prisma.emailCampaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'campaign-123' },
          data: expect.objectContaining({
            opens: { increment: 1 },
          }),
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ received: true, processed: true })
      );
    });

    it('processes Click event', async () => {
      const req = createMockReq({
        EventType: 'Click',
        MailingId: 'mailing-456',
        EmailAddress: 'user@example.com',
        Timestamp: '2025-01-15T10:00:00Z',
        Url: 'https://example.com/offer',
      });
      const res = createMockRes();

      await handleReachMailWebhook(req, res);

      expect(prisma.emailCampaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clicks: { increment: 1 },
          }),
        })
      );
    });

    it('processes Bounce event', async () => {
      const req = createMockReq({
        EventType: 'Bounce',
        MailingId: 'mailing-456',
        EmailAddress: 'user@example.com',
        Timestamp: '2025-01-15T10:00:00Z',
        BounceType: 'hard',
      });
      const res = createMockRes();

      await handleReachMailWebhook(req, res);

      expect(prisma.emailCampaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bounces: { increment: 1 },
          }),
        })
      );
    });

    it('processes OptOut event', async () => {
      const req = createMockReq({
        EventType: 'OptOut',
        MailingId: 'mailing-456',
        EmailAddress: 'user@example.com',
        Timestamp: '2025-01-15T10:00:00Z',
      });
      const res = createMockRes();

      await handleReachMailWebhook(req, res);

      expect(prisma.emailCampaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            optOuts: { increment: 1 },
          }),
        })
      );
    });
  });

  describe('campaign lookup', () => {
    it('returns 200 with processed=false when campaign not found', async () => {
      vi.mocked(prisma.emailCampaign.findFirst).mockResolvedValue(null);

      const req = createMockReq({
        EventType: 'Open',
        MailingId: 'unknown-mailing',
        EmailAddress: 'user@example.com',
        Timestamp: '2025-01-15T10:00:00Z',
      });
      const res = createMockRes();

      await handleReachMailWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ processed: false })
      );
    });

    it('looks up campaign by ReachMail mailing ID', async () => {
      const req = createMockReq({
        EventType: 'Open',
        MailingId: 'mailing-456',
        EmailAddress: 'user@example.com',
        Timestamp: '2025-01-15T10:00:00Z',
      });
      const res = createMockRes();

      await handleReachMailWebhook(req, res);

      expect(prisma.emailCampaign.findFirst).toHaveBeenCalledWith({
        where: { reachmailMailingId: 'mailing-456' },
      });
    });
  });

  describe('payload validation', () => {
    it('returns 400 for missing MailingId', async () => {
      const req = createMockReq({
        EventType: 'Open',
        EmailAddress: 'user@example.com',
      });
      const res = createMockRes();

      await handleReachMailWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for missing EventType', async () => {
      const req = createMockReq({
        MailingId: 'mailing-456',
        EmailAddress: 'user@example.com',
      });
      const res = createMockRes();

      await handleReachMailWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('signature verification', () => {
    it('verifies HMAC-SHA256 signature when secret is configured', async () => {
      process.env.REACHMAIL_WEBHOOK_SECRET = 'test-secret';

      const payload = JSON.stringify({
        EventType: 'Open',
        MailingId: 'mailing-456',
        EmailAddress: 'user@example.com',
        Timestamp: '2025-01-15T10:00:00Z',
      });

      const signature = computeHmac(payload, 'test-secret');

      const req = createMockReq(payload, {
        'x-reachmail-signature': signature,
      });
      const res = createMockRes();

      await handleReachMailWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('rejects invalid signature', async () => {
      process.env.REACHMAIL_WEBHOOK_SECRET = 'test-secret';

      const req = createMockReq(
        JSON.stringify({
          EventType: 'Open',
          MailingId: 'mailing-456',
          EmailAddress: 'user@example.com',
        }),
        { 'x-reachmail-signature': 'invalid-signature' }
      );
      const res = createMockRes();

      await handleReachMailWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('rejects missing signature when secret is configured', async () => {
      process.env.REACHMAIL_WEBHOOK_SECRET = 'test-secret';

      const req = createMockReq({
        EventType: 'Open',
        MailingId: 'mailing-456',
        EmailAddress: 'user@example.com',
      });
      const res = createMockRes();

      await handleReachMailWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('skips verification when no secret is configured', async () => {
      const req = createMockReq({
        EventType: 'Open',
        MailingId: 'mailing-456',
        EmailAddress: 'user@example.com',
        Timestamp: '2025-01-15T10:00:00Z',
      });
      const res = createMockRes();

      await handleReachMailWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('error handling', () => {
    it('returns 500 on database error', async () => {
      vi.mocked(prisma.emailCampaign.findFirst).mockRejectedValue(new Error('DB error'));

      const req = createMockReq({
        EventType: 'Open',
        MailingId: 'mailing-456',
        EmailAddress: 'user@example.com',
        Timestamp: '2025-01-15T10:00:00Z',
      });
      const res = createMockRes();

      await handleReachMailWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
