/**
 * In-Memory Mock Prisma Client for Demo Mode
 *
 * Provides a fully functional mock database that lets all MCP tools
 * work without a real PostgreSQL connection. Activated by DEMO_MODE=true.
 *
 * Pre-seeded with realistic demo data so you can explore all tools immediately.
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================
// In-Memory Store
// ============================================================

interface Store {
  tenants: Map<string, Record<string, unknown>>;
  apiKeys: Map<string, Record<string, unknown>>;
  subscriptions: Map<string, Record<string, unknown>>;
  usageRecords: Map<string, Record<string, unknown>>;
  dataSubscriptions: Map<string, Record<string, unknown>>;
  deliveries: Map<string, Record<string, unknown>>;
  templates: Map<string, Record<string, unknown>>;
  deliveryConfigs: Map<string, Record<string, unknown>>;
  deliveryRecords: Map<string, Record<string, unknown>>;
  listPurchases: Map<string, Record<string, unknown>>;
  exportFiles: Map<string, Record<string, unknown>>;
  intentCategories: Map<string, Record<string, unknown>>;
  intentSubscriptions: Map<string, Record<string, unknown>>;
  intentWebhooks: Map<string, Record<string, unknown>>;
  intentDeliveries: Map<string, Record<string, unknown>>;
  emailConfigs: Map<string, Record<string, unknown>>;
  emailCampaigns: Map<string, Record<string, unknown>>;
  swotspotConfigs: Map<string, Record<string, unknown>>;
  swotspotAudits: Map<string, Record<string, unknown>>;
  swotspotCompetitors: Map<string, Record<string, unknown>>;
  pricingTiers: Map<string, Record<string, unknown>>;
}

const store: Store = {
  tenants: new Map(),
  apiKeys: new Map(),
  subscriptions: new Map(),
  usageRecords: new Map(),
  dataSubscriptions: new Map(),
  deliveries: new Map(),
  templates: new Map(),
  deliveryConfigs: new Map(),
  deliveryRecords: new Map(),
  listPurchases: new Map(),
  exportFiles: new Map(),
  intentCategories: new Map(),
  intentSubscriptions: new Map(),
  intentWebhooks: new Map(),
  intentDeliveries: new Map(),
  emailConfigs: new Map(),
  emailCampaigns: new Map(),
  swotspotConfigs: new Map(),
  swotspotAudits: new Map(),
  swotspotCompetitors: new Map(),
  pricingTiers: new Map(),
};

// ============================================================
// Seed Demo Data
// ============================================================

function seedDemoData() {
  const now = new Date();
  const oneMonthLater = new Date(now);
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

  // Test tenant
  store.tenants.set('test-tenant-id', {
    id: 'test-tenant-id',
    name: 'Demo Company',
    email: 'demo@leadsplease.com',
    company: 'LeadsPlease Demo',
    phone: '(555) 123-4567',
    status: 'ACTIVE',
    stripeCustomerId: 'cus_demo_123',
    parentTenantId: null,
    isReseller: false,
    wholesalePricing: null,
    createdAt: now,
    updatedAt: now,
  });

  // API key
  store.apiKeys.set('test-api-key-id', {
    id: 'test-api-key-id',
    key: 'test-key',
    name: 'Demo API Key',
    tenantId: 'test-tenant-id',
    permissions: ['*'],
    isActive: true,
    lastUsedAt: null,
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
  });

  // Subscription
  store.subscriptions.set('test-subscription-id', {
    id: 'test-subscription-id',
    tenantId: 'test-tenant-id',
    plan: 'PROFESSIONAL',
    status: 'ACTIVE',
    stripeSubscriptionId: 'sub_demo_123',
    monthlyRecordLimit: 10000,
    monthlyEmailAppends: 5000,
    monthlyPhoneAppends: 5000,
    allowedStates: [],
    allowedZipCodes: [],
    allowedDatabases: ['NHO', 'NEW_MOVER', 'CONSUMER', 'BUSINESS', 'INTENT'],
    pricePerRecord: createDecimal(0.05),
    priceEmailAppend: createDecimal(0.02),
    pricePhoneAppend: createDecimal(0.03),
    pricePdfGeneration: createDecimal(0.02),
    billingCycleStart: now,
    billingCycleEnd: oneMonthLater,
    createdAt: now,
    updatedAt: now,
  });

  // Demo templates
  const templateCategories = [
    { cat: 'REALTOR', name: 'Welcome Home', desc: 'Real estate welcome postcard' },
    { cat: 'HVAC', name: 'Seasonal HVAC Checkup', desc: 'HVAC maintenance offer' },
    { cat: 'INSURANCE', name: 'Home Insurance Quote', desc: 'Insurance offer for new homeowners' },
    { cat: 'LANDSCAPING', name: 'Spring Lawn Care', desc: 'Landscaping services offer' },
    { cat: 'HOME_SERVICES', name: 'Handyman Special', desc: 'Home repair services' },
    { cat: 'RETAIL', name: 'Local Store Grand Opening', desc: 'Retail promotion' },
  ];

  for (const t of templateCategories) {
    const id = uuidv4();
    store.templates.set(id, {
      id,
      tenantId: null,
      name: t.name,
      description: t.desc,
      category: t.cat,
      size: 'SIZE_4X6',
      htmlFront: `<div style="padding:20px"><h1>${t.name}</h1><p>{{first_name}} {{last_name}}</p><p>{{address}}, {{city}}, {{state}} {{zip}}</p></div>`,
      htmlBack: '<div style="padding:20px"><p>Your message here</p></div>',
      cssStyles: null,
      mergeFields: ['first_name', 'last_name', 'address', 'city', 'state', 'zip'],
      thumbnailUrl: null,
      isPublic: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      dataSubscriptions: [],
      _count: { dataSubscriptions: 0 },
    });
  }

  // Demo data subscription
  const subId = uuidv4();
  store.dataSubscriptions.set(subId, {
    id: subId,
    tenantId: 'test-tenant-id',
    name: 'Phoenix NHO Weekly',
    clientName: 'Demo Client',
    clientEmail: 'client@demo.com',
    clientPhone: '(555) 987-6543',
    database: 'NHO',
    geography: { type: 'city', values: ['Phoenix'] },
    filters: {},
    frequency: 'WEEKLY',
    nextDeliveryAt: oneMonthLater,
    templateId: null,
    fulfillmentMethod: 'EMAIL',
    fulfillmentConfig: { email_address: 'client@demo.com' },
    syncChannels: [],
    status: 'ACTIVE',
    lastDeliveryAt: now,
    totalDeliveries: 12,
    totalRecordsDelivered: 1450,
    createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    updatedAt: now,
  });

  // Demo delivery
  const deliveryId = uuidv4();
  store.deliveries.set(deliveryId, {
    id: deliveryId,
    subscriptionId: subId,
    tenantId: 'test-tenant-id',
    database: 'NHO',
    geography: { type: 'city', values: ['Phoenix'] },
    filters: {},
    status: 'COMPLETED',
    recordCount: 125,
    newRecordCount: 118,
    duplicateCount: 7,
    deliveredAt: now,
    fulfillmentMethod: 'EMAIL',
    fulfillmentStatus: 'DELIVERED',
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  });

  // Demo email config
  store.emailConfigs.set('test-tenant-id', {
    id: uuidv4(),
    tenantId: 'test-tenant-id',
    provider: 'REACHMAIL',
    accountId: 'demo-account',
    apiKey: 'encrypted:demo-reachmail-key',
    fromName: 'Demo Company',
    fromEmail: 'demo@leadsplease.com',
    replyToEmail: 'demo@leadsplease.com',
    lastTestAt: now,
    lastTestSuccess: true,
    createdAt: now,
    updatedAt: now,
  });

  // Demo email campaign
  const campaignId = uuidv4();
  store.emailCampaigns.set(campaignId, {
    id: campaignId,
    tenantId: 'test-tenant-id',
    configId: Array.from(store.emailConfigs.values())[0]?.id,
    name: 'Welcome New Homeowners - Phoenix',
    subject: 'Welcome to your new home!',
    htmlBody: '<h1>Welcome!</h1><p>Hello {{first_name}}</p>',
    textBody: 'Welcome! Hello {{first_name}}',
    listId: 'demo-list-123',
    listName: 'Phoenix NHO Jan 2026',
    status: 'SENT',
    externalCampaignId: 'ext-campaign-123',
    sentAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    scheduledAt: null,
    totalRecipients: 250,
    delivered: 245,
    opened: 78,
    clicked: 23,
    bounced: 5,
    unsubscribed: 1,
    analyticsData: {},
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    updatedAt: now,
  });

  // Demo SWOTSPOT audit
  const auditId = uuidv4();
  store.swotspotAudits.set(auditId, {
    id: auditId,
    tenantId: 'test-tenant-id',
    businessName: 'Phoenix HVAC Pros',
    address: '4521 E McDowell Rd',
    city: 'Phoenix',
    state: 'AZ',
    zip: '85008',
    industry: 'hvac',
    externalAuditId: 'ext-audit-demo',
    overallScore: 62,
    reportData: {
      overall_score: 62,
      strengths: [{ area: 'Google Business Profile', score: 78, detail: 'Profile is claimed and verified' }],
      weaknesses: [{ area: 'Citations', score: 45, detail: 'Missing from 12 directories', recommendation: 'Submit to top directories' }],
      opportunities: [{ area: 'Reviews', detail: 'Competitors average more reviews', potential_impact: 'high' }],
      threats: [{ area: 'Competition', detail: 'New HVAC company opened nearby', risk_level: 'medium' }],
    },
    status: 'COMPLETED',
    completedAt: now,
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    updatedAt: now,
  });

  console.log('[Demo Mode] In-memory database seeded with demo data');
}

// ============================================================
// Helper: Prisma Decimal mock
// ============================================================

function createDecimal(value: number) {
  return {
    toNumber: () => value,
    toString: () => value.toString(),
    valueOf: () => value,
  };
}

// ============================================================
// Generic Mock Model (handles all Prisma CRUD patterns)
// ============================================================

function matchesWhere(record: Record<string, unknown>, where: Record<string, unknown>): boolean {
  if (!where) return true;

  for (const [key, condition] of Object.entries(where)) {
    if (key === 'AND') {
      const andConditions = Array.isArray(condition) ? condition : [condition];
      if (!andConditions.every((c: Record<string, unknown>) => matchesWhere(record, c))) return false;
      continue;
    }
    if (key === 'OR') {
      const orConditions = Array.isArray(condition) ? condition : [condition];
      if (!orConditions.some((c: Record<string, unknown>) => matchesWhere(record, c))) return false;
      continue;
    }
    if (key === 'NOT') {
      if (matchesWhere(record, condition as Record<string, unknown>)) return false;
      continue;
    }

    const recordValue = record[key];

    if (condition === null || condition === undefined || typeof condition !== 'object') {
      if (recordValue !== condition) return false;
      continue;
    }

    // Handle Prisma operators
    const op = condition as Record<string, unknown>;
    if ('equals' in op) {
      if (recordValue !== op.equals) return false;
    } else if ('contains' in op) {
      const str = String(recordValue || '');
      const search = String(op.contains);
      const insensitive = (op.mode as string) === 'insensitive';
      if (insensitive) {
        if (!str.toLowerCase().includes(search.toLowerCase())) return false;
      } else {
        if (!str.includes(search)) return false;
      }
    } else if ('in' in op) {
      if (!(op.in as unknown[]).includes(recordValue)) return false;
    } else if ('gt' in op) {
      if ((recordValue as number) <= (op.gt as number)) return false;
    } else if ('gte' in op) {
      if ((recordValue as number) < (op.gte as number)) return false;
    } else if ('lt' in op) {
      if ((recordValue as number) >= (op.lt as number)) return false;
    } else if ('lte' in op) {
      if ((recordValue as number) > (op.lte as number)) return false;
    } else {
      // Nested object comparison (e.g., where: { tenant: { id: '...' } })
      // Treat as equality for simple cases
      if (recordValue !== condition) return false;
    }
  }

  return true;
}

function createMockModel(storeName: keyof Store, _uniqueKeys: string[] = ['id']) {
  const getStore = () => store[storeName] as Map<string, Record<string, unknown>>;

  function findByUnique(where: Record<string, unknown>): Record<string, unknown> | null {
    for (const record of getStore().values()) {
      if (matchesWhere(record, where)) {
        return { ...record };
      }
    }
    return null;
  }

  function findAllMatching(where: Record<string, unknown> = {}): Record<string, unknown>[] {
    const results: Record<string, unknown>[] = [];
    for (const record of getStore().values()) {
      if (matchesWhere(record, where)) {
        results.push({ ...record });
      }
    }
    return results;
  }

  return {
    findUnique: async (args: { where: Record<string, unknown>; include?: unknown }) => {
      return findByUnique(args.where);
    },

    findFirst: async (args: { where?: Record<string, unknown>; orderBy?: unknown; include?: unknown } = {}) => {
      const results = findAllMatching(args.where || {});
      return results.length > 0 ? results[0] : null;
    },

    findMany: async (args: {
      where?: Record<string, unknown>;
      orderBy?: unknown;
      take?: number;
      skip?: number;
      include?: unknown;
    } = {}) => {
      let results = findAllMatching(args.where || {});
      if (args.skip) results = results.slice(args.skip);
      if (args.take) results = results.slice(0, args.take);
      return results;
    },

    count: async (args: { where?: Record<string, unknown> } = {}) => {
      return findAllMatching(args.where || {}).length;
    },

    create: async (args: { data: Record<string, unknown>; include?: unknown }) => {
      const id = (args.data.id as string) || uuidv4();
      const now = new Date();
      const record = {
        ...args.data,
        id,
        createdAt: args.data.createdAt || now,
        updatedAt: args.data.updatedAt || now,
        _count: { dataSubscriptions: 0 },
      };
      getStore().set(id, record);
      return { ...record };
    },

    createMany: async (args: { data: Record<string, unknown>[] }) => {
      let count = 0;
      for (const item of args.data) {
        const id = (item.id as string) || uuidv4();
        const now = new Date();
        getStore().set(id, { ...item, id, createdAt: now, updatedAt: now });
        count++;
      }
      return { count };
    },

    update: async (args: { where: Record<string, unknown>; data: Record<string, unknown>; include?: unknown }) => {
      const existing = findByUnique(args.where);
      if (!existing) {
        throw new Error(`Record not found in ${storeName}`);
      }
      const updated = { ...existing, ...args.data, updatedAt: new Date() };
      getStore().set(existing.id as string, updated);
      return { ...updated };
    },

    updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const results = findAllMatching(args.where);
      for (const record of results) {
        const updated = { ...record, ...args.data, updatedAt: new Date() };
        getStore().set(record.id as string, updated);
      }
      return { count: results.length };
    },

    upsert: async (args: {
      where: Record<string, unknown>;
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => {
      const existing = findByUnique(args.where);
      if (existing) {
        const updated = { ...existing, ...args.update, updatedAt: new Date() };
        getStore().set(existing.id as string, updated);
        return { ...updated };
      }
      const id = (args.create.id as string) || uuidv4();
      const now = new Date();
      const record = { ...args.create, id, createdAt: now, updatedAt: now };
      getStore().set(id, record);
      return { ...record };
    },

    delete: async (args: { where: Record<string, unknown> }) => {
      const existing = findByUnique(args.where);
      if (existing) {
        getStore().delete(existing.id as string);
      }
      return existing;
    },

    deleteMany: async (args: { where?: Record<string, unknown> } = {}) => {
      const results = findAllMatching(args.where || {});
      for (const record of results) {
        getStore().delete(record.id as string);
      }
      return { count: results.length };
    },

    groupBy: async (args: {
      by: string[];
      where?: Record<string, unknown>;
      _count?: Record<string, boolean>;
    }) => {
      const results = findAllMatching(args.where || {});
      const groups = new Map<string, Record<string, unknown>[]>();

      for (const record of results) {
        const key = args.by.map((field) => String(record[field])).join('|');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(record);
      }

      return Array.from(groups.entries()).map(([, records]) => {
        const group: Record<string, unknown> = {};
        for (const field of args.by) {
          group[field] = records[0][field];
        }
        if (args._count) {
          const counts: Record<string, number> = {};
          for (const field of Object.keys(args._count)) {
            counts[field] = records.length;
          }
          group._count = counts;
        }
        return group;
      });
    },
  };
}

// ============================================================
// Mock Prisma Client
// ============================================================

export function createMockPrismaClient() {
  // Seed demo data on first creation
  seedDemoData();

  const client = {
    // All models
    tenant: createMockModel('tenants'),
    apiKey: createMockModel('apiKeys'),
    subscription: createMockModel('subscriptions'),
    usageRecord: createMockModel('usageRecords'),
    dataPull: createMockModel('usageRecords'), // Alias, same structure
    pricingTier: createMockModel('pricingTiers'),
    dataSubscription: createMockModel('dataSubscriptions'),
    delivery: createMockModel('deliveries'),
    template: createMockModel('templates'),
    deliveryConfig: createMockModel('deliveryConfigs'),
    deliveryRecord: createMockModel('deliveryRecords'),
    listPurchase: createMockModel('listPurchases'),
    exportFile: createMockModel('exportFiles'),
    intentCategory: createMockModel('intentCategories'),
    intentSubscription: createMockModel('intentSubscriptions'),
    intentWebhook: createMockModel('intentWebhooks'),
    intentDelivery: createMockModel('intentDeliveries'),
    emailConfig: createMockModel('emailConfigs'),
    emailCampaign: createMockModel('emailCampaigns'),
    swotspotConfig: createMockModel('swotspotConfigs'),
    swotspotAudit: createMockModel('swotspotAudits'),
    swotspotCompetitor: createMockModel('swotspotCompetitors'),

    // Prisma special methods
    $connect: async () => { /* no-op */ },
    $disconnect: async () => { /* no-op */ },
    $queryRaw: async () => [{ '?column?': 1 }],
    $executeRaw: async () => 0,
    $transaction: async (operations: unknown[]) => {
      // Execute all operations in sequence
      if (Array.isArray(operations)) {
        return Promise.all(operations);
      }
      // Function-based transaction
      if (typeof operations === 'function') {
        return (operations as (tx: unknown) => unknown)(client);
      }
      return [];
    },
    $on: () => { /* no-op for event listeners */ },
  };

  return client;
}

// ============================================================
// Singleton
// ============================================================

let mockInstance: ReturnType<typeof createMockPrismaClient> | null = null;

export function getMockPrismaClient() {
  if (!mockInstance) {
    mockInstance = createMockPrismaClient();
  }
  return mockInstance;
}
