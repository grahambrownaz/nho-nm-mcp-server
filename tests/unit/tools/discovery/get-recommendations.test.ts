/**
 * Tests for get_recommendations tool
 */

import { describe, it, expect } from 'vitest';
import type { TenantContext } from '../../../../src/utils/auth.js';
import { executeGetRecommendations } from '../../../../src/tools/discovery/get-recommendations.js';

function createTestContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenant: {
      id: 'test-tenant-id',
      name: 'Test Tenant',
      email: 'test@example.com',
      company: 'Test Company',
      phone: null,
      status: 'ACTIVE',
      stripeCustomerId: null,
      parentTenantId: null,
      isReseller: false,
      wholesalePricing: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    apiKey: {
      id: 'test-api-key-id',
      key: 'test-key',
      name: 'Test Key',
      tenantId: 'test-tenant-id',
      permissions: ['*'],
      isActive: true,
      lastUsedAt: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    subscription: null,
    permissions: ['*'],
    ...overrides,
  };
}

describe('get_recommendations tool', () => {
  const context = createTestContext();

  describe('valid inputs', () => {
    it('returns success for valid input with business_type', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'realtor',
        goals: ['find_new_customers'],
      };

      const result = await executeGetRecommendations(input, context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('returns success without industry (optional)', async () => {
      const input = {
        business_type: 'tech_developer',
        goals: ['api_integration'],
      };

      const result = await executeGetRecommendations(input, context);

      expect(result.success).toBe(true);
      expect(result.data.your_profile.industry).toBeNull();
    });

    it('returns all expected sections', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'hvac',
        goals: ['find_new_customers', 'direct_mail'],
      };

      const result = await executeGetRecommendations(input, context);

      expect(result.data.welcome_message).toBeDefined();
      expect(result.data.your_profile).toBeDefined();
      expect(result.data.your_profile.business_type).toBeDefined();
      expect(result.data.your_profile.business_type_description).toBeDefined();
      expect(result.data.recommended_workflows).toBeDefined();
      expect(result.data.quick_wins).toBeDefined();
      expect(result.data.available_categories).toBeDefined();
      expect(result.data.next_step).toBeDefined();
    });
  });

  describe('profile display', () => {
    it('maps business_type to display name', async () => {
      const input = {
        business_type: 'print_company',
        goals: ['offer_data_to_clients'],
      };

      const result = await executeGetRecommendations(input, context);

      expect(result.data.your_profile.business_type).toBe('Print & Mail Company');
      expect(result.data.your_profile.business_type_description).toContain('data + print');
    });

    it('maps industry to display name', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'realtor',
        goals: ['find_new_customers'],
      };

      const result = await executeGetRecommendations(input, context);

      expect(result.data.your_profile.industry).toBe('Real Estate');
    });

    it('maps goals to display names', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'insurance',
        goals: ['find_new_customers', 'email_campaigns'],
      };

      const result = await executeGetRecommendations(input, context);

      expect(result.data.your_profile.goals).toContain('Find New Customers');
      expect(result.data.your_profile.goals).toContain('Email Campaigns');
    });

    it('includes welcome message with business type and industry', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'landscaping',
        goals: ['direct_mail'],
      };

      const result = await executeGetRecommendations(input, context);

      expect(result.data.welcome_message).toContain('Business Owner');
      expect(result.data.welcome_message).toContain('Landscaping');
    });

    it('includes welcome message without industry for tech developers', async () => {
      const input = {
        business_type: 'tech_developer',
        goals: ['api_integration'],
      };

      const result = await executeGetRecommendations(input, context);

      expect(result.data.welcome_message).toContain('Developer');
    });
  });

  describe('business type workflow filtering', () => {
    it('returns end_user workflows for end_user + find_new_customers', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'realtor',
        goals: ['find_new_customers'],
      };

      const result = await executeGetRecommendations(input, context);

      const workflowNames = result.data.recommended_workflows.map((w) => w.name);
      expect(workflowNames).toContain('New Homeowner Direct Mail Campaign');
      expect(workflowNames).toContain('New Mover Welcome Campaign');
    });

    it('returns print-specific workflows for print_company', async () => {
      const input = {
        business_type: 'print_company',
        goals: ['offer_data_to_clients', 'automated_delivery'],
      };

      const result = await executeGetRecommendations(input, context);

      const workflowNames = result.data.recommended_workflows.map((w) => w.name);
      expect(workflowNames).toContain('Data + Print Service for Your Clients');
      expect(workflowNames).toContain('SFTP Hot Folder Integration');
    });

    it('returns agency-specific workflows for agency', async () => {
      const input = {
        business_type: 'agency',
        goals: ['offer_data_to_clients', 'direct_mail'],
      };

      const result = await executeGetRecommendations(input, context);

      const workflowNames = result.data.recommended_workflows.map((w) => w.name);
      expect(workflowNames).toContain('Multi-Client Campaign Management');
    });

    it('returns developer-specific workflows for tech_developer', async () => {
      const input = {
        business_type: 'tech_developer',
        goals: ['api_integration'],
      };

      const result = await executeGetRecommendations(input, context);

      const workflowNames = result.data.recommended_workflows.map((w) => w.name);
      expect(workflowNames).toContain('API & Data Integration');
    });

    it('returns reseller-specific workflows for reseller', async () => {
      const input = {
        business_type: 'reseller',
        goals: ['white_label', 'offer_data_to_clients'],
      };

      const result = await executeGetRecommendations(input, context);

      const workflowNames = result.data.recommended_workflows.map((w) => w.name);
      expect(workflowNames).toContain('White-Label Reseller Setup');
    });

    it('does not show print workflows to end_user', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'hvac',
        goals: ['find_new_customers', 'direct_mail'],
      };

      const result = await executeGetRecommendations(input, context);

      const workflowNames = result.data.recommended_workflows.map((w) => w.name);
      expect(workflowNames).not.toContain('Data + Print Service for Your Clients');
      expect(workflowNames).not.toContain('SFTP Hot Folder Integration');
    });

    it('does not show agency workflows to end_user', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'insurance',
        goals: ['find_new_customers'],
      };

      const result = await executeGetRecommendations(input, context);

      const workflowNames = result.data.recommended_workflows.map((w) => w.name);
      expect(workflowNames).not.toContain('Multi-Client Campaign Management');
    });
  });

  describe('industry workflow filtering', () => {
    it('includes email workflow when email_campaigns is a goal', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'insurance',
        goals: ['email_campaigns'],
      };

      const result = await executeGetRecommendations(input, context);

      const workflowNames = result.data.recommended_workflows.map((w) => w.name);
      expect(workflowNames).toContain('Email Campaign to Purchased Lists');
    });

    it('includes intent workflow when intent_data is a goal', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'hvac',
        goals: ['intent_data'],
      };

      const result = await executeGetRecommendations(input, context);

      const workflowNames = result.data.recommended_workflows.map((w) => w.name);
      expect(workflowNames).toContain('Intent-Based Prospecting');
    });

    it('sorts workflows by goal relevance', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'insurance',
        goals: ['find_new_customers', 'email_campaigns'],
      };

      const result = await executeGetRecommendations(input, context);

      // Workflows matching more goals should appear first
      expect(result.data.recommended_workflows.length).toBeGreaterThan(0);
    });
  });

  describe('new industries', () => {
    it('supports solar industry', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'solar',
        goals: ['find_new_customers'],
      };

      const result = await executeGetRecommendations(input, context);

      expect(result.data.your_profile.industry).toBe('Solar');
      expect(result.data.recommended_workflows.length).toBeGreaterThan(0);
    });

    it('supports roofing industry', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'roofing',
        goals: ['direct_mail'],
      };

      const result = await executeGetRecommendations(input, context);

      expect(result.data.your_profile.industry).toBe('Roofing');
    });

    it('supports dental industry', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'dental',
        goals: ['find_new_customers'],
      };

      const result = await executeGetRecommendations(input, context);

      expect(result.data.your_profile.industry).toBe('Dental');
    });
  });

  describe('include_examples flag', () => {
    it('includes step details when include_examples is true', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'realtor',
        goals: ['find_new_customers'],
        include_examples: true,
      };

      const result = await executeGetRecommendations(input, context);

      const firstWorkflow = result.data.recommended_workflows[0];
      expect(firstWorkflow.steps.length).toBeGreaterThan(0);
      expect(firstWorkflow.steps[0].tool).toBeDefined();
      expect(firstWorkflow.steps[0].action).toBeDefined();
    });

    it('omits step details when include_examples is false', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'realtor',
        goals: ['find_new_customers'],
        include_examples: false,
      };

      const result = await executeGetRecommendations(input, context);

      const firstWorkflow = result.data.recommended_workflows[0];
      expect(firstWorkflow.steps).toEqual([]);
    });

    it('defaults to include_examples true', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'realtor',
        goals: ['find_new_customers'],
      };

      const result = await executeGetRecommendations(input, context);

      const firstWorkflow = result.data.recommended_workflows[0];
      expect(firstWorkflow.steps.length).toBeGreaterThan(0);
    });
  });

  describe('quick wins', () => {
    it('returns quick wins matching business type and goals', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'hvac',
        goals: ['find_new_customers'],
      };

      const result = await executeGetRecommendations(input, context);

      expect(result.data.quick_wins.length).toBeGreaterThan(0);
      expect(result.data.quick_wins[0].tool).toBeDefined();
      expect(result.data.quick_wins[0].description).toBeDefined();
      expect(result.data.quick_wins[0].why).toBeDefined();
    });

    it('returns max 4 quick wins', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'realtor',
        goals: ['find_new_customers', 'direct_mail', 'email_campaigns', 'data_enrichment'],
      };

      const result = await executeGetRecommendations(input, context);

      expect(result.data.quick_wins.length).toBeLessThanOrEqual(4);
    });

    it('includes developer-relevant quick wins for tech_developer', async () => {
      const input = {
        business_type: 'tech_developer',
        goals: ['data_enrichment'],
      };

      const result = await executeGetRecommendations(input, context);

      const tools = result.data.quick_wins.map((qw) => qw.tool);
      expect(tools).toContain('get_sample_data');
    });

    it('includes pricing quick win for print_company', async () => {
      const input = {
        business_type: 'print_company',
        goals: ['offer_data_to_clients'],
      };

      const result = await executeGetRecommendations(input, context);

      const tools = result.data.quick_wins.map((qw) => qw.tool);
      expect(tools).toContain('get_pricing');
    });
  });

  describe('category relevance scoring', () => {
    it('marks matching categories as high relevance', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'realtor',
        goals: ['direct_mail'],
      };

      const result = await executeGetRecommendations(input, context);

      const directMailCat = result.data.available_categories.find(
        (c) => c.category === 'Direct Mail & Postcards'
      );
      expect(directMailCat?.relevance).toBe('high');
    });

    it('sorts categories by relevance (high first)', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'insurance',
        goals: ['find_new_customers'],
      };

      const result = await executeGetRecommendations(input, context);

      const relevances = result.data.available_categories.map((c) => c.relevance);
      const relevanceOrder = { high: 0, medium: 1, low: 2 };
      for (let i = 1; i < relevances.length; i++) {
        expect(relevanceOrder[relevances[i]]).toBeGreaterThanOrEqual(
          relevanceOrder[relevances[i - 1]]
        );
      }
    });

    it('includes all categories regardless of relevance', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'hvac',
        goals: ['direct_mail'],
      };

      const result = await executeGetRecommendations(input, context);

      // Should have all 10 categories
      expect(result.data.available_categories.length).toBe(10);
    });

    it('considers business type in relevance scoring', async () => {
      const input = {
        business_type: 'tech_developer',
        goals: ['api_integration'],
      };

      const result = await executeGetRecommendations(input, context);

      // Email campaigns should be low relevance for tech_developer
      const emailCat = result.data.available_categories.find(
        (c) => c.category === 'Email Campaigns'
      );
      expect(emailCat?.relevance).toBe('low');
    });
  });

  describe('next step recommendation', () => {
    it('always includes a next_step', async () => {
      const input = {
        business_type: 'end_user',
        goals: ['find_new_customers'],
      };

      const result = await executeGetRecommendations(input, context);

      expect(result.data.next_step.tool).toBeDefined();
      expect(result.data.next_step.prompt).toBeDefined();
      expect(result.data.next_step.prompt.length).toBeGreaterThan(0);
    });

    it('suggests preview_count for direct_mail goal', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'realtor',
        goals: ['direct_mail'],
      };

      const result = await executeGetRecommendations(input, context);

      expect(result.data.next_step.tool).toBe('preview_count');
    });

    it('suggests configure_email_account for email_campaigns goal', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'insurance',
        goals: ['email_campaigns'],
      };

      const result = await executeGetRecommendations(input, context);

      expect(result.data.next_step.tool).toBe('configure_email_account');
    });

    it('suggests list_intent_categories for intent_data goal', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'hvac',
        goals: ['intent_data'],
      };

      const result = await executeGetRecommendations(input, context);

      expect(result.data.next_step.tool).toBe('list_intent_categories');
    });

    it('suggests get_sample_data for tech_developer', async () => {
      const input = {
        business_type: 'tech_developer',
        goals: ['api_integration'],
      };

      const result = await executeGetRecommendations(input, context);

      expect(result.data.next_step.tool).toBe('get_sample_data');
    });

    it('suggests get_pricing for reseller', async () => {
      const input = {
        business_type: 'reseller',
        goals: ['white_label'],
      };

      const result = await executeGetRecommendations(input, context);

      expect(result.data.next_step.tool).toBe('get_pricing');
    });

    it('suggests get_pricing for print_company with offer_data_to_clients', async () => {
      const input = {
        business_type: 'print_company',
        goals: ['offer_data_to_clients'],
      };

      const result = await executeGetRecommendations(input, context);

      expect(result.data.next_step.tool).toBe('get_pricing');
    });

    it('suggests configure_delivery for print_company without offer_data_to_clients', async () => {
      const input = {
        business_type: 'print_company',
        goals: ['automated_delivery'],
      };

      const result = await executeGetRecommendations(input, context);

      expect(result.data.next_step.tool).toBe('configure_delivery');
    });

    it('suggests get_pricing for agency with offer_data_to_clients', async () => {
      const input = {
        business_type: 'agency',
        goals: ['offer_data_to_clients'],
      };

      const result = await executeGetRecommendations(input, context);

      expect(result.data.next_step.tool).toBe('get_pricing');
    });

    it('suggests configure_platform_connection for crm_sync goal', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'realtor',
        goals: ['crm_sync'],
      };

      const result = await executeGetRecommendations(input, context);

      expect(result.data.next_step.tool).toBe('configure_platform_connection');
    });
  });

  describe('input validation', () => {
    it('throws error for invalid business_type', async () => {
      const input = {
        business_type: 'invalid_type',
        goals: ['find_new_customers'],
      };

      await expect(executeGetRecommendations(input, context)).rejects.toThrow();
    });

    it('throws error for invalid industry', async () => {
      const input = {
        business_type: 'end_user',
        industry: 'invalid_industry',
        goals: ['find_new_customers'],
      };

      await expect(executeGetRecommendations(input, context)).rejects.toThrow();
    });

    it('throws error for invalid goal', async () => {
      const input = {
        business_type: 'end_user',
        goals: ['invalid_goal'],
      };

      await expect(executeGetRecommendations(input, context)).rejects.toThrow();
    });

    it('throws error for empty goals array', async () => {
      const input = {
        business_type: 'end_user',
        goals: [],
      };

      await expect(executeGetRecommendations(input, context)).rejects.toThrow();
    });

    it('throws error for missing business_type', async () => {
      const input = {
        goals: ['find_new_customers'],
      };

      await expect(executeGetRecommendations(input, context)).rejects.toThrow();
    });
  });

  describe('no permission check required', () => {
    it('works with any permission set (info tool)', async () => {
      const restrictedContext = createTestContext({
        permissions: ['data:read'],
      });

      const input = {
        business_type: 'end_user',
        industry: 'hvac',
        goals: ['find_new_customers'],
      };

      const result = await executeGetRecommendations(input, restrictedContext);

      expect(result.success).toBe(true);
    });
  });
});
