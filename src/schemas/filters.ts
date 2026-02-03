/**
 * Filter Schemas
 * Comprehensive Zod schemas for all database filter types
 */

import { z } from 'zod';

// ============================================================================
// CONSUMER FILTERS
// ============================================================================

/**
 * Consumer database filter schema
 */
export const ConsumerFiltersSchema = z.object({
  // Demographics
  age_min: z.number().min(18).max(99).optional(),
  age_max: z.number().min(18).max(99).optional(),
  gender: z.enum(['male', 'female', 'any']).optional(),
  marital_status: z.enum(['single', 'married', 'divorced', 'widowed', 'any']).optional(),
  has_children: z.boolean().optional(),
  children_age_ranges: z.array(z.enum(['0-2', '3-5', '6-10', '11-15', '16-18'])).optional(),

  // Housing
  homeowner: z.boolean().optional(),
  renter: z.boolean().optional(),
  dwelling_type: z.enum(['single_family', 'condo', 'apartment', 'mobile', 'any']).optional(),
  home_value_min: z.number().min(0).optional(),
  home_value_max: z.number().min(0).optional(),
  length_of_residence_min: z.number().min(0).optional(),
  length_of_residence_max: z.number().min(0).optional(),

  // Financial
  income_min: z.number().min(0).optional(),
  income_max: z.number().min(0).optional(),
  net_worth_min: z.number().min(0).optional(),
  net_worth_max: z.number().min(0).optional(),
  credit_rating: z.enum(['excellent', 'good', 'fair', 'poor', 'any']).optional(),

  // Interests & Lifestyle
  interests: z.array(z.string()).optional(),
  pet_owner: z.boolean().optional(),
  pet_type: z.array(z.enum(['dog', 'cat', 'bird', 'fish', 'other'])).optional(),

  // Purchase Behavior
  mail_order_buyer: z.boolean().optional(),
  online_shopper: z.boolean().optional(),
  donor: z.boolean().optional(),
  donor_type: z.array(z.enum(['charity', 'political', 'religious', 'environmental'])).optional(),

  // Vehicle
  vehicle_owner: z.boolean().optional(),
  vehicle_make: z.array(z.string()).optional(),
  vehicle_year_min: z.number().min(1990).optional(),
  vehicle_year_max: z.number().max(2030).optional(),

  // Data Quality
  include_email: z.boolean().optional(),
  include_phone: z.boolean().optional(),
  email_required: z.boolean().optional(),
  phone_required: z.boolean().optional(),
});

export type ConsumerFilters = z.infer<typeof ConsumerFiltersSchema>;

/**
 * Available consumer interests
 */
export const CONSUMER_INTERESTS = [
  // Sports & Fitness
  'golf', 'tennis', 'fitness', 'running', 'cycling', 'swimming', 'skiing', 'fishing',
  'hunting', 'boating', 'camping', 'hiking', 'yoga', 'martial_arts',
  // Home & Garden
  'gardening', 'home_improvement', 'diy', 'cooking', 'gourmet_food', 'wine',
  'interior_design', 'landscaping',
  // Arts & Entertainment
  'arts', 'music', 'theater', 'movies', 'reading', 'photography', 'writing',
  // Technology
  'computers', 'electronics', 'gaming', 'mobile_apps', 'smart_home',
  // Travel
  'travel', 'domestic_travel', 'international_travel', 'cruises', 'rv_travel',
  // Health & Wellness
  'health_conscious', 'organic', 'vitamins', 'alternative_medicine', 'meditation',
  // Hobbies & Crafts
  'crafts', 'collecting', 'antiques', 'woodworking', 'sewing', 'knitting',
  // Pets
  'pets', 'dogs', 'cats', 'horses', 'exotic_pets',
  // Family
  'parenting', 'grandparenting', 'education',
  // Financial
  'investing', 'real_estate_investing', 'stocks',
] as const;

// ============================================================================
// BUSINESS FILTERS
// ============================================================================

/**
 * Business database filter schema
 */
