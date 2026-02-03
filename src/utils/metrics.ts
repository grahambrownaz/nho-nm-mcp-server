import { logger } from './logger.js';

interface MetricEvent {
  name: string;
  value: number;
  tags: Record<string, string>;
  timestamp: Date;
}

class MetricsCollector {
  private buffer: MetricEvent[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Flush metrics every 60 seconds
    this.flushInterval = setInterval(() => this.flush(), 60000);
  }

  increment(name: string, tags: Record<string, string> = {}, value: number = 1) {
    this.buffer.push({
      name,
      value,
      tags,
      timestamp: new Date(),
    });
  }

  timing(name: string, durationMs: number, tags: Record<string, string> = {}) {
    this.buffer.push({
      name: `${name}.duration`,
      value: durationMs,
      tags,
      timestamp: new Date(),
    });
  }

  gauge(name: string, value: number, tags: Record<string, string> = {}) {
    this.buffer.push({
      name,
      value,
      tags,
      timestamp: new Date(),
    });
  }

  private async flush() {
    if (this.buffer.length === 0) return;

    const events = [...this.buffer];
    this.buffer = [];

    // Log metrics (in production, send to DataDog/CloudWatch/etc.)
    logger.info({ metrics: events }, 'Metrics flush');

    // If you have a metrics service, send here:
    // await metricsService.send(events);
  }

  async shutdown() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    await this.flush();
  }
}

export const metrics = new MetricsCollector();

// Common metric helpers
export function trackToolInvocation(
  tool: string,
  tenantId: string,
  durationMs: number,
  success: boolean
) {
  metrics.increment('tool.invocation', { tool, tenantId, success: String(success) });
  metrics.timing('tool', durationMs, { tool, tenantId });
  if (!success) {
    metrics.increment('tool.error', { tool, tenantId });
  }
}

export function trackDelivery(
  database: string,
  fulfillmentMethod: string,
  recordCount: number,
  success: boolean
) {
  metrics.increment('delivery.completed', {
    database,
    fulfillmentMethod,
    success: String(success),
  });
  metrics.gauge('delivery.records', recordCount, { database });
}

export function trackExternalApi(
  service: string,
  operation: string,
  durationMs: number,
  success: boolean
) {
  metrics.timing('external_api', durationMs, { service, operation });
  metrics.increment('external_api.call', {
    service,
    operation,
    success: String(success),
  });
}
