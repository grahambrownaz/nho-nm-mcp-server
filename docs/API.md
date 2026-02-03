# NHO/NM MCP Server API Documentation

## Overview

The NHO/NM MCP Server provides 19 tools for managing new homeowner and new mover data subscriptions, with support for multiple fulfillment methods including SFTP hot folders, print APIs, and platform integrations.

## Authentication

All API requests require an API key passed in the `X-API-Key` header:

```bash
curl -H "X-API-Key: your-api-key" https://api.example.com/api/v1/...
```

## Tools Summary

| # | Tool | Purpose |
|---|------|---------|
| 1 | `search_data` | Query NHO/NM/Consumer/Business databases |
| 2 | `preview_count` | Quick count for quoting |
| 3 | `get_sample_data` | Sample records for data quality preview |
| 4 | `get_pricing` | Current pricing and volume tiers |
| 5 | `create_subscription` | Set up automated delivery |
| 6 | `manage_subscription` | Update/pause/resume/cancel |
| 7 | `list_subscriptions` | Portfolio view |
| 8 | `delivery_report` | Generate reports |
| 9 | `upload_template` | Create custom templates |
| 10 | `browse_templates` | View template library |
| 11 | `import_design` | Convert PDF/image to template |
| 12 | `generate_postcard_pdf` | On-demand PDF generation |
| 13 | `configure_delivery` | Set up SFTP/print API/email |
| 14 | `get_fulfillment_status` | Check delivery status |
| 15 | `sync_to_platform` | Push to Mailchimp/HubSpot/Zapier |
| 16 | `configure_platform_connection` | Store platform credentials |
| 17 | `create_checkout_session` | Stripe Checkout for self-service |
| 18 | `get_billing_status` | Usage and invoice preview |
| 19 | `get_billing_portal` | Stripe Customer Portal link |

---

## Data Tools (1-4)

### 1. search_data

Search NHO/New Mover databases with geography and filter criteria.

**Parameters:**
- `database` (required): `nho`, `new_mover`, `consumer`, `business`
- `geography` (required): Object with `type` and `values`
  - Types: `nationwide`, `state`, `zip`, `city`, `county`, `radius`
- `filters` (optional): Demographic filters
- `limit` (optional): Max records (default: 100)
- `offset` (optional): Pagination offset

**Example:**
```json
{
  "database": "nho",
  "geography": {
    "type": "zip",
    "values": ["85001", "85002"]
  },
  "filters": {
    "income_range": ["$75k-$100k", "$100k+"]
  },
  "limit": 50
}
```

### 2. preview_count

Get record count matching criteria without returning data.

**Parameters:** Same as `search_data`

### 3. get_sample_data

Get sample records for preview (usually free).

**Parameters:**
- Same as `search_data`
- `sample_size` (optional): Number of samples (default: 10)

### 4. get_pricing

Get current pricing based on database and volume.

**Parameters:**
- `database` (optional): Specific database
- `record_count` (optional): Estimated count for volume pricing

---

## Subscription Tools (5-8)

### 5. create_subscription

Create an automated data delivery subscription.

**Parameters:**
- `name` (required): Subscription name
- `database` (required): Data source
- `geography` (required): Geographic targeting
- `frequency` (required): `daily`, `weekly`, `biweekly`, `monthly`
- `template_id` (optional): Postcard template
- `fulfillment_method` (optional): `download`, `email`, `print_mail`

### 6. manage_subscription

Update, pause, resume, or cancel a subscription.

**Parameters:**
- `subscription_id` (required): Subscription ID
- `action` (required): `update`, `pause`, `resume`, `cancel`
- `updates` (optional): Fields to update

### 7. list_subscriptions

List all subscriptions for the tenant.

**Parameters:**
- `status` (optional): Filter by status
- `limit` (optional): Max results
- `offset` (optional): Pagination

### 8. delivery_report

Generate a delivery report.

**Parameters:**
- `subscription_id` (optional): Specific subscription
- `start_date` (optional): Report start
- `end_date` (optional): Report end
- `format` (optional): `summary`, `detailed`

---

## Template Tools (9-12)

### 9. upload_template

Upload a custom postcard template.

**Parameters:**
- `name` (required): Template name
- `category` (required): Template category
- `size` (required): `4x6`, `6x9`, `6x11`
- `html_front` (required): Front HTML
- `html_back` (optional): Back HTML

