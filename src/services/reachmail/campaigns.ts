/**
 * ReachMail Campaign Service
 * Handles campaign creation, scheduling, and management
 */

import { ReachMailClient } from './client.js';

export interface CreateCampaignRequest {
  Name: string;
  MailingId: string;
  ListIds: string[];
  ScheduledDelivery?: string; // ISO date string
}

export interface CampaignResponse {
  Id: string;
  Name: string;
  Status: string;
  MailingId: string;
  ListIds: string[];
  ScheduledDelivery?: string;
  CreatedOn: string;
}

export interface CampaignListItem {
  Id: string;
  Name: string;
  Status: string;
  CreatedOn: string;
  SentOn?: string;
}

/**
 * Create a new campaign (list + mailing = campaign)
 */
export async function createCampaign(
  client: ReachMailClient,
  options: {
    name: string;
    mailingId: string;
    listIds: string[];
    scheduledDelivery?: string;
  }
): Promise<CampaignResponse> {
  const basePath = await client.accountPath('Campaigns');

  const body: CreateCampaignRequest = {
    Name: options.name,
    MailingId: options.mailingId,
    ListIds: options.listIds,
  };

  if (options.scheduledDelivery) {
    body.ScheduledDelivery = options.scheduledDelivery;
  }

  return client.post<CampaignResponse>(basePath, body);
}

/**
 * Schedule a campaign for delivery
 */
export async function scheduleCampaign(
  client: ReachMailClient,
  campaignId: string,
  deliveryDate?: string
): Promise<CampaignResponse> {
  const basePath = await client.accountPath('Campaigns');

  const body: Record<string, unknown> = {};
  if (deliveryDate) {
    body.ScheduledDelivery = deliveryDate;
  }

  return client.post<CampaignResponse>(`${basePath}/${campaignId}/Scheduled`, body);
}

/**
 * Get campaign details
 */
export async function getCampaign(
  client: ReachMailClient,
  campaignId: string
): Promise<CampaignResponse> {
  const basePath = await client.accountPath('Campaigns');
  return client.get<CampaignResponse>(`${basePath}/${campaignId}`);
}

/**
 * List all campaigns
 */
export async function listCampaigns(
  client: ReachMailClient
): Promise<CampaignListItem[]> {
  const basePath = await client.accountPath('Campaigns');
  return client.get<CampaignListItem[]>(basePath);
}
