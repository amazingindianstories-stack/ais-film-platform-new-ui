'use client';

import { useState } from 'react';
import { stop } from '@/components/canvas/entityConfig';
import { GenerateIcon } from '@/components/shot/icons';

// Vertical swatch stack for the generated colour palette. The focused swatch
// reveals its hex. "Generate" is owned by the card (derives from the reference
// image when present).
export default function ColourPalette({ colors = [], onGenerate, busy = false }) {
  const list = colors.length ? colors : ['#2A2533'];
  const [active, setActive] = useState(0);
  const current = Math.min(active, list.length - 1);

  return (
    <div className="palette" onPointerDown={stop}>
      <div className="palette__bars">
        {list.map((color, index) => (
          <button
            key={`${color}-${index}`}
            type="button"
            className={`palette__bar${index === current ? ' is-active' : ''}`}
            style={{ background: color }}
            onClick={() => setActive(index)}
            aria-label={color}
          >
            {index === current && <span className="palette__hex">{color.toUpperCase()}</span>}
          </button>
        ))}
      </div>
      <button type="button" className="palette__gen" onClick={onGenerate} disabled={busy}>
        <GenerateIcon />
        <span>{busy ? 'Generating…' : 'Generate'}</span>
      </button>
    </div>
  );
}