export const BusinessFiltersSchema = z.object({
  // Industry
  sic_codes: z.array(z.string()).optional(),
  sic_code_prefix: z.string().optional(),
  naics_codes: z.array(z.string()).optional(),
  industry_keywords: z.array(z.string()).optional(),

  // Company Size
  employee_count_min: z.number().min(1).optional(),
  employee_count_max: z.number().optional(),
  employee_range: z.enum(['1-4', '5-9', '10-19', '20-49', '50-99', '100-249', '250-499', '500+']).optional(),
  annual_revenue_min: z.number().min(0).optional(),
  annual_revenue_max: z.number().optional(),
  revenue_range: z.enum([
    'under_500k', '500k-1m', '1m-2.5m', '2.5m-5m', '5m-10m', '10m-25m', '25m-50m', '50m-100m', '100m+',
  ]).optional(),

  // Business Characteristics
  years_in_business_min: z.number().min(0).optional(),
  years_in_business_max: z.number().optional(),
  business_type: z.enum(['corporation', 'llc', 'partnership', 'sole_proprietor', 'nonprofit', 'government', 'any']).optional(),
  franchise: z.boolean().optional(),
  home_based: z.boolean().optional(),
  headquarters_only: z.boolean().optional(),
  publicly_traded: z.boolean().optional(),
  woman_owned: z.boolean().optional(),
  minority_owned: z.boolean().optional(),
  veteran_owned: z.boolean().optional(),

  // Contact Preferences
  contact_level: z.enum(['owner', 'c_level', 'vp', 'director', 'manager', 'any']).optional(),
  contact_title_keywords: z.array(z.string()).optional(),
  decision_maker: z.boolean().optional(),

  // Data Quality
  include_email: z.boolean().optional(),
  include_phone: z.boolean().optional(),
  include_executive_contacts: z.boolean().optional(),
  verified_within_days: z.number().min(1).optional(),
});

export type BusinessFilters = z.infer<typeof BusinessFiltersSchema>;

/**
 * SIC code groups for common industries
 */
export const SIC_GROUPS: Record<string, string[]> = {
  healthcare: ['8011', '8021', '8031', '8041', '8049', '8051', '8062', '8069', '8071', '8082', '8099'],
  dental: ['8021'],
  medical_offices: ['8011'],
  hospitals: ['8062', '8063'],
  nursing_homes: ['8051', '8052'],
  legal: ['8111'],
  accounting: ['8721'],
  restaurants: ['5812', '5813'],
  fast_food: ['5812'],
  bars: ['5813'],
  construction: ['1521', '1522', '1531', '1541', '1711', '1721', '1731', '1751', '1761', '1771', '1781', '1791', '1799'],
  plumbing_hvac: ['1711'],
  electrical: ['1731'],
  roofing: ['1761'],
  real_estate: ['6531', '6541', '6552'],
  real_estate_agents: ['6531'],
  insurance: ['6311', '6321', '6331', '6411'],
  insurance_agents: ['6411'],
  automotive: ['5511', '5521', '5531', '5541', '7532', '7533', '7534', '7538'],
  auto_dealers: ['5511', '5521'],
  auto_repair: ['7532', '7533', '7534', '7538'],
  professional_services: ['8721', '8731', '8741', '8742', '8748'],
  retail: ['5200', '5300', '5400', '5500', '5600', '5700', '5800', '5900'],
  manufacturing: ['2000', '2100', '2200', '2300', '2400', '2500', '2600', '2700', '2800', '2900', '3000', '3100', '3200', '3300', '3400', '3500', '3600', '3700', '3800', '3900'],
  technology: ['7371', '7372', '7373', '7374', '7375', '7376', '7377', '7378', '7379'],
  financial_services: ['6000', '6100', '6200', '6300', '6400', '6500', '6600', '6700'],
  education: ['8200', '8211', '8221', '8222', '8231', '8243', '8244', '8249', '8299'],
  fitness_gyms: ['7991'],
  beauty_salons: ['7231'],
  landscaping: ['0781', '0782'],
  cleaning_services: ['7349'],
  pet_services: ['0752'],
  veterinary: ['0741', '0742'],
};

