/**
 * Tests for DeliveryScheduler (Scheduled Delivery Processing)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DeliveryScheduler,
  getScheduler,
  startScheduler,
  stopScheduler,
  type SchedulerConfig,
  type ProcessingRunResult,
} from '../../../src/cron/scheduler.js';
import * as subscriptionProcessor from '../../../src/cron/subscription-processor.js';

// Mock dependencies
vi.mock('../../../src/cron/subscription-processor.js', () => ({
  processAllDueSubscriptions: vi.fn(),
}));

// Mock node-cron
vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn((expression, callback, options) => ({
      start: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
    })),
    validate: vi.fn(() => true),
  },
}));

describe('DeliveryScheduler', () => {
  let scheduler: DeliveryScheduler;

  beforeEach(() => {
    vi.clearAllMocks();
    scheduler = new DeliveryScheduler({
      enabled: true,
      timezone: 'America/New_York',
      deliveryHour: 6,
      batchSize: 10,
      retryFailedAfterMinutes: 30,
    });

    // Default mock response
    vi.mocked(subscriptionProcessor.processAllDueSubscriptions).mockResolvedValue({
      processed: 5,
      successful: 5,
      failed: 0,
      results: [],
    });
  });

  afterEach(() => {
    scheduler.stop();
  });

  describe('constructor', () => {
    it('creates scheduler with default config', () => {
      const defaultScheduler = new DeliveryScheduler();
      const status = defaultScheduler.getStatus();

      expect(status.config.enabled).toBe(true);
      expect(status.config.timezone).toBe('America/New_York');
      expect(status.config.deliveryHour).toBe(6);

      defaultScheduler.stop();
    });

    it('accepts custom config', () => {
      const customScheduler = new DeliveryScheduler({
        enabled: false,
        timezone: 'America/Phoenix',
        deliveryHour: 8,
      });
      const status = customScheduler.getStatus();

      expect(status.config.enabled).toBe(false);
      expect(status.config.timezone).toBe('America/Phoenix');
      expect(status.config.deliveryHour).toBe(8);

      customScheduler.stop();
    });
  });

  describe('start', () => {
    it('starts scheduler when enabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      scheduler.start();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Scheduler] Started')
      );

      consoleSpy.mockRestore();
    });

    it('does not start when disabled', () => {
      const disabledScheduler = new DeliveryScheduler({ enabled: false });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      disabledScheduler.start();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Scheduler is disabled')
      );

      consoleSpy.mockRestore();
      disabledScheduler.stop();
    });
  });

  describe('stop', () => {
    it('stops running scheduler', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      scheduler.start();
      scheduler.stop();

      expect(consoleSpy).toHaveBeenCalledWith('[Scheduler] Stopped');

      consoleSpy.mockRestore();
    });
  });

  describe('triggerProcessing', () => {
    it('processes due subscriptions', async () => {
      const result = await scheduler.triggerProcessing();

      expect(subscriptionProcessor.processAllDueSubscriptions).toHaveBeenCalled();
      expect(result?.processed).toBe(5);
      expect(result?.successful).toBe(5);
      expect(result?.failed).toBe(0);
    });

    it('returns run result with timing information', async () => {
      const result = await scheduler.triggerProcessing();

      expect(result?.runId).toBeDefined();
      expect(result?.startedAt).toBeInstanceOf(Date);
      expect(result?.completedAt).toBeInstanceOf(Date);
      expect(result?.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('records run in history', async () => {
      await scheduler.triggerProcessing();
      await scheduler.triggerProcessing();

      const history = scheduler.getHistory();

      expect(history).toHaveLength(2);
      expect(history[0].runId).toContain('manual_');
    });

    it('prevents concurrent processing', async () => {
      // Start a long-running process
      vi.mocked(subscriptionProcessor.processAllDueSubscriptions).mockImplementation(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return { processed: 1, successful: 1, failed: 0, results: [] };
        }
      );

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Trigger twice quickly
      const firstPromise = scheduler.triggerProcessing();
      const secondResult = await scheduler.triggerProcessing();

      // Second one should be skipped
      expect(secondResult).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Already processing')
      );

      await firstPromise;
      consoleSpy.mockRestore();
    });

    it('handles processing errors gracefully', async () => {
      vi.mocked(subscriptionProcessor.processAllDueSubscriptions).mockRejectedValue(
        new Error('Processing failed')
      );

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await scheduler.triggerProcessing();

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Scheduler] Error'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getStatus', () => {
    it('returns scheduler status', () => {
      const status = scheduler.getStatus();

      expect(status.enabled).toBe(true);
      expect(status.isProcessing).toBe(false);
      expect(status.config).toBeDefined();
    });

    it('shows daily task as running after start', () => {
      scheduler.start();
      const status = scheduler.getStatus();

      expect(status.uptime.dailyTaskRunning).toBe(true);
      expect(status.uptime.retryTaskRunning).toBe(true);
    });

    it('calculates next daily run time', () => {
      scheduler.start();
      const status = scheduler.getStatus();

      expect(status.nextDailyRun).toBeInstanceOf(Date);
      expect(status.nextDailyRun!.getTime()).toBeGreaterThan(Date.now());
    });

    it('includes last run result', async () => {
      await scheduler.triggerProcessing();
      const status = scheduler.getStatus();

      expect(status.lastRun).toBeDefined();
      expect(status.lastRun?.processed).toBe(5);
    });
  });

  describe('getHistory', () => {
    it('returns empty array initially', () => {
      const history = scheduler.getHistory();

      expect(history).toEqual([]);
    });

    it('returns recent runs', async () => {
      await scheduler.triggerProcessing();
      await scheduler.triggerProcessing();
      await scheduler.triggerProcessing();

      const history = scheduler.getHistory(2);

      expect(history).toHaveLength(2);
    });

    it('returns runs in reverse chronological order', async () => {
      await scheduler.triggerProcessing();
      await new Promise((resolve) => setTimeout(resolve, 10));
      await scheduler.triggerProcessing();

      const history = scheduler.getHistory();

      expect(history[0].startedAt.getTime()).toBeGreaterThan(
        history[1].startedAt.getTime()
      );
    });
  });

  describe('updateConfig', () => {
    it('updates scheduler configuration', () => {
      scheduler.updateConfig({
        deliveryHour: 10,
        batchSize: 20,
      });

      const status = scheduler.getStatus();

      expect(status.config.deliveryHour).toBe(10);
      expect(status.config.batchSize).toBe(20);
    });

    it('stops scheduler when disabled', () => {
      scheduler.start();
      expect(scheduler.getStatus().uptime.dailyTaskRunning).toBe(true);

      scheduler.updateConfig({ enabled: false });
      expect(scheduler.getStatus().uptime.dailyTaskRunning).toBe(false);
    });

    it('starts scheduler when enabled', () => {
      const disabledScheduler = new DeliveryScheduler({ enabled: false });
      expect(disabledScheduler.getStatus().uptime.dailyTaskRunning).toBe(false);

      disabledScheduler.updateConfig({ enabled: true });
      expect(disabledScheduler.getStatus().uptime.dailyTaskRunning).toBe(true);

      disabledScheduler.stop();
    });
  });
});

describe('Singleton functions', () => {
  afterEach(() => {
    stopScheduler();
  });

  describe('getScheduler', () => {
    it('returns scheduler instance', () => {
      const scheduler = getScheduler();

      expect(scheduler).toBeInstanceOf(DeliveryScheduler);
    });

    it('returns same instance on subsequent calls', () => {
      const scheduler1 = getScheduler();
      const scheduler2 = getScheduler();

      expect(scheduler1).toBe(scheduler2);
    });
  });

  describe('startScheduler', () => {
    it('starts and returns scheduler', () => {
      const scheduler = startScheduler();

      expect(scheduler).toBeInstanceOf(DeliveryScheduler);
      expect(scheduler.getStatus().uptime.dailyTaskRunning).toBe(true);
    });
  });

  describe('stopScheduler', () => {
    it('stops the scheduler', () => {
      const scheduler = startScheduler();
      stopScheduler();

      expect(scheduler.getStatus().uptime.dailyTaskRunning).toBe(false);
    });
  });
});
