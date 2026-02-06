/**
 * Tests for list_audits tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { AuthorizationError } from '../../../../src/utils/errors.js';

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    swotspotAudit: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { executeListAudits } from '../../../../src/tools/swotspot/list-audits.js';
import { prisma } from '../../../../src/db/client.js';

const mockAudits = [
  {
    id: 'audit-1',
    tenantId: 'test-tenant-id',
    businessName: 'HVAC Co',
    city: 'Phoenix',
    state: 'AZ',
    overallScore: 62,
    status: 'COMPLETED',
    industry: 'hvac',
    createdAt: new Date('2025-01-15'),
    completedAt: new Date('2025-01-15'),
  },
  {
    id: 'audit-2',
    tenantId: 'test-tenant-id',
    businessName: 'Plumbing Co',
    city: 'Tucson',
    state: 'AZ',
    overallScore: null,
    status: 'PENDING',
    industry: 'home_services',
    createdAt: new Date('2025-01-16'),
    completedAt: null,
  },
];

function createTestContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenant: {
      id: 'test-tenant-id',
      name: 'Test Tenant',
      email: 'test@example.com',
      company: 'Test Company',
      phone: null,
      status: 'ACTIVE',
      stripeCustomerId: null,
      parentTenantId: null,
      isReseller: false,
      wholesalePricing: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    apiKey: {
      id: 'test-api-key-id',
      key: 'test-key',
      name: 'Test Key',
      tenantId: 'test-tenant-id',
      permissions: ['*'],
      isActive: true,
      lastUsedAt: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    subscription: null,
    permissions: ['*'],
    ...overrides,
  };
}

describe('list_audits tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.swotspotAudit.findMany).mockResolvedValue(mockAudits as never);
    vi.mocked(prisma.swotspotAudit.count).mockResolvedValue(2);
  });

  describe('listing audits', () => {
    it('returns audits for tenant', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeListAudits(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.audits).toHaveLength(2);
      expect(result.data?.total).toBe(2);
    });

    it('returns formatted audit data', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeListAudits(input, context);

      const audit = result.data?.audits[0];
      expect(audit?.id).toBe('audit-1');
      expect(audit?.business_name).toBe('HVAC Co');
      expect(audit?.location).toBe('Phoenix, AZ');
      expect(audit?.overall_score).toBe(62);
      expect(audit?.status).toBe('COMPLETED');
    });

    it('returns empty list when no audits exist', async () => {
      vi.mocked(prisma.swotspotAudit.findMany).mockResolvedValue([]);
      vi.mocked(prisma.swotspotAudit.count).mockResolvedValue(0);

      const context = createTestContext();
      const input = {};

      const result = await executeListAudits(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.audits).toHaveLength(0);
      expect(result.data?.total).toBe(0);
    });
  });

  describe('filtering', () => {
    it('filters by status', async () => {
      const context = createTestContext();
      const input = { status: 'COMPLETED' };

      await executeListAudits(input, context);

      expect(prisma.swotspotAudit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'test-tenant-id',
            status: 'COMPLETED',
          }),
        })
      );
    });
  });

  describe('pagination', () => {
    it('uses default limit and offset', async () => {
      const context = createTestContext();
      const input = {};

      const result = await executeListAudits(input, context);

      expect(result.data?.limit).toBe(20);
      expect(result.data?.offset).toBe(0);
    });

    it('respects custom limit and offset', async () => {
      const context = createTestContext();
      const input = { limit: 10, offset: 5 };

      await executeListAudits(input, context);

      expect(prisma.swotspotAudit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 5,
        })
      );
    });

    it('calculates has_more correctly', async () => {
      vi.mocked(prisma.swotspotAudit.count).mockResolvedValue(50);

      const context = createTestContext();
      const input = { limit: 20, offset: 0 };

      const result = await executeListAudits(input, context);

      expect(result.data?.has_more).toBe(true);
    });
  });

  describe('input validation', () => {
    it('throws error for invalid status', async () => {
      const context = createTestContext();
      const input = { status: 'INVALID' };

      await expect(executeListAudits(input, context)).rejects.toThrow();
    });

    it('throws error for limit over 100', async () => {
      const context = createTestContext();
      const input = { limit: 200 };

      await expect(executeListAudits(input, context)).rejects.toThrow();
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing swotspot:read permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });

      await expect(executeListAudits({}, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with swotspot:read permission', async () => {
      const context = createTestContext({
        permissions: ['swotspot:read'],
      });

      const result = await executeListAudits({}, context);
      expect(result.success).toBe(true);
    });
  });
});
