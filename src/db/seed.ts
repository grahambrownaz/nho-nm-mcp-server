/**
 * Database Seed Script
 * Creates initial test data for development
 */

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create default pricing tiers
  console.log('Creating pricing tiers...');

  const pricingTiers = [
    {
      name: 'Starter',
      minRecords: 1,
      maxRecords: 500,
      pricePerRecord: 0.08,
      priceEmailAppend: 0.03,
      pricePhoneAppend: 0.04,
      pricePdfGeneration: 0.15,
      pricePrintPerPiece: 0.85,
    },
    {
      name: 'Growth',
      minRecords: 501,
      maxRecords: 2500,
      pricePerRecord: 0.06,
      priceEmailAppend: 0.025,
      pricePhoneAppend: 0.035,
      pricePdfGeneration: 0.12,
      pricePrintPerPiece: 0.75,
    },
    {
      name: 'Professional',
      minRecords: 2501,
      maxRecords: 10000,
      pricePerRecord: 0.05,
      priceEmailAppend: 0.02,
      pricePhoneAppend: 0.03,
      pricePdfGeneration: 0.10,
      pricePrintPerPiece: 0.65,
    },
    {
      name: 'Enterprise',
      minRecords: 10001,
      maxRecords: null,
      pricePerRecord: 0.04,
      priceEmailAppend: 0.015,
      pricePhoneAppend: 0.025,
      pricePdfGeneration: 0.08,
      pricePrintPerPiece: 0.55,
    },
  ];

  for (const tier of pricingTiers) {
    await prisma.pricingTier.upsert({
      where: { id: tier.name.toLowerCase() },
      update: tier,
      create: {
        id: tier.name.toLowerCase(),
        ...tier,
      },
    });
  }

  // Create test tenant
  console.log('Creating test tenant...');

  const testTenant = await prisma.tenant.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      id: 'test-tenant-001',
      name: 'Test Company',
      email: 'test@example.com',
      company: 'Test Company Inc.',
      phone: '(555) 123-4567',
      status: 'ACTIVE',
    },
  });

  console.log(`Created tenant: ${testTenant.name} (${testTenant.id})`);

  // Create API key for test tenant
  console.log('Creating API key...');

  const testApiKey = `nho_test_${uuidv4().replace(/-/g, '')}`;

  await prisma.apiKey.upsert({
    where: { key: testApiKey },
    update: {},
    create: {
      id: 'test-api-key-001',
      key: testApiKey,
      name: 'Development API Key',
      tenantId: testTenant.id,
      permissions: ['data:read', 'data:write', 'subscription:read'],
      isActive: true,
    },
  });

  console.log(`Created API key: ${testApiKey}`);

  // Create subscription for test tenant
  console.log('Creating subscription...');

  const now = new Date();
  const billingCycleEnd = new Date(now);
  billingCycleEnd.setMonth(billingCycleEnd.getMonth() + 1);

  await prisma.subscription.upsert({
    where: { id: 'test-subscription-001' },
    update: {},
    create: {
      id: 'test-subscription-001',
      tenantId: testTenant.id,
      plan: 'PROFESSIONAL',
      status: 'ACTIVE',
      monthlyRecordLimit: 10000,
      monthlyEmailAppends: 5000,
      monthlyPhoneAppends: 5000,
      allowedStates: [], // Empty = all states allowed
      allowedZipCodes: [],
      allowedDatabases: ['NHO', 'NEW_MOVER', 'CONSUMER', 'BUSINESS'],
      billingCycleStart: now,
      billingCycleEnd: billingCycleEnd,
    },
  });

  console.log('Created subscription');

  // Create a second test tenant with limited access
  console.log('Creating limited test tenant...');

  const limitedTenant = await prisma.tenant.upsert({
    where: { email: 'limited@example.com' },
    update: {},
    create: {
      id: 'test-tenant-002',
      name: 'Limited Company',
      email: 'limited@example.com',
      company: 'Limited Company LLC',
      status: 'ACTIVE',
    },
  });

  const limitedApiKey = `nho_limited_${uuidv4().replace(/-/g, '')}`;

  await prisma.apiKey.upsert({
    where: { key: limitedApiKey },
    update: {},
    create: {
      id: 'test-api-key-002',
      key: limitedApiKey,
      name: 'Limited API Key',
      tenantId: limitedTenant.id,
      permissions: ['data:read'], // Read only
      isActive: true,
    },
  });

  await prisma.subscription.upsert({
    where: { id: 'test-subscription-002' },
    update: {},
    create: {
      id: 'test-subscription-002',
      tenantId: limitedTenant.id,
      plan: 'STARTER',
      status: 'ACTIVE',
      monthlyRecordLimit: 500,
      monthlyEmailAppends: 100,
      monthlyPhoneAppends: 100,
      allowedStates: ['AZ', 'CA'], // Limited to AZ and CA
      allowedZipCodes: [],
      allowedDatabases: ['NHO', 'NEW_MOVER'], // Only NHO and New Mover
      billingCycleStart: now,
      billingCycleEnd: billingCycleEnd,
    },
  });

  console.log(`Created limited tenant with API key: ${limitedApiKey}`);

  console.log('');
  console.log('='.repeat(60));
  console.log('Database seeded successfully!');
  console.log('='.repeat(60));
  console.log('');
  console.log('Test API Keys:');
  console.log(`  Full Access:    ${testApiKey}`);
  console.log(`  Limited Access: ${limitedApiKey}`);
  console.log('');
  console.log('Add to your .env file:');
  console.log(`  TEST_API_KEY="${testApiKey}"`);
  console.log('');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
