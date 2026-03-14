'use client';

import { Save, Check, Loader2 } from 'lucide-react';
import { CATEGORY_OPTIONS, PostcardState, CategoryValue } from '../../lib/postcard-constants';

interface SaveTemplateDialogProps {
  state: PostcardState;
  onFieldChange: (field: string, value: string | boolean) => void;
  onSave: () => void;
}

export default function SaveTemplateDialog({ state, onFieldChange, onSave }: SaveTemplateDialogProps) {
  const canSave = state.name.trim().length > 0 && !state.isSaving;

  return (
    <div style={{
      borderTop: '1px solid var(--border, #e5e7eb)',
      paddingTop: '16px',
      marginTop: '16px',
    }}>
      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', color: 'var(--foreground, #171717)' }}>
        Save Template
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div>
          <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>
            Template Name *
          </label>
          <input
            type="text"
            value={state.name}
            onChange={(e) => onFieldChange('name', e.target.value)}
            placeholder="e.g., Spring Roofing Promo"
            style={{
              width: '100%',
              padding: '6px 10px',
              fontSize: '13px',
              border: '1px solid var(--border, #e5e7eb)',
              borderRadius: '4px',
              background: 'var(--background, #fff)',
              color: 'var(--foreground, #171717)',
            }}
          />
        </div>

        <div>
          <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>
            Description
          </label>
          <input
            type="text"
            value={state.description}
            onChange={(e) => onFieldChange('description', e.target.value)}
            placeholder="Optional description"
            style={{
              width: '100%',
              padding: '6px 10px',
              fontSize: '13px',
              border: '1px solid var(--border, #e5e7eb)',
              borderRadius: '4px',
              background: 'var(--background, #fff)',
              color: 'var(--foreground, #171717)',
            }}
          />
        </div>

        <div>
          <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>
            Category
          </label>
          <select
            value={state.category}
            onChange={(e) => onFieldChange('category', e.target.value as CategoryValue)}
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
            {CATEGORY_OPTIONS.map((cat) => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
        </div>

        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          color: 'var(--foreground, #171717)',
          cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={state.isPublic}
            onChange={(e) => onFieldChange('isPublic', e.target.checked)}
          />
          Make template public
        </label>

        {state.saveError && (
          <div style={{
            padding: '8px 12px',
            borderRadius: '4px',
            background: '#fef2f2',
            color: '#dc2626',
            fontSize: '12px',
          }}>
            {state.saveError}
          </div>
        )}

        {state.savedTemplateId && (
          <div style={{
            padding: '8px 12px',
            borderRadius: '4px',
            background: '#f0fdf4',
            color: '#16a34a',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <Check size={14} />
            Template saved successfully!
          </div>
        )}

        <button
          onClick={onSave}
          disabled={!canSave}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '10px 20px',
            borderRadius: '6px',
            border: 'none',
            background: canSave ? 'var(--foreground, #171717)' : '#d1d5db',
            color: canSave ? 'var(--background, #fff)' : '#9ca3af',
            fontSize: '14px',
            fontWeight: 600,
            cursor: canSave ? 'pointer' : 'not-allowed',
            width: '100%',
          }}
        >
          {state.isSaving ? (
            <>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              Saving...
            </>
          ) : (
            <>
              <Save size={16} />
              Save Template
            </>
          )}
        </button>
      </div>
    </div>
  );
}
