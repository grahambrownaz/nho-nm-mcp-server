/**
 * Track Competitor Tool
 * Start monitoring a competitor's local presence
 */

import { z } from 'zod';
import { validateInput } from '../../utils/validation.js';
import { requirePermission, type TenantContext } from '../../utils/auth.js';
import { NotFoundError } from '../../utils/errors.js';
import { decrypt } from '../../services/encryption.js';
import { SwotspotClient } from '../../services/swotspot/client.js';
import { trackCompetitor, getCompetitorReport, type CompetitorReport } from '../../services/swotspot/competitors.js';
import { prisma } from '../../db/client.js';

const TrackCompetitorSchema = z.object({
  audit_id: z.string().uuid('audit_id must be a valid UUID'),
  competitor_name: z.string().min(1, 'Competitor name is required'),
  competitor_location: z.string().min(1, 'Competitor location is required (e.g., "Phoenix, AZ")'),
});

export const trackCompetitorTool = {
  name: 'track_competitor',
  description: `Start monitoring a competitor's local presence and compare it to your business.

Provides a side-by-side comparison of Google Business Profile, citations,
reviews, and local rankings with actionable insights on how to gain an advantage.

Requires an existing audit_id from run_local_audit to compare against.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      audit_id: {
        type: 'string',
        description: 'Your business audit ID (from run_local_audit) to compare against',
      },
      competitor_name: {
        type: 'string',
        description: 'Name of the competitor business',
      },
      competitor_location: {
        type: 'string',
        description: 'Competitor location (e.g., "Phoenix, AZ" or full address)',
      },
    },
    required: ['audit_id', 'competitor_name', 'competitor_location'],
  },
};

export async function executeTrackCompetitor(
  input: unknown,
  context: TenantContext
): Promise<{
  success: boolean;
  data?: {
    competitor_id: string;
    report: CompetitorReport;
  };
  error?: string;
}> {
  const params = validateInput(TrackCompetitorSchema, input);
  requirePermission(context, 'swotspot:write');

  // Verify audit belongs to this tenant
  const audit = await prisma.swotspotAudit.findFirst({
    where: {
      id: params.audit_id,
      tenantId: context.tenant.id,
    },
  });

  if (!audit) {
    throw new NotFoundError('Audit', params.audit_id);
  }

  // Get SWOTSPOT config
  const config = await prisma.swotspotConfig.findUnique({
    where: { tenantId: context.tenant.id },
  });

  if (!config) {
    throw new NotFoundError('SWOTSPOT configuration. Run configure_swotspot first');
  }

  // Decrypt and create client
  const apiKey = decrypt(config.apiKey);
  const client = new SwotspotClient({ apiKey });

  // Track the competitor
  const tracking = await trackCompetitor(client, {
    businessName: params.competitor_name,
    location: params.competitor_location,
    yourAuditId: audit.externalAuditId || audit.id,
  });

  // Get comparison report
  const report = await getCompetitorReport(
    client,
    tracking.id,
    audit.businessName,
    params.competitor_name,
    params.competitor_location
  );

  // Store in database
  const competitor = await prisma.swotspotCompetitor.create({
    data: {
      tenantId: context.tenant.id,
      auditId: audit.id,
      businessName: params.competitor_name,
      location: params.competitor_location,
      externalTrackingId: tracking.id,
      lastReportData: JSON.parse(JSON.stringify(report)),
      isActive: true,
    },
  });

  return {
    success: true,
    data: {
      competitor_id: competitor.id,
      report,
    },
  };
}
