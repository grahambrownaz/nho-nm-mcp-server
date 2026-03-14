/**
 * Franchise & Dealer Network Types
 * Enables franchise brands to create self-service marketing hubs
 * where each store uses AI (Claude/ChatGPT) to buy data and run campaigns.
 */

export interface FranchiseBrandConfig {
  name: string;
  slug: string;
  industry?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  domain?: string;
  supportEmail?: string;
  supportPhone?: string;
  websiteUrl?: string;
  defaultDatabases?: string[];
  defaultRadiusMiles?: number;
  billingModel?: 'PER_STORE' | 'CONSOLIDATED' | 'HYBRID';
  welcomeMessage?: string;
  maxStores?: number;
}

export interface FranchiseStoreConfig {
  brandSlug: string;
  storeNumber?: string;
  storeName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude?: number;
  longitude?: number;
  radiusMiles?: number;
  managerName?: string;
  managerEmail: string;
  managerPhone?: string;
}

export interface FranchiseCreativeConfig {
  brandSlug: string;
  name: string;
  description?: string;
  type: 'POSTCARD' | 'EMAIL' | 'LETTER' | 'BANNER' | 'SOCIAL' | 'LANDING_PAGE';
  category?: string;
  templateId?: string;
  htmlContent?: string;
  imageUrl?: string;
  mergeFields?: string[];
  isRequired?: boolean;
  availableFrom?: string;
  availableTo?: string;
}

export interface FranchiseDashboardSummary {
  brand: {
    name: string;
    slug: string;
    industry?: string;
    status: string;
  };
  stores: {
    total: number;
    active: number;
    suspended: number;
    pendingSetup: number;
  };
  creative: {
    total: number;
    byType: Record<string, number>;
  };
  activity: {
    totalSpend: number;
    totalCampaigns: number;
    activeSubscriptions: number;
    last30DaysSpend: number;
  };
  topStores: Array<{
    storeName: string;
    storeNumber?: string;
    city: string;
    state: string;
    totalSpend: number;
    totalCampaigns: number;
    lastActivityAt?: string;
  }>;
}

export interface StoreContext {
  brandSlug: string;
  brandName: string;
  storeId: string;
  storeName: string;
  storeNumber?: string;
  location: {
    address: string;
    city: string;
    state: string;
    zip: string;
    latitude?: number;
    longitude?: number;
  };
  radiusMiles: number;
  availableCreative: Array<{
    id: string;
    name: string;
    type: string;
    category?: string;
    isRequired: boolean;
    thumbnailUrl?: string;
  }>;
  branding: {
    logoUrl?: string;
    primaryColor: string;
    secondaryColor: string;
    accentColor?: string;
    welcomeMessage?: string;
  };
}
