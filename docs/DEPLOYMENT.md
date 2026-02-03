# Deployment Guide

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Stripe account (for billing)
- Print API account (Lob, PostGrid, or ReminderMedia)

## Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/nho_nm_mcp"

# Server
MCP_SERVER_NAME="nho-nm-mcp-server"
MCP_SERVER_VERSION="1.2.0"
NODE_ENV="production"

# Authentication
ADMIN_API_KEY="your-admin-api-key"

# Stripe Billing
STRIPE_SECRET_KEY="sk_live_xxx"
STRIPE_WEBHOOK_SECRET="whsec_xxx"
STRIPE_PRICE_DATA_RECORD="price_xxx"
STRIPE_PRICE_PDF_GENERATION="price_xxx"
STRIPE_PRICE_PRINT_4X6="price_xxx"
STRIPE_PRICE_PLATFORM_STARTER="price_xxx"
STRIPE_PRICE_PLATFORM_GROWTH="price_xxx"
STRIPE_PRICE_PLATFORM_PRO="price_xxx"

# Print API (configure one)
PRINT_API_DEFAULT_PROVIDER="lob"
LOB_API_KEY="live_xxx"

# LeadsPlease API
LEADSPLEASE_API_KEY="your-api-key"
LEADSPLEASE_API_URL="https://api.leadsplease.com/v1"

# Encryption
ENCRYPTION_KEY="your-32-byte-hex-key"

# Features
ENABLE_REST_API="true"
REST_API_PORT="3000"
ENABLE_SCHEDULER="true"
SCHEDULER_TIMEZONE="America/New_York"
SCHEDULER_HOUR="6"
```

## Local Development

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Start development server
npm run dev
```

## Database Setup

```bash
# Create database
createdb nho_nm_mcp

# Run migrations
npx prisma migrate deploy

# Seed initial data (optional)
npx prisma db seed
```

## Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/main.js"]
```

```bash
# Build image
docker build -t nho-nm-mcp-server .

# Run container
docker run -d \
  --name nho-nm-mcp \
  -p 3000:3000 \
  --env-file .env \
  nho-nm-mcp-server
```

## Railway Deployment

1. Connect your GitHub repository to Railway
2. Set environment variables in Railway dashboard
3. Railway will auto-detect the Node.js app and deploy

```bash
# Railway CLI
railway login
railway init
railway up
```

## Vercel Deployment

For serverless deployment on Vercel:

1. Create `vercel.json`:
```json
{
  "functions": {
    "api/**/*.ts": {
      "runtime": "@vercel/node@3"
    }
  }
}
```

2. Deploy:
```bash
vercel --prod
```

Note: Cron jobs will need to be triggered externally (e.g., Vercel Cron or external service).

## Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nho-nm-mcp-server
spec:
  replicas: 2
  selector:
    matchLabels:
      app: nho-nm-mcp-server
  template:
    metadata:
      labels:
        app: nho-nm-mcp-server
    spec:
      containers:
      - name: app
        image: your-registry/nho-nm-mcp-server:latest
        ports:
        - containerPort: 3000
        envFrom:
        - secretRef:
            name: nho-nm-mcp-secrets
        livenessProbe:
          httpGet:
            path: /api/live
            port: 3000
          initialDelaySeconds: 10
        readinessProbe:
          httpGet:
            path: /api/ready
            port: 3000
          initialDelaySeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: nho-nm-mcp-server
spec:
  selector:
    app: nho-nm-mcp-server
  ports:
  - port: 80
    targetPort: 3000
```

## Stripe Webhook Setup

1. Go to Stripe Dashboard > Developers > Webhooks
2. Add endpoint: `https://your-domain.com/webhooks/stripe`
3. Select events:
   - `checkout.session.completed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`
   - `customer.subscription.updated`
4. Copy signing secret to `STRIPE_WEBHOOK_SECRET`

## Post-Deployment Checklist

- [ ] Database migrations applied
- [ ] Environment variables configured
- [ ] Stripe webhook endpoint configured and tested
- [ ] Health check endpoint responding (`/api/health`)
- [ ] API documentation accessible (`/api/docs`)
- [ ] SFTP connections tested (if using Printer Mode)
- [ ] Print API credentials validated (if using Direct Mode)
- [ ] Platform connections tested (if using integrations)
- [ ] First delivery scheduled and monitored

## Monitoring

### Health Endpoints

- `GET /api/health` - Full health status
- `GET /api/ready` - Readiness check
- `GET /api/live` - Liveness check

### Logs

Logs are written to stderr. In production, configure log aggregation:

```bash
# View logs
docker logs nho-nm-mcp

# Stream logs
docker logs -f nho-nm-mcp
```

### Metrics

Key metrics to monitor:
- Delivery success rate
- API response times
- Database connection pool usage
- Print API job success rate
- Stripe payment success rate

## Scaling

### Horizontal Scaling

The application is stateless and can be scaled horizontally:

```bash
# Docker Swarm
docker service scale nho-nm-mcp=5

# Kubernetes
kubectl scale deployment nho-nm-mcp-server --replicas=5
```

### Database Scaling

- Use connection pooling (PgBouncer)
- Consider read replicas for reporting
- Monitor slow queries

### Scheduler Considerations

When running multiple instances, ensure only one scheduler runs:
- Use distributed locking (Redis)
- Or designate a single scheduler instance
- Or use external cron service
