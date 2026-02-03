/**
 * Tests for validation schemas
 */

import { describe, it, expect } from 'vitest';
import {
  DatabaseTypeSchema,
  GeographyTypeSchema,
  GeographySchema,
  DemographicFiltersSchema,
  IncomeRangeSchema,
  AgeRangeSchema,
  HomeValueRangeSchema,
  DateRangeSchema,
  DwellingTypeSchema,
  SearchDataInputSchema,
  PreviewCountInputSchema,
  GetSampleDataInputSchema,
  GetPricingInputSchema,
  validateInput,
} from '../../../src/utils/validation.js';
import { ValidationError } from '../../../src/utils/errors.js';

describe('DatabaseTypeSchema', () => {
  it('accepts valid database types', () => {
    expect(DatabaseTypeSchema.parse('nho')).toBe('nho');
    expect(DatabaseTypeSchema.parse('new_mover')).toBe('new_mover');
    expect(DatabaseTypeSchema.parse('consumer')).toBe('consumer');
    expect(DatabaseTypeSchema.parse('business')).toBe('business');
  });

  it('rejects invalid database types', () => {
    expect(() => DatabaseTypeSchema.parse('invalid')).toThrow();
    expect(() => DatabaseTypeSchema.parse('NHO')).toThrow(); // Case sensitive
    expect(() => DatabaseTypeSchema.parse('')).toThrow();
    expect(() => DatabaseTypeSchema.parse(null)).toThrow();
    expect(() => DatabaseTypeSchema.parse(undefined)).toThrow();
  });
});

describe('GeographyTypeSchema', () => {
  it('accepts valid geography types', () => {
    expect(GeographyTypeSchema.parse('zip')).toBe('zip');
    expect(GeographyTypeSchema.parse('city')).toBe('city');
    expect(GeographyTypeSchema.parse('county')).toBe('county');
    expect(GeographyTypeSchema.parse('state')).toBe('state');
    expect(GeographyTypeSchema.parse('radius')).toBe('radius');
    expect(GeographyTypeSchema.parse('nationwide')).toBe('nationwide');
  });

  it('rejects invalid geography types', () => {
    expect(() => GeographyTypeSchema.parse('region')).toThrow();
    expect(() => GeographyTypeSchema.parse('country')).toThrow();
    expect(() => GeographyTypeSchema.parse('')).toThrow();
  });
});

