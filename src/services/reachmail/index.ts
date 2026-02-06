/**
 * ReachMail Service Index
 * Re-exports all ReachMail service modules
 */

export { ReachMailClient, type ReachMailClientConfig, type ReachMailUser } from './client.js';
export * as lists from './lists.js';
export * as mailings from './mailings.js';
export * as campaigns from './campaigns.js';
export * as reports from './reports.js';
