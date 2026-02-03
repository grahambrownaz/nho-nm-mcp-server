import { logger } from './logger.js';
import { prisma } from '../db/client.js';

interface AlertCondition {
  name: string;
  check: () => Promise<boolean>;
  message: string;
  severity: 'warning' | 'critical';
}

const alertConditions: AlertCondition[] = [
  {
    name: 'high_error_rate',
    check: async () => {
      // Check if error rate > 5% in last 5 minutes
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const [total, errors] = await Promise.all([
        prisma.delivery.count({ where: { createdAt: { gte: fiveMinAgo } } }),
        prisma.delivery.count({
          where: { createdAt: { gte: fiveMinAgo }, status: 'FAILED' },
        }),
      ]);
      return total > 0 && errors / total > 0.05;
    },
    message: 'Delivery error rate exceeds 5%',
    severity: 'critical',
  },
  {
    name: 'no_deliveries_24h',
    check: async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const activeSubscriptions = await prisma.subscription.count({
        where: { status: 'ACTIVE' },
      });
      const recentDeliveries = await prisma.delivery.count({
        where: { createdAt: { gte: yesterday }, status: 'COMPLETED' },
      });
      return activeSubscriptions > 0 && recentDeliveries === 0;
    },
    message: 'No successful deliveries in 24 hours despite active subscriptions',
    severity: 'critical',
  },
  {
    name: 'pending_delivery_backlog',
    check: async () => {
      const pending = await prisma.delivery.count({
        where: { status: 'PENDING' },
      });
      return pending > 100;
    },
    message: 'More than 100 deliveries pending',
    severity: 'warning',
  },
  {
    name: 'high_api_latency',
    check: async () => {
      // Check for slow API responses in logs
      // This would typically be tracked via metrics
      // Placeholder implementation
      return false;
    },
    message: 'API latency exceeds acceptable thresholds',
    severity: 'warning',
  },
  {
    name: 'low_disk_space',
    check: async () => {
      // Check disk space (for local deployments)
      // In cloud environments, this would be handled by the platform
      return false;
    },
    message: 'Disk space running low',
    severity: 'critical',
  },
  {
    name: 'database_connection_pool_exhausted',
    check: async () => {
      // Check if database connections are near limit
      // This is a placeholder - actual implementation depends on Prisma metrics
      return false;
    },
    message: 'Database connection pool near exhaustion',
    severity: 'critical',
  },
];

export async function checkAlerts(): Promise<void> {
  for (const condition of alertConditions) {
    try {
      const triggered = await condition.check();
      if (triggered) {
        logger.error(
          {
            alert: condition.name,
            severity: condition.severity,
            message: condition.message,
          },
          'ALERT TRIGGERED'
        );

        // In production, send to PagerDuty/Slack/etc.
        await sendAlert(condition);
      }
    } catch (error) {
      logger.error({ alert: condition.name, error }, 'Alert check failed');
    }
  }
}

// Send alert to external services
async function sendAlert(condition: AlertCondition): Promise<void> {
  // Slack webhook
  if (process.env.SLACK_WEBHOOK_URL) {
    try {
      await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🚨 *${condition.severity.toUpperCase()}*: ${condition.message}`,
          attachments: [
            {
              color: condition.severity === 'critical' ? 'danger' : 'warning',
              fields: [
                { title: 'Alert Name', value: condition.name, short: true },
                { title: 'Severity', value: condition.severity, short: true },
              ],
            },
          ],
        }),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to send Slack alert');
    }
  }

  // PagerDuty
  if (process.env.PAGERDUTY_ROUTING_KEY && condition.severity === 'critical') {
    try {
      await fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routing_key: process.env.PAGERDUTY_ROUTING_KEY,
          event_action: 'trigger',
          payload: {
            summary: condition.message,
            severity: condition.severity,
            source: 'nho-nm-mcp-server',
            custom_details: {
              alert_name: condition.name,
            },
          },
        }),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to send PagerDuty alert');
    }
  }
}

// Run alert checks every 5 minutes
let alertInterval: NodeJS.Timeout | null = null;

export function startAlertMonitor() {
  alertInterval = setInterval(checkAlerts, 5 * 60 * 1000);
  logger.info('Alert monitor started');
  // Run initial check
  checkAlerts();
}

export function stopAlertMonitor() {
  if (alertInterval) {
    clearInterval(alertInterval);
    alertInterval = null;
  }
  logger.info('Alert monitor stopped');
}
