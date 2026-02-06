/**
 * ReachMail Mailing (Email Content/Template) Service
 * Handles email content creation and management
 */

import { ReachMailClient } from './client.js';

export interface CreateMailingRequest {
  Subject: string;
  FromAddress: string;
  FromName?: string;
  ReplyTo?: string;
  BodyHtml: string;
  BodyText?: string;
  Tracking?: boolean;
}

export interface MailingResponse {
  Id: string;
  Subject: string;
  FromAddress: string;
  FromName?: string;
  CreatedOn: string;
}

export interface MailingListItem {
  Id: string;
  Subject: string;
  FromAddress: string;
  CreatedOn: string;
  ModifiedOn: string;
}

/**
 * Create a new mailing (email content/template)
 */
export async function createMailing(
  client: ReachMailClient,
  options: {
    subject: string;
    fromAddress: string;
    fromName?: string;
    replyTo?: string;
    htmlBody: string;
    textBody?: string;
  }
): Promise<MailingResponse> {
  const basePath = await client.accountPath('Mailings');
  return client.post<MailingResponse>(basePath, {
    Subject: options.subject,
    FromAddress: options.fromAddress,
    FromName: options.fromName,
    ReplyTo: options.replyTo,
    BodyHtml: options.htmlBody,
    BodyText: options.textBody,
    Tracking: true,
  });
}

/**
 * Get mailing details
 */
export async function getMailing(
  client: ReachMailClient,
  mailingId: string
): Promise<MailingResponse> {
  const basePath = await client.accountPath('Mailings');
  return client.get<MailingResponse>(`${basePath}/${mailingId}`);
}

/**
 * List mailings with optional filtering
 */
export async function listMailings(
  client: ReachMailClient
): Promise<MailingListItem[]> {
  const basePath = await client.accountPath('Mailings');
  return client.get<MailingListItem[]>(`${basePath}/Filtered`);
}

/**
 * Update an existing mailing
 */
export async function updateMailing(
  client: ReachMailClient,
  mailingId: string,
  updates: Partial<{
    subject: string;
    fromAddress: string;
    fromName: string;
    replyTo: string;
    htmlBody: string;
    textBody: string;
  }>
): Promise<MailingResponse> {
  const basePath = await client.accountPath('Mailings');

  const body: Record<string, unknown> = {};
  if (updates.subject) body.Subject = updates.subject;
  if (updates.fromAddress) body.FromAddress = updates.fromAddress;
  if (updates.fromName) body.FromName = updates.fromName;
  if (updates.replyTo) body.ReplyTo = updates.replyTo;
  if (updates.htmlBody) body.BodyHtml = updates.htmlBody;
  if (updates.textBody) body.BodyText = updates.textBody;

  return client.put<MailingResponse>(`${basePath}/${mailingId}`, body);
}
