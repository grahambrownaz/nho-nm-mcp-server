'use client';

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export default function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '32px',
          height: '32px',
          border: '1px solid var(--border, #e5e7eb)',
          borderRadius: '4px',
          cursor: 'pointer',
          padding: '2px',
        }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>{label}</div>
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v);
          }}
          style={{
            width: '80px',
            fontSize: '12px',
            padding: '2px 6px',
            border: '1px solid var(--border, #e5e7eb)',
            borderRadius: '3px',
            fontFamily: 'monospace',
            background: 'var(--background, #fff)',
            color: 'var(--foreground, #171717)',
          }}
        />
      </div>
    </div>
  );
}
