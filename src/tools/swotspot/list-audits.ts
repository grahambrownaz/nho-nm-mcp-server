/**
 * List Audits Tool
 * Lists SWOTSPOT audits for the tenant
 */

import { z } from 'zod';
import { validateInput } from '../../utils/validation.js';
import { requirePermission, type TenantContext } from '../../utils/auth.js';
import { prisma } from '../../db/client.js';

const ListAuditsSchema = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

export const listAuditsTool = {
  name: 'list_audits',
  description: `List your previous SWOTSPOT local business audits.

Returns audit summaries with overall scores and status. Filter by status and paginate results.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      status: {
        type: 'string',
        enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
        description: 'Filter by audit status (optional)',
      },
      limit: {
        type: 'number',
        description: 'Number of results to return (default: 20, max: 100)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default: 0)',
      },
    },
  },
};

export async function executeListAudits(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    audits: Array<{
      id: string;
      business_name: string;
      location: string;
      overall_score: number | null;
      status: string;
      industry: string | null;
      created_at: string;
      completed_at: string | null;
    }>;
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}> {
  const params = validateInput(ListAuditsSchema, input);
  requirePermission(context, 'swotspot:read');

  const limit = params.limit ?? 20;
  const offset = params.offset ?? 0;

  const where: Record<string, unknown> = {
    tenantId: context.tenant.id,
  };

  if (params.status) {
    where.status = params.status;
  }

  const [audits, total] = await Promise.all([
    prisma.swotspotAudit.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.swotspotAudit.count({ where }),
  ]);

  const formattedAudits = audits.map((a: {
    id: string;
    businessName: string;
    city: string;
    state: string;
    overallScore: number | null;
    status: string;
    industry: string | null;
    createdAt: Date;
    completedAt: Date | null;
  }) => ({
    id: a.id,
    business_name: a.businessName,
    location: `${a.city}, ${a.state}`,
    overall_score: a.overallScore,
    status: a.status,
    industry: a.industry,
    created_at: a.createdAt.toISOString(),
    completed_at: a.completedAt?.toISOString() || null,
  }));

  return {
    success: true,
    data: {
      audits: formattedAudits,
      total,
      limit,
      offset,
      has_more: offset + limit < total,
    },
  };
}