/**
 * Common business title keywords
 */
export const BUSINESS_TITLES = {
  owner: ['owner', 'proprietor', 'founder', 'co-founder', 'partner'],
  c_level: ['ceo', 'cfo', 'coo', 'cto', 'cio', 'cmo', 'chief'],
  vp: ['vp', 'vice president', 'evp', 'svp'],
  director: ['director', 'head of'],
  manager: ['manager', 'supervisor', 'lead'],
  marketing: ['marketing', 'brand', 'communications', 'pr'],
  sales: ['sales', 'business development', 'account'],
  it: ['it', 'technology', 'systems', 'developer', 'engineer'],
  hr: ['hr', 'human resources', 'talent', 'recruiting'],
  finance: ['finance', 'accounting', 'controller', 'treasurer'],
  operations: ['operations', 'logistics', 'supply chain'],
};

// ============================================================================
// NHO (NEW HOMEOWNER) FILTERS
// ============================================================================

/**
 * NHO database filter schema
 */
export const NhoFiltersSchema = z.object({
  // Move timing
  move_date_min: z.string().optional(), // ISO date
  move_date_max: z.string().optional(),
  days_since_move_min: z.number().min(0).optional(),
  days_since_move_max: z.number().optional(),

  // Property
  home_value_min: z.number().min(0).optional(),
  home_value_max: z.number().optional(),
  dwelling_type: z.enum(['single_family', 'condo', 'townhouse', 'multi_family', 'any']).optional(),
  property_type: z.enum(['residential', 'commercial', 'any']).optional(),

  // Demographics
  income_min: z.number().min(0).optional(),
  income_max: z.number().optional(),
  age_min: z.number().min(18).optional(),
  age_max: z.number().max(99).optional(),
  has_children: z.boolean().optional(),

  // Data Quality
  include_email: z.boolean().optional(),
  include_phone: z.boolean().optional(),
  email_required: z.boolean().optional(),
  phone_required: z.boolean().optional(),
});

export type NhoFilters = z.infer<typeof NhoFiltersSchema>;

// ============================================================================
// NEW MOVER FILTERS
// ============================================================================

/**
 * New Mover database filter schema
 */
export const NewMoverFiltersSchema = z.object({
  // Move timing
  move_date_min: z.string().optional(),
  move_date_max: z.string().optional(),
  days_since_move_min: z.number().min(0).optional(),
  days_since_move_max: z.number().optional(),

  // Move type
  move_type: z.enum(['local', 'intrastate', 'interstate', 'any']).optional(),
  previous_state: z.string().optional(),

  // Property
  homeowner: z.boolean().optional(),
  renter: z.boolean().optional(),
  dwelling_type: z.enum(['single_family', 'condo', 'apartment', 'townhouse', 'any']).optional(),
  home_value_min: z.number().min(0).optional(),
  home_value_max: z.number().optional(),

  // Demographics
  income_min: z.number().min(0).optional(),
  income_max: z.number().optional(),
  age_min: z.number().min(18).optional(),
  age_max: z.number().max(99).optional(),
  has_children: z.boolean().optional(),
  marital_status: z.enum(['single', 'married', 'any']).optional(),

  // Data Quality
  include_email: z.boolean().optional(),
  include_phone: z.boolean().optional(),
  email_required: z.boolean().optional(),
  phone_required: z.boolean().optional(),
});

export type NewMoverFilters = z.infer<typeof NewMoverFiltersSchema>;

// ============================================================================
// COMBINED FILTER SCHEMA
// ============================================================================

/**
 * Database type enum
 */
export const DatabaseTypeSchema = z.enum(['consumer', 'business', 'nho', 'new_mover']);
export type DatabaseType = z.infer<typeof DatabaseTypeSchema>;

/**
 * Get the appropriate filter schema for a database type
 */
