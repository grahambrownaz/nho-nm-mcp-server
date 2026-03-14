'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Database, MessageSquare } from 'lucide-react';

function NavLink({ href, children, isActive }: { href: string; children: React.ReactNode; isActive: boolean }) {
  return (
    <Link
      href={href}
      style={{
        padding: '4px 12px',
        borderRadius: '4px',
        fontSize: '13px',
        fontWeight: isActive ? 600 : 400,
        textDecoration: 'none',
        background: isActive ? 'var(--foreground, #171717)' : 'transparent',
        color: isActive ? 'var(--background, #fff)' : 'var(--muted-foreground, #6b7280)',
      }}
    >
      {children}
    </Link>
  );
}

export function Header() {
  const pathname = usePathname();

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
      <div>
        <h1 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
          LeadsPlease
        </h1>
        <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.2 }}>
          Data Assistant
        </p>
      </div>

      <nav style={{ display: 'flex', gap: '4px', marginLeft: '24px' }}>
        <NavLink href="/" isActive={pathname === '/'}>
          Chat
        </NavLink>
        <NavLink href="/builder" isActive={pathname === '/builder'}>
          Builder
        </NavLink>
      </nav>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          fontSize: '0.75rem',
          color: 'var(--muted-foreground)',
          marginLeft: 'auto',
        }}
      >
        <MessageSquare size={14} />
        <span>Powered by Claude</span>
      </div>
    </header>
  );
}
