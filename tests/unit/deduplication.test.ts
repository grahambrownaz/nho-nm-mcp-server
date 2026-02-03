/**
 * Deduplication Service Tests
 */

import { describe, it, expect } from 'vitest';
import { getDeduplicationService, generateRecordHash } from '../../src/services/deduplication.js';

describe('Deduplication Service', () => {
  const dedupeService = getDeduplicationService();

  describe('generateRecordHash', () => {
    it('should generate consistent hash for same data', () => {
      const record1 = {
        last_name: 'Smith',
        address: '123 Main St',
        city: 'Phoenix',
        state: 'AZ',
        zip: '85001',
      };
      const record2 = {
        last_name: 'Smith',
        address: '123 Main St',
        city: 'Phoenix',
        state: 'AZ',
        zip: '85001',
      };

      const hash1 = generateRecordHash(record1);
      const hash2 = generateRecordHash(record2);

      expect(hash1).toBe(hash2);
    });

    it('should normalize addresses', () => {
      const record1 = {
        last_name: 'Smith',
        address: '123 Main Street',
        city: 'Phoenix',
        state: 'AZ',
        zip: '85001',
      };
      const record2 = {
        last_name: 'Smith',
        address: '123 main st',
        city: 'Phoenix',
        state: 'AZ',
        zip: '85001',
      };

      const hash1 = generateRecordHash(record1);
      const hash2 = generateRecordHash(record2);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different data', () => {
      const record1 = {
        last_name: 'Smith',
        address: '123 Main St',
        city: 'Phoenix',
        state: 'AZ',
        zip: '85001',
      };
      const record2 = {
        last_name: 'Jones',
        address: '456 Oak Ave',
        city: 'Scottsdale',
        state: 'AZ',
        zip: '85251',
      };

      const hash1 = generateRecordHash(record1);
      const hash2 = generateRecordHash(record2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('deduplicateBatch', () => {
    it('should remove duplicates from a batch', () => {
      const records = [
        { last_name: 'Smith', address: '123 Main St', city: 'Phoenix', state: 'AZ', zip: '85001' },
        { last_name: 'Smith', address: '123 Main St', city: 'Phoenix', state: 'AZ', zip: '85001' }, // Duplicate
        { last_name: 'Jones', address: '456 Oak Ave', city: 'Mesa', state: 'AZ', zip: '85201' },
      ];

      const result = dedupeService.deduplicateBatch(records);

      expect(result.originalCount).toBe(3);
      expect(result.uniqueCount).toBe(2);
      expect(result.duplicateCount).toBe(1);
    });

    it('should handle empty batch', () => {
      const result = dedupeService.deduplicateBatch([]);

      expect(result.originalCount).toBe(0);
      expect(result.uniqueCount).toBe(0);
    });
  });
});