export function getFilterSchema(database: DatabaseType) {
  switch (database) {
    case 'consumer':
      return ConsumerFiltersSchema;
    case 'business':
      return BusinessFiltersSchema;
    case 'nho':
      return NhoFiltersSchema;
    case 'new_mover':
      return NewMoverFiltersSchema;
    default:
      return z.object({});
  }
}

/**
 * Combined filters type (union of all filter types)
 */
export type AnyFilters = ConsumerFilters | BusinessFilters | NhoFilters | NewMoverFilters;

// ============================================================================
// FILTER METADATA (for get_filter_options tool)
// ============================================================================

export interface FilterOption {
  field: string;
  label: string;
  type: 'boolean' | 'number' | 'range' | 'enum' | 'array' | 'date';
  description: string;
  options?: string[];
  range?: { min?: number; max?: number };
  pricing_impact?: string;
}

export interface FilterCategory {
  name: string;
  description: string;
  filters: FilterOption[];
}

/**
 * Consumer filter metadata
 */
export const CONSUMER_FILTER_METADATA: FilterCategory[] = [
  {
    name: 'Demographics',
    description: 'Age, gender, marital status, and family information',
    filters: [
      { field: 'age_min', label: 'Minimum Age', type: 'number', description: 'Minimum age of consumer', range: { min: 18, max: 99 } },
      { field: 'age_max', label: 'Maximum Age', type: 'number', description: 'Maximum age of consumer', range: { min: 18, max: 99 } },
      { field: 'gender', label: 'Gender', type: 'enum', description: 'Consumer gender', options: ['male', 'female', 'any'] },
      { field: 'marital_status', label: 'Marital Status', type: 'enum', description: 'Marital status', options: ['single', 'married', 'divorced', 'widowed', 'any'] },
      { field: 'has_children', label: 'Has Children', type: 'boolean', description: 'Household has children' },
      { field: 'children_age_ranges', label: 'Children Age Ranges', type: 'array', description: 'Age ranges of children in household', options: ['0-2', '3-5', '6-10', '11-15', '16-18'] },
    ],
  },
  {
    name: 'Housing',
    description: 'Home ownership, property type, and value',
    filters: [
      { field: 'homeowner', label: 'Homeowner', type: 'boolean', description: 'Consumer owns their home' },
      { field: 'renter', label: 'Renter', type: 'boolean', description: 'Consumer rents their home' },
      { field: 'dwelling_type', label: 'Dwelling Type', type: 'enum', description: 'Type of residence', options: ['single_family', 'condo', 'apartment', 'mobile', 'any'] },
      { field: 'home_value_min', label: 'Min Home Value', type: 'number', description: 'Minimum estimated home value', range: { min: 0 } },
      { field: 'home_value_max', label: 'Max Home Value', type: 'number', description: 'Maximum estimated home value', range: { min: 0 } },
      { field: 'length_of_residence_min', label: 'Min Years at Address', type: 'number', description: 'Minimum years at current address', range: { min: 0 } },
      { field: 'length_of_residence_max', label: 'Max Years at Address', type: 'number', description: 'Maximum years at current address', range: { min: 0 } },
    ],
  },
  {
    name: 'Financial',
    description: 'Income, net worth, and financial indicators',
    filters: [
      { field: 'income_min', label: 'Min Household Income', type: 'number', description: 'Minimum household income', range: { min: 0 } },
      { field: 'income_max', label: 'Max Household Income', type: 'number', description: 'Maximum household income', range: { min: 0 } },
      { field: 'net_worth_min', label: 'Min Net Worth', type: 'number', description: 'Minimum estimated net worth', range: { min: 0 } },
      { field: 'net_worth_max', label: 'Max Net Worth', type: 'number', description: 'Maximum estimated net worth', range: { min: 0 } },
      { field: 'credit_rating', label: 'Credit Rating', type: 'enum', description: 'Estimated credit rating', options: ['excellent', 'good', 'fair', 'poor', 'any'] },
    ],
  },
  {
    name: 'Interests & Lifestyle',
    description: 'Hobbies, interests, and lifestyle indicators',
    filters: [
      { field: 'interests', label: 'Interests', type: 'array', description: 'Consumer interests and hobbies', options: [...CONSUMER_INTERESTS] },
      { field: 'pet_owner', label: 'Pet Owner', type: 'boolean', description: 'Household owns pets' },
      { field: 'pet_type', label: 'Pet Type', type: 'array', description: 'Types of pets owned', options: ['dog', 'cat', 'bird', 'fish', 'other'] },
    ],
  },
  {
    name: 'Purchase Behavior',
    description: 'Shopping habits and donor activity',
    filters: [
      { field: 'mail_order_buyer', label: 'Mail Order Buyer', type: 'boolean', description: 'Purchases via mail order' },
      { field: 'online_shopper', label: 'Online Shopper', type: 'boolean', description: 'Active online shopper' },
      { field: 'donor', label: 'Charitable Donor', type: 'boolean', description: 'Makes charitable donations' },
      { field: 'donor_type', label: 'Donor Categories', type: 'array', description: 'Types of causes supported', options: ['charity', 'political', 'religious', 'environmental'] },
    ],
  },
  {
    name: 'Data Appends',
    description: 'Additional data fields (additional cost)',
    filters: [
      { field: 'include_email', label: 'Include Email', type: 'boolean', description: 'Include email addresses where available', pricing_impact: '+$0.02/record with email' },
      { field: 'include_phone', label: 'Include Phone', type: 'boolean', description: 'Include phone numbers where available', pricing_impact: '+$0.02/record with phone' },
      { field: 'email_required', label: 'Email Required', type: 'boolean', description: 'Only include records with email' },
      { field: 'phone_required', label: 'Phone Required', type: 'boolean', description: 'Only include records with phone' },
    ],
  },
];

