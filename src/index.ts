#!/usr/bin/env node
/**
 * NHO/NM MCP Server Entry Point
 *
 * This server provides:
 * 1. MCP (Model Context Protocol) tools for Claude/ChatGPT integration
 * 2. REST API for machine-to-machine headless access
 *
 * Available MCP tools (14 total):
 * - search_data, preview_count, get_sample_data, get_pricing (Data)
 * - create_subscription, manage_subscription, list_subscriptions, delivery_report (Subscriptions)
 * - upload_template, browse_templates, import_design, generate_postcard_pdf (Templates)
 * - configure_delivery, get_fulfillment_status (Delivery)
 *
 * REST API endpoints at /api/v1/*
 * API Documentation at /api/docs
 *
 * Usage:
 *   npm run dev     - Start in development mode with hot reload
 *   npm start       - Start in production mode
 *
 * Environment variables:
 *   ENABLE_MCP_SERVER=true    - Enable MCP stdio server (default: true)
 *   ENABLE_REST_API=true      - Enable REST API server (default: true)
 *   REST_API_PORT=3000        - REST API port (default: 3000)
 */

import 'dotenv/config';
import { startServer as startMcpServer } from './server.js';
import { startRestApi } from './api/index.js';
import { startAlertMonitor, stopAlertMonitor } from './utils/alerts.js';
import { metrics } from './utils/metrics.js';
import { prisma } from './db/client.js';

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    // Log startup info to stderr (stdout is reserved for MCP protocol)
    console.error('='.repeat(60));
    console.error('NHO/NM MCP Server v1.2.0');
    console.error('='.repeat(60));
    console.error(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.error(`Node.js: ${process.version}`);
    console.error('');

    const enableMcp = process.env.ENABLE_MCP_SERVER !== 'false';
    const enableRest = process.env.ENABLE_REST_API !== 'false';
    const restPort = parseInt(process.env.REST_API_PORT || '3000', 10);

    // Start REST API server (runs in background, doesn't block)
    if (enableRest) {
      console.error('Starting REST API server...');
      await startRestApi(restPort);

      // Start alert monitoring (only when REST API is enabled)
      console.error('Starting alert monitor...');
      startAlertMonitor();
    }

    // Start MCP server (blocks on stdio)
    if (enableMcp) {
      console.error('Starting MCP server...');
      await startMcpServer();
    }

    // If neither server is enabled, exit
    if (!enableMcp && !enableRest) {
      console.error('No servers enabled. Set ENABLE_MCP_SERVER=true or ENABLE_REST_API=true');
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal error starting server:', error);
    process.exit(1);
  }
}

// Graceful shutdown handler
async function shutdown(signal: string): Promise<void> {
  console.error(`\n${signal} received, shutting down gracefully...`);

  try {
    // Stop alert monitor
    console.error('Stopping alert monitor...');
    stopAlertMonitor();

    // Flush metrics
    console.error('Flushing metrics...');
    await metrics.shutdown();

    // Disconnect database
    console.error('Disconnecting database...');
    await prisma.$disconnect();

    console.error('Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  shutdown('unhandledRejection');
});

// Run
main();
