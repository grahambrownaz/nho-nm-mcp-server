/**
 * ReachMail List Management Service
 * Handles creating lists and importing recipients
 */

import { ReachMailClient } from './client.js';

export interface ReachMailRecipient {
  EmailAddress: string;
  Fields?: Record<string, string>;
}

export interface CreateListRequest {
  Name: string;
  Fields?: Array<{
    Name: string;
    Type: string; // 'Text', 'Number', 'Date'
  }>;
}

export interface CreateListResponse {
  Id: string;
  Name: string;
}

export interface ImportRecipientsRequest {
  Recipients: ReachMailRecipient[];
}

export interface ImportRecipientsResponse {
  TotalCount: number;
  ImportedCount: number;
  DuplicateCount: number;
  InvalidCount: number;
}

export interface ListSummary {
  Id: string;
  Name: string;
  ActiveCount: number;
  TotalCount: number;
  CreatedOn: string;
}

/**
 * Default merge fields we create on every list
 */
const DEFAULT_LIST_FIELDS = [
  { Name: 'FirstName', Type: 'Text' },
  { Name: 'LastName', Type: 'Text' },
  { Name: 'Address', Type: 'Text' },
  { Name: 'City', Type: 'Text' },
  { Name: 'State', Type: 'Text' },
  { Name: 'Zip', Type: 'Text' },
  { Name: 'Phone', Type: 'Text' },
  { Name: 'Company', Type: 'Text' },
];

/**
 * Create a new recipient list in ReachMail
 */
export async function createList(
  client: ReachMailClient,
  name: string,
  customFields?: Array<{ Name: string; Type: string }>
): Promise<CreateListResponse> {
  const basePath = await client.accountPath('Lists');
  return client.post<CreateListResponse>(basePath, {
    Name: name,
    Fields: customFields || DEFAULT_LIST_FIELDS,
  });
}

/**
 * Import recipients into an existing list
 */
export async function importRecipients(
  client: ReachMailClient,
  listId: string,
  recipients: ReachMailRecipient[]
): Promise<ImportRecipientsResponse> {
  const basePath = await client.accountPath('Lists');
  return client.post<ImportRecipientsResponse>(`${basePath}/${listId}/Import`, {
    Recipients: recipients,
  });
}

/**
 * Get list details
 */
export async function getList(
  client: ReachMailClient,
  listId: string
): Promise<ListSummary> {
  const basePath = await client.accountPath('Lists');
  return client.get<ListSummary>(`${basePath}/${listId}`);
}

/**
 * Delete a list
 */
export async function deleteList(
  client: ReachMailClient,
  listId: string
): Promise<void> {
  const basePath = await client.accountPath('Lists');
  await client.del(`${basePath}/${listId}`);
}

/**
 * Convert data records to ReachMail recipient format
 */
export function toReachMailRecipients(
  records: Array<{
    email: string;
    firstName?: string;
    lastName?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    phone?: string;
    company?: string;
    [key: string]: unknown;
  }>
): ReachMailRecipient[] {
  return records
    .filter((r) => r.email)
    .map((record) => {
      const fields: Record<string, string> = {};
      if (record.firstName) fields.FirstName = record.firstName;
      if (record.lastName) fields.LastName = record.lastName;
      if (record.address) fields.Address = record.address;
      if (record.city) fields.City = record.city;
      if (record.state) fields.State = record.state;
      if (record.zip) fields.Zip = record.zip;
      if (record.phone) fields.Phone = record.phone;
      if (record.company) fields.Company = record.company;

      return {
        EmailAddress: record.email,
        Fields: Object.keys(fields).length > 0 ? fields : undefined,
      };
    });
}
