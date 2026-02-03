/**
 * LeadsPlease API Service
 * Handles all communication with the LeadsPlease data API
 * Currently returns mock data - structured to easily swap in real API later
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Geography,
  DemographicFilters,
  DataRecord,
  PreviewCountResponse,
  DatabaseType,
} from '../utils/validation.js';
import { ExternalServiceError } from '../utils/errors.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const LEADSPLEASE_API_URL = process.env.LEADSPLEASE_API_URL || 'https://api.leadsplease.com/v1';
const LEADSPLEASE_API_KEY = process.env.LEADSPLEASE_API_KEY || '';

// ============================================================================
// MOCK DATA GENERATION
// ============================================================================

const FIRST_NAMES = [
  'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda',
  'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Lisa', 'Daniel', 'Nancy',
  'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Donald', 'Ashley',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker',
];

const STREET_NAMES = [
  'Main', 'Oak', 'Pine', 'Maple', 'Cedar', 'Elm', 'Washington', 'Lake', 'Hill',
  'Park', 'Forest', 'River', 'Valley', 'Sunset', 'Highland', 'Meadow', 'Spring',
];

const STREET_TYPES = ['St', 'Ave', 'Blvd', 'Dr', 'Ln', 'Rd', 'Way', 'Ct', 'Pl'];

const CITIES_BY_STATE: Record<string, string[]> = {
  AZ: ['Phoenix', 'Tucson', 'Mesa', 'Chandler', 'Scottsdale', 'Gilbert', 'Tempe'],
  CA: ['Los Angeles', 'San Diego', 'San Jose', 'San Francisco', 'Fresno', 'Sacramento'],
  TX: ['Houston', 'San Antonio', 'Dallas', 'Austin', 'Fort Worth', 'El Paso'],
  FL: ['Jacksonville', 'Miami', 'Tampa', 'Orlando', 'St. Petersburg', 'Hialeah'],
  NY: ['New York', 'Buffalo', 'Rochester', 'Yonkers', 'Syracuse', 'Albany'],
  // Add more as needed
};

const INCOME_RANGES = [
  '$25,000 - $34,999',
  '$35,000 - $49,999',
  '$50,000 - $74,999',
  '$75,000 - $99,999',
  '$100,000 - $149,999',
  '$150,000 - $199,999',
  '$200,000+',
];

const AGE_RANGES = ['25-34', '35-44', '45-54', '55-64', '65-74', '75+'];

const HOME_VALUES = [
  '$100,000 - $149,999',
  '$150,000 - $199,999',
  '$200,000 - $299,999',
  '$300,000 - $399,999',
  '$400,000 - $499,999',
  '$500,000 - $749,999',
  '$750,000 - $999,999',
  '$1,000,000+',
];

const DWELLING_TYPES = [
  'Single Family',
  'Condominium',
  'Townhouse',
  'Multi-Family',
  'Mobile Home',
];

/**
 * Generate a random element from an array
 */
function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a random number in a range
 */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate a random date within the last N months
 */
function randomRecentDate(monthsBack: number): string {
  const now = new Date();
  const daysBack = randomInt(1, monthsBack * 30);
  const date = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  return date.toISOString().split('T')[0];
}

/**
 * Generate a random ZIP code for a state
 */
function generateZipForState(state: string): string {
  const zipRanges: Record<string, [number, number]> = {
    AZ: [85001, 86556],
    CA: [90001, 96162],
    TX: [73301, 79999],
    FL: [32003, 34997],
    NY: [10001, 14925],
    // Defaults
    DEFAULT: [10001, 99950],
  };
  const range = zipRanges[state] || zipRanges.DEFAULT;
  return String(randomInt(range[0], range[1]));
}

/**
 * Generate a mock data record
 */
