# Troubleshooting Guide

## Common Issues

### Authentication Errors

**Error:** `Authentication required` or `Invalid API key`

**Solutions:**
1. Verify API key is passed in `X-API-Key` header
2. Check API key is active in database
3. Verify tenant status is `ACTIVE`
4. Check API key hasn't expired

```sql
-- Check API key status
SELECT ak.*, t.status as tenant_status
FROM api_keys ak
JOIN tenants t ON ak.tenant_id = t.id
WHERE ak.key = 'your-api-key';
```

### Database Connection Issues

**Error:** `Database error` or connection timeout

**Solutions:**
1. Verify `DATABASE_URL` is correct
2. Check PostgreSQL is running
3. Verify network connectivity
4. Check connection pool limits

```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

### SFTP Delivery Failures

**Error:** `SFTP error` or connection refused

**Solutions:**
1. Verify SFTP credentials
2. Check host/port accessibility
3. Verify folder permissions
4. Test connection manually

```bash
# Test SFTP connection
sftp -P 22 user@host
```

**Common SFTP Issues:**
- Wrong port (check if 22 or custom)
- Firewall blocking connection
- SSH key format issues
- Folder doesn't exist

### Print API Errors

**Error:** `Print API error` or job submission failed

**Solutions:**
1. Verify API key is valid
2. Check account has sufficient balance
3. Verify return address is complete
4. Check recipient addresses are valid

**Lob-specific:**
```bash
# Test Lob API
curl https://api.lob.com/v1/addresses \
  -u "test_xxx:" \
  -d "name=Test" \
  -d "address_line1=185 Berry St" \
  -d "address_city=San Francisco" \
  -d "address_state=CA" \
  -d "address_zip=94107"
```

### Stripe Billing Issues

**Error:** `Billing error` or webhook failures

**Solutions:**
1. Verify Stripe API keys
2. Check webhook secret matches
3. Verify webhook endpoint is accessible
4. Check Stripe dashboard for errors

```bash
# Test webhook endpoint
curl -X POST https://your-domain.com/webhooks/stripe \
  -H "Content-Type: application/json" \
  -d '{"type":"test"}'
```

**Webhook debugging:**
1. Check Stripe Dashboard > Developers > Webhooks
2. View webhook attempt logs
3. Verify endpoint response codes

### Platform Sync Failures

**Error:** `Platform sync error` for Mailchimp/HubSpot

**Solutions:**

**Mailchimp:**
1. Verify API key format: `xxxxx-us1` (includes server)
2. Check audience ID exists
3. Verify merge fields are configured

**HubSpot:**
1. Verify access token is valid
2. Check token has correct scopes
3. Verify contact properties exist

**Zapier:**
1. Verify webhook URL is active
2. Check Zap is turned on
3. Test webhook manually

### PDF Generation Issues

**Error:** `PDF generation error` or blank PDFs

**Solutions:**
1. Check template HTML is valid
2. Verify merge fields match record data
3. Check Puppeteer dependencies

```bash
# Install Puppeteer dependencies (Linux)
apt-get install -y \
  chromium \
  libnss3 \
  libatk-bridge2.0-0 \
  libdrm2 \
  libxkbcommon0 \
  libgbm1
```

### Rate Limiting

**Error:** `Rate limit exceeded`

**Solutions:**
1. Reduce request frequency
2. Implement request batching
3. Wait for rate limit reset
4. Contact support for limit increase

Check rate limit headers:
- `X-RateLimit-Limit`: Max requests
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Reset timestamp
- `Retry-After`: Seconds to wait

### Memory Issues

**Error:** Out of memory or slow responses

**Solutions:**
1. Increase Node.js heap size
2. Reduce batch sizes
3. Implement pagination
4. Add memory monitoring

```bash
# Increase heap size
NODE_OPTIONS="--max-old-space-size=4096" node dist/main.js
```

### Scheduler Not Running

**Error:** Deliveries not being processed

**Solutions:**
1. Verify `ENABLE_SCHEDULER=true`
2. Check scheduler timezone
3. Verify no other instance is running scheduler
4. Check scheduler logs

```bash
# Manually trigger processing
curl -X POST http://localhost:3000/api/v1/admin/process-deliveries
```

---

## Debugging Tools

### Health Check

```bash
curl http://localhost:3000/api/health | jq
```

### Database Queries

```sql
-- Check pending deliveries
SELECT * FROM data_subscriptions
WHERE status = 'ACTIVE'
AND next_delivery_at <= NOW();

-- Check recent deliveries
SELECT * FROM deliveries
ORDER BY created_at DESC
LIMIT 10;

-- Check failed deliveries
SELECT * FROM deliveries
WHERE status = 'FAILED'
ORDER BY created_at DESC;
```

### Log Analysis

```bash
# Filter error logs
grep -i error logs/app.log

# Recent delivery logs
grep "Processor" logs/app.log | tail -50
```

---

## Getting Help

1. Check this troubleshooting guide
2. Review API documentation at `/api/docs`
3. Check GitHub issues
4. Contact support with:
   - Error message
   - Request ID (from response headers)
   - Steps to reproduce
   - Relevant logs
