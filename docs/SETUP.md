# NHO/NM MCP Server - Developer Setup Guide

## Prerequisites

- **Node.js** 18+ (recommended: 20+)
- **PostgreSQL** 15+
- **Git**
- **macOS** (or Linux)

---

## Quick Start

### 1. Clone the Repository

```bash
git clone <REPO_URL>
cd nho-nm-mcp-server
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up PostgreSQL

**macOS (Homebrew):**
```bash
brew install postgresql@15
brew services start postgresql@15
createdb nho_nm_mcp
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo -u postgres createdb nho_nm_mcp
```

**Docker (Alternative):**
```bash
docker run -d \
  --name nho-postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=nho_nm_mcp \
  -p 5432:5432 \
  postgres:15
```

### 4. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Database (adjust if using Docker)
DATABASE_URL="postgresql://localhost:5432/nho_nm_mcp?schema=public"

# For Docker:
# DATABASE_URL="postgresql://postgres:password@localhost:5432/nho_nm_mcp?schema=public"

# API Keys (get from team lead)
LEADSPLEASE_API_KEY="your-key"
STRIPE_SECRET_KEY="sk_test_..."

# Leave defaults for local dev
NODE_ENV="development"
LOG_LEVEL="info"
```

### 5. Initialize Database

```bash
# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# (Optional) Seed with test data
npm run db:seed
```

### 6. Run the Server

```bash
npm run dev
```

You should see:
```
REST API server running on port 3000
API Documentation: http://localhost:3000/api/docs
```

### 7. Verify It Works

Open in browser: http://localhost:3000/api/docs

Or test with curl:
```bash
curl http://localhost:3000/health/live
# Should return: {"status":"alive"}
```

---

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript |
| `npm run start` | Run production build |
| `npm test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | TypeScript type checking |
| `npm run db:studio` | Open Prisma Studio (database GUI) |

---

## Project Structure

```
src/
├── api/                 # REST API (Express.js)
│   ├── middleware/      # Auth, rate limiting, errors
│   └── routes/          # API endpoints
├── cron/                # Scheduled jobs
├── db/                  # Prisma client
├── services/            # Business logic
├── tools/               # MCP tool implementations
│   ├── billing/         # Stripe billing
│   ├── data/            # Data search & pricing
│   ├── delivery/        # SFTP delivery
│   ├── exports/         # Data exports
│   ├── platforms/       # Mailchimp, HubSpot, Zapier
│   ├── purchases/       # One-time purchases
│   ├── subscriptions/   # Recurring subscriptions
│   └── templates/       # Postcard templates
├── utils/               # Shared utilities
└── webhooks/            # Stripe webhooks
```

---

## API Documentation

Once running, view interactive API docs at:
http://localhost:3000/api/docs

Key endpoints:
- `GET /health` - Health check
- `GET /api/v1/filters/:database` - Get filter options
- `POST /api/v1/data/search` - Search data
- `POST /api/v1/subscriptions` - Create subscription
- `POST /api/v1/purchases` - One-time purchase

---

## MCP Server (for Claude Desktop)

This app is also an MCP server. To use with Claude Desktop:

1. Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "nho-nm": {
      "command": "node",
      "args": ["/path/to/nho-nm-mcp-server/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://localhost:5432/nho_nm_mcp?schema=public",
        "LEADSPLEASE_API_KEY": "your-key"
      }
    }
  }
}
```

2. Build the project: `npm run build`
3. Restart Claude Desktop

---

## Troubleshooting

### Database connection error
```
Can't reach database server at localhost:5432
```
**Fix:** Start PostgreSQL
```bash
brew services start postgresql@15
```

### Port 3000 already in use
```
Error: listen EADDRINUSE: address already in use :::3000
```
**Fix:** Kill the process or use different port
```bash
# Find process
lsof -i :3000
# Kill it
kill -9 <PID>
```

### Prisma client not generated
```
Error: @prisma/client did not initialize yet
```
**Fix:** Generate client
```bash
npm run db:generate
```

### npm install fails
```
npm error EACCES permission denied
```
**Fix:** Fix npm cache permissions
```bash
sudo chown -R $(whoami) ~/.npm
```

---

## Contact

Questions? Reach out to Graham or check the GitHub issues.