describe('GeographySchema', () => {
  describe('zip type', () => {
    it('accepts valid zip geography', () => {
      const result = GeographySchema.parse({
        type: 'zip',
        values: ['85001', '85002', '85003'],
      });
      expect(result.type).toBe('zip');
      expect(result.values).toEqual(['85001', '85002', '85003']);
    });

    it('rejects zip geography without values', () => {
      expect(() =>
        GeographySchema.parse({ type: 'zip' })
      ).toThrow();
    });

    it('rejects zip geography with empty values', () => {
      expect(() =>
        GeographySchema.parse({ type: 'zip', values: [] })
      ).toThrow();
    });
  });

  describe('city type', () => {
    it('accepts valid city geography', () => {
      const result = GeographySchema.parse({
        type: 'city',
        values: ['Phoenix', 'Tucson'],
      });
      expect(result.type).toBe('city');
      expect(result.values).toEqual(['Phoenix', 'Tucson']);
    });

    it('rejects city geography without values', () => {
      expect(() =>
        GeographySchema.parse({ type: 'city' })
      ).toThrow();
    });
  });

  describe('county type', () => {
    it('accepts valid county geography', () => {
      const result = GeographySchema.parse({
        type: 'county',
        values: ['Maricopa County', 'Pima County'],
      });
      expect(result.type).toBe('county');
    });

    it('rejects county geography without values', () => {
      expect(() =>
        GeographySchema.parse({ type: 'county' })
      ).toThrow();
    });
  });

  describe('state type', () => {
    it('accepts valid state geography', () => {
      const result = GeographySchema.parse({
        type: 'state',
        values: ['AZ', 'CA', 'TX'],
      });
      expect(result.type).toBe('state');
      expect(result.values).toHaveLength(3);
    });

    it('rejects state geography without values', () => {
      expect(() =>
        GeographySchema.parse({ type: 'state' })
      ).toThrow();
    });
  });

  describe('radius type', () => {
    it('accepts valid radius geography', () => {
      const result = GeographySchema.parse({
        type: 'radius',
        center: { lat: 33.4484, lng: -112.074 },
        radiusMiles: 25,
      });
      expect(result.type).toBe('radius');
      expect(result.center).toEqual({ lat: 33.4484, lng: -112.074 });
      expect(result.radiusMiles).toBe(25);
    });

    it('rejects radius without center', () => {
      expect(() =>
        GeographySchema.parse({
          type: 'radius',
          radiusMiles: 25,
        })
      ).toThrow();
    });

    it('rejects radius without radiusMiles', () => {
      expect(() =>
        GeographySchema.parse({
          type: 'radius',
          center: { lat: 33.4484, lng: -112.074 },
        })
      ).toThrow();
    });

    it('rejects radius with invalid lat/lng', () => {
      expect(() =>
        GeographySchema.parse({
          type: 'radius',
          center: { lat: 100, lng: -112.074 }, // lat > 90
          radiusMiles: 25,
        })
      ).toThrow();

      expect(() =>
        GeographySchema.parse({
          type: 'radius',
          center: { lat: 33.4484, lng: -200 }, // lng < -180
          radiusMiles: 25,
        })
      ).toThrow();
    });

    it('rejects radius outside 1-100 mile range', () => {
      expect(() =>
        GeographySchema.parse({
          type: 'radius',
          center: { lat: 33.4484, lng: -112.074 },
          radiusMiles: 0,
        })
      ).toThrow();

      expect(() =>
        GeographySchema.parse({
          type: 'radius',
          center: { lat: 33.4484, lng: -112.074 },
          radiusMiles: 101,
        })
      ).toThrow();
    });
  });

  describe('nationwide type', () => {
    it('accepts valid nationwide geography', () => {
      const result = GeographySchema.parse({
        type: 'nationwide',
      });
      expect(result.type).toBe('nationwide');
    });

    it('accepts nationwide with extra fields (ignored)', () => {
      const result = GeographySchema.parse({
        type: 'nationwide',
        values: ['ignored'],
      });
      expect(result.type).toBe('nationwide');
    });
  });
});

describe('IncomeRangeSchema', () => {
  it('accepts valid income range', () => {
    const result = IncomeRangeSchema.parse({ min: 50000, max: 150000 });
    expect(result.min).toBe(50000);
    expect(result.max).toBe(150000);
  });

  it('accepts min only', () => {
    const result = IncomeRangeSchema.parse({ min: 75000 });
    expect(result.min).toBe(75000);
    expect(result.max).toBeUndefined();
  });

  it('accepts max only', () => {
    const result = IncomeRangeSchema.parse({ max: 200000 });
    expect(result.max).toBe(200000);
    expect(result.min).toBeUndefined();
  });

  it('rejects min greater than max', () => {
    expect(() =>
      IncomeRangeSchema.parse({ min: 100000, max: 50000 })
    ).toThrow();
  });

  it('rejects negative values', () => {
    expect(() =>
      IncomeRangeSchema.parse({ min: -10000 })
    ).toThrow();
  });
});

describe('AgeRangeSchema', () => {
  it('accepts valid age range', () => {
    const result = AgeRangeSchema.parse({ min: 25, max: 55 });
    expect(result.min).toBe(25);
    expect(result.max).toBe(55);
  });

  it('rejects age below 18', () => {
    expect(() =>
      AgeRangeSchema.parse({ min: 16 })
    ).toThrow();
  });

  it('rejects age above 120', () => {
    expect(() =>
      AgeRangeSchema.parse({ max: 150 })
    ).toThrow();
  });

  it('rejects min greater than max', () => {
    expect(() =>
      AgeRangeSchema.parse({ min: 60, max: 40 })
    ).toThrow();
  });
});

