'use client';

import { PRESETS } from '../../lib/postcard-presets';

interface PresetSelectorProps {
  value: string;
  onChange: (presetId: string) => void;
}

export default function PresetSelector({ value, onChange }: PresetSelectorProps) {
  return (
    <div>
      <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '6px' }}>
        Layout
      </label>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '6px',
      }}>
        {PRESETS.map((preset) => {
          const isActive = value === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => onChange(preset.id)}
              style={{
                padding: '10px 6px',
                borderRadius: '6px',
                border: isActive ? '2px solid var(--foreground, #171717)' : '1px solid var(--border, #e5e7eb)',
                background: isActive ? 'var(--foreground, #171717)' : 'var(--background, #fff)',
                color: isActive ? 'var(--background, #fff)' : 'var(--foreground, #171717)',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '2px' }}>
                {preset.name}
              </div>
              <div style={{
                fontSize: '10px',
                opacity: 0.7,
                lineHeight: 1.3,
              }}>
                {preset.description}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
