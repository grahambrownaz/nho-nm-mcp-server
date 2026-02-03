/**
 * Test Setup
 * Common configuration and utilities for tests
 */

import { beforeAll, afterAll, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';

// Skip database connection for unit tests (they should mock the database)
const isUnitTest = process.env.TEST_TYPE !== 'integration';

// Create a test database client (only used for integration tests)
export const prisma = new PrismaClient();

// Test tenant context
export const testTenantContext = {
  tenant: {
    id: 'test-tenant-id',
    name: 'Test Tenant',
    email: 'test@example.com',
    company: 'Test Company',
    phone: null,
    status: 'ACTIVE' as const,
    stripeCustomerId: null,
    parentTenantId: null,
    isReseller: false,
    wholesalePricing: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  apiKey: {
    id: 'test-api-key-id',
    key: 'test-key',
    name: 'Development Key',
    tenantId: 'test-tenant-id',
    permissions: ['*'],
    isActive: true,
    lastUsedAt: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  subscription: null,
  permissions: ['*'],
};

// Mock data generators
export function generateMockRecords(count: number) {
  const records = [];
  const cities = ['Phoenix', 'Scottsdale', 'Mesa', 'Tempe', 'Chandler'];
  const streets = ['Main', 'Oak', 'Maple', 'Cedar', 'Pine'];

  for (let i = 0; i < count; i++) {
    const streetNum = Math.floor(Math.random() * 9000) + 1000;
    const streetName = streets[Math.floor(Math.random() * streets.length)];
    const city = cities[Math.floor(Math.random() * cities.length)];

    records.push({
      first_name: `FirstName${i}`,
      last_name: `LastName${Math.floor(Math.random() * 1000)}`,
      address: `${streetNum} ${streetName} St`,
      city,
      state: 'AZ',
      zip: '85001',
      move_date: new Date().toISOString(),
      email: `test${i}@example.com`,
      phone: `555-${String(i).padStart(4, '0')}`,
    });
  }

  return records;
}

// Cleanup function for tests
export async function cleanupTestData() {
  // Add cleanup logic as needed
  if (!isUnitTest) {
    await prisma.$disconnect();
  }
}

// Before all tests
export async function setupTests() {
  // Any global setup
}

// After all tests
export async function teardownTests() {
  await cleanupTestData();
}

// Vitest hooks
beforeAll(async () => {
  // Only connect to database for integration tests
  if (!isUnitTest) {
    await prisma.$connect();
  }
});

afterAll(async () => {
  // Only disconnect for integration tests
  if (!isUnitTest) {
    await prisma.$disconnect();
  }
});

afterEach(async () => {
  // Clean up mocks after each test
  vi.clearAllMocks();
});

// Mock environment variables
process.env.LEADSPLEASE_API_KEY = 'test_key';
process.env.LEADSPLEASE_API_URL = 'https://api.test.leadsplease.com';
process.env.NODE_ENV = 'test';