describe('HomeValueRangeSchema', () => {
  it('accepts valid home value range', () => {
    const result = HomeValueRangeSchema.parse({ min: 200000, max: 500000 });
    expect(result.min).toBe(200000);
    expect(result.max).toBe(500000);
  });

  it('rejects min greater than max', () => {
    expect(() =>
      HomeValueRangeSchema.parse({ min: 500000, max: 200000 })
    ).toThrow();
  });

  it('rejects negative values', () => {
    expect(() =>
      HomeValueRangeSchema.parse({ min: -100000 })
    ).toThrow();
  });
});

describe('DateRangeSchema', () => {
  it('accepts valid date range', () => {
    const result = DateRangeSchema.parse({
      from: '2024-01-01T00:00:00.000Z',
      to: '2024-12-31T23:59:59.999Z',
    });
    expect(result.from).toBe('2024-01-01T00:00:00.000Z');
    expect(result.to).toBe('2024-12-31T23:59:59.999Z');
  });

  it('rejects from after to', () => {
    expect(() =>
      DateRangeSchema.parse({
        from: '2024-12-31T00:00:00.000Z',
        to: '2024-01-01T00:00:00.000Z',
      })
    ).toThrow();
  });

  it('rejects invalid date format', () => {
    expect(() =>
      DateRangeSchema.parse({
        from: '2024-01-01', // Missing time component
      })
    ).toThrow();
  });
});

describe('DwellingTypeSchema', () => {
  it('accepts valid dwelling types', () => {
    expect(DwellingTypeSchema.parse('single_family')).toBe('single_family');
    expect(DwellingTypeSchema.parse('condo')).toBe('condo');
    expect(DwellingTypeSchema.parse('townhouse')).toBe('townhouse');
    expect(DwellingTypeSchema.parse('multi_family')).toBe('multi_family');
    expect(DwellingTypeSchema.parse('apartment')).toBe('apartment');
    expect(DwellingTypeSchema.parse('mobile_home')).toBe('mobile_home');
  });

  it('rejects invalid dwelling types', () => {
    expect(() => DwellingTypeSchema.parse('house')).toThrow();
    expect(() => DwellingTypeSchema.parse('duplex')).toThrow();
  });
});

describe('DemographicFiltersSchema', () => {
  it('accepts valid demographic filters', () => {
    const result = DemographicFiltersSchema.parse({
      income: { min: 50000, max: 150000 },
      age: { min: 25, max: 55 },
      homeValue: { min: 200000 },
      dwellingType: ['single_family', 'condo'],
      hasChildren: true,
      ownerOccupied: true,
    });

    expect(result?.income?.min).toBe(50000);
    expect(result?.age?.min).toBe(25);
    expect(result?.dwellingType).toContain('single_family');
  });

  it('accepts empty filters', () => {
    const result = DemographicFiltersSchema.parse({});
    expect(result).toEqual({});
  });

  it('accepts undefined filters', () => {
    const result = DemographicFiltersSchema.parse(undefined);
    expect(result).toBeUndefined();
  });

  it('rejects invalid nested filters', () => {
    expect(() =>
      DemographicFiltersSchema.parse({
        age: { min: 10 }, // Below 18
      })
    ).toThrow();
  });
});

