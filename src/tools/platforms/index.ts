/**
 * Platform Tools Index
 * Exports all platform integration tools for MCP server registration
 */

export {
  syncToPlatformTool,
  executeSyncToPlatform,
  type SyncToPlatformInput,
} from './sync-to-platform.js';

export {
  configurePlatformConnectionTool,
  executeConfigurePlatformConnection,
  type ConfigurePlatformConnectionInput,
} from './configure-platform-connection.js';
