/**
 * OpenAPI/Swagger Documentation
 * Generates API documentation from JSDoc annotations
 */

import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'NHO/NM Subscription API',
      version: process.env.MCP_SERVER_VERSION || '1.2.0',
      description: `
REST API for NHO/NM (New Homeowner / New Mover) data subscription service.

This API provides:
- **Data Search & Preview**: Search databases, preview counts, get sample data
- **Subscriptions**: Create and manage recurring data subscriptions
- **Templates**: Upload and manage postcard templates, generate PDFs
- **Delivery**: Configure SFTP hot folders, track fulfillment status

## Authentication

All endpoints require API key authentication via one of:
- \`X-API-Key\` header: \`X-API-Key: your-api-key\`
- \`Authorization\` header: \`Authorization: Bearer your-api-key\`

## Rate Limiting

API requests are rate limited to protect service availability:

| Endpoint Type | Limit | Window |
|--------------|-------|--------|
| Standard API | 100 requests | 1 minute |
| Data Search | 200 requests | 1 minute |
| Webhooks | 1000 requests | 1 minute |

Rate limit headers are included in all responses:
- \`RateLimit-Limit\`: Maximum requests allowed
- \`RateLimit-Remaining\`: Requests remaining in current window
- \`RateLimit-Reset\`: Unix timestamp when the window resets

When rate limited, you'll receive a \`429 Too Many Requests\` response.

## Response Format

All responses follow a consistent structure:

**Success:**
\`\`\`json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "uuid",
    "timestamp": "ISO date"
  }
}
\`\`\`

**Error:**
\`\`\`json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": { ... }
  },
  "meta": { ... }
}
\`\`\`
      `,
      contact: {
        name: 'API Support',
        email: 'support@leadsplease.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
      {
        url: 'https://api.leadsplease.com',
        description: 'Production server',
      },
    ],
    tags: [
      {
        name: 'Data',
        description: 'Data search, preview, and pricing operations',
      },
      {
        name: 'Filters',
        description: 'Filter options and metadata for database queries',
      },
      {
        name: 'Subscriptions',
        description: 'Recurring data subscription management',
      },
      {
        name: 'Purchases',
        description: 'One-time list purchases with volume discounts',
      },
      {
        name: 'Exports',
        description: 'Data export to CSV, Excel, or JSON',
      },
      {
        name: 'Templates',
        description: 'Postcard template management and PDF generation',
      },
      {
        name: 'Delivery',
        description: 'Delivery configuration and fulfillment tracking',
      },
      {
        name: 'Billing',
        description: 'Stripe billing, checkout, and payment management',
      },
      {
        name: 'Platforms',
        description: 'External platform integrations (Mailchimp, HubSpot, etc.)',
      },
      {
        name: 'Intent',
        description: 'Purchase intent data subscriptions and webhook delivery',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for authentication',
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Bearer token (API key)',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  example: 'VALIDATION_ERROR',
                },
                message: {
                  type: 'string',
                  example: 'Invalid request parameters',
                },
                details: {
                  type: 'object',
                },
              },
            },
            meta: {
              $ref: '#/components/schemas/Meta',
            },
          },
        },
        Meta: {
          type: 'object',
          properties: {
            requestId: {
              type: 'string',
              format: 'uuid',
              example: '550e8400-e29b-41d4-a716-446655440000',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-15T10:30:00.000Z',
            },
          },
        },
        Geography: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['nationwide', 'state', 'zip', 'city', 'county', 'radius'],
              example: 'state',
            },
            values: {
              type: 'array',
              items: {
                type: 'string',
              },
              example: ['AZ', 'CA'],
            },
            center: {
              type: 'object',
              description: 'For radius type',
              properties: {
                lat: { type: 'number' },
                lng: { type: 'number' },
              },
            },
            radius_miles: {
              type: 'number',
              description: 'For radius type',
            },
          },
        },
        DataRecord: {
          type: 'object',
          properties: {
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            address: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            zip: { type: 'string' },
            move_date: { type: 'string', format: 'date' },
            income_range: { type: 'string' },
            home_value: { type: 'string' },
          },
        },
        Subscription: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            database: { type: 'string' },
            geography: { $ref: '#/components/schemas/Geography' },
            frequency: { type: 'string', enum: ['daily', 'weekly', 'biweekly', 'monthly'] },
            status: { type: 'string', enum: ['active', 'paused', 'cancelled'] },
            next_delivery_at: { type: 'string', format: 'date-time' },
            last_delivery_at: { type: 'string', format: 'date-time' },
            total_records: { type: 'integer' },
            total_deliveries: { type: 'integer' },
          },
        },
        Template: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
            size: { type: 'string', enum: ['4x6', '6x9', '6x11'] },
            orientation: { type: 'string', enum: ['landscape', 'portrait'] },
            is_public: { type: 'boolean' },
            preview_url: { type: 'string', format: 'uri' },
          },
        },
        DeliveryConfig: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            method: {
              type: 'string',
              enum: ['sftp_hot_folder', 'print_api', 'email', 'webhook', 'cloud_storage'],
            },
            is_default: { type: 'boolean' },
            is_active: { type: 'boolean' },
          },
        },
        Delivery: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            subscription_id: { type: 'string', format: 'uuid' },
            status: { type: 'string' },
            fulfillment_status: { type: 'string' },
            record_count: { type: 'integer' },
            scheduled_at: { type: 'string', format: 'date-time' },
            completed_at: { type: 'string', format: 'date-time' },
          },
        },
      },
      responses: {
        Unauthorized: {
          description: 'Authentication required',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                success: false,
                error: {
                  code: 'AUTHENTICATION_REQUIRED',
                  message: 'API key is required',
                },
                meta: {
                  requestId: '550e8400-e29b-41d4-a716-446655440000',
                  timestamp: '2024-01-15T10:30:00.000Z',
                },
              },
            },
          },
        },
        Forbidden: {
          description: 'Permission denied',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        ValidationError: {
          description: 'Invalid request parameters',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        RateLimitExceeded: {
          description: 'Rate limit exceeded',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                success: false,
                error: {
                  code: 'RATE_LIMIT_EXCEEDED',
                  message: 'Too many requests. Please try again later.',
                },
              },
            },
          },
        },
      },
    },
    security: [
      { ApiKeyAuth: [] },
      { BearerAuth: [] },
    ],
  },
  apis: ['./src/api/routes/*.ts', './src/api/routes/*.js'],
};

export const swaggerSpec = swaggerJsdoc(options);
