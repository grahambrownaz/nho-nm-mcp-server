/**
 * Tests for run_local_audit tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { AuthorizationError } from '../../../../src/utils/errors.js';

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    swotspotConfig: {
      findUnique: vi.fn(),
    },
    swotspotAudit: {
      create: vi.fn(),
    },
  },
}));

// Mock encryption
vi.mock('../../../../src/services/encryption.js', () => ({
  decrypt: vi.fn((val: string) => val.replace('encrypted:', '')),
}));

// Mock SWOTSPOT client
vi.mock('../../../../src/services/swotspot/client.js', () => ({
  SwotspotClient: vi.fn().mockImplementation(() => ({})),
}));

// Mock audits service
vi.mock('../../../../src/services/swotspot/audits.js', () => ({
  runAudit: vi.fn().mockResolvedValue({
    id: 'audit-mock-123',
    business_name: 'Test HVAC Co',
    location: 'Phoenix, AZ',
    generated_at: new Date().toISOString(),
    overall_score: 62,
    strengths: [{ area: 'Google Business Profile', score: 78, detail: 'Profile is claimed' }],
    weaknesses: [{ area: 'Citations', score: 45, detail: 'Missing directories', recommendation: 'Submit to top directories' }],
    opportunities: [{ area: 'Reviews', detail: 'Competitors have more reviews', potential_impact: 'high' }],
    threats: [{ area: 'Competition', detail: 'New competitors entering market', risk_level: 'medium' }],
    categories: {
      google_business_profile: { score: 78, details: {} },
      citations: { score: 45, found: 28, missing: 12, inconsistent: 5, details: {} },
      reviews: { score: 71, average_rating: 4.3, total_reviews: 87, platforms: { google: 52 }, details: {} },
      local_rankings: { score: 38, keywords_tracked: 15, top3_count: 1, top10_count: 3, details: {} },
    },
  }),
}));

import { executeRunLocalAudit } from '../../../../src/tools/swotspot/run-local-audit.js';
import { prisma } from '../../../../src/db/client.js';

const mockConfig = {
  id: 'config-123',
  tenantId: 'test-tenant-id',
  apiKey: 'encrypted:test-api-key',
  accountId: 'acct-123',
  lastTestAt: new Date(),
  lastTestSuccess: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

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

describe('run_local_audit tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.swotspotConfig.findUnique).mockResolvedValue(mockConfig as never);
    vi.mocked(prisma.swotspotAudit.create).mockResolvedValue({
      id: 'stored-audit-id',
      tenantId: 'test-tenant-id',
      businessName: 'Test HVAC Co',
      address: '123 Main St',
      city: 'Phoenix',
      state: 'AZ',
      zip: '85001',
      industry: 'hvac',
      externalAuditId: 'audit-mock-123',
      overallScore: 62,
      reportData: {},
      status: 'COMPLETED',
      completedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
  });

  describe('running an audit', () => {
    it('returns SWOT report for valid input', async () => {
      const context = createTestContext();
      const input = {
        business_name: 'Test HVAC Co',
        address: '123 Main St',
        city: 'Phoenix',
        state: 'AZ',
        zip: '85001',
        industry: 'hvac',
      };

      const result = await executeRunLocalAudit(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.audit_id).toBe('stored-audit-id');
      expect(result.data?.report).toBeDefined();
    });

    it('returns all SWOT sections', async () => {
      const context = createTestContext();
      const input = {
        business_name: 'Test HVAC Co',
        address: '123 Main St',
        city: 'Phoenix',
        state: 'AZ',
      };

      const result = await executeRunLocalAudit(input, context);
      const report = result.data?.report;

      expect(report?.strengths).toBeDefined();
      expect(report?.weaknesses).toBeDefined();
      expect(report?.opportunities).toBeDefined();
      expect(report?.threats).toBeDefined();
    });

    it('returns category scores', async () => {
      const context = createTestContext();
      const input = {
        business_name: 'Test HVAC Co',
        address: '123 Main St',
        city: 'Phoenix',
        state: 'AZ',
      };

      const result = await executeRunLocalAudit(input, context);
      const categories = result.data?.report?.categories;

      expect(categories?.google_business_profile.score).toBeDefined();
      expect(categories?.citations.score).toBeDefined();
      expect(categories?.reviews.score).toBeDefined();
      expect(categories?.local_rankings.score).toBeDefined();
    });

    it('stores audit in database', async () => {
      const context = createTestContext();
      const input = {
        business_name: 'Test HVAC Co',
        address: '123 Main St',
        city: 'Phoenix',
        state: 'AZ',
      };

      await executeRunLocalAudit(input, context);

      expect(prisma.swotspotAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'test-tenant-id',
            businessName: 'Test HVAC Co',
            status: 'COMPLETED',
          }),
        })
      );
    });
  });

  describe('config required', () => {
    it('throws NotFoundError when config is missing', async () => {
      vi.mocked(prisma.swotspotConfig.findUnique).mockResolvedValue(null);

      const context = createTestContext();
      const input = {
        business_name: 'Test Co',
        address: '123 Main St',
        city: 'Phoenix',
        state: 'AZ',
      };

      await expect(executeRunLocalAudit(input, context)).rejects.toThrow('SWOTSPOT configuration');
    });
  });

  describe('input validation', () => {
    it('throws error for missing business_name', async () => {
      const context = createTestContext();
      const input = {
        address: '123 Main St',
        city: 'Phoenix',
        state: 'AZ',
      };

      await expect(executeRunLocalAudit(input, context)).rejects.toThrow();
    });

    it('throws error for missing address', async () => {
      const context = createTestContext();
      const input = {
        business_name: 'Test Co',
        city: 'Phoenix',
        state: 'AZ',
      };

      await expect(executeRunLocalAudit(input, context)).rejects.toThrow();
    });

    it('throws error for invalid state code', async () => {
      const context = createTestContext();
      const input = {
        business_name: 'Test Co',
        address: '123 Main St',
        city: 'Phoenix',
        state: 'XX',
      };

      await expect(executeRunLocalAudit(input, context)).rejects.toThrow();
    });

    it('throws error for state code not 2 characters', async () => {
      const context = createTestContext();
      const input = {
        business_name: 'Test Co',
        address: '123 Main St',
        city: 'Phoenix',
        state: 'Arizona',
      };

      await expect(executeRunLocalAudit(input, context)).rejects.toThrow();
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing swotspot:write permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {
        business_name: 'Test Co',
        address: '123 Main St',
        city: 'Phoenix',
        state: 'AZ',
      };

      await expect(executeRunLocalAudit(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with swotspot:write permission', async () => {
      const context = createTestContext({
        permissions: ['swotspot:write'],
      });
      const input = {
        business_name: 'Test Co',
        address: '123 Main St',
        city: 'Phoenix',
        state: 'AZ',
      };

      const result = await executeRunLocalAudit(input, context);
      expect(result.success).toBe(true);
    });
  });
});
