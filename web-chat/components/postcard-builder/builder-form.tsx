'use client';

import { useRef, useCallback } from 'react';
import { PostcardState, PostcardSize } from '../../lib/postcard-constants';
import PresetSelector from './preset-selector';
import SizeSelector from './size-selector';
import ColorPicker from './color-picker';
import FontSelector from './font-selector';
import MergeFieldToolbar from './merge-field-toolbar';
import ImageUpload from './image-upload';
import SaveTemplateDialog from './save-template-dialog';

export type BuilderAction =
  | { type: 'SET_FIELD'; field: string; value: unknown }
  | { type: 'SET_FRONT_FIELD'; field: string; value: string | null }
  | { type: 'SET_BACK_FIELD'; field: string; value: string | boolean }
  | { type: 'SET_PRESET'; preset: string }
  | { type: 'SET_SIDE'; side: 'front' | 'back' }
  | { type: 'SET_SIZE'; size: PostcardSize }
  | { type: 'SAVE_START' }
  | { type: 'SAVE_SUCCESS'; templateId: string }
  | { type: 'SAVE_ERROR'; error: string };

interface BuilderFormProps {
  state: PostcardState;
  dispatch: React.Dispatch<BuilderAction>;
  onSave: () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '12px',
      fontWeight: 700,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
      color: '#9ca3af',
      marginTop: '20px',
      marginBottom: '8px',
      paddingBottom: '6px',
      borderBottom: '1px solid var(--border, #e5e7eb)',
    }}>
      {children}
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <div>
      <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>
        {label}
      </label>
      <Tag
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={multiline ? 3 : undefined}
        style={{
          width: '100%',
          padding: '6px 10px',
          fontSize: '13px',
          border: '1px solid var(--border, #e5e7eb)',
          borderRadius: '4px',
          background: 'var(--background, #fff)',
          color: 'var(--foreground, #171717)',
          resize: multiline ? 'vertical' : undefined,
          fontFamily: 'inherit',
        }}
      />
    </div>
  );
}

