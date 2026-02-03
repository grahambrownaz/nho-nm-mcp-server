# NHO/NM MCP Server

An MCP (Model Context Protocol) server for accessing New Homeowner (NHO) and New Mover data through the LeadsPlease API.

## Features

- **search_data**: Search for NHO/NM records by geography and demographics
- **preview_count**: Get record counts without fetching actual data (free)
- **get_sample_data**: Preview sample records before purchasing (free)
- **get_pricing**: View pricing tiers and volume discounts

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL database (for production)

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Generate Prisma client
npm run db:generate

# (Optional) Set up database and seed test data
npm run db:push
npm run db:seed
```

### Development

```bash
# Start in development mode with hot reload
npm run dev
```

### Production

```bash
# Build
npm run build

# Start
npm start
```

## Connecting to Claude Desktop

Add this server to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "nho-nm": {
      "command": "node",
      "args": ["/path/to/nho-nm-mcp-server/dist/index.js"],
      "env": {
        "TEST_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Available Tools

### search_data

Search for records with full data. Charged per record.

```json
{
  "database": "nho",
  "geography": {
    "type": "zip",
    "values": ["85001", "85002", "85003"]
  },
  "filters": {
    "income": { "min": 75000 },
    "homeValue": { "min": 300000 }
  },
  "limit": 100,
  "include_email": true
}
```

### preview_count

Get estimated record counts (no charge).

```json
{
  "database": "new_mover",
  "geography": {
    "type": "state",
    "values": ["AZ", "CA"]
  }
}
```

### get_sample_data

Preview sample records (no charge, no email/phone).

```json
{
  "database": "nho",
  "geography": {
    "type": "city",
    "values": ["Phoenix", "Scottsdale"]
  },
  "count": 5
}
```

### get_pricing

View pricing information.

```json
{
  "volume": 1000
}
```

## Project Structure

```
src/
├── index.ts              # Entry point
├── server.ts             # MCP server configuration
├── tools/
│   └── data/
│       ├── search-data.ts
│       ├── preview-count.ts
│       ├── get-sample-data.ts
│       └── get-pricing.ts
├── services/
│   └── leadsplease-api.ts   # LeadsPlease API integration
├── db/
│   ├── client.ts         # Prisma client singleton
│   └── seed.ts           # Database seeding
└── utils/
    ├── auth.ts           # Authentication
    ├── validation.ts     # Zod schemas
    └── errors.ts         # Error classes
```

## License

MIT
