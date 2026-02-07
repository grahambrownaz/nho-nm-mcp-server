/**
 * Get Recommendations Tool
 * Onboarding/discovery tool that returns tailored recommendations
 * based on the user's business type, industry, role, and goals
 */

import { z } from 'zod';
import { validateInput } from '../../utils/validation.js';
import type { TenantContext } from '../../utils/auth.js';

// ============================================================================
// Input Schema
// ============================================================================

/**
 * Business Type — the first and most important question.
 * This fundamentally changes the experience:
 * - end_user: "I run a business and want leads for myself"
 * - print_company: "I'm a printer and want to offer data+print to my clients"
 * - agency: "I manage marketing for multiple clients"
 * - tech_developer: "I'm building software and want to integrate data"
 * - reseller: "I want to white-label and resell data services"
 */
const BusinessTypeEnum = z.enum([
  'end_user',
  'print_company',
  'agency',
  'tech_developer',
  'reseller',
]);

const IndustryEnum = z.enum([
  'realtor', 'hvac', 'insurance', 'landscaping',
  'home_services', 'retail', 'marketing_agency',
  'financial_services', 'solar', 'roofing',
  'pest_control', 'plumbing', 'dental',
  'other',
]);

const GoalEnum = z.enum([
  'find_new_customers', 'direct_mail', 'email_campaigns',
  'data_enrichment', 'crm_sync', 'intent_data',
  'automated_delivery', 'offer_data_to_clients',
  'api_integration', 'white_label',
]);

const GetRecommendationsSchema = z.object({
  business_type: BusinessTypeEnum,
  industry: IndustryEnum.optional(),
  goals: z.array(GoalEnum).min(1),
  include_examples: z.boolean().default(true),
});

type BusinessType = z.infer<typeof BusinessTypeEnum>;
type Industry = z.infer<typeof IndustryEnum>;
type Goal = z.infer<typeof GoalEnum>;

// ============================================================================
// Tool Definition
// ============================================================================