### 10. browse_templates

Browse available templates.

**Parameters:**
- `category` (optional): Filter by category
- `size` (optional): Filter by size
- `include_public` (optional): Include public templates

### 11. import_design

Import a design from PDF or image.

**Parameters:**
- `file_url` (required): URL to design file
- `name` (required): Template name
- `side` (required): `front`, `back`, `both`

### 12. generate_postcard_pdf

Generate a PDF preview.

**Parameters:**
- `template_id` (required): Template to use
- `records` (required): Data records
- `format` (optional): `single_pdf`, `individual_pdfs`

---

## Delivery Tools (13-14)

### 13. configure_delivery

Configure delivery method (SFTP, Print API, etc.).

**Parameters:**
- `name` (required): Configuration name
- `method` (required): `sftp_hot_folder`, `print_api`, `email`, `webhook`
- `config` (required): Method-specific configuration

**SFTP Config:**
```json
{
  "host": "sftp.example.com",
  "port": 22,
  "username": "user",
  "password": "pass",
  "folder_path": "/incoming"
}
```

**Print API Config:**
```json
{
  "provider": "lob",
  "api_key": "key_xxx",
  "return_address": {...}
}
```

### 14. get_fulfillment_status

Check delivery/fulfillment status.

**Parameters:**
- `delivery_id` (required): Delivery ID

---

## Platform Tools (15-16)

### 15. sync_to_platform

Sync records to external platforms.

**Parameters:**
- `platform` (required): `mailchimp`, `hubspot`, `zapier`
- `connection_id` (required): Connection ID
- `records` (required): Records to sync
- `field_mapping` (optional): Custom field mapping
- `tags` (optional): Tags to apply

### 16. configure_platform_connection

Configure platform credentials.

**Parameters:**
- `platform` (required): Platform type
- `connection_name` (required): Friendly name
- `credentials` (required): Platform-specific credentials
- `test` (optional): Test connection (default: true)

---

## Billing Tools (17-19)

### 17. create_checkout_session

Create a Stripe Checkout session.

**Parameters:**
- `plan` (required): `starter`, `growth`, `pro`
- `success_url` (optional): Success redirect
- `cancel_url` (optional): Cancel redirect

### 18. get_billing_status

Get current billing status and usage.

**Parameters:** None

### 19. get_billing_portal

Get Stripe Customer Portal URL.

**Parameters:**
- `return_url` (required): Return URL after portal

---

## REST API Endpoints

The REST API is available at `/api/v1/`:

- `POST /api/v1/data/search` - search_data
- `POST /api/v1/data/count` - preview_count
- `POST /api/v1/data/sample` - get_sample_data
- `GET /api/v1/pricing` - get_pricing
- `POST /api/v1/subscriptions` - create_subscription
- `PATCH /api/v1/subscriptions/:id` - manage_subscription
- `GET /api/v1/subscriptions` - list_subscriptions
- `GET /api/v1/subscriptions/:id/report` - delivery_report
- `POST /api/v1/templates` - upload_template
- `GET /api/v1/templates` - browse_templates
- `POST /api/v1/templates/import` - import_design
- `POST /api/v1/templates/:id/generate` - generate_postcard_pdf
- `POST /api/v1/delivery/configure` - configure_delivery
- `GET /api/v1/delivery/:id/status` - get_fulfillment_status
- `POST /api/v1/platforms/sync` - sync_to_platform
- `POST /api/v1/platforms/connections` - configure_platform_connection
- `POST /api/v1/billing/checkout` - create_checkout_session
- `GET /api/v1/billing/status` - get_billing_status
- `POST /api/v1/billing/portal` - get_billing_portal

---

## Health Checks

- `GET /api/health` - Full health check with database status
- `GET /api/ready` - Kubernetes readiness probe
- `GET /api/live` - Kubernetes liveness probe

---

## Webhooks

### Stripe Webhook

`POST /webhooks/stripe`

Handles:
- `checkout.session.completed` - New subscription signup
- `invoice.paid` - Successful payment
- `invoice.payment_failed` - Failed payment (pauses deliveries)
- `customer.subscription.deleted` - Cancellation
- `customer.subscription.updated` - Plan changes

Configure webhook secret in `STRIPE_WEBHOOK_SECRET`.
