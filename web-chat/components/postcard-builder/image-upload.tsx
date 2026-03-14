'use client';

import { useRef } from 'react';
import { Upload, X } from 'lucide-react';

interface ImageUploadProps {
  label: string;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  maxWidth?: number;
  maxHeight?: number;
}

function resizeImage(file: File, maxW: number, maxH: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxW || h > maxH) {
          const ratio = Math.min(maxW / w, maxH / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export default function ImageUpload({
  label,
  value,
  onChange,
  maxWidth = 800,
  maxHeight = 800,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be under 2MB');
      return;
    }
    try {
      const dataUrl = await resizeImage(file, maxWidth, maxHeight);
      onChange(dataUrl);
    } catch {
      alert('Failed to process image');
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div>
      <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '6px' }}>
        {label}
      </label>
      {value ? (
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img
            src={value}
            alt={label}
            style={{
              maxHeight: '60px',
              maxWidth: '160px',
              borderRadius: '4px',
              border: '1px solid var(--border, #e5e7eb)',
            }}
          />
          <button
            onClick={() => onChange(null)}
            style={{
              position: 'absolute',
              top: '-6px',
              right: '-6px',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: '#ef4444',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            fontSize: '12px',
            border: '1px dashed var(--border, #e5e7eb)',
            borderRadius: '6px',
            background: 'var(--background, #fff)',
            color: '#6b7280',
            cursor: 'pointer',
          }}
        >
          <Upload size={14} />
          Upload Image
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFile}
        style={{ display: 'none' }}
      />
    </div>
  );
}
