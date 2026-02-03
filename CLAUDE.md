# NHO/NM MCP Server

## Overview

MCP (Model Context Protocol) server for New Homeowner and New Mover data services. Provides tools for searching data, managing subscriptions, generating postcards, and delivering to print providers.

## Project Structure

```
src/
├── api/                 # REST API layer (Express.js)
│   ├── middleware/      # Auth, rate limiting, error handling
│   └── routes/          # API route handlers
├── cron/                # Scheduled job processing
├── db/                  # Prisma client and database utilities
├── schemas/             # Zod schemas for validation
├── services/            # Business logic and external integrations
├── tools/               # MCP tool implementations
│   ├── billing/         # Stripe billing tools
│   ├── data/            # Data search and pricing tools
│   ├── delivery/        # SFTP and fulfillment tools
│   ├── exports/         # Data export tools
│   ├── filters/         # Filter option tools
│   ├── intent/          # Intent data tools
│   ├── platforms/       # External platform sync tools
│   ├── purchases/       # One-time purchase tools
│   ├── subscriptions/   # Subscription management tools
│   └── templates/       # Template and PDF tools
├── utils/               # Shared utilities
└── webhooks/            # Webhook handlers (Stripe, etc.)
```

## Quality Standards

### TypeScript Configuration

tsconfig.json must include:
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### Input Validation

Every MCP tool must:
1. Define input schema using Zod
2. Validate all inputs before processing
3. Return clear error messages for invalid inputs
4. Sanitize strings to prevent injection

Example pattern:
```typescript
import { z } from 'zod';

const InputSchema = z.object({
  database: z.enum(['nho', 'new_mover', 'consumer', 'business']),
  geography: z.object({
    type: z.enum(['zip', 'city', 'county', 'state', 'radius']),
    values: z.array(z.string()).optional(),
    center_address: z.string().optional(),
    radius_miles: z.number().min(1).max(100).optional(),
  }),
  limit: z.number().min(1).max(10000).default(100),
});

export async function handler(rawInput: unknown) {
  const input = InputSchema.parse(rawInput); // Throws on invalid
  // ... proceed with validated input
}
```

### Error Handling

Every external API call must:
1. Be wrapped in try/catch
2. Implement retry logic for transient failures
3. Log errors with context
4. Return user-friendly messages

Standard error wrapper:
```typescript
import { logger } from '../utils/logger';

interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoffMultiplier?: number;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  context: string,
  options: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 3, delayMs = 1000, backoffMultiplier = 2 } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      logger.warn({
        context,
        attempt,
        maxAttempts,
        error: lastError.message,
      }, `Attempt ${attempt} failed`);

      if (attempt < maxAttempts) {
        await sleep(delayMs * Math.pow(backoffMultiplier, attempt - 1));
      }
    }
  }

  logger.error({ context, error: lastError!.message }, 'All retry attempts failed');
  throw new Error(`${context} failed after ${maxAttempts} attempts: ${lastError!.message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### Logging

Use structured JSON logging with pino:

```typescript
// src/utils/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Create child logger with tenant context
export function createTenantLogger(tenantId: string) {
  return logger.child({ tenantId });
}
```

Every MCP tool invocation must log:
- Tool name
- Tenant ID
- Input parameters (sanitized)
- Duration (ms)
- Success/failure
- Error details (if failed)

```typescript
export async function toolHandler(tenantId: string, input: Input) {
  const start = Date.now();
  const log = createTenantLogger(tenantId);

  log.info({ tool: 'search_data', input }, 'Tool invoked');

  try {
    const result = await doWork(input);
    log.info({
      tool: 'search_data',
      duration: Date.now() - start,
      resultCount: result.length
    }, 'Tool completed');
    return result;
  } catch (error) {
    log.error({
      tool: 'search_data',
      duration: Date.now() - start,
      error: error.message
    }, 'Tool failed');
    throw error;
  }
}
```

### Database Best Practices

1. Use Prisma transactions for multi-step operations
2. Add database indexes for frequently queried fields
3. Use connection pooling
4. Handle connection errors gracefully

```typescript
// Prisma client with logging
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'stdout' },
    { level: 'warn', emit: 'stdout' },
  ],
});

// Log slow queries
prisma.$on('query', (e) => {
  if (e.duration > 1000) {
    logger.warn({ query: e.query, duration: e.duration }, 'Slow query detected');
  }
});
```

### Security Requirements

1. API keys hashed with bcrypt before storage
2. Sensitive config encrypted with AES-256-GCM
3. No secrets in logs
4. Input sanitization for all user content
5. Rate limiting on all endpoints

### Testing Requirements

Each module must have:
1. Unit tests for core logic (>80% coverage)
2. Integration tests for MCP tools
3. Mocks for external dependencies
4. Tests for error conditions

Add these npm scripts to package.json:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:integration": "vitest run --config vitest.integration.config.ts"
  }
}
```

## Development Commands

```bash
# Development
npm run dev          # Start with hot reload
npm run build        # Compile TypeScript
npm run start        # Run compiled code

# Database
npm run db:generate  # Generate Prisma client
npm run db:push      # Push schema to database
npm run db:migrate   # Run migrations
npm run db:seed      # Seed test data
npm run db:studio    # Open Prisma Studio

# Testing
npm test             # Run tests
npm run test:watch   # Watch mode
npm run test:coverage # With coverage report

# Quality
npm run lint         # Run ESLint
npm run typecheck    # Type checking without emit
```

## Environment Variables

Required environment variables (see `.env.example`):
- `DATABASE_URL` - PostgreSQL connection string
- `STRIPE_SECRET_KEY` - Stripe API key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret
- `API_KEY` - Default API key for testing
- `LOG_LEVEL` - Logging level (debug, info, warn, error)

## MCP Tools

The server exposes 27 tools organized by category:

### Data Tools (1-5)
- `search_data` - Search NHO/NM databases
- `preview_count` - Get count without fetching records
- `get_sample_data` - Get sample records
- `get_pricing` - Get pricing for a query
- `get_filter_options` - Get available filter values

### Subscription Tools (6-9)
- `create_subscription` - Create recurring subscription
- `manage_subscription` - Pause/resume/cancel
- `list_subscriptions` - List tenant subscriptions
- `delivery_report` - Get delivery statistics

### Template Tools (10-13)
- `upload_template` - Upload postcard template
- `browse_templates` - List available templates
- `import_design` - Import from Canva/external
- `generate_postcard_pdf` - Generate PDF from template

### Delivery Tools (14-15)
- `configure_delivery` - Setup SFTP/print delivery
- `get_fulfillment_status` - Track delivery status

### Billing Tools (16-19)
- `create_checkout_session` - Stripe checkout
- `get_billing_status` - Billing summary
- `get_billing_portal` - Customer portal link
- `create_payment_link` - One-time payment link

### Platform Tools (20-21)
- `sync_to_platform` - Sync to Mailchimp/HubSpot
- `configure_platform_connection` - Setup OAuth

### Purchase Tools (22)
- `purchase_list` - One-time list purchase

### Export Tools (23)
- `export_data` - Export to CSV/Excel/JSON

### Intent Tools (24-27)
- `search_intent_data` - Search intent signals
- `create_intent_subscription` - Subscribe to intent data
- `list_intent_categories` - List intent categories
- `configure_intent_webhook` - Setup webhook delivery
