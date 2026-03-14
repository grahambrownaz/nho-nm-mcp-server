'use client';

import { FONT_OPTIONS } from '../../lib/postcard-constants';

interface FontSelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export default function FontSelector({ label, value, onChange }: FontSelectorProps) {
  return (
    <div>
      <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '6px 8px',
          fontSize: '13px',
          border: '1px solid var(--border, #e5e7eb)',
          borderRadius: '4px',
          background: 'var(--background, #fff)',
          color: 'var(--foreground, #171717)',
          cursor: 'pointer',
        }}
      >
        {FONT_OPTIONS.map((font) => (
          <option key={font.value} value={font.value}>
            {font.label} ({font.category})
          </option>
        ))}
      </select>
    </div>
  );
}
