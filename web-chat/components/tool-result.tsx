'use client';

import { Wrench, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface ToolResultProps {
  toolName: string;
  result: string;
  args?: Record<string, unknown>;
}

// Map tool names to user-friendly labels
const TOOL_LABELS: Record<string, string> = {
  get_recommendations: 'Getting personalized recommendations',
  preview_count: 'Checking available records',
  get_sample_data: 'Fetching sample records',
  search_data: 'Searching data',
  get_pricing: 'Looking up pricing',
  get_filter_options: 'Loading filter options',
  create_subscription: 'Creating subscription',
  manage_subscription: 'Managing subscription',
  list_subscriptions: 'Loading subscriptions',
  delivery_report: 'Generating delivery report',
  browse_templates: 'Browsing templates',
  upload_template: 'Uploading template',
  generate_postcard_pdf: 'Generating postcards',
  configure_delivery: 'Configuring delivery',
  get_fulfillment_status: 'Checking fulfillment status',
  search_intent_data: 'Searching intent signals',
  list_intent_categories: 'Loading intent categories',
  create_email_campaign: 'Creating email campaign',
  send_email_campaign: 'Sending email campaign',
  get_email_analytics: 'Loading email analytics',
  run_local_audit: 'Running local business audit',
  track_competitor: 'Analyzing competitor',
  purchase_list: 'Processing list purchase',
  export_data: 'Exporting data',
  get_billing_status: 'Checking billing status',
  create_checkout_session: 'Creating checkout session',
  sync_to_platform: 'Syncing to platform',
};

export function ToolInvocation({ toolName, args: _args }: { toolName: string; args?: Record<string, unknown> }) {
  const label = TOOL_LABELS[toolName] || toolName.replace(/_/g, ' ');

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 0.75rem',
        margin: '0.25rem 0',
        fontSize: '0.8125rem',
        color: 'var(--muted-foreground)',
        backgroundColor: 'var(--muted)',
        borderRadius: '0.5rem',
        border: '1px solid var(--border)',
      }}
    >
      <div className="typing-dot" style={{
        width: '0.375rem',
        height: '0.375rem',
        borderRadius: '50%',
        backgroundColor: 'var(--primary)',
      }} />
      <Wrench size={14} />
      <span>{label}...</span>
    </div>
  );
}

export function ToolResult({ toolName, result, args: _args }: ToolResultProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const label = TOOL_LABELS[toolName] || toolName.replace(/_/g, ' ');

  // Try to detect if result is JSON for better formatting
  let isJson = false;
  try {
    JSON.parse(result);
    isJson = true;
  } catch {
    // Not JSON, that's fine
  }

  return (
    <div
      style={{
        margin: '0.375rem 0',
        borderRadius: '0.5rem',
        border: '1px solid var(--border)',
        overflow: 'hidden',
        fontSize: '0.8125rem',
      }}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          width: '100%',
          border: 'none',
          background: 'var(--muted)',
          color: 'var(--muted-foreground)',
          cursor: 'pointer',
          textAlign: 'left',
          fontSize: '0.8125rem',
        }}
      >
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Wrench size={14} />
        <span>{label}</span>
        <span style={{ marginLeft: 'auto', opacity: 0.5 }}>
          {isExpanded ? 'collapse' : 'expand'}
        </span>
      </button>

      {isExpanded && (
        <div
          className="tool-result"
          style={{
            padding: '0.75rem',
            maxHeight: '20rem',
            overflow: 'auto',
            backgroundColor: 'var(--card)',
          }}
        >
          {isJson ? (
            <pre style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: '0.75rem',
              lineHeight: 1.5,
            }}>
              {JSON.stringify(JSON.parse(result), null, 2)}
            </pre>
          ) : (
            <pre style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: '0.75rem',
              lineHeight: 1.5,
            }}>
              {result}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
