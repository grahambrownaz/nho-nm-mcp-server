/**
 * Tests for LeadsPlease API Service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LeadsPleaseApiService, leadsPleaseApi } from '../../../src/services/leadsplease-api.js';
import type { Geography, DatabaseType } from '../../../src/utils/validation.js';

describe('LeadsPleaseApiService', () => {
  describe('searchRecords', () => {
    it('returns records matching the search criteria', async () => {
      const params = {
        database: 'nho' as DatabaseType,
        geography: { type: 'zip', values: ['85001', '85002'] } as Geography,
        limit: 10,
        offset: 0,
        includeEmail: false,
        includePhone: false,
      };

      const result = await leadsPleaseApi.searchRecords(params);

      expect(result).toBeDefined();
      expect(result.records).toBeDefined();
      expect(Array.isArray(result.records)).toBe(true);
      expect(result.total).toBeDefined();
      expect(typeof result.total).toBe('number');
    });

    it('respects the limit parameter', async () => {
      const params = {
        database: 'nho' as DatabaseType,
        geography: { type: 'state', values: ['AZ'] } as Geography,
        limit: 5,
        offset: 0,
        includeEmail: false,
        includePhone: false,
      };

      const result = await leadsPleaseApi.searchRecords(params);

      expect(result.records.length).toBeLessThanOrEqual(5);
    });

    it('includes email when includeEmail is true', async () => {
      const params = {
        database: 'nho' as DatabaseType,
        geography: { type: 'zip', values: ['85001'] } as Geography,
        limit: 5,
        offset: 0,
        includeEmail: true,
        includePhone: false,
      };

      const result = await leadsPleaseApi.searchRecords(params);

      result.records.forEach((record) => {
        expect(record.email).toBeDefined();
        expect(record.email).toContain('@');
      });
    });

    it('includes phone when includePhone is true', async () => {
      const params = {
        database: 'nho' as DatabaseType,
        geography: { type: 'zip', values: ['85001'] } as Geography,
        limit: 5,
        offset: 0,
        includeEmail: false,
        includePhone: true,
      };

      const result = await leadsPleaseApi.searchRecords(params);

      result.records.forEach((record) => {
        expect(record.phone).toBeDefined();
      });
    });

    it('excludes email when includeEmail is false', async () => {
      const params = {
        database: 'nho' as DatabaseType,
        geography: { type: 'zip', values: ['85001'] } as Geography,
        limit: 5,
        offset: 0,
        includeEmail: false,
        includePhone: false,
      };

      const result = await leadsPleaseApi.searchRecords(params);

      result.records.forEach((record) => {
        expect(record.email).toBeUndefined();
      });
    });

    it('excludes phone when includePhone is false', async () => {
      const params = {
        database: 'nho' as DatabaseType,
        geography: { type: 'zip', values: ['85001'] } as Geography,
        limit: 5,
        offset: 0,
        includeEmail: false,
        includePhone: false,
      };

      const result = await leadsPleaseApi.searchRecords(params);

      result.records.forEach((record) => {
        expect(record.phone).toBeUndefined();
      });
    });

    it('returns records with required fields', async () => {
      const params = {
        database: 'nho' as DatabaseType,
        geography: { type: 'zip', values: ['85001'] } as Geography,
        limit: 5,
        offset: 0,
        includeEmail: false,
        includePhone: false,
      };

      const result = await leadsPleaseApi.searchRecords(params);

      result.records.forEach((record) => {
        expect(record.id).toBeDefined();
        expect(record.firstName).toBeDefined();
        expect(record.lastName).toBeDefined();
        expect(record.address).toBeDefined();
        expect(record.address.street).toBeDefined();
        expect(record.address.city).toBeDefined();
        expect(record.address.state).toBeDefined();
        expect(record.address.zip).toBeDefined();
        expect(record.recordType).toBeDefined();
        expect(record.dataDate).toBeDefined();
      });
    });

    it('includes move/purchase date for NHO records', async () => {
      const params = {
        database: 'nho' as DatabaseType,
        geography: { type: 'zip', values: ['85001'] } as Geography,
        limit: 5,
        offset: 0,
        includeEmail: false,
        includePhone: false,
      };

      const result = await leadsPleaseApi.searchRecords(params);

      result.records.forEach((record) => {
        expect(record.moveDate).toBeDefined();
        expect(record.purchaseDate).toBeDefined();
        expect(record.purchasePrice).toBeDefined();
      });
    });

    it('includes move date for new_mover records', async () => {
      const params = {
        database: 'new_mover' as DatabaseType,
        geography: { type: 'zip', values: ['85001'] } as Geography,
        limit: 5,
        offset: 0,
        includeEmail: false,
        includePhone: false,
      };

      const result = await leadsPleaseApi.searchRecords(params);

      result.records.forEach((record) => {
        expect(record.moveDate).toBeDefined();
      });
    });

    it('returns lower total when filters are applied', async () => {
      const paramsWithoutFilters = {
        database: 'nho' as DatabaseType,
        geography: { type: 'state', values: ['AZ'] } as Geography,
        limit: 10,
        offset: 0,
        includeEmail: false,
        includePhone: false,
      };

      const paramsWithFilters = {
        ...paramsWithoutFilters,
        filters: {
          income: { min: 100000 },
        },
      };

      const resultWithout = await leadsPleaseApi.searchRecords(paramsWithoutFilters);
      const resultWith = await leadsPleaseApi.searchRecords(paramsWithFilters);

      // Filtered results should have a lower total
      expect(resultWith.total).toBeLessThan(resultWithout.total);
    });
  });

  describe('getCount', () => {
    it('returns count information for valid geography', async () => {
      const params = {
        database: 'nho' as DatabaseType,
        geography: { type: 'zip', values: ['85001', '85002'] } as Geography,
      };

      const result = await leadsPleaseApi.getCount(params);

      expect(result).toBeDefined();
      expect(result.total_available).toBeDefined();
      expect(typeof result.total_available).toBe('number');
      expect(result.total_available).toBeGreaterThan(0);
    });

    it('returns estimated weekly counts', async () => {
      const params = {
        database: 'nho' as DatabaseType,
        geography: { type: 'state', values: ['AZ'] } as Geography,
      };

      const result = await leadsPleaseApi.getCount(params);

      expect(result.estimated_weekly).toBeDefined();
      expect(typeof result.estimated_weekly).toBe('number');
      expect(result.estimated_weekly).toBeLessThan(result.total_available);
    });

    it('returns estimated monthly counts', async () => {
      const params = {
        database: 'nho' as DatabaseType,
        geography: { type: 'state', values: ['AZ'] } as Geography,
      };

      const result = await leadsPleaseApi.getCount(params);

      expect(result.estimated_monthly).toBeDefined();
      expect(typeof result.estimated_monthly).toBe('number');
      expect(result.estimated_monthly).toBeGreaterThan(result.estimated_weekly);
    });

    it('returns geography summary', async () => {
      const params = {
        database: 'nho' as DatabaseType,
        geography: { type: 'state', values: ['AZ', 'CA'] } as Geography,
      };

      const result = await leadsPleaseApi.getCount(params);

      expect(result.geography_summary).toBeDefined();
      expect(result.geography_summary).toContain('States');
    });

    it('indicates filters_applied correctly', async () => {
      const paramsWithoutFilters = {
        database: 'nho' as DatabaseType,
        geography: { type: 'zip', values: ['85001'] } as Geography,
      };

      const paramsWithFilters = {
        ...paramsWithoutFilters,
        filters: { income: { min: 50000 } },
      };

      const resultWithout = await leadsPleaseApi.getCount(paramsWithoutFilters);
      const resultWith = await leadsPleaseApi.getCount(paramsWithFilters);

      expect(resultWithout.filters_applied).toBe(false);
      expect(resultWith.filters_applied).toBe(true);
    });

    it('returns higher totals for larger geographies', async () => {
      const zipParams = {
        database: 'nho' as DatabaseType,
        geography: { type: 'zip', values: ['85001'] } as Geography,
      };

      const stateParams = {
        database: 'nho' as DatabaseType,
        geography: { type: 'state', values: ['AZ'] } as Geography,
      };

      const zipResult = await leadsPleaseApi.getCount(zipParams);
      const stateResult = await leadsPleaseApi.getCount(stateParams);

      expect(stateResult.total_available).toBeGreaterThan(zipResult.total_available);
    });
  });

  describe('getSamples', () => {
    it('returns sample records', async () => {
      const params = {
        database: 'nho' as DatabaseType,
        geography: { type: 'zip', values: ['85001'] } as Geography,
        count: 5,
      };

      const result = await leadsPleaseApi.getSamples(params);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(5);
    });

    it('respects the count parameter', async () => {
      const params = {
        database: 'nho' as DatabaseType,
        geography: { type: 'zip', values: ['85001'] } as Geography,
        count: 3,
      };

      const result = await leadsPleaseApi.getSamples(params);

      expect(result.length).toBe(3);
    });

    it('does not include email in samples', async () => {
      const params = {
        database: 'nho' as DatabaseType,
        geography: { type: 'zip', values: ['85001'] } as Geography,
        count: 5,
      };

      const result = await leadsPleaseApi.getSamples(params);

      result.forEach((record) => {
        expect(record.email).toBeUndefined();
      });
    });

    it('does not include phone in samples', async () => {
      const params = {
        database: 'nho' as DatabaseType,
        geography: { type: 'zip', values: ['85001'] } as Geography,
        count: 5,
      };

      const result = await leadsPleaseApi.getSamples(params);

      result.forEach((record) => {
        expect(record.phone).toBeUndefined();
      });
    });

    it('returns records with basic fields', async () => {
      const params = {
        database: 'nho' as DatabaseType,
        geography: { type: 'zip', values: ['85001'] } as Geography,
        count: 3,
      };

      const result = await leadsPleaseApi.getSamples(params);

      result.forEach((record) => {
        expect(record.firstName).toBeDefined();
        expect(record.lastName).toBeDefined();
        expect(record.address).toBeDefined();
      });
    });
  });

  describe('geography handling', () => {
    it('handles nationwide geography', async () => {
      const params = {
        database: 'nho' as DatabaseType,
        geography: { type: 'nationwide' } as Geography,
      };

      const result = await leadsPleaseApi.getCount(params);

      expect(result.total_available).toBeGreaterThan(1000000);
      expect(result.geography_summary).toBe('Nationwide');
    });

    it('handles state geography', async () => {
      const params = {
        database: 'nho' as DatabaseType,
        geography: { type: 'state', values: ['AZ', 'CA'] } as Geography,
      };

      const result = await leadsPleaseApi.getCount(params);

      expect(result.geography_summary).toContain('AZ');
      expect(result.geography_summary).toContain('CA');
    });

    it('handles county geography', async () => {
      const params = {
        database: 'nho' as DatabaseType,
        geography: { type: 'county', values: ['Maricopa County'] } as Geography,
      };

      const result = await leadsPleaseApi.getCount(params);

      expect(result.geography_summary).toContain('Counties');
    });

    it('handles city geography', async () => {
      const params = {
        database: 'nho' as DatabaseType,
        geography: { type: 'city', values: ['Phoenix', 'Tucson'] } as Geography,
      };

      const result = await leadsPleaseApi.getCount(params);

      expect(result.geography_summary).toContain('Cities');
    });

    it('handles zip geography', async () => {
      const params = {
        database: 'nho' as DatabaseType,
        geography: { type: 'zip', values: ['85001', '85002'] } as Geography,
      };

      const result = await leadsPleaseApi.getCount(params);

      expect(result.geography_summary).toContain('ZIP');
    });

    it('handles radius geography', async () => {
      const params = {
        database: 'nho' as DatabaseType,
        geography: {
          type: 'radius',
          center: { lat: 33.4484, lng: -112.074 },
          radiusMiles: 25,
        } as Geography,
      };

      const result = await leadsPleaseApi.getCount(params);

      expect(result.geography_summary).toContain('25 mile radius');
    });
  });

  describe('database types', () => {
    it('handles nho database', async () => {
      const params = {
        database: 'nho' as DatabaseType,
        geography: { type: 'zip', values: ['85001'] } as Geography,
        count: 3,
      };

      const result = await leadsPleaseApi.getSamples(params);

      result.forEach((record) => {
        expect(record.recordType).toBe('nho');
      });
    });

    it('handles new_mover database', async () => {
      const params = {
        database: 'new_mover' as DatabaseType,
        geography: { type: 'zip', values: ['85001'] } as Geography,
        count: 3,
      };

      const result = await leadsPleaseApi.getSamples(params);

      result.forEach((record) => {
        expect(record.recordType).toBe('new_mover');
      });
    });

    it('handles consumer database', async () => {
      const params = {
        database: 'consumer' as DatabaseType,
        geography: { type: 'zip', values: ['85001'] } as Geography,
        count: 3,
      };

      const result = await leadsPleaseApi.getSamples(params);

      result.forEach((record) => {
        expect(record.recordType).toBe('consumer');
      });
    });

    it('handles business database', async () => {
      const params = {
        database: 'business' as DatabaseType,
        geography: { type: 'zip', values: ['85001'] } as Geography,
        count: 3,
      };

      const result = await leadsPleaseApi.getSamples(params);

      result.forEach((record) => {
        expect(record.recordType).toBe('business');
      });
    });
  });

  describe('singleton instance', () => {
    it('exports a singleton instance', () => {
      expect(leadsPleaseApi).toBeDefined();
      expect(leadsPleaseApi).toBeInstanceOf(LeadsPleaseApiService);
    });
  });
});
