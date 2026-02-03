/**
 * Tests for Scheduler (Cron Job Manager)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scheduler, scheduler, CronJob } from '../../../src/cron/scheduler.js';
import { subscriptionProcessor } from '../../../src/cron/subscription-processor.js';
import { logger } from '../../../src/utils/logger.js';

// Mock dependencies
vi.mock('../../../src/cron/subscription-processor.js', () => ({
  subscriptionProcessor: {
    processAll: vi.fn(),
  },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

// Mock node-cron
vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn((expression, callback, options) => ({
      start: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      getStatus: vi.fn(() => 'scheduled'),
    })),
    validate: vi.fn((expression) => {
      // Basic cron validation
      const parts = expression.split(' ');
      return parts.length === 5 || parts.length === 6;
    }),
  },
}));

describe('Scheduler', () => {
  let schedulerInstance: Scheduler;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    schedulerInstance = new Scheduler();

    // Default mock responses
    vi.mocked(subscriptionProcessor.processAll).mockResolvedValue({
      processed: 5,
      succeeded: 5,
      failed: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    schedulerInstance.stopAll();
  });

  describe('registerJob', () => {
    it('registers a new cron job', () => {
      const job: CronJob = {
        name: 'test-job',
        schedule: '0 * * * *', // Every hour
        handler: vi.fn(),
      };

      schedulerInstance.registerJob(job);

      const jobs = schedulerInstance.listJobs();
      expect(jobs).toContain('test-job');
    });

    it('validates cron expression', () => {
      const invalidJob: CronJob = {
        name: 'invalid-job',
        schedule: 'not-a-cron-expression',
        handler: vi.fn(),
      };

      expect(() => schedulerInstance.registerJob(invalidJob)).toThrow();
    });

    it('prevents duplicate job names', () => {
      const job: CronJob = {
        name: 'duplicate-job',
        schedule: '0 * * * *',
        handler: vi.fn(),
      };

      schedulerInstance.registerJob(job);

      expect(() => schedulerInstance.registerJob(job)).toThrow();
    });

    it('accepts valid cron expressions', () => {
      const expressions = [
        '* * * * *', // Every minute
        '0 * * * *', // Every hour
        '0 0 * * *', // Every day at midnight
        '0 0 * * 1', // Every Monday at midnight
        '0 0 1 * *', // First of every month
        '*/5 * * * *', // Every 5 minutes
        '0 9-17 * * 1-5', // 9am-5pm weekdays
      ];

      expressions.forEach((schedule, index) => {
        const job: CronJob = {
          name: `job-${index}`,
          schedule,
          handler: vi.fn(),
        };

        expect(() => schedulerInstance.registerJob(job)).not.toThrow();
      });
    });
  });

  describe('unregisterJob', () => {
    it('unregisters an existing job', () => {
      const job: CronJob = {
        name: 'removable-job',
        schedule: '0 * * * *',
        handler: vi.fn(),
      };

      schedulerInstance.registerJob(job);
      schedulerInstance.unregisterJob('removable-job');

      const jobs = schedulerInstance.listJobs();
      expect(jobs).not.toContain('removable-job');
    });

    it('throws for non-existent job', () => {
      expect(() => schedulerInstance.unregisterJob('non-existent')).toThrow();
    });
  });

  describe('startJob', () => {
    it('starts a registered job', () => {
      const handler = vi.fn();
      const job: CronJob = {
        name: 'startable-job',
        schedule: '0 * * * *',
        handler,
      };

      schedulerInstance.registerJob(job);
      schedulerInstance.startJob('startable-job');

      expect(schedulerInstance.isJobRunning('startable-job')).toBe(true);
    });

    it('throws for non-existent job', () => {
      expect(() => schedulerInstance.startJob('non-existent')).toThrow();
    });
  });

  describe('stopJob', () => {
    it('stops a running job', () => {
      const job: CronJob = {
        name: 'stoppable-job',
        schedule: '0 * * * *',
        handler: vi.fn(),
      };

      schedulerInstance.registerJob(job);
      schedulerInstance.startJob('stoppable-job');
      schedulerInstance.stopJob('stoppable-job');

      expect(schedulerInstance.isJobRunning('stoppable-job')).toBe(false);
    });
  });

  describe('startAll', () => {
    it('starts all registered jobs', () => {
      schedulerInstance.registerJob({
        name: 'job-1',
        schedule: '0 * * * *',
        handler: vi.fn(),
      });
      schedulerInstance.registerJob({
        name: 'job-2',
        schedule: '0 0 * * *',
        handler: vi.fn(),
      });

      schedulerInstance.startAll();

      expect(schedulerInstance.isJobRunning('job-1')).toBe(true);
      expect(schedulerInstance.isJobRunning('job-2')).toBe(true);
    });
  });

  describe('stopAll', () => {
    it('stops all running jobs', () => {
      schedulerInstance.registerJob({
        name: 'job-1',
        schedule: '0 * * * *',
        handler: vi.fn(),
      });
      schedulerInstance.registerJob({
        name: 'job-2',
        schedule: '0 0 * * *',
        handler: vi.fn(),
      });

      schedulerInstance.startAll();
      schedulerInstance.stopAll();

      expect(schedulerInstance.isJobRunning('job-1')).toBe(false);
      expect(schedulerInstance.isJobRunning('job-2')).toBe(false);
    });
  });

  describe('job execution', () => {
    it('executes handler on schedule trigger', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const job: CronJob = {
        name: 'executable-job',
        schedule: '* * * * *',
        handler,
      };

      schedulerInstance.registerJob(job);
      schedulerInstance.startJob('executable-job');

      // Manually trigger the job
      await schedulerInstance.triggerJob('executable-job');

      expect(handler).toHaveBeenCalled();
    });

    it('logs job start and completion', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const job: CronJob = {
        name: 'logged-job',
        schedule: '* * * * *',
        handler,
      };

      schedulerInstance.registerJob(job);
      await schedulerInstance.triggerJob('logged-job');

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ job: 'logged-job' }),
        expect.stringContaining('started')
      );
    });

    it('logs job errors', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Job failed'));
      const job: CronJob = {
        name: 'failing-job',
        schedule: '* * * * *',
        handler,
      };

      schedulerInstance.registerJob(job);
      await schedulerInstance.triggerJob('failing-job');

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          job: 'failing-job',
          error: expect.stringContaining('Job failed'),
        }),
        expect.any(String)
      );
    });
  });

  describe('error handling', () => {
    it('continues running after job failure', async () => {
      const failingHandler = vi.fn().mockRejectedValue(new Error('Failed'));
      const job: CronJob = {
        name: 'resilient-job',
        schedule: '* * * * *',
        handler: failingHandler,
      };

      schedulerInstance.registerJob(job);
      schedulerInstance.startJob('resilient-job');

      // Trigger multiple times
      await schedulerInstance.triggerJob('resilient-job');
      await schedulerInstance.triggerJob('resilient-job');

      expect(failingHandler).toHaveBeenCalledTimes(2);
      expect(schedulerInstance.isJobRunning('resilient-job')).toBe(true);
    });

    it('prevents concurrent execution by default', async () => {
      let isRunning = false;
      const handler = vi.fn().mockImplementation(async () => {
        if (isRunning) {
          throw new Error('Concurrent execution detected');
        }
        isRunning = true;
        await new Promise((resolve) => setTimeout(resolve, 100));
        isRunning = false;
      });

      const job: CronJob = {
        name: 'non-concurrent-job',
        schedule: '* * * * *',
        handler,
        allowConcurrent: false,
      };

      schedulerInstance.registerJob(job);

      // Trigger twice quickly
      const trigger1 = schedulerInstance.triggerJob('non-concurrent-job');
      const trigger2 = schedulerInstance.triggerJob('non-concurrent-job');

      vi.advanceTimersByTime(200);
      await Promise.all([trigger1, trigger2]);

      // Second trigger should be skipped
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('allows concurrent execution when enabled', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);

      const job: CronJob = {
        name: 'concurrent-job',
        schedule: '* * * * *',
        handler,
        allowConcurrent: true,
      };

      schedulerInstance.registerJob(job);

      // Trigger multiple times
      await Promise.all([
        schedulerInstance.triggerJob('concurrent-job'),
        schedulerInstance.triggerJob('concurrent-job'),
      ]);

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('subscription processor integration', () => {
    it('registers subscription processor job', () => {
      schedulerInstance.registerDefaultJobs();

      const jobs = schedulerInstance.listJobs();
      expect(jobs).toContain('subscription-processor');
    });

    it('runs subscription processor on trigger', async () => {
      schedulerInstance.registerDefaultJobs();
      await schedulerInstance.triggerJob('subscription-processor');

      expect(subscriptionProcessor.processAll).toHaveBeenCalled();
    });

    it('logs subscription processor results', async () => {
      vi.mocked(subscriptionProcessor.processAll).mockResolvedValue({
        processed: 10,
        succeeded: 8,
        failed: 2,
      });

      schedulerInstance.registerDefaultJobs();
      await schedulerInstance.triggerJob('subscription-processor');

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          processed: 10,
          succeeded: 8,
          failed: 2,
        }),
        expect.any(String)
      );
    });
  });

  describe('job configuration', () => {
    it('respects timezone option', () => {
      const job: CronJob = {
        name: 'timezone-job',
        schedule: '0 9 * * *',
        handler: vi.fn(),
        timezone: 'America/Phoenix',
      };

      schedulerInstance.registerJob(job);
      const config = schedulerInstance.getJobConfig('timezone-job');

      expect(config?.timezone).toBe('America/Phoenix');
    });

    it('respects enabled option', () => {
      const job: CronJob = {
        name: 'disabled-job',
        schedule: '0 * * * *',
        handler: vi.fn(),
        enabled: false,
      };

      schedulerInstance.registerJob(job);
      schedulerInstance.startAll();

      expect(schedulerInstance.isJobRunning('disabled-job')).toBe(false);
    });
  });

  describe('getJobStats', () => {
    it('returns execution statistics', async () => {
      const job: CronJob = {
        name: 'stats-job',
        schedule: '* * * * *',
        handler: vi.fn().mockResolvedValue(undefined),
      };

      schedulerInstance.registerJob(job);
      await schedulerInstance.triggerJob('stats-job');
      await schedulerInstance.triggerJob('stats-job');

      const stats = schedulerInstance.getJobStats('stats-job');

      expect(stats.executionCount).toBe(2);
      expect(stats.lastExecutionTime).toBeDefined();
      expect(stats.successCount).toBe(2);
      expect(stats.failureCount).toBe(0);
    });

    it('tracks failed executions', async () => {
      const job: CronJob = {
        name: 'failing-stats-job',
        schedule: '* * * * *',
        handler: vi.fn().mockRejectedValue(new Error('Failed')),
      };

      schedulerInstance.registerJob(job);
      await schedulerInstance.triggerJob('failing-stats-job');

      const stats = schedulerInstance.getJobStats('failing-stats-job');

      expect(stats.failureCount).toBe(1);
      expect(stats.lastError).toBe('Failed');
    });
  });

  describe('listJobs', () => {
    it('returns all registered job names', () => {
      schedulerInstance.registerJob({
        name: 'job-a',
        schedule: '0 * * * *',
        handler: vi.fn(),
      });
      schedulerInstance.registerJob({
        name: 'job-b',
        schedule: '0 0 * * *',
        handler: vi.fn(),
      });

      const jobs = schedulerInstance.listJobs();

      expect(jobs).toContain('job-a');
      expect(jobs).toContain('job-b');
      expect(jobs).toHaveLength(2);
    });
  });

  describe('getNextRunTime', () => {
    it('returns next scheduled run time', () => {
      const job: CronJob = {
        name: 'next-run-job',
        schedule: '0 0 * * *', // Midnight daily
        handler: vi.fn(),
      };

      schedulerInstance.registerJob(job);
      const nextRun = schedulerInstance.getNextRunTime('next-run-job');

      expect(nextRun).toBeInstanceOf(Date);
      expect(nextRun!.getTime()).toBeGreaterThan(Date.now());
    });

    it('returns null for non-existent job', () => {
      const nextRun = schedulerInstance.getNextRunTime('non-existent');

      expect(nextRun).toBeNull();
    });
  });

  describe('singleton instance', () => {
    it('exports singleton instance', () => {
      expect(scheduler).toBeDefined();
      expect(scheduler).toBeInstanceOf(Scheduler);
    });
  });
});
