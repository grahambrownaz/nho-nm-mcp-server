'use client';

import { POSTCARD_SIZES, PostcardSize } from '../../lib/postcard-constants';

interface SizeSelectorProps {
  value: PostcardSize;
  onChange: (value: PostcardSize) => void;
}

export default function SizeSelector({ value, onChange }: SizeSelectorProps) {
  return (
    <div>
      <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '6px' }}>
        Postcard Size
      </label>
      <div style={{ display: 'flex', gap: '8px' }}>
        {(Object.keys(POSTCARD_SIZES) as PostcardSize[]).map((sizeKey) => {
          const isActive = value === sizeKey;
          return (
            <button
              key={sizeKey}
              onClick={() => onChange(sizeKey)}
              style={{
                flex: 1,
                padding: '8px 4px',
                borderRadius: '6px',
                border: isActive ? '2px solid var(--foreground, #171717)' : '1px solid var(--border, #e5e7eb)',
                background: isActive ? 'var(--foreground, #171717)' : 'var(--background, #fff)',
                color: isActive ? 'var(--background, #fff)' : 'var(--foreground, #171717)',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {POSTCARD_SIZES[sizeKey].label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