describe('SearchDataInputSchema', () => {
  it('accepts valid search input', () => {
    const result = SearchDataInputSchema.parse({
      database: 'nho',
      geography: { type: 'zip', values: ['85001'] },
      limit: 100,
      offset: 0,
    });

    expect(result.database).toBe('nho');
    expect(result.limit).toBe(100);
  });

  it('applies default limit of 100', () => {
    const result = SearchDataInputSchema.parse({
      database: 'nho',
      geography: { type: 'zip', values: ['85001'] },
    });

    expect(result.limit).toBe(100);
  });

  it('applies default offset of 0', () => {
    const result = SearchDataInputSchema.parse({
      database: 'nho',
      geography: { type: 'zip', values: ['85001'] },
    });

    expect(result.offset).toBe(0);
  });

  it('rejects limit below 1', () => {
    expect(() =>
      SearchDataInputSchema.parse({
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        limit: 0,
      })
    ).toThrow();
  });

  it('rejects limit above 10000', () => {
    expect(() =>
      SearchDataInputSchema.parse({
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        limit: 10001,
      })
    ).toThrow();
  });

  it('rejects negative offset', () => {
    expect(() =>
      SearchDataInputSchema.parse({
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        offset: -1,
      })
    ).toThrow();
  });

  it('applies default include_email of false', () => {
    const result = SearchDataInputSchema.parse({
      database: 'nho',
      geography: { type: 'zip', values: ['85001'] },
    });

    expect(result.include_email).toBe(false);
  });

  it('applies default include_phone of false', () => {
    const result = SearchDataInputSchema.parse({
      database: 'nho',
      geography: { type: 'zip', values: ['85001'] },
    });

    expect(result.include_phone).toBe(false);
  });
});

describe('PreviewCountInputSchema', () => {
  it('accepts valid preview count input', () => {
    const result = PreviewCountInputSchema.parse({
      database: 'new_mover',
      geography: { type: 'state', values: ['AZ'] },
    });

    expect(result.database).toBe('new_mover');
  });

  it('accepts filters', () => {
    const result = PreviewCountInputSchema.parse({
      database: 'nho',
      geography: { type: 'zip', values: ['85001'] },
      filters: {
        income: { min: 75000 },
      },
    });

    expect(result.filters?.income?.min).toBe(75000);
  });
});

describe('GetSampleDataInputSchema', () => {
  it('accepts valid sample data input', () => {
    const result = GetSampleDataInputSchema.parse({
      database: 'consumer',
      geography: { type: 'city', values: ['Phoenix'] },
      count: 5,
    });

    expect(result.count).toBe(5);
  });

  it('applies default count of 5', () => {
    const result = GetSampleDataInputSchema.parse({
      database: 'nho',
      geography: { type: 'zip', values: ['85001'] },
    });

    expect(result.count).toBe(5);
  });

  it('rejects count below 1', () => {
    expect(() =>
      GetSampleDataInputSchema.parse({
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        count: 0,
      })
    ).toThrow();
  });

  it('rejects count above 10', () => {
    expect(() =>
      GetSampleDataInputSchema.parse({
        database: 'nho',
        geography: { type: 'zip', values: ['85001'] },
        count: 11,
      })
    ).toThrow();
  });
});

describe('GetPricingInputSchema', () => {
  it('accepts empty input', () => {
    const result = GetPricingInputSchema.parse({});
    expect(result).toEqual({});
  });

  it('accepts undefined input', () => {
    const result = GetPricingInputSchema.parse(undefined);
    expect(result).toBeUndefined();
  });

  it('accepts database filter', () => {
    const result = GetPricingInputSchema.parse({
      database: 'nho',
    });
    expect(result?.database).toBe('nho');
  });

  it('accepts volume parameter', () => {
    const result = GetPricingInputSchema.parse({
      volume: 5000,
    });
    expect(result?.volume).toBe(5000);
  });

  it('rejects volume below 1', () => {
    expect(() =>
      GetPricingInputSchema.parse({
        volume: 0,
      })
    ).toThrow();
  });
});

describe('validateInput helper', () => {
  it('returns parsed data for valid input', () => {
    const result = validateInput(DatabaseTypeSchema, 'nho');
    expect(result).toBe('nho');
  });

  it('throws error for invalid input', () => {
    expect(() =>
      validateInput(DatabaseTypeSchema, 'invalid')
    ).toThrow();
  });

  it('throws error with details for invalid input', () => {
    expect(() =>
      validateInput(SearchDataInputSchema, { database: 'invalid' })
    ).toThrow();
  });
});
