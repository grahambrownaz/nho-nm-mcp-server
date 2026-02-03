/**
 * Authentication utilities for the NHO/NM MCP Server
 * Handles API key validation and tenant context
 */

import { prisma } from '../db/client.js';
import { AuthenticationError, AuthorizationError } from './errors.js';
import type { Tenant, ApiKey, Subscription } from '@prisma/client';

/**
 * Tenant context attached to authenticated requests
 */
export interface TenantContext {
  tenant: Tenant;
  apiKey: ApiKey;
  subscription: Subscription | null;
  permissions: string[];
}

/**
 * Cache for API key lookups (simple in-memory cache)
 * In production, consider using Redis
 */
const apiKeyCache = new Map<string, { context: TenantContext; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Validates an API key and returns the tenant context
 * @param apiKey - The API key from the request header
 * @returns TenantContext with tenant, subscription, and permissions
 * @throws AuthenticationError if the key is invalid or inactive
 */
export async function validateApiKey(apiKey: string | undefined): Promise<TenantContext> {
  if (!apiKey) {
    throw new AuthenticationError('API key is required');
  }

  // Check cache first
  const cached = apiKeyCache.get(apiKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.context;
  }

  // Look up the API key in the database
  const apiKeyRecord = await prisma.apiKey.findUnique({
    where: { key: apiKey },
    include: {
      tenant: {
        include: {
          subscriptions: {
            where: {
              status: { in: ['ACTIVE', 'TRIAL'] },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      },
    },
  });

  if (!apiKeyRecord) {
    throw new AuthenticationError('Invalid API key');
  }

  if (!apiKeyRecord.isActive) {
    throw new AuthenticationError('API key is inactive');
  }

  if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
    throw new AuthenticationError('API key has expired');
  }

  if (apiKeyRecord.tenant.status !== 'ACTIVE') {
    throw new AuthenticationError(
      `Tenant account is ${apiKeyRecord.tenant.status.toLowerCase()}`
    );
  }

  // Update last used timestamp (fire and forget)
  prisma.apiKey
    .update({
      where: { id: apiKeyRecord.id },
      data: { lastUsedAt: new Date() },
    })
    .catch((err) => console.error('Failed to update lastUsedAt:', err));

  const context: TenantContext = {
    tenant: apiKeyRecord.tenant,
    apiKey: apiKeyRecord,
    subscription: apiKeyRecord.tenant.subscriptions[0] ?? null,
    permissions: apiKeyRecord.permissions,
  };

  // Cache the result
  apiKeyCache.set(apiKey, {
    context,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return context;
}

/**
 * Checks if the tenant has a specific permission
 * @param context - The tenant context
 * @param permission - The permission to check (e.g., "data:read")
 * @returns true if the tenant has the permission
 */
export function hasPermission(context: TenantContext, permission: string): boolean {
  // Admin has all permissions
  if (context.permissions.includes('*') || context.permissions.includes('admin')) {
    return true;
  }

  // Check for exact match
  if (context.permissions.includes(permission)) {
    return true;
  }

  // Check for wildcard match (e.g., "data:*" matches "data:read")
  const [category] = permission.split(':');
  if (context.permissions.includes(`${category}:*`)) {
    return true;
  }

  return false;
}

/**
 * Asserts that the tenant has a specific permission
 * @throws AuthorizationError if the tenant doesn't have the permission
 */
export function requirePermission(context: TenantContext, permission: string): void {
  if (!hasPermission(context, permission)) {
    throw new AuthorizationError(
      `Permission denied: ${permission} required`,
      { requiredPermission: permission }
    );
  }
}

/**
 * Checks if the tenant has access to a specific database type
 */
export function hasDatabaseAccess(
  context: TenantContext,
  database: string
): boolean {
  if (!context.subscription) {
    return false;
  }

  const allowedDatabases = context.subscription.allowedDatabases;

  // Map input database to enum value
  const databaseMap: Record<string, string> = {
    nho: 'NHO',
    new_mover: 'NEW_MOVER',
    consumer: 'CONSUMER',
    business: 'BUSINESS',
  };

  const dbEnum = databaseMap[database.toLowerCase()];
  return allowedDatabases.includes(dbEnum as any);
}

/**
 * Asserts that the tenant has access to a specific database
 * @throws AuthorizationError if access is denied
 */
export function requireDatabaseAccess(context: TenantContext, database: string): void {
  if (!hasDatabaseAccess(context, database)) {
    throw new AuthorizationError(
      `Access denied to ${database} database`,
      { database }
    );
  }
}

/**
 * Checks if a geography is allowed for the tenant
 */
export function isGeographyAllowed(
  context: TenantContext,
  geography: { type: string; values?: string[] }
): boolean {
  if (!context.subscription) {
    return false;
  }

  const { allowedStates, allowedZipCodes } = context.subscription;

  // If no restrictions, all geographies are allowed
  if (allowedStates.length === 0 && allowedZipCodes.length === 0) {
    return true;
  }

  // Check based on geography type
  if (geography.type === 'nationwide') {
    // Nationwide only allowed if no restrictions
    return allowedStates.length === 0 && allowedZipCodes.length === 0;
  }

  if (geography.type === 'state' && geography.values) {
    return geography.values.every((state) =>
      allowedStates.length === 0 || allowedStates.includes(state.toUpperCase())
    );
  }

  if (geography.type === 'zip' && geography.values) {
    if (allowedZipCodes.length > 0) {
      return geography.values.every((zip) => allowedZipCodes.includes(zip));
    }
    // If only state restrictions, need to map zips to states
    // For simplicity, allow if no zip restrictions
    return true;
  }

  // For city, county, radius - check against state restrictions if applicable
  return true;
}

/**
 * Clears the API key cache (useful for testing or when keys are updated)
 */
export function clearApiKeyCache(): void {
  apiKeyCache.clear();
}

/**
 * Extracts API key from various header formats
 */
export function extractApiKey(headers: Record<string, string | undefined>): string | undefined {
  // Check X-API-Key header (preferred)
  if (headers['x-api-key']) {
    return headers['x-api-key'];
  }

  // Check Authorization header (Bearer token)
  const authHeader = headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Check query parameter (least preferred, for debugging)
  // This would need to be extracted from the URL separately

  return undefined;
}