export default function BuilderForm({ state, dispatch, onSave }: BuilderFormProps) {
  const lastFocusedRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const lastFocusedFieldRef = useRef<{ side: 'front' | 'back'; field: string } | null>(null);

  const handleMergeFieldInsert = useCallback((fieldName: string) => {
    const el = lastFocusedRef.current;
    const fieldInfo = lastFocusedFieldRef.current;
    if (!el || !fieldInfo) return;

    const tag = `{{${fieldName}}}`;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const newValue = el.value.slice(0, start) + tag + el.value.slice(end);

    if (fieldInfo.side === 'front') {
      dispatch({ type: 'SET_FRONT_FIELD', field: fieldInfo.field, value: newValue });
    } else {
      dispatch({ type: 'SET_BACK_FIELD', field: fieldInfo.field, value: newValue });
    }

    requestAnimationFrame(() => {
      el.focus();
      const newPos = start + tag.length;
      el.setSelectionRange(newPos, newPos);
    });
  }, [dispatch]);

  const trackFocus = (side: 'front' | 'back', field: string) => ({
    onFocus: (e: React.FocusEvent<HTMLDivElement>) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        lastFocusedRef.current = target;
        lastFocusedFieldRef.current = { side, field };
      }
    },
  });

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      padding: '20px',
      overflowY: 'auto',
      height: '100%',
    }}>
      <SectionLabel>Layout &amp; Size</SectionLabel>
      <PresetSelector value={state.preset} onChange={(p) => dispatch({ type: 'SET_PRESET', preset: p })} />
      <SizeSelector value={state.size} onChange={(s) => dispatch({ type: 'SET_SIZE', size: s })} />

      <SectionLabel>Colors</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <ColorPicker label="Background" value={state.backgroundColor} onChange={(v) => dispatch({ type: 'SET_FIELD', field: 'backgroundColor', value: v })} />
        <ColorPicker label="Text" value={state.textColor} onChange={(v) => dispatch({ type: 'SET_FIELD', field: 'textColor', value: v })} />
        <ColorPicker label="Accent" value={state.accentColor} onChange={(v) => dispatch({ type: 'SET_FIELD', field: 'accentColor', value: v })} />
        <ColorPicker label="CTA Background" value={state.ctaBackgroundColor} onChange={(v) => dispatch({ type: 'SET_FIELD', field: 'ctaBackgroundColor', value: v })} />
      </div>

      <SectionLabel>Typography</SectionLabel>
      <FontSelector label="Headline Font" value={state.headlineFont} onChange={(v) => dispatch({ type: 'SET_FIELD', field: 'headlineFont', value: v })} />
      <FontSelector label="Body Font" value={state.bodyFont} onChange={(v) => dispatch({ type: 'SET_FIELD', field: 'bodyFont', value: v })} />

      <SectionLabel>Merge Fields</SectionLabel>
      <MergeFieldToolbar onInsert={handleMergeFieldInsert} />

      {state.activeSide === 'front' ? (
        <>
          <SectionLabel>Front Content</SectionLabel>
          <ImageUpload
            label="Logo"
            value={state.front.logoDataUrl}
            onChange={(v) => dispatch({ type: 'SET_FRONT_FIELD', field: 'logoDataUrl', value: v })}
            maxWidth={400}
            maxHeight={200}
          />
          <ImageUpload
            label="Hero Image"
            value={state.front.imageDataUrl}
            onChange={(v) => dispatch({ type: 'SET_FRONT_FIELD', field: 'imageDataUrl', value: v })}
          />
          <div {...trackFocus('front', 'headline')}>
            <TextInput label="Headline" value={state.front.headline} onChange={(v) => dispatch({ type: 'SET_FRONT_FIELD', field: 'headline', value: v })} />
          </div>
          <div {...trackFocus('front', 'subheadline')}>
            <TextInput label="Subheadline" value={state.front.subheadline} onChange={(v) => dispatch({ type: 'SET_FRONT_FIELD', field: 'subheadline', value: v })} />
          </div>
          <div {...trackFocus('front', 'bodyText')}>
            <TextInput label="Body Text" value={state.front.bodyText} onChange={(v) => dispatch({ type: 'SET_FRONT_FIELD', field: 'bodyText', value: v })} multiline />
          </div>
          <div {...trackFocus('front', 'ctaText')}>
            <TextInput label="Call to Action" value={state.front.ctaText} onChange={(v) => dispatch({ type: 'SET_FRONT_FIELD', field: 'ctaText', value: v })} />
          </div>
        </>
      ) : (
        <>
          <SectionLabel>Back Content</SectionLabel>
          <div {...trackFocus('back', 'companyName')}>
            <TextInput label="Company Name" value={state.back.companyName} onChange={(v) => dispatch({ type: 'SET_BACK_FIELD', field: 'companyName', value: v })} />
          </div>
          <div {...trackFocus('back', 'companyPhone')}>
            <TextInput label="Phone" value={state.back.companyPhone} onChange={(v) => dispatch({ type: 'SET_BACK_FIELD', field: 'companyPhone', value: v })} />
          </div>
          <div {...trackFocus('back', 'companyAddress')}>
            <TextInput label="Address" value={state.back.companyAddress} onChange={(v) => dispatch({ type: 'SET_BACK_FIELD', field: 'companyAddress', value: v })} />
          </div>
          <div {...trackFocus('back', 'companyWebsite')}>
            <TextInput label="Website" value={state.back.companyWebsite} onChange={(v) => dispatch({ type: 'SET_BACK_FIELD', field: 'companyWebsite', value: v })} />
          </div>
          <div {...trackFocus('back', 'bodyText')}>
            <TextInput label="Additional Text" value={state.back.bodyText} onChange={(v) => dispatch({ type: 'SET_BACK_FIELD', field: 'bodyText', value: v })} multiline />
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
              checked={state.back.includeRecipientBlock}
              onChange={(e) => dispatch({ type: 'SET_BACK_FIELD', field: 'includeRecipientBlock', value: e.target.checked })}
            />
            Include recipient address block
          </label>
        </>
      )}

      <SaveTemplateDialog
        state={state}
        onFieldChange={(field, value) => dispatch({ type: 'SET_FIELD', field, value })}
        onSave={onSave}
      />
    </div>
  );
}
