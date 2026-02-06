/**
 * Prisma Database Client Singleton
 * Ensures a single database connection is reused across the application
 *
 * When DEMO_MODE=true, uses an in-memory mock client instead of PostgreSQL.
 */

import { PrismaClient } from '@prisma/client';
import { getMockPrismaClient } from './mock-prisma.js';

// Declare global type for the Prisma client singleton
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const isDemoMode = process.env.DEMO_MODE === 'true';

/**
 * Create a new Prisma client with logging configuration
 */
function createPrismaClient(): PrismaClient {
  if (isDemoMode) {
    console.log('[Demo Mode] Using in-memory mock database — no PostgreSQL required');
    return getMockPrismaClient() as unknown as PrismaClient;
  }

  const client = new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
  });

  return client;
}

/**
 * Singleton Prisma client instance
 * In development, we store it on the global object to survive hot reloads
 * In production, we create a single instance
 * In demo mode, uses in-memory mock
 */
export const prisma: PrismaClient = global.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

/**
 * Gracefully disconnect from the database
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

/**
 * Health check for database connection
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

export default prisma;
