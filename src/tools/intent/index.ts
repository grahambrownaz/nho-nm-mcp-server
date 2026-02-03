/**
 * Intent Tools Index
 * Exports all intent data tools for MCP server registration
 */

export {
  searchIntentDataTool,
  executeSearchIntentData,
} from './search-intent-data.js';

export {
  createIntentSubscriptionTool,
  executeCreateIntentSubscription,
} from './create-intent-subscription.js';

export {
  listIntentCategoriesTool,
  executeListIntentCategories,
} from './list-intent-categories.js';

export {
  configureIntentWebhookTool,
  executeConfigureIntentWebhook,
} from './configure-intent-webhook.js';

/**
 * All intent tools for registration
 */
export const intentTools = [
  { name: 'search_intent_data', module: './search-intent-data.js' },
  { name: 'create_intent_subscription', module: './create-intent-subscription.js' },
  { name: 'list_intent_categories', module: './list-intent-categories.js' },
  { name: 'configure_intent_webhook', module: './configure-intent-webhook.js' },
] as const;
