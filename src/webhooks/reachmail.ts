/**
 * ReachMail Webhook Handler
 * Processes ReachMail event callbacks (opens, clicks, bounces, opt-outs)
 * Updates cached analytics in the EmailCampaign model
 */

import * as crypto from 'crypto';
import type { Request, Response } from 'express';
import { prisma } from '../db/client.js';

/**
 * ReachMail webhook event types
 */
interface ReachMailWebhookEvent {
  EventType: 'Open' | 'Click' | 'Bounce' | 'OptOut';
  MailingId: string;
  EmailAddress: string;
  Timestamp: string;
  // Click-specific
  Url?: string;
  // Bounce-specific
  BounceType?: string;
  BounceMessage?: string;
}

/**
 * Verify HMAC-SHA256 signature from ReachMail
 */
function verifySignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) return false;

  try {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const expectedSignature = hmac.digest('hex');

    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (sigBuffer.length !== expectedBuffer.length) return false;

    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * Handle incoming ReachMail webhook
 */
export async function handleReachMailWebhook(req: Request, res: Response): Promise<void> {
  const webhookSecret = process.env.REACHMAIL_WEBHOOK_SECRET;

  // Verify signature if secret is configured
  if (webhookSecret) {
    const signature = req.headers['x-reachmail-signature'] as string | undefined;
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

    if (!verifySignature(rawBody, signature, webhookSecret)) {
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }
  }

  try {
    const event: ReachMailWebhookEvent = typeof req.body === 'string'
      ? JSON.parse(req.body)
      : req.body;

    if (!event.MailingId || !event.EventType) {
      res.status(400).json({ error: 'Invalid webhook payload' });
      return;
    }

    // Find the campaign by ReachMail mailing ID
    const campaign = await prisma.emailCampaign.findFirst({
      where: { reachmailMailingId: event.MailingId },
    });

    if (!campaign) {
      // Campaign not found - might be from a different system
      res.status(200).json({ received: true, processed: false });
      return;
    }

    // Update analytics based on event type
    switch (event.EventType) {
      case 'Open':
        await prisma.emailCampaign.update({
          where: { id: campaign.id },
          data: {
            opens: { increment: 1 },
            lastStatsUpdate: new Date(),
          },
        });
        break;

      case 'Click':
        await prisma.emailCampaign.update({
          where: { id: campaign.id },
          data: {
            clicks: { increment: 1 },
            lastStatsUpdate: new Date(),
          },
        });
        break;

      case 'Bounce':
        await prisma.emailCampaign.update({
          where: { id: campaign.id },
          data: {
            bounces: { increment: 1 },
            lastStatsUpdate: new Date(),
          },
        });
        break;

      case 'OptOut':
        await prisma.emailCampaign.update({
          where: { id: campaign.id },
          data: {
            optOuts: { increment: 1 },
            lastStatsUpdate: new Date(),
          },
        });
        break;
    }

    res.status(200).json({ received: true, processed: true, event_type: event.EventType });
  } catch (error) {
    console.error('[ReachMail Webhook] Processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

/**
 * Middleware to parse raw body for signature verification
 */
export function reachMailWebhookMiddleware(_req: Request, _res: Response, next: () => void): void {
  // Body is already parsed by express.json() or express.raw()
  next();
}
