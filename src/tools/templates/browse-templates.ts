/**
 * Tool: browse_templates
 * Browse available postcard templates
 */

import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { validateInput } from '../../utils/validation.js';
import { requirePermission, type TenantContext } from '../../utils/auth.js';

/**
 * Input schema for browse_templates
 */
const BrowseTemplatesInputSchema = z.object({
  category: z.enum([
    'realtor', 'hvac', 'insurance', 'landscaping',
    'home_services', 'retail', 'general', 'custom', 'all',
  ]).default('all'),
  size: z.enum(['4x6', '6x9', '6x11', 'all']).default('all'),
  include_public: z.boolean().default(true),
  include_private: z.boolean().default(true),
  search: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
}).optional();

export type BrowseTemplatesInput = z.infer<typeof BrowseTemplatesInputSchema>;

/**
 * Tool definition for MCP server registration
 */
export const browseTemplatesTool = {
  name: 'browse_templates',
  description: `Browse available postcard templates.

Filter options:
- category: Filter by category (realtor, hvac, insurance, landscaping, home_services, retail, general, custom, all)
- size: Filter by size (4x6, 6x9, 6x11, all)
- include_public: Include public templates (default: true)
- include_private: Include your private templates (default: true)
- search: Search by name or description
- limit/offset: Pagination

Returns template summaries with preview info.`,

  inputSchema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['realtor', 'hvac', 'insurance', 'landscaping', 'home_services', 'retail', 'general', 'custom', 'all'],
        description: 'Filter by category',
      },
      size: {
        type: 'string',
        enum: ['4x6', '6x9', '6x11', 'all'],
        description: 'Filter by postcard size',
      },
      include_public: {
        type: 'boolean',
        description: 'Include public templates',
      },
      include_private: {
        type: 'boolean',
        description: 'Include your private templates',
      },
      search: {
        type: 'string',
        description: 'Search by name or description',
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return',
      },
      offset: {
        type: 'number',
        description: 'Number of results to skip',
      },
    },
  },
};

/**
 * Map size string to enum
 */
function mapSizeToEnum(size: string): string {
  const map: Record<string, string> = {
    '4x6': 'SIZE_4X6',
    '6x9': 'SIZE_6X9',
    '6x11': 'SIZE_6X11',
  };
  return map[size] || size;
}

/**
 * Map category string to enum
 */
function mapCategoryToEnum(category: string): string {
  return category.toUpperCase().replace('_', '_');
}

/**
 * Map enum to display string
 */
function mapSizeToDisplay(size: string): string {
  const map: Record<string, string> = {
    SIZE_4X6: '4x6',
    SIZE_6X9: '6x9',
    SIZE_6X11: '6x11',
  };
  return map[size] || size;
}

/**
 * Execute the browse_templates tool
 */
export async function executeBrowseTemplates(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    templates: Array<{
      id: string;
      name: string;
      description: string | null;
      category: string;
      size: string;
      mergeFields: string[];
      isPublic: boolean;
      isOwned: boolean;
      thumbnailUrl: string | null;
      createdAt: string;
      usageCount: number;
    }>;
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
    categories: Array<{
      name: string;
      count: number;
    }>;
  };
  error?: string;
}> {
  // Validate input
  const params = validateInput(BrowseTemplatesInputSchema, input) || {};

  // Check permissions
  requirePermission(context, 'template:read');

  const category = params.category || 'all';
  const size = params.size || 'all';
  const includePublic = params.include_public ?? true;
  const includePrivate = params.include_private ?? true;
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  // Build OR conditions for visibility
  const orConditions: Array<Record<string, unknown>> = [];

  if (includePublic) {
    orConditions.push({ isPublic: true });
  }

  if (includePrivate) {
    orConditions.push({ tenantId: context.tenant.id });
  }

  if (orConditions.length === 0) {
    return {
      success: true,
      data: {
        templates: [],
        pagination: { total: 0, limit, offset, hasMore: false },
        categories: [],
      },
    };
  }

  // Build where clause
  const where: Record<string, unknown> = {
    isActive: true,
    OR: orConditions,
  };

  // Category filter
  if (category !== 'all') {
    where.category = mapCategoryToEnum(category);
  }

  // Size filter
  if (size !== 'all') {
    where.size = mapSizeToEnum(size);
  }

  // Search filter
  if (params.search) {
    where.AND = [
      {
        OR: [
          { name: { contains: params.search, mode: 'insensitive' } },
          { description: { contains: params.search, mode: 'insensitive' } },
        ],
      },
    ];
  }

  // Fetch templates
  const [templates, total] = await Promise.all([
    prisma.template.findMany({
      where,
      orderBy: [
        { isPublic: 'desc' }, // Public templates first
        { createdAt: 'desc' },
      ],
      take: limit,
      skip: offset,
      include: {
        _count: {
          select: { dataSubscriptions: true },
        },
      },
    }),
    prisma.template.count({ where }),
  ]);

  // Get category counts
  const categoryCountsRaw = await prisma.template.groupBy({
    by: ['category'],
    where: {
      isActive: true,
      OR: orConditions,
    },
    _count: { category: true },
  });

  const categoryCounts = categoryCountsRaw.map((c) => ({
    name: c.category.toLowerCase(),
    count: c._count.category,
  }));

  return {
    success: true,
    data: {
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category.toLowerCase(),
        size: mapSizeToDisplay(t.size),
        mergeFields: t.mergeFields,
        isPublic: t.isPublic,
        isOwned: t.tenantId === context.tenant.id,
        thumbnailUrl: t.thumbnailUrl,
        createdAt: t.createdAt.toISOString(),
        usageCount: t._count.dataSubscriptions,
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + templates.length < total,
      },
      categories: categoryCounts,
    },
  };
}