/**
 * Business filter metadata
 */
export const BUSINESS_FILTER_METADATA: FilterCategory[] = [
  {
    name: 'Industry',
    description: 'Industry classification and keywords',
    filters: [
      { field: 'sic_codes', label: 'SIC Codes', type: 'array', description: 'Specific 4-digit SIC codes' },
      { field: 'sic_code_prefix', label: 'SIC Code Prefix', type: 'number', description: '2-digit SIC major group (e.g., 80 for healthcare)' },
      { field: 'naics_codes', label: 'NAICS Codes', type: 'array', description: 'Specific NAICS codes' },
      { field: 'industry_keywords', label: 'Industry Keywords', type: 'array', description: 'Search business descriptions for keywords' },
    ],
  },
  {
    name: 'Company Size',
    description: 'Employee count and revenue',
    filters: [
      { field: 'employee_count_min', label: 'Min Employees', type: 'number', description: 'Minimum number of employees', range: { min: 1 } },
      { field: 'employee_count_max', label: 'Max Employees', type: 'number', description: 'Maximum number of employees' },
      { field: 'employee_range', label: 'Employee Range', type: 'enum', description: 'Employee count range', options: ['1-4', '5-9', '10-19', '20-49', '50-99', '100-249', '250-499', '500+'] },
      { field: 'annual_revenue_min', label: 'Min Annual Revenue', type: 'number', description: 'Minimum annual revenue', range: { min: 0 } },
      { field: 'annual_revenue_max', label: 'Max Annual Revenue', type: 'number', description: 'Maximum annual revenue' },
      { field: 'revenue_range', label: 'Revenue Range', type: 'enum', description: 'Annual revenue range', options: ['under_500k', '500k-1m', '1m-2.5m', '2.5m-5m', '5m-10m', '10m-25m', '25m-50m', '50m-100m', '100m+'] },
    ],
  },
  {
    name: 'Business Characteristics',
    description: 'Business type, age, and ownership',
    filters: [
      { field: 'years_in_business_min', label: 'Min Years in Business', type: 'number', description: 'Minimum years operating', range: { min: 0 } },
      { field: 'business_type', label: 'Business Type', type: 'enum', description: 'Legal entity type', options: ['corporation', 'llc', 'partnership', 'sole_proprietor', 'nonprofit', 'government', 'any'] },
      { field: 'franchise', label: 'Franchise', type: 'boolean', description: 'Business is a franchise location' },
      { field: 'home_based', label: 'Home Based', type: 'boolean', description: 'Home-based business' },
      { field: 'headquarters_only', label: 'Headquarters Only', type: 'boolean', description: 'Only return headquarters locations' },
      { field: 'woman_owned', label: 'Woman Owned', type: 'boolean', description: 'Woman-owned business' },
      { field: 'minority_owned', label: 'Minority Owned', type: 'boolean', description: 'Minority-owned business' },
      { field: 'veteran_owned', label: 'Veteran Owned', type: 'boolean', description: 'Veteran-owned business' },
    ],
  },
  {
    name: 'Contacts',
    description: 'Decision maker and contact level targeting',
    filters: [
      { field: 'contact_level', label: 'Contact Level', type: 'enum', description: 'Target contact seniority', options: ['owner', 'c_level', 'vp', 'director', 'manager', 'any'] },
      { field: 'contact_title_keywords', label: 'Title Keywords', type: 'array', description: 'Keywords in contact title' },
      { field: 'decision_maker', label: 'Decision Maker', type: 'boolean', description: 'Contact is a decision maker' },
      { field: 'include_executive_contacts', label: 'Include Executives', type: 'boolean', description: 'Include multiple executive contacts', pricing_impact: '+$0.03/executive contact' },
    ],
  },
  {
    name: 'Data Appends',
    description: 'Additional data fields (additional cost)',
    filters: [
      { field: 'include_email', label: 'Include Email', type: 'boolean', description: 'Include email addresses where available', pricing_impact: '+$0.02/record with email' },
      { field: 'include_phone', label: 'Include Phone', type: 'boolean', description: 'Include phone numbers where available', pricing_impact: '+$0.02/record with phone' },
    ],
  },
];

