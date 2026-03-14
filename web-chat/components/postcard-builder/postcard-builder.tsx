'use client';

import { useReducer, useCallback } from 'react';
import { PostcardState, INITIAL_STATE } from '../../lib/postcard-constants';
import { generateTemplatePayload } from '../../lib/postcard-html-generator';
import BuilderForm, { BuilderAction } from './builder-form';
import PostcardPreview from './postcard-preview';

function reducer(state: PostcardState, action: BuilderAction): PostcardState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value, savedTemplateId: null, saveError: null };
    case 'SET_FRONT_FIELD':
      return {
        ...state,
        front: { ...state.front, [action.field]: action.value },
        savedTemplateId: null,
        saveError: null,
      };
    case 'SET_BACK_FIELD':
      return {
        ...state,
        back: { ...state.back, [action.field]: action.value },
        savedTemplateId: null,
        saveError: null,
      };
    case 'SET_PRESET':
      return { ...state, preset: action.preset, savedTemplateId: null, saveError: null };
    case 'SET_SIDE':
      return { ...state, activeSide: action.side };
    case 'SET_SIZE':
      return { ...state, size: action.size, savedTemplateId: null, saveError: null };
    case 'SAVE_START':
      return { ...state, isSaving: true, saveError: null, savedTemplateId: null };
    case 'SAVE_SUCCESS':
      return { ...state, isSaving: false, savedTemplateId: action.templateId };
    case 'SAVE_ERROR':
      return { ...state, isSaving: false, saveError: action.error };
    default:
      return state;
  }
}

export default function PostcardBuilder() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const handleSave = useCallback(async () => {
    if (!state.name.trim()) {
      dispatch({ type: 'SAVE_ERROR', error: 'Template name is required' });
      return;
    }
    dispatch({ type: 'SAVE_START' });

    try {
      const payload = generateTemplatePayload(state);
      const res = await fetch('/api/save-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save template');
      }
      dispatch({ type: 'SAVE_SUCCESS', templateId: data.data.template.id });
    } catch (err) {
      dispatch({
        type: 'SAVE_ERROR',
        error: err instanceof Error ? err.message : 'Failed to save template',
      });
    }
  }, [state]);

  const handleToggleSide = useCallback((side: 'front' | 'back') => {
    dispatch({ type: 'SET_SIDE', side });
  }, []);

  return (
    <div style={{
      display: 'flex',
      height: 'calc(100vh - 60px)',
      background: 'var(--background, #fff)',
    }}>
      {/* Left Panel - Form */}
      <div style={{
        width: '380px',
        minWidth: '380px',
        borderRight: '1px solid var(--border, #e5e7eb)',
        overflowY: 'auto',
      }}>
        <BuilderForm state={state} dispatch={dispatch} onSave={handleSave} />
      </div>

      {/* Right Panel - Preview */}
      <div style={{
        flex: 1,
        padding: '20px',
        overflowY: 'auto',
      }}>
        <PostcardPreview state={state} onToggleSide={handleToggleSide} />
      </div>
    </div>
  );
}