export const getRecommendationsTool = {
  name: 'get_recommendations',
  description: `Discover what you can do with this platform based on your business profile.

IMPORTANT: Before calling this tool, ask the user these 3 questions:

1. What best describes you?
   Options: end_user ("I want leads/data for my own business"), print_company ("I'm a print/mail company"), agency ("I'm a marketing agency"), tech_developer ("I'm building software/integrations"), reseller ("I want to white-label/resell data")

2. What industry are you in? (for end_user) OR What industries do your clients serve? (for agency/print_company)
   Options: realtor, hvac, insurance, landscaping, home_services, retail, financial_services, solar, roofing, pest_control, plumbing, dental, other

3. What are your main goals? (pick all that apply)
   Options: find_new_customers, direct_mail, email_campaigns, data_enrichment, crm_sync, intent_data, automated_delivery, offer_data_to_clients, api_integration, white_label

Then call this tool with their answers to get tailored recommendations, workflows, and next steps.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      business_type: {
        type: 'string',
        enum: ['end_user', 'print_company', 'agency', 'tech_developer', 'reseller'],
        description: 'What type of business/user is this? This is the most important question.',
      },
      industry: {
        type: 'string',
        enum: ['realtor', 'hvac', 'insurance', 'landscaping', 'home_services', 'retail', 'marketing_agency', 'financial_services', 'solar', 'roofing', 'pest_control', 'plumbing', 'dental', 'other'],
        description: 'Industry vertical (for end users) or primary client industry (for agencies/printers). Optional for tech_developer and reseller.',
      },
      goals: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['find_new_customers', 'direct_mail', 'email_campaigns', 'data_enrichment', 'crm_sync', 'intent_data', 'automated_delivery', 'offer_data_to_clients', 'api_integration', 'white_label'],
        },
        description: 'User\'s primary goals (one or more)',
      },
      include_examples: {
        type: 'boolean',
        description: 'Include step-by-step workflow examples (default: true)',
      },
    },
    required: ['business_type', 'goals'],
  },
};

// ============================================================================
// Workflow Definitions
// ============================================================================

interface WorkflowStep {
  step: number;
  tool: string;
  action: string;
}

interface WorkflowDef {
  name: string;
  description: string;
  applicable_business_types: BusinessType[];
  applicable_industries: Industry[];
  applicable_goals: Goal[];
  steps: WorkflowStep[];
  estimated_time: string;
}

const WORKFLOWS: Record<string, WorkflowDef> = {
  new_homeowner_postcards: {
    name: 'New Homeowner Direct Mail Campaign',
    description: 'Find recent home buyers in your area and send them personalized postcards promoting your services',
    applicable_business_types: ['end_user', 'agency'],
    applicable_industries: ['realtor', 'hvac', 'insurance', 'landscaping', 'home_services', 'financial_services', 'solar', 'roofing', 'pest_control', 'plumbing', 'dental', 'other'],
    applicable_goals: ['find_new_customers', 'direct_mail'],
    steps: [
      { step: 1, tool: 'preview_count', action: 'Check how many new homeowners are in your target area' },
      { step: 2, tool: 'get_sample_data', action: 'Preview sample records to verify data quality' },
      { step: 3, tool: 'browse_templates', action: 'Choose a postcard template for your industry' },
      { step: 4, tool: 'search_data', action: 'Pull the full list of new homeowner records' },
      { step: 5, tool: 'generate_postcard_pdf', action: 'Generate personalized postcards from your template' },
      { step: 6, tool: 'configure_delivery', action: 'Set up delivery to your printer via SFTP or print API' },
    ],
    estimated_time: '10 minutes',
  },
  new_mover_outreach: {
    name: 'New Mover Welcome Campaign',
    description: 'Reach people who just moved into your service area with a welcome offer',
    applicable_business_types: ['end_user', 'agency'],
    applicable_industries: ['realtor', 'hvac', 'insurance', 'landscaping', 'home_services', 'retail', 'solar', 'roofing', 'pest_control', 'plumbing', 'dental', 'other'],
    applicable_goals: ['find_new_customers', 'direct_mail'],
    steps: [
      { step: 1, tool: 'preview_count', action: 'See how many new movers are in your target ZIP codes' },
      { step: 2, tool: 'search_data', action: 'Pull new mover records with mailing addresses' },
      { step: 3, tool: 'upload_template', action: 'Upload your custom postcard design or choose a template' },
      { step: 4, tool: 'generate_postcard_pdf', action: 'Generate personalized postcards' },
      { step: 5, tool: 'configure_delivery', action: 'Deliver PDFs to your print provider' },
    ],
    estimated_time: '10 minutes',
  },
  email_campaign: {
    name: 'Email Campaign to Purchased Lists',
    description: 'Send email campaigns to purchased email data using ReachMail (most ESPs prohibit purchased lists)',
    applicable_business_types: ['end_user', 'agency'],
    applicable_industries: ['insurance', 'retail', 'marketing_agency', 'financial_services', 'home_services', 'solar', 'roofing', 'other'],
    applicable_goals: ['email_campaigns', 'find_new_customers'],
    steps: [
      { step: 1, tool: 'configure_email_account', action: 'Connect your ReachMail email sending account' },
      { step: 2, tool: 'search_data', action: 'Search for records with email addresses in your target area' },
      { step: 3, tool: 'create_email_campaign', action: 'Create a campaign with your email content and recipients' },
      { step: 4, tool: 'send_email_campaign', action: 'Schedule or send the campaign immediately' },
      { step: 5, tool: 'get_email_analytics', action: 'Track opens, clicks, bounces, and engagement' },
    ],
    estimated_time: '15 minutes',
  },
  recurring_subscription: {
    name: 'Automated Recurring Data Delivery',
    description: 'Set up automatic weekly or monthly delivery of fresh data to your printer or CRM',
    applicable_business_types: ['end_user', 'agency', 'print_company'],
    applicable_industries: ['realtor', 'hvac', 'insurance', 'landscaping', 'home_services', 'marketing_agency', 'financial_services', 'solar', 'roofing', 'pest_control', 'plumbing', 'dental', 'other'],
    applicable_goals: ['automated_delivery', 'find_new_customers', 'direct_mail'],
    steps: [
      { step: 1, tool: 'preview_count', action: 'Estimate how many new records arrive weekly/monthly' },
      { step: 2, tool: 'browse_templates', action: 'Select a postcard template for recurring use' },
      { step: 3, tool: 'configure_delivery', action: 'Set up your SFTP hot folder or print API connection' },
      { step: 4, tool: 'create_subscription', action: 'Create a recurring subscription with your geography and filters' },
      { step: 5, tool: 'delivery_report', action: 'Monitor delivery reports to track volume and performance' },
    ],
    estimated_time: '15 minutes',
  },
  crm_integration: {
    name: 'CRM/Marketing Platform Sync',
    description: 'Push purchased data directly into HubSpot, Mailchimp, or Zapier for follow-up',
    applicable_business_types: ['end_user', 'agency'],
    applicable_industries: ['realtor', 'insurance', 'retail', 'marketing_agency', 'financial_services', 'other'],
    applicable_goals: ['crm_sync', 'data_enrichment', 'find_new_customers'],
    steps: [
      { step: 1, tool: 'configure_platform_connection', action: 'Connect your CRM (HubSpot, Mailchimp, or Zapier)' },
      { step: 2, tool: 'search_data', action: 'Search for records matching your target audience' },
      { step: 3, tool: 'sync_to_platform', action: 'Push records directly to your CRM with field mapping' },
    ],
    estimated_time: '10 minutes',
  },
  intent_data_prospecting: {
    name: 'Intent-Based Prospecting',
    description: 'Find consumers actively searching for services like yours and reach them first',
    applicable_business_types: ['end_user', 'agency'],
    applicable_industries: ['hvac', 'insurance', 'home_services', 'financial_services', 'retail', 'solar', 'roofing', 'pest_control', 'plumbing', 'dental', 'other'],
    applicable_goals: ['intent_data', 'find_new_customers'],
    steps: [
      { step: 1, tool: 'list_intent_categories', action: 'Browse available intent signal categories' },
      { step: 2, tool: 'search_intent_data', action: 'Preview intent signals in your target area' },
      { step: 3, tool: 'create_intent_subscription', action: 'Subscribe to real-time intent signals' },
      { step: 4, tool: 'configure_intent_webhook', action: 'Set up webhook for instant notifications' },
    ],
    estimated_time: '10 minutes',
  },
  one_time_list_purchase: {
    name: 'One-Time Data List Purchase',
    description: 'Buy a targeted consumer or business list for a single campaign',
    applicable_business_types: ['end_user', 'agency', 'print_company'],
    applicable_industries: ['realtor', 'hvac', 'insurance', 'landscaping', 'home_services', 'retail', 'marketing_agency', 'financial_services', 'solar', 'roofing', 'pest_control', 'plumbing', 'dental', 'other'],
    applicable_goals: ['find_new_customers', 'data_enrichment'],
    steps: [
      { step: 1, tool: 'get_filter_options', action: 'See available demographic and geographic filters' },
      { step: 2, tool: 'preview_count', action: 'Check record counts for your target criteria' },
      { step: 3, tool: 'get_pricing', action: 'Get pricing for your desired volume' },
      { step: 4, tool: 'purchase_list', action: 'Purchase the list with a Stripe payment link' },
      { step: 5, tool: 'export_data', action: 'Export your purchased data to CSV, Excel, or JSON' },
    ],
    estimated_time: '5 minutes',
  },
  // --- Print Company Specific ---
  print_data_service: {
    name: 'Data + Print Service for Your Clients',
    description: 'Add new homeowner/mover data as a service to offer your print clients — data arrives automatically, you print and mail',
    applicable_business_types: ['print_company'],
    applicable_industries: ['other'],
    applicable_goals: ['offer_data_to_clients', 'automated_delivery', 'direct_mail'],
    steps: [
      { step: 1, tool: 'get_pricing', action: 'Review volume pricing and calculate your margins' },
      { step: 2, tool: 'preview_count', action: 'Show clients how many prospects are in their area' },
      { step: 3, tool: 'browse_templates', action: 'Set up client-branded postcard templates' },
      { step: 4, tool: 'create_subscription', action: 'Create per-client subscriptions with their geography' },
      { step: 5, tool: 'configure_delivery', action: 'Route data directly to your SFTP hot folder or print queue' },
      { step: 6, tool: 'delivery_report', action: 'Generate per-client reports for billing' },
    ],
    estimated_time: '20 minutes',
  },
  print_sftp_integration: {
    name: 'SFTP Hot Folder Integration',
    description: 'Connect your print production system — data and print-ready PDFs arrive automatically in your hot folder with JDF job tickets',
    applicable_business_types: ['print_company'],
    applicable_industries: ['other'],
    applicable_goals: ['automated_delivery', 'offer_data_to_clients'],
    steps: [
      { step: 1, tool: 'configure_delivery', action: 'Set up SFTP hot folder connection with your print server' },
      { step: 2, tool: 'browse_templates', action: 'Choose or upload postcard templates' },
      { step: 3, tool: 'create_subscription', action: 'Create automated data subscription' },
      { step: 4, tool: 'get_fulfillment_status', action: 'Monitor delivery status and file transfers' },
    ],
    estimated_time: '15 minutes',
  },
  // --- Agency Specific ---
  agency_multi_client: {
    name: 'Multi-Client Campaign Management',
    description: 'Set up and manage data-driven marketing campaigns for multiple clients with separate tracking and billing',
    applicable_business_types: ['agency'],
    applicable_industries: ['marketing_agency', 'other'],
    applicable_goals: ['offer_data_to_clients', 'automated_delivery', 'find_new_customers', 'direct_mail'],
    steps: [
      { step: 1, tool: 'get_pricing', action: 'Review volume-based pricing tiers for your client margins' },
      { step: 2, tool: 'create_subscription', action: 'Create per-client subscriptions with geography filters' },
      { step: 3, tool: 'browse_templates', action: 'Set up client-specific postcard templates' },
      { step: 4, tool: 'configure_delivery', action: 'Configure separate delivery endpoints per client' },
      { step: 5, tool: 'delivery_report', action: 'Generate per-client delivery reports for billing' },
    ],
    estimated_time: '20 minutes',
  },
  // --- Developer Specific ---
  api_integration: {
    name: 'API & Data Integration',
    description: 'Integrate new homeowner/mover data and intent signals into your application via API, webhooks, or platform sync',
    applicable_business_types: ['tech_developer'],
    applicable_industries: ['other'],
    applicable_goals: ['api_integration', 'data_enrichment', 'intent_data'],
    steps: [
      { step: 1, tool: 'get_sample_data', action: 'Pull sample records to understand the data schema' },
      { step: 2, tool: 'get_filter_options', action: 'Explore all available filters and field definitions' },
      { step: 3, tool: 'search_data', action: 'Test a data query with your target criteria' },
      { step: 4, tool: 'configure_intent_webhook', action: 'Set up real-time webhooks for intent signals' },
      { step: 5, tool: 'export_data', action: 'Export data in JSON format for your application' },
    ],
    estimated_time: '15 minutes',
  },
  // --- Reseller Specific ---
  white_label_setup: {
    name: 'White-Label Reseller Setup',
    description: 'Set up white-label data services — resell new homeowner/mover data and postcard campaigns under your own brand',
    applicable_business_types: ['reseller'],
    applicable_industries: ['other'],
    applicable_goals: ['white_label', 'offer_data_to_clients', 'automated_delivery'],
    steps: [
      { step: 1, tool: 'get_pricing', action: 'Review wholesale pricing tiers and calculate reseller margins' },
      { step: 2, tool: 'create_subscription', action: 'Set up per-client subscriptions' },
      { step: 3, tool: 'browse_templates', action: 'Configure client-branded templates' },
      { step: 4, tool: 'configure_delivery', action: 'Set up delivery pipelines per client' },
      { step: 5, tool: 'delivery_report', action: 'Track usage and generate billing reports per client' },
    ],
    estimated_time: '25 minutes',
  },
  // --- Universal ---
  local_business_audit: {
    name: 'Local Business SWOT Audit',
    description: 'Analyze your local search presence with a SWOT audit covering Google Business Profile, citations, reviews, and rankings — then compare against competitors',
    applicable_business_types: ['end_user', 'agency'],
    applicable_industries: ['realtor', 'hvac', 'insurance', 'landscaping', 'home_services', 'retail', 'financial_services', 'solar', 'roofing', 'pest_control', 'plumbing', 'dental', 'other'],
    applicable_goals: ['find_new_customers', 'data_enrichment'],
    steps: [
      { step: 1, tool: 'configure_swotspot', action: 'Connect your SWOTSPOT.ai account' },
      { step: 2, tool: 'run_local_audit', action: 'Run a SWOT analysis on your business location' },
      { step: 3, tool: 'track_competitor', action: 'Compare your presence against a local competitor' },
      { step: 4, tool: 'list_audits', action: 'Review past audits and track improvement over time' },
    ],
    estimated_time: '5 minutes',
  },
};

// ============================================================================
// Tool Category Definitions
// ============================================================================

interface CategoryDef {
  category: string;
  description: string;
  tools: string[];
  serves_goals: Goal[];
  serves_business_types: BusinessType[];
}

const CATEGORIES: CategoryDef[] = [
  {
    category: 'Data Search & Discovery',
    description: 'Search, preview, and price consumer, business, new homeowner, and new mover data',
    tools: ['search_data', 'preview_count', 'get_sample_data', 'get_pricing', 'get_filter_options'],
    serves_goals: ['find_new_customers', 'data_enrichment', 'offer_data_to_clients'],
    serves_business_types: ['end_user', 'agency', 'print_company', 'tech_developer', 'reseller'],
  },
  {
    category: 'Direct Mail & Postcards',
    description: 'Design postcard templates and generate print-ready PDFs for direct mail campaigns',
    tools: ['upload_template', 'browse_templates', 'import_design', 'generate_postcard_pdf'],
    serves_goals: ['direct_mail', 'find_new_customers', 'offer_data_to_clients'],
    serves_business_types: ['end_user', 'agency', 'print_company', 'reseller'],
  },
  {
    category: 'Email Campaigns',
    description: 'Send email campaigns to purchased lists via ReachMail with full analytics',
    tools: ['configure_email_account', 'create_email_list', 'create_email_campaign', 'send_email_campaign', 'get_email_analytics', 'list_email_campaigns'],
    serves_goals: ['email_campaigns', 'find_new_customers'],
    serves_business_types: ['end_user', 'agency'],
  },
  {
    category: 'Subscriptions & Automation',
    description: 'Set up recurring data deliveries with automatic scheduling and monitoring',
    tools: ['create_subscription', 'manage_subscription', 'list_subscriptions', 'delivery_report'],
    serves_goals: ['automated_delivery', 'find_new_customers', 'offer_data_to_clients'],
    serves_business_types: ['end_user', 'agency', 'print_company', 'reseller'],
  },
  {
    category: 'Delivery & Fulfillment',
    description: 'Configure SFTP, print APIs, webhooks, and cloud storage for data and PDF delivery',
    tools: ['configure_delivery', 'get_fulfillment_status'],
    serves_goals: ['automated_delivery', 'direct_mail', 'offer_data_to_clients'],
    serves_business_types: ['end_user', 'agency', 'print_company', 'tech_developer', 'reseller'],
  },
  {
    category: 'CRM & Platform Sync',
    description: 'Push data to HubSpot, Mailchimp, Zapier, and other platforms',
    tools: ['configure_platform_connection', 'sync_to_platform'],
    serves_goals: ['crm_sync', 'data_enrichment', 'api_integration'],
    serves_business_types: ['end_user', 'agency', 'tech_developer'],
  },
  {
    category: 'Intent Data',
    description: 'Access real-time purchase intent signals for consumers actively looking for your services',
    tools: ['search_intent_data', 'create_intent_subscription', 'list_intent_categories', 'configure_intent_webhook'],
    serves_goals: ['intent_data', 'find_new_customers', 'api_integration'],
    serves_business_types: ['end_user', 'agency', 'tech_developer'],
  },
  {
    category: 'Purchases & Exports',
    description: 'One-time list purchases with Stripe checkout and flexible export formats',
    tools: ['purchase_list', 'export_data', 'create_payment_link'],
    serves_goals: ['find_new_customers', 'data_enrichment', 'api_integration'],
    serves_business_types: ['end_user', 'agency', 'print_company', 'tech_developer', 'reseller'],
  },
  {
    category: 'Billing & Account',
    description: 'Manage your subscription billing, view usage, and access the customer portal',
    tools: ['create_checkout_session', 'get_billing_status', 'get_billing_portal'],
    serves_goals: ['automated_delivery', 'offer_data_to_clients'],
    serves_business_types: ['end_user', 'agency', 'print_company', 'tech_developer', 'reseller'],
  },
  {
    category: 'Local Business Intelligence',
    description: 'Audit your local search presence, identify strengths and weaknesses, and monitor competitors',
    tools: ['configure_swotspot', 'run_local_audit', 'list_audits', 'track_competitor'],
    serves_goals: ['find_new_customers', 'data_enrichment'],
    serves_business_types: ['end_user', 'agency'],
  },
];

// ============================================================================
// Quick Win Definitions
// ============================================================================

interface QuickWinDef {
  tool: string;
  description: string;
  applicable_business_types: BusinessType[];
  applicable_goals: Goal[];
  why_template: string;
}

const QUICK_WINS: QuickWinDef[] = [
  {
    tool: 'preview_count',
    description: 'Check how many prospects are available in your target area (free, no charge)',
    applicable_business_types: ['end_user', 'agency', 'print_company', 'reseller'],
    applicable_goals: ['find_new_customers', 'direct_mail', 'email_campaigns', 'offer_data_to_clients'],
    why_template: 'See the size of your opportunity before committing any budget',
  },
  {
    tool: 'get_sample_data',
    description: 'Download free sample records to evaluate data quality',
    applicable_business_types: ['end_user', 'agency', 'print_company', 'tech_developer', 'reseller'],
    applicable_goals: ['find_new_customers', 'data_enrichment', 'api_integration', 'offer_data_to_clients'],
    why_template: 'Verify the data has what you need before purchasing',
  },
  {
    tool: 'browse_templates',
    description: 'Browse ready-made postcard templates for your industry',
    applicable_business_types: ['end_user', 'agency', 'print_company'],
    applicable_goals: ['direct_mail', 'offer_data_to_clients'],
    why_template: 'Start sending mail immediately without needing a designer',
  },
  {
    tool: 'get_pricing',
    description: 'See transparent per-record pricing with volume discounts',
    applicable_business_types: ['end_user', 'agency', 'print_company', 'reseller'],
    applicable_goals: ['find_new_customers', 'direct_mail', 'email_campaigns', 'offer_data_to_clients', 'white_label'],
    why_template: 'Understand costs upfront and plan your budget',
  },
  {
    tool: 'list_intent_categories',
    description: 'Explore what types of purchase intent signals are available',
    applicable_business_types: ['end_user', 'agency', 'tech_developer'],
    applicable_goals: ['intent_data', 'find_new_customers'],
    why_template: 'Discover consumers who are actively searching for your services right now',
  },
  {
    tool: 'get_filter_options',
    description: 'See all available demographic and geographic filters for precise targeting',
    applicable_business_types: ['end_user', 'agency', 'tech_developer', 'print_company'],
    applicable_goals: ['find_new_customers', 'data_enrichment', 'api_integration'],
    why_template: 'Target exactly the right audience with age, income, home value, and more',
  },
  {
    tool: 'export_data',
    description: 'Export data to CSV, Excel, or JSON for use in any system',
    applicable_business_types: ['tech_developer', 'agency'],
    applicable_goals: ['data_enrichment', 'crm_sync', 'api_integration'],
    why_template: 'Get data in the format your systems need',
  },
];

// ============================================================================
// Display Names
// ============================================================================

const BUSINESS_TYPE_NAMES: Record<BusinessType, string> = {
  end_user: 'Business Owner / End User',
  print_company: 'Print & Mail Company',
  agency: 'Marketing Agency',
  tech_developer: 'Developer / Integrator',
  reseller: 'White-Label Reseller',
};

const BUSINESS_TYPE_DESCRIPTIONS: Record<BusinessType, string> = {
  end_user: 'You want leads and data to grow your own business',
  print_company: 'You want to offer data + print services to your clients',
  agency: 'You manage marketing campaigns for multiple clients',
  tech_developer: 'You\'re building software and want to integrate data',
  reseller: 'You want to white-label and resell data services',
};

const INDUSTRY_NAMES: Record<Industry, string> = {
  realtor: 'Real Estate',
  hvac: 'HVAC',
  insurance: 'Insurance',
  landscaping: 'Landscaping',
  home_services: 'Home Services',
  retail: 'Retail',
  marketing_agency: 'Marketing Agency',
  financial_services: 'Financial Services',
  solar: 'Solar',
  roofing: 'Roofing',
  pest_control: 'Pest Control',
  plumbing: 'Plumbing',
  dental: 'Dental',
  other: 'General Business',
};

const GOAL_NAMES: Record<Goal, string> = {
  find_new_customers: 'Find New Customers',
  direct_mail: 'Direct Mail Campaigns',
  email_campaigns: 'Email Campaigns',
  data_enrichment: 'Data Enrichment',
  crm_sync: 'CRM / Platform Sync',
  intent_data: 'Intent Data / Signals',
  automated_delivery: 'Automated Recurring Delivery',
  offer_data_to_clients: 'Offer Data Services to Clients',
  api_integration: 'API / Data Integration',
  white_label: 'White-Label / Resell',
};

// ============================================================================
// Executor
// ============================================================================

export async function executeGetRecommendations(
  input: unknown,
  _context: TenantContext
): Promise<{
  success: boolean;
  data: {
    welcome_message: string;
    your_profile: {
      business_type: string;
      business_type_description: string;
      industry: string | null;
      goals: string[];
    };
    recommended_workflows: Array<{
      name: string;
      description: string;
      steps: WorkflowStep[];
      estimated_time: string;
    }>;
    quick_wins: Array<{
      tool: string;
      description: string;
      why: string;
    }>;
    available_categories: Array<{
      category: string;
      tools: string[];
      relevance: 'high' | 'medium' | 'low';
      description: string;
    }>;
    next_step: {
      tool: string;
      prompt: string;
    };
  };
}> {
  const params = validateInput(GetRecommendationsSchema, input);

  const includeExamples = params.include_examples ?? true;

  // Build welcome message
  const businessTypeName = BUSINESS_TYPE_NAMES[params.business_type];
  const businessTypeDesc = BUSINESS_TYPE_DESCRIPTIONS[params.business_type];
  const industryName = params.industry ? INDUSTRY_NAMES[params.industry] : null;
  const goalNames = params.goals.map((g) => GOAL_NAMES[g]);

  const industryPart = industryName ? ` in ${industryName}` : '';
  const welcome = `Welcome! As a ${businessTypeName}${industryPart}, here's how this platform can help you ${goalNames.join(', ').toLowerCase()}.`;

  // Find matching workflows
  const matchedWorkflows = Object.values(WORKFLOWS)
    .filter((w) => {
      const businessTypeMatch = w.applicable_business_types.includes(params.business_type);
      const goalMatch = w.applicable_goals.some((g) => params.goals.includes(g));
      // Industry match: if workflow lists 'other' it's universal for that business type,
      // or if user didn't specify industry, match all
      const industryMatch = !params.industry
        || w.applicable_industries.includes(params.industry)
        || w.applicable_industries.includes('other');
      return businessTypeMatch && goalMatch && industryMatch;
    })
    .sort((a, b) => {
      // Sort by number of matching goals (more relevant first)
      const aGoalMatches = a.applicable_goals.filter((g) => params.goals.includes(g)).length;
      const bGoalMatches = b.applicable_goals.filter((g) => params.goals.includes(g)).length;
      return bGoalMatches - aGoalMatches;
    })
    .map((w) => ({
      name: w.name,
      description: w.description,
      steps: includeExamples ? w.steps : [],
      estimated_time: w.estimated_time,
    }));

  // Find matching quick wins
  const matchedQuickWins = QUICK_WINS
    .filter((qw) => {
      const businessTypeMatch = qw.applicable_business_types.includes(params.business_type);
      const goalMatch = qw.applicable_goals.some((g) => params.goals.includes(g));
      return businessTypeMatch && goalMatch;
    })
    .slice(0, 4)
    .map((qw) => ({
      tool: qw.tool,
      description: qw.description,
      why: qw.why_template,
    }));

  // Score and sort categories
  const scoredCategories = CATEGORIES.map((cat) => {
    const goalScore = cat.serves_goals.filter((g) => params.goals.includes(g)).length;
    const businessTypeMatch = cat.serves_business_types.includes(params.business_type) ? 1 : 0;
    const score = (goalScore / Math.max(params.goals.length, 1)) * businessTypeMatch;
    const relevance: 'high' | 'medium' | 'low' =
      score >= 0.5 ? 'high' : score >= 0.25 ? 'medium' : 'low';
    return {
      category: cat.category,
      tools: cat.tools,
      relevance,
      description: cat.description,
      score,
    };
  })
    .sort((a, b) => b.score - a.score)
    .map(({ score: _score, ...rest }) => rest);

  // Determine the best first step
  const nextStep = determineNextStep(params.business_type, params.industry ?? null, params.goals);

  return {
    success: true,
    data: {
      welcome_message: welcome,
      your_profile: {
        business_type: businessTypeName,
        business_type_description: businessTypeDesc,
        industry: industryName,
        goals: goalNames,
      },
      recommended_workflows: matchedWorkflows,
      quick_wins: matchedQuickWins,
      available_categories: scoredCategories,
      next_step: nextStep,
    },
  };
}

