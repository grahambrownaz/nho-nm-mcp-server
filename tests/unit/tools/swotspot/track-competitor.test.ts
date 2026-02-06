/**
 * Tests for track_competitor tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { AuthorizationError } from '../../../../src/utils/errors.js';

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    swotspotAudit: {
      findFirst: vi.fn(),
    },
    swotspotConfig: {
      findUnique: vi.fn(),
    },
    swotspotCompetitor: {
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

// Mock competitors service
vi.mock('../../../../src/services/swotspot/competitors.js', () => ({
  trackCompetitor: vi.fn().mockResolvedValue({
    id: 'comp-track-123',
    competitor_name: 'Rival HVAC',
    competitor_location: 'Phoenix, AZ',
    your_audit_id: '550e8400-e29b-41d4-a716-446655440000',
    created_at: new Date().toISOString(),
  }),
  getCompetitorReport: vi.fn().mockResolvedValue({
    tracking_id: 'comp-track-123',
    your_business: { name: 'My HVAC', overall_score: 62 },
    competitor: { name: 'Rival HVAC', location: 'Phoenix, AZ', overall_score: 71 },
    comparison: {
      google_business_profile: { you: 78, them: 82, advantage: 'competitor' },
      citations: { you: 45, them: 55, advantage: 'competitor' },
      reviews: { you: 71, them: 68, advantage: 'you' },
      local_rankings: { you: 38, them: 52, advantage: 'competitor' },
    },
    insights: [{ area: 'Citations', insight: 'Competitor has more listings', action: 'Submit to directories' }],
    generated_at: new Date().toISOString(),
  }),
}));

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

import { executeTrackCompetitor } from '../../../../src/tools/swotspot/track-competitor.js';
import { prisma } from '../../../../src/db/client.js';

const mockAudit = {
  id: VALID_UUID,
  tenantId: 'test-tenant-id',
  businessName: 'My HVAC',
  externalAuditId: 'ext-audit-123',
  city: 'Phoenix',
  state: 'AZ',
};

const mockConfig = {
  id: 'config-123',
  tenantId: 'test-tenant-id',
  apiKey: 'encrypted:test-api-key',
  accountId: 'acct-123',
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

describe('track_competitor tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.swotspotAudit.findFirst).mockResolvedValue(mockAudit as never);
    vi.mocked(prisma.swotspotConfig.findUnique).mockResolvedValue(mockConfig as never);
    vi.mocked(prisma.swotspotCompetitor.create).mockResolvedValue({
      id: 'stored-competitor-id',
      tenantId: 'test-tenant-id',
      auditId: VALID_UUID,
      businessName: 'Rival HVAC',
      location: 'Phoenix, AZ',
      externalTrackingId: 'comp-track-123',
      lastReportData: {},
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
  });

  describe('tracking a competitor', () => {
    it('creates competitor tracking with comparison report', async () => {
      const context = createTestContext();
      const input = {
        audit_id: VALID_UUID,
        competitor_name: 'Rival HVAC',
        competitor_location: 'Phoenix, AZ',
      };

      const result = await executeTrackCompetitor(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.competitor_id).toBe('stored-competitor-id');
      expect(result.data?.report).toBeDefined();
    });

    it('returns comparison data', async () => {
      const context = createTestContext();
      const input = {
        audit_id: VALID_UUID,
        competitor_name: 'Rival HVAC',
        competitor_location: 'Phoenix, AZ',
      };

      const result = await executeTrackCompetitor(input, context);
      const report = result.data?.report;

      expect(report?.comparison).toBeDefined();
      expect(report?.comparison.google_business_profile).toBeDefined();
      expect(report?.comparison.reviews).toBeDefined();
      expect(report?.insights).toBeDefined();
      expect(report?.insights.length).toBeGreaterThan(0);
    });

    it('stores competitor in database', async () => {
      const context = createTestContext();
      const input = {
        audit_id: VALID_UUID,
        competitor_name: 'Rival HVAC',
        competitor_location: 'Phoenix, AZ',
      };

      await executeTrackCompetitor(input, context);

      expect(prisma.swotspotCompetitor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'test-tenant-id',
            auditId: VALID_UUID,
            businessName: 'Rival HVAC',
          }),
        })
      );
    });
  });

  describe('audit validation', () => {
    it('throws NotFoundError when audit does not exist', async () => {
      vi.mocked(prisma.swotspotAudit.findFirst).mockResolvedValue(null);

      const context = createTestContext();
      const input = {
        audit_id: VALID_UUID,
        competitor_name: 'Rival HVAC',
        competitor_location: 'Phoenix, AZ',
      };

      await expect(executeTrackCompetitor(input, context)).rejects.toThrow('Audit');
    });

    it('throws NotFoundError when config is missing', async () => {
      vi.mocked(prisma.swotspotConfig.findUnique).mockResolvedValue(null);

      const context = createTestContext();
      const input = {
        audit_id: VALID_UUID,
        competitor_name: 'Rival HVAC',
        competitor_location: 'Phoenix, AZ',
      };

      await expect(executeTrackCompetitor(input, context)).rejects.toThrow('SWOTSPOT configuration');
    });
  });

  describe('input validation', () => {
    it('throws error for invalid audit_id format', async () => {
      const context = createTestContext();
      const input = {
        audit_id: 'not-a-uuid',
        competitor_name: 'Rival HVAC',
        competitor_location: 'Phoenix, AZ',
      };

      await expect(executeTrackCompetitor(input, context)).rejects.toThrow();
    });

    it('throws error for missing competitor_name', async () => {
      const context = createTestContext();
      const input = {
        audit_id: VALID_UUID,
        competitor_location: 'Phoenix, AZ',
      };

      await expect(executeTrackCompetitor(input, context)).rejects.toThrow();
    });

    it('throws error for empty competitor_location', async () => {
      const context = createTestContext();
      const input = {
        audit_id: VALID_UUID,
        competitor_name: 'Rival HVAC',
        competitor_location: '',
      };

      await expect(executeTrackCompetitor(input, context)).rejects.toThrow();
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing swotspot:write permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {
        audit_id: VALID_UUID,
        competitor_name: 'Rival HVAC',
        competitor_location: 'Phoenix, AZ',
      };

      await expect(executeTrackCompetitor(input, context)).rejects.toThrow(AuthorizationError);
    });

    it('allows access with swotspot:write permission', async () => {
      const context = createTestContext({
        permissions: ['swotspot:write'],
      });
      const input = {
        audit_id: VALID_UUID,
        competitor_name: 'Rival HVAC',
        competitor_location: 'Phoenix, AZ',
      };

      const result = await executeTrackCompetitor(input, context);
      expect(result.success).toBe(true);
    });
  });
});
