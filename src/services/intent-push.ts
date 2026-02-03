/**
 * Intent Push Notification Service
 * Handles real-time delivery of intent signals to webhooks
 */

import crypto from 'crypto';
import { prisma } from '../db/client.js';
import type { IntentSignal } from '../schemas/intent.js';

/**
 * Webhook delivery result
 */
interface DeliveryResult {
  success: boolean;
  statusCode?: number;
  responseTimeMs: number;
  error?: string;
}

/**
 * Generate webhook signature
 */
function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Deliver intent signals to a webhook
 */
export async function deliverToWebhook(params: {
  webhookId: string;
  signals: IntentSignal[];
  subscriptionId: string;
  tenantId: string;
}): Promise<DeliveryResult> {
  const { webhookId, signals, subscriptionId, tenantId } = params;

  // Get webhook configuration
  const webhook = await prisma.intentWebhook.findUnique({
    where: { id: webhookId },
  });

  if (!webhook) {
    return {
      success: false,
      responseTimeMs: 0,
      error: 'Webhook not found',
    };
  }

  if (!webhook.isActive) {
    return {
      success: false,
      responseTimeMs: 0,
      error: 'Webhook is inactive',
    };
  }

  // Prepare payload
  const payload = {
    event: 'intent_signals',
    subscription_id: subscriptionId,
    timestamp: new Date().toISOString(),
    signals,
  };

  const payloadString = JSON.stringify(payload);

  // Prepare headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Intent-Event': 'intent_signals',
    'X-Intent-Subscription': subscriptionId,
  };

  // Add signature if secret is configured
  if (webhook.secret) {
    const signature = generateSignature(payloadString, webhook.secret);
    headers['X-Intent-Signature'] = `sha256=${signature}`;
  }

  // Add custom headers
  if (webhook.headers && typeof webhook.headers === 'object') {
    Object.assign(headers, webhook.headers);
  }

  // Create delivery record
  const delivery = await prisma.intentDelivery.create({
    data: {
      subscriptionId,
      tenantId,
      webhookId,
      deliveryType: 'REALTIME_WEBHOOK',
      signalCount: signals.length,
      payload: JSON.parse(JSON.stringify(payload)),
      status: 'DELIVERING',
      attemptCount: 1,
      lastAttemptAt: new Date(),
    },
  });

  // Attempt delivery with retries
  let lastResult: DeliveryResult = {
    success: false,
    responseTimeMs: 0,
    error: 'No attempts made',
  };

  const maxAttempts = webhook.retryAttempts + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: payloadString,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const responseTimeMs = Date.now() - startTime;

      if (response.ok) {
        lastResult = {
          success: true,
          statusCode: response.status,
          responseTimeMs,
        };

        // Update delivery record
        await prisma.intentDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'DELIVERED',
            deliveredAt: new Date(),
            responseStatusCode: response.status,
            responseTimeMs,
            attemptCount: attempt,
          },
        });

        // Update webhook stats
        await prisma.intentWebhook.update({
          where: { id: webhookId },
          data: {
            lastDeliveryAt: new Date(),
            lastSuccessAt: new Date(),
            consecutiveFailures: 0,
          },
        });

        // Update subscription stats
        await prisma.intentSubscription.update({
          where: { id: subscriptionId },
          data: {
            totalSignalsReceived: { increment: signals.length },
            totalDeliveries: { increment: 1 },
            signalsThisMonth: { increment: signals.length },
          },
        });

        return lastResult;
      } else {
        lastResult = {
          success: false,
          statusCode: response.status,
          responseTimeMs,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;
      lastResult = {
        success: false,
        responseTimeMs,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    // If not last attempt, wait before retrying
    if (attempt < maxAttempts) {
      const delay = webhook.retryDelayMs * Math.pow(2, attempt - 1); // Exponential backoff
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Update attempt count
      await prisma.intentDelivery.update({
        where: { id: delivery.id },
        data: {
          attemptCount: attempt + 1,
          lastAttemptAt: new Date(),
          status: 'RETRYING',
        },
      });
    }
  }

  // All attempts failed
  await prisma.intentDelivery.update({
    where: { id: delivery.id },
    data: {
      status: 'FAILED',
      errorMessage: lastResult.error,
      responseStatusCode: lastResult.statusCode,
      responseTimeMs: lastResult.responseTimeMs,
    },
  });

  // Update webhook failure stats
  await prisma.intentWebhook.update({
    where: { id: webhookId },
    data: {
      lastDeliveryAt: new Date(),
      lastFailureAt: new Date(),
      lastErrorMessage: lastResult.error,
      consecutiveFailures: { increment: 1 },
    },
  });

  // If too many consecutive failures, deactivate webhook
  const updatedWebhook = await prisma.intentWebhook.findUnique({
    where: { id: webhookId },
  });

  if (updatedWebhook && updatedWebhook.consecutiveFailures >= 10) {
    await prisma.intentWebhook.update({
      where: { id: webhookId },
      data: { isActive: false },
    });

    console.error(`[Intent Push] Webhook ${webhookId} deactivated after 10 consecutive failures`);
  }

  return lastResult;
}

/**
 * Batch deliver signals to a webhook (for batch subscriptions)
 */
export async function batchDeliverToWebhook(params: {
  subscriptionId: string;
}): Promise<{
  success: boolean;
  signalCount: number;
  error?: string;
}> {
  const subscription = await prisma.intentSubscription.findUnique({
    where: { id: params.subscriptionId },
    include: { webhook: true },
  });

  if (!subscription) {
    return { success: false, signalCount: 0, error: 'Subscription not found' };
  }

  if (!subscription.webhook) {
    return { success: false, signalCount: 0, error: 'No webhook configured' };
  }

  // In production, this would fetch signals from the upstream API
  // For now, we'll simulate getting the signals
  const mockSignals: IntentSignal[] = [];

  if (mockSignals.length === 0) {
    return { success: true, signalCount: 0 };
  }

  const result = await deliverToWebhook({
    webhookId: subscription.webhookId!,
    signals: mockSignals,
    subscriptionId: subscription.id,
    tenantId: subscription.tenantId,
  });

  return {
    success: result.success,
    signalCount: mockSignals.length,
    error: result.error,
  };
}

/**
 * Process batch deliveries for all due subscriptions
 */
export async function processBatchDeliveries(): Promise<{
  processed: number;
  successful: number;
  failed: number;
}> {
  const now = new Date();

  // Find subscriptions with batch delivery due
  const dueSubscriptions = await prisma.intentSubscription.findMany({
    where: {
      status: 'ACTIVE',
      deliveryMethod: { in: ['BATCH_EMAIL', 'BATCH_SFTP'] },
      nextBatchAt: { lte: now },
    },
    include: { webhook: true },
  });

  let processed = 0;
  let successful = 0;
  let failed = 0;

  for (const subscription of dueSubscriptions) {
    processed++;

    try {
      const result = await batchDeliverToWebhook({
        subscriptionId: subscription.id,
      });

      if (result.success) {
        successful++;
      } else {
        failed++;
      }

      // Calculate next batch time
      const nextBatchAt = calculateNextBatchTime(subscription.batchFrequency);

      await prisma.intentSubscription.update({
        where: { id: subscription.id },
        data: { nextBatchAt },
      });
    } catch (error) {
      failed++;
      console.error(`[Intent Push] Error processing subscription ${subscription.id}:`, error);
    }
  }

  return { processed, successful, failed };
}

/**
 * Calculate next batch delivery time based on frequency
 */
function calculateNextBatchTime(frequency: string | null): Date {
  const now = new Date();

  switch (frequency) {
    case 'HOURLY':
      return new Date(now.getTime() + 60 * 60 * 1000);
    case 'EVERY_4_HOURS':
      return new Date(now.getTime() + 4 * 60 * 60 * 1000);
    case 'DAILY':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case 'WEEKLY':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() + 24 * 60 * 60 * 1000); // Default to daily
  }
}