/**
 * Determine the best first action based on user profile
 */
function determineNextStep(
  businessType: BusinessType,
  _industry: Industry | null,
  goals: Goal[]
): { tool: string; prompt: string } {
  // Business-type specific defaults first
  if (businessType === 'print_company') {
    if (goals.includes('offer_data_to_clients')) {
      return {
        tool: 'get_pricing',
        prompt: 'Let\'s start by reviewing the volume pricing so you can plan your margins. How many records per month do your clients typically need?',
      };
    }
    return {
      tool: 'configure_delivery',
      prompt: 'Let\'s set up your SFTP hot folder connection so data and PDFs can flow directly to your print queue. Do you have your SFTP credentials ready?',
    };
  }

  if (businessType === 'tech_developer') {
    return {
      tool: 'get_sample_data',
      prompt: 'Let\'s pull some sample records so you can see the data schema and fields available for your integration.',
    };
  }

  if (businessType === 'reseller') {
    return {
      tool: 'get_pricing',
      prompt: 'Let\'s review the wholesale pricing tiers so you can plan your reseller margins. What volume are you expecting per month?',
    };
  }

  if (businessType === 'agency') {
    if (goals.includes('offer_data_to_clients')) {
      return {
        tool: 'get_pricing',
        prompt: 'Let\'s review volume pricing so you can build data services into your client packages. How many clients would you start with?',
      };
    }
  }

  // Goal-based defaults for end_user and agency
  if (goals.includes('direct_mail')) {
    return {
      tool: 'preview_count',
      prompt: 'Let\'s start by checking how many prospects are in your target area. What ZIP codes or city would you like to search?',
    };
  }
  if (goals.includes('email_campaigns')) {
    return {
      tool: 'configure_email_account',
      prompt: 'Let\'s set up your email sending account first. Do you have your ReachMail API token ready?',
    };
  }
  if (goals.includes('intent_data')) {
    return {
      tool: 'list_intent_categories',
      prompt: 'Let\'s explore what intent signals are available for your industry.',
    };
  }
  if (goals.includes('crm_sync')) {
    return {
      tool: 'configure_platform_connection',
      prompt: 'Let\'s connect your CRM. Which platform do you use - HubSpot, Mailchimp, or Zapier?',
    };
  }
  if (goals.includes('automated_delivery')) {
    return {
      tool: 'preview_count',
      prompt: 'Let\'s see what data volumes look like in your area before setting up automated delivery. What geography are you targeting?',
    };
  }
  if (goals.includes('data_enrichment')) {
    return {
      tool: 'get_filter_options',
      prompt: 'Let\'s see what data fields and filters are available for your targeting needs.',
    };
  }

  return {
    tool: 'preview_count',
    prompt: 'Let\'s start by checking how many records are available in your target area. What location would you like to search?',
  };
}
