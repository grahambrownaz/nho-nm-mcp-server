/**
 * Server validation script
 */

import { createRestApi } from '../src/api/index.js';

// Import tool definitions to verify they load
import { searchDataTool } from '../src/tools/data/index.js';
import { createSubscriptionTool } from '../src/tools/subscriptions/index.js';
import { uploadTemplateTool } from '../src/tools/templates/index.js';
import { configureDeliveryTool } from '../src/tools/delivery/index.js';
import { createCheckoutSessionTool } from '../src/tools/billing/index.js';
import { syncToPlatformTool } from '../src/tools/platforms/index.js';

// Import services to verify they load
import { getDeduplicationService } from '../src/services/deduplication.js';
import { RateLimiter } from '../src/utils/rate-limiter.js';

async function validate() {
  console.log('Validating module imports and service creation...\n');

  // Test tool definitions
  console.log('=== Tool Definitions ===');
  console.log(`✓ search_data: ${searchDataTool.name}`);
  console.log(`✓ create_subscription: ${createSubscriptionTool.name}`);
  console.log(`✓ upload_template: ${uploadTemplateTool.name}`);
  console.log(`✓ configure_delivery: ${configureDeliveryTool.name}`);
  console.log(`✓ create_checkout_session: ${createCheckoutSessionTool.name}`);
  console.log(`✓ sync_to_platform: ${syncToPlatformTool.name}`);

  // Test services
  console.log('\n=== Services ===');
  const dedupeService = getDeduplicationService();
  console.log('✓ Deduplication service created');

  const rateLimiter = new RateLimiter({ maxRequests: 10, windowMs: 60000 });
  console.log('✓ Rate limiter created');
  rateLimiter.destroy();

  // Test API creation
  console.log('\n=== API ===');
  const api = createRestApi({ standalone: false });
  console.log('✓ REST API created successfully');

  console.log('\n=== All validations passed ===');

  // Exit cleanly
  process.exit(0);
}

validate().catch(err => {
  console.error('Validation failed:', err);
  process.exit(1);
});
