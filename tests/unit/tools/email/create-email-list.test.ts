/**
 * Tests for create_email_list tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { AuthorizationError } from '../../../../src/utils/errors.js';

// Mock Prisma client
vi.mock('../../../../src/db/client.js', () => ({
  prisma: {
    emailConfig: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock encryption
vi.mock('../../../../src/services/encryption.js', () => ({
  decrypt: vi.fn((val: string) => val.replace('encrypted:', '')),
}));

// Mock ReachMail client
vi.mock('../../../../src/services/reachmail/client.js', () => ({
  ReachMailClient: vi.fn().mockImplementation(() => ({})),
}));

// Mock ReachMail lists service
vi.mock('../../../../src/services/reachmail/lists.js', () => ({
  createList: vi.fn().mockResolvedValue({ Id: 'list-rm-123' }),
  importRecipients: vi.fn().mockResolvedValue({
    ImportedCount: 95,
    DuplicateCount: 3,
    InvalidCount: 2,
  }),
  toReachMailRecipients: vi.fn((records: any[]) => records),
}));

// Import after mocks
import { executeCreateEmailList } from '../../../../src/tools/email/create-email-list.js';
import { prisma } from '../../../../src/db/client.js';
import { createList, importRecipients } from '../../../../src/services/reachmail/lists.js';

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

describe('create_email_list tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(prisma.emailConfig.findUnique).mockResolvedValue({
      id: 'config-123',
      tenantId: 'test-tenant-id',
      reachmailToken: 'encrypted:test-token',
      reachmailAccountId: 'acct-123',
      defaultFromAddress: 'send@example.com',
      defaultReplyTo: null,
      physicalAddress: '123 Main St',
      dkimDomain: null,
      isVerified: true,
      lastTestAt: new Date(),
      lastTestSuccess: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
  });

  describe('successful list creation', () => {
    it('creates a list and imports recipients', async () => {
      const context = createTestContext();
      const input = {
        name: 'My Test List',
        records: [
          { email: 'user1@example.com', firstName: 'John', lastName: 'Doe' },
          { email: 'user2@example.com', firstName: 'Jane', lastName: 'Smith' },
        ],
      };

      const result = await executeCreateEmailList(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.list_id).toBe('list-rm-123');
      expect(result.data?.list_name).toBe('My Test List');
      expect(result.data?.total_records).toBe(2);
      expect(result.data?.imported).toBe(95);
      expect(result.data?.duplicates).toBe(3);
      expect(result.data?.invalid).toBe(2);
    });

    it('calls createList with correct name', async () => {
      const context = createTestContext();
      const input = {
        name: 'Campaign List',
        records: [{ email: 'user@example.com' }],
      };

      await executeCreateEmailList(input, context);

      expect(createList).toHaveBeenCalledWith(expect.anything(), 'Campaign List');
    });

    it('calls importRecipients with the created list ID', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test List',
        records: [{ email: 'user@example.com' }],
      };

      await executeCreateEmailList(input, context);

      expect(importRecipients).toHaveBeenCalledWith(
        expect.anything(),
        'list-rm-123',
        expect.any(Array)
      );
    });
  });

  describe('email config required', () => {
    it('throws NotFoundError when no email config exists', async () => {
      vi.mocked(prisma.emailConfig.findUnique).mockResolvedValue(null);

      const context = createTestContext();
      const input = {
        name: 'My List',
        records: [{ email: 'user@example.com' }],
      };

      await expect(executeCreateEmailList(input, context)).rejects.toThrow('Email configuration');
    });
  });

  describe('input validation', () => {
    it('throws error for missing list name', async () => {
      const context = createTestContext();
      const input = {
        records: [{ email: 'user@example.com' }],
      };

      await expect(executeCreateEmailList(input, context)).rejects.toThrow();
    });

    it('throws error for empty records array', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test List',
        records: [],
      };

      await expect(executeCreateEmailList(input, context)).rejects.toThrow();
    });

    it('throws error for invalid email in records', async () => {
      const context = createTestContext();
      const input = {
        name: 'Test List',
        records: [{ email: 'not-an-email' }],
      };

      await expect(executeCreateEmailList(input, context)).rejects.toThrow();
    });
  });

  describe('permission checks', () => {
    it('throws AuthorizationError when missing email:write permission', async () => {
      const context = createTestContext({
        permissions: ['data:read'],
      });
      const input = {
        name: 'Test List',
        records: [{ email: 'user@example.com' }],
      };

      await expect(executeCreateEmailList(input, context)).rejects.toThrow(AuthorizationError);
    });
  });
});
