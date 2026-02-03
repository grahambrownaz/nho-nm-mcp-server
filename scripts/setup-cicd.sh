#!/bin/bash
# CI/CD Setup Script for NHO/NM MCP Server
# Run this script in your terminal: ./scripts/setup-cicd.sh

set -e

echo "================================"
echo "NHO/NM MCP Server CI/CD Setup"
echo "================================"
echo ""

# Step 1: Fix npm cache permissions
echo "Step 1: Fixing npm cache permissions..."
sudo chown -R $(whoami) ~/.npm
echo "✓ npm cache permissions fixed"
echo ""

# Step 2: Install dependencies
echo "Step 2: Installing dependencies..."
npm install
echo "✓ Dependencies installed"
echo ""

# Step 3: Install GitHub CLI if not present
echo "Step 3: Checking GitHub CLI..."
if ! command -v gh &> /dev/null; then
    echo "GitHub CLI not found. Installing via Homebrew..."
    if command -v brew &> /dev/null; then
        brew install gh
    else
        echo "Homebrew not found. Please install GitHub CLI manually:"
        echo "  https://cli.github.com/manual/installation"
        exit 1
    fi
fi
echo "✓ GitHub CLI available"
echo ""

# Step 4: Authenticate with GitHub if needed
echo "Step 4: Checking GitHub authentication..."
if ! gh auth status &> /dev/null; then
    echo "Please authenticate with GitHub:"
    gh auth login
fi
echo "✓ GitHub authenticated"
echo ""

# Get repository info
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")
if [ -z "$REPO" ]; then
    echo "Could not detect GitHub repository."
    echo "Please ensure this is a git repo connected to GitHub."
    echo ""
    read -p "Enter repository (owner/repo): " REPO
fi
echo "Repository: $REPO"
echo ""

# Step 5: Set GitHub Secrets
echo "Step 5: Setting GitHub Secrets..."
echo "You'll be prompted to enter values for each secret."
echo ""

echo "RAILWAY_TOKEN - Get from Railway dashboard > Account Settings > Tokens"
read -sp "Enter RAILWAY_TOKEN: " RAILWAY_TOKEN
echo ""
if [ -n "$RAILWAY_TOKEN" ]; then
    echo "$RAILWAY_TOKEN" | gh secret set RAILWAY_TOKEN --repo "$REPO"
    echo "✓ RAILWAY_TOKEN set"
fi

echo ""
echo "STRIPE_TEST_KEY - Get from Stripe Dashboard > Developers > API Keys (test mode)"
read -sp "Enter STRIPE_TEST_KEY (sk_test_...): " STRIPE_TEST_KEY
echo ""
if [ -n "$STRIPE_TEST_KEY" ]; then
    echo "$STRIPE_TEST_KEY" | gh secret set STRIPE_TEST_KEY --repo "$REPO"
    echo "✓ STRIPE_TEST_KEY set"
fi

echo ""
echo "LEADSPLEASE_TEST_KEY - Your LeadsPlease test API key"
read -sp "Enter LEADSPLEASE_TEST_KEY: " LEADSPLEASE_TEST_KEY
echo ""
if [ -n "$LEADSPLEASE_TEST_KEY" ]; then
    echo "$LEADSPLEASE_TEST_KEY" | gh secret set LEADSPLEASE_TEST_KEY --repo "$REPO"
    echo "✓ LEADSPLEASE_TEST_KEY set"
fi

echo ""
echo "ENCRYPTION_KEY - 32+ character encryption key for sensitive data"
read -sp "Enter ENCRYPTION_KEY (or press enter to generate): " ENCRYPTION_KEY
echo ""
if [ -z "$ENCRYPTION_KEY" ]; then
    ENCRYPTION_KEY=$(openssl rand -hex 32)
    echo "Generated: $ENCRYPTION_KEY"
fi
echo "$ENCRYPTION_KEY" | gh secret set ENCRYPTION_KEY --repo "$REPO"
echo "✓ ENCRYPTION_KEY set"

echo ""

# Step 6: Set GitHub Variables
echo "Step 6: Setting GitHub Variables..."
echo ""

read -p "Enter STAGING_URL (e.g., https://staging.yourapp.com): " STAGING_URL
if [ -n "$STAGING_URL" ]; then
    gh variable set STAGING_URL --repo "$REPO" --body "$STAGING_URL"
    echo "✓ STAGING_URL set"
fi

read -p "Enter PRODUCTION_URL (e.g., https://yourapp.com): " PRODUCTION_URL
if [ -n "$PRODUCTION_URL" ]; then
    gh variable set PRODUCTION_URL --repo "$REPO" --body "$PRODUCTION_URL"
    echo "✓ PRODUCTION_URL set"
fi

echo ""
echo "================================"
echo "✓ CI/CD Setup Complete!"
echo "================================"
echo ""
echo "Next steps:"
echo "1. Push your code to GitHub"
echo "2. The CI workflow will run on push to main/develop"
echo "3. Deploy workflow runs on push to main (staging) or manual trigger (production)"
echo ""
echo "Verify setup:"
echo "  gh secret list --repo $REPO"
echo "  gh variable list --repo $REPO"
