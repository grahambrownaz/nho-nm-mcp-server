/**
 * Run Local Audit Tool
 * Runs a SWOT analysis on a local business
 */

import { z } from 'zod';
import { validateInput } from '../../utils/validation.js';
import { requirePermission, type TenantContext } from '../../utils/auth.js';
import { NotFoundError } from '../../utils/errors.js';
import { decrypt } from '../../services/encryption.js';
import { SwotspotClient } from '../../services/swotspot/client.js';
import { runAudit, type AuditReport } from '../../services/swotspot/audits.js';
import { prisma } from '../../db/client.js';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
] as const;

const RunLocalAuditSchema = z.object({
  business_name: z.string().min(1, 'Business name is required'),
  address: z.string().min(1, 'Address is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().length(2, 'State must be a 2-letter code').refine(
    (val) => US_STATES.includes(val.toUpperCase() as typeof US_STATES[number]),
    { message: 'Invalid US state code' }
  ),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code').optional(),
  industry: z.string().optional(),
});

export const runLocalAuditTool = {
  name: 'run_local_audit',
  description: `Run a SWOT analysis on a local business to assess its online presence.

Analyzes four key areas:
- Google Business Profile (optimization, completeness, activity)
- Citations (directory listings, consistency, coverage)
- Reviews (volume, ratings, response rate across platforms)
- Local Rankings (keyword positions, "near me" visibility)

Returns strengths, weaknesses, opportunities, and threats with actionable recommendations.

Requires configure_swotspot to be run first.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      business_name: {
        type: 'string',
        description: 'Name of the business to audit',
      },
      address: {
        type: 'string',
        description: 'Street address of the business',
      },
      city: {
        type: 'string',
        description: 'City',
      },
      state: {
        type: 'string',
        description: '2-letter US state code (e.g., CA, NY, TX)',
      },
      zip: {
        type: 'string',
        description: 'ZIP code (optional)',
      },
      industry: {
        type: 'string',
        description: 'Business industry for tailored analysis (e.g., hvac, realtor, insurance)',
      },
    },
    required: ['business_name', 'address', 'city', 'state'],
  },
};

export async function executeRunLocalAudit(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    audit_id: string;
    report: AuditReport;
  };
  error?: string;
}> {
  const params = validateInput(RunLocalAuditSchema, input);
  requirePermission(context, 'swotspot:write');

  // Get SWOTSPOT config
  const config = await prisma.swotspotConfig.findUnique({
    where: { tenantId: context.tenant.id },
  });

  if (!config) {
    throw new NotFoundError('SWOTSPOT configuration. Run configure_swotspot first');
  }

  // Decrypt and create client
  const apiKey = decrypt(config.apiKey);
  const client = new SwotspotClient({
    apiKey,
    ...(config.accountId ? {} : {}),
  });

  // Run the audit
  const report = await runAudit(client, {
    businessName: params.business_name,
    address: params.address,
    city: params.city,
    state: params.state.toUpperCase(),
    zip: params.zip,
    industry: params.industry,
  });

  // Store in database
  const audit = await prisma.swotspotAudit.create({
    data: {
      tenantId: context.tenant.id,
      businessName: params.business_name,
      address: params.address,
      city: params.city,
      state: params.state.toUpperCase(),
      zip: params.zip || null,
      industry: params.industry || null,
      externalAuditId: report.id,
      overallScore: report.overall_score,
      reportData: JSON.parse(JSON.stringify(report)),
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  });

  return {
    success: true,
    data: {
      audit_id: audit.id,
      report,
    },
  };
}
