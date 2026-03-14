'use client';

import { MERGE_FIELDS } from '../../lib/postcard-constants';

interface MergeFieldToolbarProps {
  onInsert: (field: string) => void;
}

export default function MergeFieldToolbar({ onInsert }: MergeFieldToolbarProps) {
  return (
    <div>
      <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '6px' }}>
        Insert Merge Field
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {MERGE_FIELDS.map((field) => (
          <button
            key={field.name}
            onClick={() => onInsert(field.name)}
            type="button"
            style={{
              padding: '3px 10px',
              fontSize: '11px',
              borderRadius: '12px',
              border: '1px solid var(--border, #e5e7eb)',
              background: 'var(--background, #fff)',
              color: 'var(--foreground, #171717)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {'{{' + field.label + '}}'}
          </button>
        ))}
      </div>
    </div>
  );
}