/**
 * NHO filter metadata
 */
export const NHO_FILTER_METADATA: FilterCategory[] = [
  {
    name: 'Move Timing',
    description: 'When the homeowner moved in',
    filters: [
      { field: 'move_date_min', label: 'Move After', type: 'date', description: 'Moved in after this date' },
      { field: 'move_date_max', label: 'Move Before', type: 'date', description: 'Moved in before this date' },
      { field: 'days_since_move_min', label: 'Min Days Since Move', type: 'number', description: 'Minimum days since move-in', range: { min: 0 } },
      { field: 'days_since_move_max', label: 'Max Days Since Move', type: 'number', description: 'Maximum days since move-in' },
    ],
  },
  {
    name: 'Property',
    description: 'Property characteristics and value',
    filters: [
      { field: 'home_value_min', label: 'Min Home Value', type: 'number', description: 'Minimum property value', range: { min: 0 } },
      { field: 'home_value_max', label: 'Max Home Value', type: 'number', description: 'Maximum property value' },
      { field: 'dwelling_type', label: 'Dwelling Type', type: 'enum', description: 'Type of property', options: ['single_family', 'condo', 'townhouse', 'multi_family', 'any'] },
    ],
  },
  {
    name: 'Demographics',
    description: 'Homeowner demographics',
    filters: [
      { field: 'income_min', label: 'Min Income', type: 'number', description: 'Minimum household income', range: { min: 0 } },
      { field: 'income_max', label: 'Max Income', type: 'number', description: 'Maximum household income' },
      { field: 'age_min', label: 'Min Age', type: 'number', description: 'Minimum age', range: { min: 18, max: 99 } },
      { field: 'age_max', label: 'Max Age', type: 'number', description: 'Maximum age', range: { min: 18, max: 99 } },
      { field: 'has_children', label: 'Has Children', type: 'boolean', description: 'Household has children' },
    ],
  },
  {
    name: 'Data Appends',
    description: 'Additional data fields (additional cost)',
    filters: [
      { field: 'include_email', label: 'Include Email', type: 'boolean', description: 'Include email addresses where available', pricing_impact: '+$0.02/record with email' },
      { field: 'include_phone', label: 'Include Phone', type: 'boolean', description: 'Include phone numbers where available', pricing_impact: '+$0.02/record with phone' },
      { field: 'email_required', label: 'Email Required', type: 'boolean', description: 'Only include records with email' },
      { field: 'phone_required', label: 'Phone Required', type: 'boolean', description: 'Only include records with phone' },
    ],
  },
];

