'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { PostcardState, POSTCARD_SIZES } from '../../lib/postcard-constants';
import { generatePreviewDocument } from '../../lib/postcard-html-generator';

interface PostcardPreviewProps {
  state: PostcardState;
  onToggleSide: (side: 'front' | 'back') => void;
}

export default function PostcardPreview({ state, onToggleSide }: PostcardPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [debouncedState, setDebouncedState] = useState(state);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedState(state), 150);
    return () => clearTimeout(timer);
  }, [state]);

  const srcdoc = useMemo(
    () => generatePreviewDocument(debouncedState, debouncedState.activeSide),
    [debouncedState]
  );

  const size = POSTCARD_SIZES[state.size];

  useEffect(() => {
    function updateScale() {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth - 40;
      const newScale = Math.min(containerWidth / size.widthPx, 1);
      setScale(newScale);
    }
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [size.widthPx]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '16px',
        borderBottom: '1px solid var(--border, #e5e7eb)',
        paddingBottom: '12px',
      }}>
        <button
          onClick={() => onToggleSide('front')}
          style={{
            padding: '6px 16px',
            borderRadius: '4px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: state.activeSide === 'front' ? 600 : 400,
            background: state.activeSide === 'front' ? 'var(--foreground, #171717)' : 'transparent',
            color: state.activeSide === 'front' ? 'var(--background, #fff)' : 'var(--foreground, #171717)',
          }}
        >
          Front
        </button>
        <button
          onClick={() => onToggleSide('back')}
          style={{
            padding: '6px 16px',
            borderRadius: '4px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: state.activeSide === 'back' ? 600 : 400,
            background: state.activeSide === 'back' ? 'var(--foreground, #171717)' : 'transparent',
            color: state.activeSide === 'back' ? 'var(--background, #fff)' : 'var(--foreground, #171717)',
          }}
        >
          Back
        </button>
        <span style={{
          marginLeft: 'auto',
          fontSize: '12px',
          color: '#9ca3af',
          alignSelf: 'center',
        }}>
          {size.label} &middot; {Math.round(scale * 100)}%
        </span>
      </div>

      <div
        ref={containerRef}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f3f4f6',
          borderRadius: '8px',
          overflow: 'hidden',
          padding: '20px',
        }}
      >
        <div style={{
          width: size.widthPx * scale,
          height: size.heightPx * scale,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          borderRadius: '4px',
          overflow: 'hidden',
        }}>
          <iframe
            srcDoc={srcdoc}
            title="Postcard Preview"
            sandbox="allow-same-origin"
            style={{
              width: size.widthPx,
              height: size.heightPx,
              border: 'none',
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              display: 'block',
            }}
          />
        </div>
      </div>
    </div>
  );
}
