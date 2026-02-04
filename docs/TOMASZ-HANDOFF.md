# NHO/NM Data Platform - Handoff to Tomasz

Hi Tomasz! Graham built this data platform and needs your help connecting it to our infrastructure.

---

## Quick Start

```bash
git clone https://github.com/grahambrown/nho-nm-mcp-server.git
cd nho-nm-mcp-server
npm install
cat docs/SETUP.md  # Full setup instructions
```

---

## What Graham Needs You To Configure

### 1. AWS Resources

| Resource | Purpose | What to provide back |
|----------|---------|---------------------|
| **S3 Bucket** | Store exports (CSV, Excel, PDF) | Bucket name, region |
| **IAM User/Role** | App credentials | Access Key ID, Secret Access Key |
| **RDS PostgreSQL** | Production database | Connection string |
| **CloudFront** (optional) | CDN for downloads | Distribution URL |
| **SES** (optional) | Email notifications | SMTP credentials |

**Environment variables to set:**
```env
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
AWS_S3_BUCKET=nho-nm-exports
DATABASE_URL=postgresql://user:pass@rds-endpoint:5432/nho_nm_production
```

---

### 2. Data API Integration

The app needs to connect to our data APIs for searching NHO, New Mover, Consumer, and Business records.

**Please provide:**

#### API Endpoints
- Base URL (e.g., `https://api.ourcompany.com/v1`)
- Search endpoint
- Count/preview endpoint
- Pricing endpoint
- Filter options endpoint

#### Authentication
- API key or OAuth credentials
- Required headers (X-API-Key, Bearer token, etc.)
- Rate limits

#### Documentation
- Swagger/OpenAPI spec (if available)
- Request/response format examples
- Error codes

#### Data Schema
- Available fields (name, address, phone, email, income, etc.)
- Available databases (NHO, New Mover, Consumer, Business)
- Filter options per database (geography, demographics, date ranges)

#### Test Environment
- Sandbox API URL
- Test API key
- Sample data for development

**Environment variables to set:**
```env
DATA_API_URL=https://api.ourcompany.com/v1
DATA_API_KEY=your-api-key
DATA_API_AUTH_HEADER=X-API-Key  # or "Authorization: Bearer"
```

---

### 3. Deployment

Choose one:

#### Option A: Railway (Recommended - Simple)
- Connect GitHub repo
- Add PostgreSQL
- Set environment variables
- Auto-deploys on push

#### Option B: AWS (Full Control)
- ECS/Fargate or EC2
- RDS PostgreSQL
- Load balancer
- CloudWatch logging

#### Option C: Other
- Vercel, Render, DigitalOcean, etc.

**What Graham needs back:**
- Production URL (e.g., `https://nho-nm.ourcompany.com`)
- Staging URL (e.g., `https://nho-nm-staging.ourcompany.com`)

---

### 4. Stripe Integration (Billing)

If using Stripe for billing:

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Webhook endpoint to configure in Stripe Dashboard:
```
https://YOUR_DOMAIN/webhooks/stripe
```

---

## Full Environment Variables Reference

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Data API
DATA_API_URL=https://api.yourcompany.com/v1
DATA_API_KEY=your-key

# AWS
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
AWS_S3_BUCKET=nho-nm-exports

# Stripe (Billing)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# App Config
NODE_ENV=production
LOG_LEVEL=info
PORT=3000

# Optional: Email
AWS_SES_FROM_EMAIL=noreply@yourcompany.com

# Optional: Monitoring
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
PAGERDUTY_ROUTING_KEY=...
```

---

## Project Structure

```
src/
├── api/           # REST API endpoints
├── services/      # Business logic (this is where API integrations live)
│   └── leadsplease-api.ts  # Data API client (rename/update for our API)
├── tools/         # MCP tools for Claude integration
├── webhooks/      # Stripe webhooks
└── utils/         # Shared utilities
```

---

## Questions?

Reach out to Graham or check GitHub issues.

---

## Checklist for Tomasz

- [ ] Clone repo and verify local setup works
- [ ] Create S3 bucket and IAM credentials
- [ ] Set up RDS PostgreSQL (or use existing)
- [ ] Provide Data API credentials and documentation
- [ ] Choose deployment platform
- [ ] Deploy staging environment
- [ ] Deploy production environment
- [ ] Share URLs and credentials back with Graham