/**
 * New Mover filter metadata
 */
export const NEW_MOVER_FILTER_METADATA: FilterCategory[] = [
  {
    name: 'Move Timing',
    description: 'When the person moved',
    filters: [
      { field: 'move_date_min', label: 'Move After', type: 'date', description: 'Moved after this date' },
      { field: 'move_date_max', label: 'Move Before', type: 'date', description: 'Moved before this date' },
      { field: 'days_since_move_min', label: 'Min Days Since Move', type: 'number', description: 'Minimum days since move', range: { min: 0 } },
      { field: 'days_since_move_max', label: 'Max Days Since Move', type: 'number', description: 'Maximum days since move' },
    ],
  },
  {
    name: 'Move Type',
    description: 'Type and distance of move',
    filters: [
      { field: 'move_type', label: 'Move Type', type: 'enum', description: 'Distance of move', options: ['local', 'intrastate', 'interstate', 'any'] },
      { field: 'previous_state', label: 'Previous State', type: 'enum', description: 'State moved from' },
    ],
  },
  {
    name: 'Housing',
    description: 'Current housing situation',
    filters: [
      { field: 'homeowner', label: 'Homeowner', type: 'boolean', description: 'Now owns their home' },
      { field: 'renter', label: 'Renter', type: 'boolean', description: 'Currently renting' },
      { field: 'dwelling_type', label: 'Dwelling Type', type: 'enum', description: 'Type of residence', options: ['single_family', 'condo', 'apartment', 'townhouse', 'any'] },
      { field: 'home_value_min', label: 'Min Home Value', type: 'number', description: 'Minimum property value', range: { min: 0 } },
      { field: 'home_value_max', label: 'Max Home Value', type: 'number', description: 'Maximum property value' },
    ],
  },
  {
    name: 'Demographics',
    description: 'Personal demographics',
    filters: [
      { field: 'income_min', label: 'Min Income', type: 'number', description: 'Minimum household income', range: { min: 0 } },
      { field: 'income_max', label: 'Max Income', type: 'number', description: 'Maximum household income' },
      { field: 'age_min', label: 'Min Age', type: 'number', description: 'Minimum age', range: { min: 18, max: 99 } },
      { field: 'age_max', label: 'Max Age', type: 'number', description: 'Maximum age', range: { min: 18, max: 99 } },
      { field: 'has_children', label: 'Has Children', type: 'boolean', description: 'Household has children' },
      { field: 'marital_status', label: 'Marital Status', type: 'enum', description: 'Marital status', options: ['single', 'married', 'any'] },
    ],
  },
  {
    name: 'Data Appends',
    description: 'Additional data fields (additional cost)',
    filters: [
      { field: 'include_email', label: 'Include Email', type: 'boolean', description: 'Include email addresses where available', pricing_impact: '+$0.02/record with email' },
      { field: 'include_phone', label: 'Include Phone', type: 'boolean', description: 'Include phone numbers where available', pricing_impact: '+$0.02/record with phone' },
      { field: 'email_required', label: 'Email Required', type: 'boolean', description: 'Only include records with email' },
      { field: 'phone_required', label: 'Phone Required', type: 'boolean', description: 'Only include records with phone' },
    ],
  },
];

/**
 * Get filter metadata for a database type
 */
export function getFilterMetadata(database: DatabaseType): FilterCategory[] {
  switch (database) {
    case 'consumer':
      return CONSUMER_FILTER_METADATA;
    case 'business':
      return BUSINESS_FILTER_METADATA;
    case 'nho':
      return NHO_FILTER_METADATA;
    case 'new_mover':
      return NEW_MOVER_FILTER_METADATA;
    default:
      return [];
  }
}

