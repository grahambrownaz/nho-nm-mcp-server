/**
 * Simple Test Runner using tsx
 * Runs basic tests without needing vitest installed
 */

import { getDeduplicationService, generateRecordHash } from '../src/services/deduplication.js';

// Simple test framework
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error instanceof Error ? error.message : error}`);
    failed++;
  }
}

function expect<T>(actual: T) {
  return {
    toBe(expected: T) {
      if (actual !== expected) {
        throw new Error(`Expected ${expected} but got ${actual}`);
      }
    },
    not: {
      toBe(expected: T) {
        if (actual === expected) {
          throw new Error(`Expected not to be ${expected}`);
        }
      },
    },
  };
}

console.log('\n=== Deduplication Service Tests ===\n');

const dedupeService = getDeduplicationService();

test('should generate consistent hash for same data', () => {
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

test('should normalize addresses', () => {
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

test('should generate different hashes for different data', () => {
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

// Rate Limiter Tests
import { RateLimiter } from '../src/utils/rate-limiter.js';

console.log('\n=== Rate Limiter Tests ===\n');

test('should allow requests within rate limit', () => {
  const limiter = new RateLimiter({
    maxRequests: 5,
    windowMs: 1000,
  });

  const result1 = limiter.check('test-key');
  const result2 = limiter.check('test-key');

  expect(result1.allowed).toBe(true);
  expect(result2.allowed).toBe(true);

  limiter.destroy();
});

test('should block requests exceeding rate limit', () => {
  const limiter = new RateLimiter({
    maxRequests: 2,
    windowMs: 60000, // 1 minute
  });

  limiter.check('test-key-2');
  limiter.check('test-key-2');
  const result = limiter.check('test-key-2');

  expect(result.allowed).toBe(false);

  limiter.destroy();
});

test('should track different keys separately', () => {
  const limiter = new RateLimiter({
    maxRequests: 1,
    windowMs: 60000,
  });

  const result1 = limiter.check('key-a');
  const result2 = limiter.check('key-b');
  const result3 = limiter.check('key-a'); // Should be blocked

  expect(result1.allowed).toBe(true);
  expect(result2.allowed).toBe(true);
  expect(result3.allowed).toBe(false);

  limiter.destroy();
});

// Error Handling Tests
import {
  McpError,
  ValidationError,
  AuthenticationError,
  DatabaseError,
  PlatformSyncError
} from '../src/utils/errors.js';

console.log('\n=== Error Handling Tests ===\n');

test('should create McpError with correct properties', () => {
  const error = new McpError('Test error', 'TEST_CODE', { detail: 'test' });

  expect(error.message).toBe('Test error');
  expect(error.code).toBe('TEST_CODE');
  expect(error.name).toBe('McpError');
});

test('should create ValidationError with field details', () => {
  const error = new ValidationError('Invalid input', [
    { field: 'email', message: 'Invalid email format' }
  ]);

  expect(error.code).toBe('VALIDATION_ERROR');
  expect(error.name).toBe('ValidationError');
});

test('should create AuthenticationError', () => {
  const error = new AuthenticationError('Invalid API key');

  expect(error.code).toBe('AUTHENTICATION_ERROR');
  expect(error.name).toBe('AuthenticationError');
});

test('should create DatabaseError', () => {
  const error = new DatabaseError('Connection failed');

  expect(error.code).toBe('DATABASE_ERROR');
  expect(error.name).toBe('DatabaseError');
});

test('should create PlatformSyncError with platform info', () => {
  const error = new PlatformSyncError('mailchimp', 'API rate limit exceeded');

  expect(error.code).toBe('PLATFORM_SYNC_ERROR');
  expect(error.name).toBe('PlatformSyncError');
  expect(error.details?.platform).toBe('mailchimp');
});

// Batch Deduplication Tests
console.log('\n=== Batch Deduplication Tests ===\n');

test('should deduplicate batch with duplicates', () => {
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

test('should handle empty batch', () => {
  const result = dedupeService.deduplicateBatch([]);

  expect(result.originalCount).toBe(0);
  expect(result.uniqueCount).toBe(0);
  expect(result.duplicateCount).toBe(0);
});

test('should handle single record batch', () => {
  const records = [
    { last_name: 'Smith', address: '123 Main St', city: 'Phoenix', state: 'AZ', zip: '85001' },
  ];

  const result = dedupeService.deduplicateBatch(records);

  expect(result.originalCount).toBe(1);
  expect(result.uniqueCount).toBe(1);
  expect(result.duplicateCount).toBe(0);
});

console.log('\n=== Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('');

if (failed > 0) {
  process.exit(1);
}
