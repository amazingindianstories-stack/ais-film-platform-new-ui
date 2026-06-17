'use client';

import { useRef } from 'react';
import { stop } from '@/components/canvas/entityConfig';
import { UploadIcon, CloseIcon } from '@/components/shot/icons';

// A single image slot: shows the uploaded image with a remove control, or an
// empty browse target. Pointer events are stopped so interacting with it never
// starts a scene-board drag on the canvas.
export default function UploadSlot({ image, onSelect, onClear, label, hint, className = '', children }) {
  const inputRef = useRef(null);

  const browse = (event) => {
    event.stopPropagation();
    inputRef.current?.click();
  };

  const onChange = (event) => {
    const file = event.target.files?.[0];
    if (file) onSelect?.(file);
    event.target.value = '';
  };

  return (
    <div className={`upload-slot${image ? ' has-image' : ''} ${className}`.trim()} onPointerDown={stop}>
      {image ? (
        <>
          <img className="upload-slot__img" src={image} alt={label || ''} />
          {onClear && (
            <button
              type="button"
              className="upload-slot__clear"
              onClick={(event) => { event.stopPropagation(); onClear(); }}
              aria-label="Remove image"
            >
              <CloseIcon />
            </button>
          )}
        </>
      ) : (
        <button type="button" className="upload-slot__empty" onClick={browse}>
          <UploadIcon />
          {label && <span className="upload-slot__label">{label}</span>}
          {hint && <span className="upload-slot__hint">{hint}</span>}
        </button>
      )}
      {children}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={onChange} />
    </div>
  );
}
