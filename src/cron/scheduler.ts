/**
 * Delivery Scheduler
 * Handles scheduled subscription processing using node-cron
 */

import cron from 'node-cron';
import { processAllDueSubscriptions, type SubscriptionProcessingResult } from './subscription-processor.js';

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
  enabled: boolean;
  timezone: string;
  deliveryHour: number; // Hour of day to process deliveries (0-23)
  batchSize: number; // Number of subscriptions to process at once
  retryFailedAfterMinutes: number; // Retry failed subscriptions after X minutes
}

/**
 * Default scheduler configuration
 */
const DEFAULT_CONFIG: SchedulerConfig = {
  enabled: true,
  timezone: 'America/New_York',
  deliveryHour: 6, // 6 AM
  batchSize: 10,
  retryFailedAfterMinutes: 30,
};

/**
 * Processing run result
 */
export interface ProcessingRunResult {
  runId: string;
  startedAt: Date;
  completedAt: Date;
  processed: number;
  successful: number;
  failed: number;
  results: SubscriptionProcessingResult[];
  durationMs: number;
}

/**
 * DeliveryScheduler class
 * Manages scheduled delivery processing
 */
export class DeliveryScheduler {
  private config: SchedulerConfig;
  private dailyTask: cron.ScheduledTask | null = null;
  private retryTask: cron.ScheduledTask | null = null;
  private isProcessing = false;
  private lastRun: ProcessingRunResult | null = null;
  private runHistory: ProcessingRunResult[] = [];
  private maxHistorySize = 100;

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (!this.config.enabled) {
      console.log('[Scheduler] Scheduler is disabled');
      return;
    }

    // Schedule main daily delivery processing
    // Runs at the configured hour every day
    const dailyCronExpression = `0 ${this.config.deliveryHour} * * *`;

    this.dailyTask = cron.schedule(
      dailyCronExpression,
      async () => {
        await this.runProcessing('daily');
      },
      {
        timezone: this.config.timezone,
      }
    );

    // Schedule retry task for failed deliveries
    // Runs every configured interval
    const retryMinutes = this.config.retryFailedAfterMinutes;
    const retryCronExpression = `*/${retryMinutes} * * * *`;

    this.retryTask = cron.schedule(
      retryCronExpression,
      async () => {
        await this.runProcessing('retry');
      },
      {
        timezone: this.config.timezone,
      }
    );

    console.log(
      `[Scheduler] Started. Daily processing at ${this.config.deliveryHour}:00 ${this.config.timezone}. ` +
        `Retry every ${retryMinutes} minutes.`
    );
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.dailyTask) {
      this.dailyTask.stop();
      this.dailyTask = null;
    }
    if (this.retryTask) {
      this.retryTask.stop();
      this.retryTask = null;
    }
    console.log('[Scheduler] Stopped');
  }

  /**
   * Run processing
   */
  private async runProcessing(trigger: 'daily' | 'retry' | 'manual'): Promise<ProcessingRunResult | null> {
    if (this.isProcessing) {
      console.log(`[Scheduler] Already processing, skipping ${trigger} run`);
      return null;
    }

    this.isProcessing = true;
    const startedAt = new Date();
    const runId = `${trigger}_${startedAt.getTime()}`;

    console.log(`[Scheduler] Starting ${trigger} processing run: ${runId}`);

    try {
      const result = await processAllDueSubscriptions(
        this.config.deliveryHour,
        this.config.batchSize
      );

      const completedAt = new Date();
      const runResult: ProcessingRunResult = {
        runId,
        startedAt,
        completedAt,
        processed: result.processed,
        successful: result.successful,
        failed: result.failed,
        results: result.results,
        durationMs: completedAt.getTime() - startedAt.getTime(),
      };

      // Store in history
      this.lastRun = runResult;
      this.runHistory.unshift(runResult);
      if (this.runHistory.length > this.maxHistorySize) {
        this.runHistory.pop();
      }

      console.log(
        `[Scheduler] Completed ${trigger} run: ${result.processed} processed, ` +
          `${result.successful} successful, ${result.failed} failed, ` +
          `duration: ${runResult.durationMs}ms`
      );

      return runResult;
    } catch (error) {
      console.error(`[Scheduler] Error during ${trigger} processing:`, error);
      return null;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Manually trigger processing (for testing or on-demand)
   */
  async triggerProcessing(): Promise<ProcessingRunResult | null> {
    return this.runProcessing('manual');
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    enabled: boolean;
    isProcessing: boolean;
    nextDailyRun: Date | null;
    lastRun: ProcessingRunResult | null;
    config: SchedulerConfig;
    uptime: {
      dailyTaskRunning: boolean;
      retryTaskRunning: boolean;
    };
  } {
    let nextDailyRun: Date | null = null;

    if (this.dailyTask) {
      const now = new Date();
      nextDailyRun = new Date(now);
      nextDailyRun.setHours(this.config.deliveryHour, 0, 0, 0);
      if (nextDailyRun <= now) {
        nextDailyRun.setDate(nextDailyRun.getDate() + 1);
      }
    }

    return {
      enabled: this.config.enabled,
      isProcessing: this.isProcessing,
      nextDailyRun,
      lastRun: this.lastRun,
      config: this.config,
      uptime: {
        dailyTaskRunning: this.dailyTask !== null,
        retryTaskRunning: this.retryTask !== null,
      },
    };
  }

  /**
   * Get run history
   */
  getHistory(limit: number = 10): ProcessingRunResult[] {
    return this.runHistory.slice(0, limit);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SchedulerConfig>): void {
    const wasEnabled = this.config.enabled;
    this.config = { ...this.config, ...config };

    // Restart if enabled state changed
    if (wasEnabled && !this.config.enabled) {
      this.stop();
    } else if (!wasEnabled && this.config.enabled) {
      this.start();
    } else if (this.config.enabled) {
      // Restart to apply new timing config
      this.stop();
      this.start();
    }
  }
}

// Singleton instance
let schedulerInstance: DeliveryScheduler | null = null;

/**
 * Get the singleton scheduler instance
 */
export function getScheduler(config?: Partial<SchedulerConfig>): DeliveryScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new DeliveryScheduler(config);
  } else if (config) {
    schedulerInstance.updateConfig(config);
  }
  return schedulerInstance;
}

/**
 * Start the scheduler (called from main entry point)
 */
export function startScheduler(config?: Partial<SchedulerConfig>): DeliveryScheduler {
  const scheduler = getScheduler(config);
  scheduler.start();
  return scheduler;
}

/**
 * Stop the scheduler (called on shutdown)
 */
export function stopScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
  }
}
