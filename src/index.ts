#!/usr/bin/env node
/**
 * NHO/NM MCP Server Entry Point
 *
 * This server provides MCP (Model Context Protocol) tools for accessing
 * New Homeowner (NHO) and New Mover data through the LeadsPlease API.
 *
 * Available tools:
 * - search_data: Search for records by geography and demographics
 * - preview_count: Get record counts without fetching data
 * - get_sample_data: Get sample records for preview
 * - get_pricing: Get pricing information
 *
 * Usage:
 *   npm run dev     - Start in development mode with hot reload
 *   npm start       - Start in production mode
 */

import 'dotenv/config';
import { startServer } from './server.js';

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    // Log startup info to stderr (stdout is reserved for MCP protocol)
    console.error('='.repeat(60));
    console.error('NHO/NM MCP Server');
    console.error('='.repeat(60));
    console.error(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.error(`Node.js: ${process.version}`);
    console.error('');

    // Start the server
    await startServer();
  } catch (error) {
    console.error('Fatal error starting server:', error);
    process.exit(1);
  }
}

// Run
main();