function generateMockRecord(
  database: DatabaseType,
  geography: Geography,
  includeEmail: boolean,
  includePhone: boolean
): DataRecord {
  // Determine state and city based on geography
  let state = 'AZ';
  let city = 'Phoenix';
  let zip = '85001';

  if (geography.type === 'state' && geography.values?.length) {
    state = geography.values[0].toUpperCase();
  } else if (geography.type === 'zip' && geography.values?.length) {
    zip = geography.values[0];
    // Infer state from zip (simplified)
    if (zip.startsWith('85') || zip.startsWith('86')) state = 'AZ';
    else if (zip.startsWith('9')) state = 'CA';
    else if (zip.startsWith('7')) state = 'TX';
    else if (zip.startsWith('3')) state = 'FL';
    else if (zip.startsWith('1')) state = 'NY';
  }

  const cities = CITIES_BY_STATE[state] || ['Springfield'];
  city = randomFrom(cities);

  if (geography.type !== 'zip') {
    zip = generateZipForState(state);
  }

  const firstName = randomFrom(FIRST_NAMES);
  const lastName = randomFrom(LAST_NAMES);
  const streetNum = randomInt(100, 9999);
  const streetName = randomFrom(STREET_NAMES);
  const streetType = randomFrom(STREET_TYPES);

  const record: DataRecord = {
    id: uuidv4(),
    firstName,
    lastName,
    address: {
      street: `${streetNum} ${streetName} ${streetType}`,
      city,
      state,
      zip,
      zip4: String(randomInt(1000, 9999)),
    },
    demographics: {
      estimatedIncome: randomFrom(INCOME_RANGES),
      estimatedAge: randomFrom(AGE_RANGES),
      homeValue: randomFrom(HOME_VALUES),
      dwellingType: randomFrom(DWELLING_TYPES),
      ownerOccupied: Math.random() > 0.2,
      lengthOfResidence: `${randomInt(1, 120)} months`,
      hasChildren: Math.random() > 0.6,
    },
    recordType: database,
    dataDate: randomRecentDate(1),
  };

  // Add move/purchase date for NHO/New Mover
  if (database === 'nho' || database === 'new_mover') {
    record.moveDate = randomRecentDate(6);
    if (database === 'nho') {
      record.purchaseDate = randomRecentDate(6);
      record.purchasePrice = randomInt(150000, 1500000);
    }
  }

  // Add email if requested
  if (includeEmail) {
    record.email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randomInt(1, 999)}@example.com`;
  }

  // Add phone if requested
  if (includePhone) {
    const areaCode = randomInt(200, 999);
    const exchange = randomInt(200, 999);
    const subscriber = randomInt(1000, 9999);
    record.phone = `(${areaCode}) ${exchange}-${subscriber}`;
  }

  return record;
}

// ============================================================================
// API SERVICE CLASS
// ============================================================================

export class LeadsPleaseApiService {
  // Reserved for real API implementation
  private _apiUrl: string;
  private _apiKey: string;
  private useMockData: boolean;

  constructor() {
    this._apiUrl = LEADSPLEASE_API_URL;
    this._apiKey = LEADSPLEASE_API_KEY;
    // Use mock data if no API key is configured
    this.useMockData = !this._apiKey || this._apiKey === 'your-leadsplease-api-key';
  }

  /**
   * Search for records matching the criteria
   */
  async searchRecords(params: {
    database: DatabaseType;
    geography: Geography;
    filters?: DemographicFilters;
    limit: number;
    offset: number;
    includeEmail: boolean;
    includePhone: boolean;
  }): Promise<{ records: DataRecord[]; total: number }> {
    if (this.useMockData) {
      return this.mockSearchRecords(params);
    }

    // Real API implementation would go here
    try {
      // const response = await fetch(`${this.apiUrl}/search`, {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${this.apiKey}`,
      //   },
      //   body: JSON.stringify(params),
      // });
      // return await response.json();

      // For now, fall back to mock
      return this.mockSearchRecords(params);
    } catch (error) {
      throw new ExternalServiceError('LeadsPlease API', error as Error);
    }
  }

  /**
   * Get count of available records (no actual data returned)
   */
  async getCount(params: {
    database: DatabaseType;
    geography: Geography;
    filters?: DemographicFilters;
  }): Promise<PreviewCountResponse> {
    if (this.useMockData) {
      return this.mockGetCount(params);
    }

    try {
      // Real API implementation would go here
      return this.mockGetCount(params);
    } catch (error) {
      throw new ExternalServiceError('LeadsPlease API', error as Error);
    }
  }

  /**
   * Get sample records for preview (no charge)
   */
  async getSamples(params: {
    database: DatabaseType;
    geography: Geography;
    count: number;
  }): Promise<DataRecord[]> {
    if (this.useMockData) {
      return this.mockGetSamples(params);
    }

    try {
      // Real API implementation would go here
      return this.mockGetSamples(params);
    } catch (error) {
      throw new ExternalServiceError('LeadsPlease API', error as Error);
    }
  }

  // ============================================================================
  // MOCK IMPLEMENTATIONS
  // ============================================================================

  private mockSearchRecords(params: {
    database: DatabaseType;
    geography: Geography;
    filters?: DemographicFilters;
    limit: number;
    offset: number;
    includeEmail: boolean;
    includePhone: boolean;
  }): { records: DataRecord[]; total: number } {
    // Generate a realistic total based on geography
    const baseTotal = this.calculateMockTotal(params.geography);
    const filteredTotal = params.filters
      ? Math.floor(baseTotal * 0.3) // Filters typically reduce by 70%
      : baseTotal;

    // Generate records up to the limit
    const recordsToGenerate = Math.min(params.limit, filteredTotal - params.offset);
    const records: DataRecord[] = [];

    for (let i = 0; i < recordsToGenerate; i++) {
      records.push(
        generateMockRecord(
          params.database,
          params.geography,
          params.includeEmail,
          params.includePhone
        )
      );
    }

    return {
      records,
      total: filteredTotal,
    };
  }

  private mockGetCount(params: {
    database: DatabaseType;
    geography: Geography;
    filters?: DemographicFilters;
  }): PreviewCountResponse {
    const baseTotal = this.calculateMockTotal(params.geography);
    const filteredTotal = params.filters
      ? Math.floor(baseTotal * 0.3)
      : baseTotal;

    // Estimate weekly/monthly based on database type
    const weeklyFactor = params.database === 'nho' ? 0.04 : 0.08; // NHO has slower turnover
    const monthlyFactor = weeklyFactor * 4.3;

    return {
      total_available: filteredTotal,
      estimated_weekly: Math.floor(filteredTotal * weeklyFactor),
      estimated_monthly: Math.floor(filteredTotal * monthlyFactor),
      geography_summary: this.formatGeographySummary(params.geography),
      filters_applied: !!params.filters,
    };
  }

  private mockGetSamples(params: {
    database: DatabaseType;
    geography: Geography;
    count: number;
  }): DataRecord[] {
    const records: DataRecord[] = [];

    for (let i = 0; i < params.count; i++) {
      // Samples don't include email/phone
      records.push(
        generateMockRecord(params.database, params.geography, false, false)
      );
    }

    return records;
  }

  /**
   * Calculate a realistic mock total based on geography
   */
  private calculateMockTotal(geography: Geography): number {
    switch (geography.type) {
      case 'nationwide':
        return randomInt(5000000, 8000000);
      case 'state':
        // Average per state, varies by size
        const statesCount = geography.values?.length || 1;
        return randomInt(50000, 200000) * statesCount;
      case 'county':
        const countiesCount = geography.values?.length || 1;
        return randomInt(5000, 30000) * countiesCount;
      case 'city':
        const citiesCount = geography.values?.length || 1;
        return randomInt(1000, 15000) * citiesCount;
      case 'zip':
        const zipsCount = geography.values?.length || 1;
        return randomInt(200, 2000) * zipsCount;
      case 'radius':
        const miles = geography.radiusMiles || 10;
        return randomInt(500, 3000) * Math.sqrt(miles);
      default:
        return randomInt(1000, 10000);
    }
  }

  /**
   * Format geography for human-readable summary
   */
  private formatGeographySummary(geography: Geography): string {
    switch (geography.type) {
      case 'nationwide':
        return 'Nationwide';
      case 'state':
        return `States: ${geography.values?.join(', ')}`;
      case 'county':
        return `Counties: ${geography.values?.join(', ')}`;
      case 'city':
        return `Cities: ${geography.values?.join(', ')}`;
      case 'zip':
        const zips = geography.values || [];
        if (zips.length <= 3) {
          return `ZIP Codes: ${zips.join(', ')}`;
        }
        return `${zips.length} ZIP Codes`;
      case 'radius':
        return `${geography.radiusMiles} mile radius from ${geography.center?.lat}, ${geography.center?.lng}`;
      default:
        return 'Custom geography';
    }
  }
}

// Export singleton instance
export const leadsPleaseApi = new LeadsPleaseApiService();
