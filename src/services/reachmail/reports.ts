/**
 * ReachMail Reports Service
 * Handles campaign analytics and reporting
 */

import { ReachMailClient } from './client.js';

export interface CampaignSummaryReport {
  Sent: number;
  Delivered: number;
  Opens: number;
  UniqueOpens: number;
  Clicks: number;
  UniqueClicks: number;
  Bounces: number;
  HardBounces: number;
  SoftBounces: number;
  OptOuts: number;
  SpamComplaints: number;
  Forwards: number;
}

export interface OpenDetail {
  EmailAddress: string;
  OpenDate: string;
  IpAddress?: string;
  UserAgent?: string;
}

export interface ClickDetail {
  EmailAddress: string;
  ClickDate: string;
  Url: string;
  IpAddress?: string;
}

export interface BounceDetail {
  EmailAddress: string;
  BounceDate: string;
  BounceType: string; // HB, SB, MB, etc.
  BounceMessage: string;
}

export interface OptOutDetail {
  EmailAddress: string;
  OptOutDate: string;
}

/**
 * Get campaign summary report (aggregate stats)
 */
export async function getCampaignSummary(
  client: ReachMailClient,
  mailingId: string
): Promise<CampaignSummaryReport> {
  const basePath = await client.accountPath('Reports');
  return client.get<CampaignSummaryReport>(`${basePath}/Mailings/${mailingId}/Summary`);
}

/**
 * Get open tracking details
 */
export async function getOpenDetails(
  client: ReachMailClient,
  mailingId: string
): Promise<OpenDetail[]> {
  const basePath = await client.accountPath('Reports');
  return client.get<OpenDetail[]>(`${basePath}/Mailings/${mailingId}/Opens/Detail`);
}

/**
 * Get click tracking details
 */
export async function getClickDetails(
  client: ReachMailClient,
  mailingId: string
): Promise<ClickDetail[]> {
  const basePath = await client.accountPath('Reports');
  return client.get<ClickDetail[]>(`${basePath}/Mailings/${mailingId}/TrackedLinks`);
}

/**
 * Get bounce details
 */
export async function getBounceDetails(
  client: ReachMailClient,
  mailingId: string
): Promise<BounceDetail[]> {
  const basePath = await client.accountPath('Reports');
  return client.get<BounceDetail[]>(`${basePath}/Mailings/${mailingId}/Bounces/Detail`);
}

/**
 * Get opt-out details
 */
export async function getOptOutDetails(
  client: ReachMailClient,
  mailingId: string
): Promise<OptOutDetail[]> {
  const basePath = await client.accountPath('Reports');
  return client.get<OptOutDetail[]>(`${basePath}/Mailings/${mailingId}/OptOuts/Detail`);
}

/**
 * Build a formatted analytics object from the summary report
 */
export function formatAnalytics(summary: CampaignSummaryReport) {
  const deliveryRate = summary.Sent > 0
    ? ((summary.Delivered / summary.Sent) * 100).toFixed(2)
    : '0.00';
  const openRate = summary.Delivered > 0
    ? ((summary.UniqueOpens / summary.Delivered) * 100).toFixed(2)
    : '0.00';
  const clickRate = summary.Delivered > 0
    ? ((summary.UniqueClicks / summary.Delivered) * 100).toFixed(2)
    : '0.00';
  const bounceRate = summary.Sent > 0
    ? ((summary.Bounces / summary.Sent) * 100).toFixed(2)
    : '0.00';
  const optOutRate = summary.Delivered > 0
    ? ((summary.OptOuts / summary.Delivered) * 100).toFixed(2)
    : '0.00';

  return {
    sent: summary.Sent,
    delivered: summary.Delivered,
    opens: summary.Opens,
    uniqueOpens: summary.UniqueOpens,
    clicks: summary.Clicks,
    uniqueClicks: summary.UniqueClicks,
    bounces: summary.Bounces,
    hardBounces: summary.HardBounces,
    softBounces: summary.SoftBounces,
    optOuts: summary.OptOuts,
    spamComplaints: summary.SpamComplaints,
    rates: {
      delivery: `${deliveryRate}%`,
      open: `${openRate}%`,
      click: `${clickRate}%`,
      bounce: `${bounceRate}%`,
      optOut: `${optOutRate}%`,
    },
  };
}