// ============================================================================
// PRE-BUILT FILTER COMBINATIONS
// ============================================================================

export interface CommonSelection {
  id: string;
  name: string;
  description: string;
  database: DatabaseType;
  filters: Record<string, unknown>;
}

export const COMMON_SELECTIONS: CommonSelection[] = [
  // Consumer presets
  {
    id: 'luxury_homeowners',
    name: 'Luxury Homeowners',
    description: 'High-income homeowners with homes valued $500k+',
    database: 'consumer',
    filters: { homeowner: true, home_value_min: 500000, income_min: 150000 },
  },
  {
    id: 'pet_owners_homeowners',
    name: 'Pet Owners (Homeowners)',
    description: 'Homeowners with pets - great for pet services',
    database: 'consumer',
    filters: { homeowner: true, pet_owner: true },
  },
  {
    id: 'young_families',
    name: 'Young Families',
    description: 'Households with children under 10',
    database: 'consumer',
    filters: { has_children: true, children_age_ranges: ['0-2', '3-5', '6-10'], age_max: 45 },
  },
  {
    id: 'affluent_retirees',
    name: 'Affluent Retirees',
    description: 'High net worth seniors 65+',
    database: 'consumer',
    filters: { age_min: 65, income_min: 100000, homeowner: true },
  },
  {
    id: 'outdoor_enthusiasts',
    name: 'Outdoor Enthusiasts',
    description: 'People interested in outdoor activities',
    database: 'consumer',
    filters: { interests: ['camping', 'hiking', 'fishing', 'hunting', 'boating'] },
  },

  // Business presets
  {
    id: 'local_restaurants',
    name: 'Local Restaurants',
    description: 'Restaurants and bars for food service vendors',
    database: 'business',
    filters: { sic_codes: ['5812', '5813'] },
  },
  {
    id: 'healthcare_practices',
    name: 'Healthcare Practices',
    description: 'Medical offices, dentists, and healthcare providers',
    database: 'business',
    filters: { sic_code_prefix: '80' },
  },
  {
    id: 'small_businesses',
    name: 'Small Businesses',
    description: 'Companies with 1-49 employees',
    database: 'business',
    filters: { employee_count_min: 1, employee_count_max: 49 },
  },
  {
    id: 'construction_contractors',
    name: 'Construction Contractors',
    description: 'General contractors and specialty trades',
    database: 'business',
    filters: { sic_code_prefix: '15' },
  },
  {
    id: 'real_estate_professionals',
    name: 'Real Estate Professionals',
    description: 'Real estate agents and brokers',
    database: 'business',
    filters: { sic_codes: ['6531'] },
  },

  // NHO presets
  {
    id: 'recent_nho_30_days',
    name: 'Recent New Homeowners (30 days)',
    description: 'Moved in within the last 30 days',
    database: 'nho',
    filters: { days_since_move_max: 30 },
  },
  {
    id: 'luxury_nho',
    name: 'Luxury New Homeowners',
    description: 'New homeowners with homes $750k+',
    database: 'nho',
    filters: { home_value_min: 750000 },
  },

  // New Mover presets
  {
    id: 'recent_movers_60_days',
    name: 'Recent Movers (60 days)',
    description: 'Moved within the last 60 days',
    database: 'new_mover',
    filters: { days_since_move_max: 60 },
  },
  {
    id: 'interstate_movers',
    name: 'Interstate Movers',
    description: 'People who moved from another state',
    database: 'new_mover',
    filters: { move_type: 'interstate' },
  },
  {
    id: 'new_homebuyers',
    name: 'New Homebuyers',
    description: 'New movers who purchased a home',
    database: 'new_mover',
    filters: { homeowner: true, days_since_move_max: 90 },
  },
];

/**
 * Get common selections for a database type
 */
export function getCommonSelections(database: DatabaseType): CommonSelection[] {
  return COMMON_SELECTIONS.filter((s) => s.database === database);
}
