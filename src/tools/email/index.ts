/**
 * Email Tools Index
 * Re-exports all email tool definitions and executors
 */

export {
  configureEmailAccountTool,
  executeConfigureEmailAccount,
} from './configure-email-account.js';

export {
  createEmailListTool,
  executeCreateEmailList,
} from './create-email-list.js';

export {
  createEmailCampaignTool,
  executeCreateEmailCampaign,
} from './create-email-campaign.js';

export {
  sendEmailCampaignTool,
  executeSendEmailCampaign,
} from './send-email-campaign.js';

export {
  getEmailAnalyticsTool,
  executeGetEmailAnalytics,
} from './get-email-analytics.js';

export {
  listEmailCampaignsTool,
  executeListEmailCampaigns,
} from './list-email-campaigns.js';
