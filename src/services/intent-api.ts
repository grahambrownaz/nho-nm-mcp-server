/**
 * Intent Data API Service
 * Upstream API integration for intent/purchase signal data
 */

import {
  type IntentSignal,
  type IntentFilters,
  type IntentGeography,
  INTENT_CATEGORIES,
  getIntentCategoryList,
} from '../schemas/intent.js';

/**
 * Configuration
 */
const INTENT_API_URL = process.env.INTENT_API_URL || 'https://api.intentdata.example.com/v1';
const INTENT_API_KEY = process.env.INTENT_API_KEY || '';

/**
 * Check if we should use mock data
 */
function shouldUseMockData(): boolean {
  return !INTENT_API_KEY || process.env.USE_MOCK_INTENT_DATA === 'true';
}

/**
 * Intent API client
 */
class IntentApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = INTENT_API_URL;
    this.apiKey = INTENT_API_KEY;
  }

  /**
   * Search for intent signals
   */
  async searchSignals(params: {
    categories: string[];
    geography?: IntentGeography;
    filters?: IntentFilters;
    limit?: number;
    offset?: number;
  }): Promise<{
    signals: IntentSignal[];
    total: number;
    hasMore: boolean;
  }> {
    if (shouldUseMockData()) {
      return this.mockSearchSignals(params);
    }

    const response = await fetch(`${this.baseUrl}/signals/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Intent API error: ${response.status} ${response.statusText}`);
    }

    return await response.json() as {
      signals: IntentSignal[];
      total: number;
      hasMore: boolean;
    };
  }

  /**
   * Get available categories from upstream
   */
  async getCategories(): Promise<Array<{
    code: string;
    name: string;
    description: string;
    parent?: string;
    avgMonthlySignals: number;
    pricePerSignal: number;
  }>> {
    if (shouldUseMockData()) {
      return this.mockGetCategories();
    }

    const response = await fetch(`${this.baseUrl}/categories`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Intent API error: ${response.status} ${response.statusText}`);
    }

    return await response.json() as Array<{
      code: string;
      name: string;
      description: string;
      parent?: string;
      avgMonthlySignals: number;
      pricePerSignal: number;
    }>;
  }

  /**
   * Get signal count for criteria
   */
  async getSignalCount(params: {
    categories: string[];
    geography?: IntentGeography;
    filters?: IntentFilters;
  }): Promise<{
    total: number;
    byCategory: Record<string, number>;
    estimatedMonthly: number;
  }> {
    if (shouldUseMockData()) {
      return this.mockGetSignalCount(params);
    }

    const response = await fetch(`${this.baseUrl}/signals/count`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Intent API error: ${response.status} ${response.statusText}`);
    }

    return await response.json() as {
      total: number;
      byCategory: Record<string, number>;
      estimatedMonthly: number;
    };
  }

  /**
   * Subscribe to real-time signals (returns webhook registration ID)
   */
  async subscribeToSignals(params: {
    categories: string[];
    geography?: IntentGeography;
    filters?: IntentFilters;
    webhookUrl: string;
    webhookSecret?: string;
  }): Promise<{
    subscriptionId: string;
    status: string;
  }> {
    if (shouldUseMockData()) {
      return {
        subscriptionId: `mock_sub_${Date.now()}`,
        status: 'active',
      };
    }

    const response = await fetch(`${this.baseUrl}/subscriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Intent API error: ${response.status} ${response.statusText}`);
    }

    return await response.json() as {
      subscriptionId: string;
      status: string;
    };
  }

  /**
   * Unsubscribe from signals
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    if (shouldUseMockData()) {
      return;
    }

    const response = await fetch(`${this.baseUrl}/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Intent API error: ${response.status} ${response.statusText}`);
    }
  }

  // ============================================================================
  // MOCK DATA METHODS
  // ============================================================================

  private mockSearchSignals(params: {
    categories: string[];
    geography?: IntentGeography;
    filters?: IntentFilters;
    limit?: number;
    offset?: number;
  }): {
    signals: IntentSignal[];
    total: number;
    hasMore: boolean;
  } {
    const limit = params.limit || 100;
    const offset = params.offset || 0;

    // Generate mock signals
    const signals: IntentSignal[] = [];
    const totalAvailable = 500 + Math.floor(Math.random() * 1000);

    const signalTypes: IntentSignal['signalType'][] = [
      'search', 'click', 'form_submit', 'comparison', 'review', 'purchase_abandon'
    ];
    const sources = ['google_ads', 'facebook', 'linkedin', 'website', 'email'];
    const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'Chris', 'Lisa'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller'];
    const cities = ['Phoenix', 'Los Angeles', 'Chicago', 'Houston', 'Miami', 'Seattle', 'Denver'];
    const states = params.geography?.values || ['AZ', 'CA', 'TX', 'FL', 'NY'];

    const signalsToGenerate = Math.min(limit, totalAvailable - offset);

    for (let i = 0; i < signalsToGenerate; i++) {
      const category = params.categories[Math.floor(Math.random() * params.categories.length)];
      const signalAge = Math.floor(Math.random() * 72); // 0-72 hours old
      const signalTimestamp = new Date(Date.now() - signalAge * 60 * 60 * 1000);

      signals.push({
        id: `sig_${Date.now()}_${i}`,
        category,
        intentScore: Math.floor(Math.random() * 60) + 40, // 40-100
        signalType: signalTypes[Math.floor(Math.random() * signalTypes.length)],
        signalSource: sources[Math.floor(Math.random() * sources.length)],
        signalTimestamp: signalTimestamp.toISOString(),

        // 70% have email
        ...(Math.random() < 0.7 ? {
          email: `${firstNames[Math.floor(Math.random() * firstNames.length)].toLowerCase()}.${lastNames[Math.floor(Math.random() * lastNames.length)].toLowerCase()}${i}@example.com`,
        } : {}),

        // 50% have phone
        ...(Math.random() < 0.5 ? {
          phone: `555-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
        } : {}),

        // 60% have address
        ...(Math.random() < 0.6 ? {
          firstName: firstNames[Math.floor(Math.random() * firstNames.length)],
          lastName: lastNames[Math.floor(Math.random() * lastNames.length)],
          address: `${Math.floor(Math.random() * 9000) + 1000} Main St`,
          city: cities[Math.floor(Math.random() * cities.length)],
          state: states[Math.floor(Math.random() * states.length)],
          zip: `${Math.floor(Math.random() * 90000) + 10000}`,
        } : {}),
      });
    }

    return {
      signals,
      total: totalAvailable,
      hasMore: offset + signals.length < totalAvailable,
    };
  }

  private mockGetCategories(): Array<{
    code: string;
    name: string;
    description: string;
    parent?: string;
    avgMonthlySignals: number;
    pricePerSignal: number;
  }> {
    const categories = getIntentCategoryList();

    return categories.map((cat) => ({
      code: cat.code,
      name: cat.name,
      description: `Intent signals for ${cat.name.toLowerCase()}`,
      parent: cat.parent,
      avgMonthlySignals: 500 + Math.floor(Math.random() * 2000),
      pricePerSignal: 0.25 + Math.random() * 0.75,
    }));
  }

  private mockGetSignalCount(params: {
    categories: string[];
    geography?: IntentGeography;
    filters?: IntentFilters;
  }): {
    total: number;
    byCategory: Record<string, number>;
    estimatedMonthly: number;
  } {
    const byCategory: Record<string, number> = {};
    let total = 0;

    for (const category of params.categories) {
      const count = 100 + Math.floor(Math.random() * 500);
      byCategory[category] = count;
      total += count;
    }

    // Apply geography reduction
    if (params.geography?.type === 'state' && params.geography.values) {
      total = Math.floor(total * (params.geography.values.length / 50));
    } else if (params.geography?.type === 'zip') {
      total = Math.floor(total * 0.05);
    }

    // Apply filters
    if (params.filters?.minIntentScore && params.filters.minIntentScore > 50) {
      total = Math.floor(total * 0.6);
    }
    if (params.filters?.requireEmail) {
      total = Math.floor(total * 0.7);
    }
    if (params.filters?.requirePhone) {
      total = Math.floor(total * 0.5);
    }

    return {
      total,
      byCategory,
      estimatedMonthly: total * 4, // ~4x per month
    };
  }
}

/**
 * Singleton instance
 */
export const intentApi = new IntentApiClient();

/**
 * Get parent categories with their children
 */
export function getParentCategories(): Array<{
  code: string;
  name: string;
  description: string;
  subcategories: Array<{ code: string; name: string }>;
}> {
  return Object.entries(INTENT_CATEGORIES).map(([code, data]) => ({
    code,
    name: data.name,
    description: data.description,
    subcategories: Object.entries(data.subcategories).map(([subCode, subName]) => ({
      code: subCode,
      name: subName,
    })),
  }));
}
