'use client';

import { Database, MessageSquare } from 'lucide-react';

export function Header() {
  return (
    <header
      style={{
        borderBottom: '1px solid var(--border)',
        padding: '0.75rem 1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        backgroundColor: 'var(--card)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '2.25rem',
          height: '2.25rem',
          borderRadius: '0.5rem',
          background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
          color: 'white',
          flexShrink: 0,
        }}
      >
        <Database size={18} />
      </div>
      <div style={{ flex: 1 }}>
        <h1 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
          LeadsPlease
        </h1>
        <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.2 }}>
          Data Assistant
        </p>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          fontSize: '0.75rem',
          color: 'var(--muted-foreground)',
        }}
      >
        <MessageSquare size={14} />
        <span>Powered by Claude</span>
      </div>
    </header>
  );
}