/**
 * Test webhook connectivity
 */
export async function testWebhook(webhookId: string): Promise<{
  success: boolean;
  statusCode?: number;
  responseTimeMs: number;
  error?: string;
}> {
  const webhook = await prisma.intentWebhook.findUnique({
    where: { id: webhookId },
  });

  if (!webhook) {
    return {
      success: false,
      responseTimeMs: 0,
      error: 'Webhook not found',
    };
  }

  // Prepare test payload
  const payload = {
    event: 'test',
    timestamp: new Date().toISOString(),
    message: 'This is a test webhook delivery',
  };

  const payloadString = JSON.stringify(payload);

  // Prepare headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Intent-Event': 'test',
  };

  if (webhook.secret) {
    const signature = generateSignature(payloadString, webhook.secret);
    headers['X-Intent-Signature'] = `sha256=${signature}`;
  }

  if (webhook.headers && typeof webhook.headers === 'object') {
    Object.assign(headers, webhook.headers);
  }

  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout for tests

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body: payloadString,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const responseTimeMs = Date.now() - startTime;

    // Update webhook test status
    await prisma.intentWebhook.update({
      where: { id: webhookId },
      data: {
        lastTestAt: new Date(),
        lastTestSuccess: response.ok,
        lastTestError: response.ok ? null : `HTTP ${response.status}`,
      },
    });

    return {
      success: response.ok,
      statusCode: response.status,
      responseTimeMs,
      error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await prisma.intentWebhook.update({
      where: { id: webhookId },
      data: {
        lastTestAt: new Date(),
        lastTestSuccess: false,
        lastTestError: errorMessage,
      },
    });

    return {
      success: false,
      responseTimeMs,
      error: errorMessage,
    };
  }
}
