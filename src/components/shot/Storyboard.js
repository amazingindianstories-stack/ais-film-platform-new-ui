'use client';

import { stop } from '@/components/canvas/entityConfig';
import UploadSlot from '@/components/shot/UploadSlot';
import { PlusIcon, GenerateIcon } from '@/components/shot/icons';

// The shot's storyboard: a strip of frames, each uploadable or generatable.
export default function Storyboard({ frames = [], onUpload, onClear, onGenerate, onAdd }) {
  const empty = frames.every((frame) => !frame);

  return (
    <section className="storyboard" onPointerDown={stop}>
      <header className="storyboard__head">
        <span>Storyboard</span>
        <span className="storyboard__count">{frames.filter(Boolean).length}/{frames.length}</span>
      </header>
      <div className={`storyboard__strip${empty ? ' is-empty' : ''}`}>
        {empty && <span className="storyboard__watermark" aria-hidden="true">Storyboard</span>}
        {frames.map((frame, index) => (
          <div className="storyboard__frame" key={index}>
            <UploadSlot
              image={frame}
              onSelect={(file) => onUpload(index, file)}
              onClear={frame ? () => onClear(index) : undefined}
              hint="Frame"
            />
            {!frame && (
              <button
                type="button"
                className="storyboard__gen"
                onClick={(event) => { event.stopPropagation(); onGenerate(index); }}
                aria-label="Generate frame"
              >
                <GenerateIcon />
              </button>
            )}
          </div>
        ))}
        <button type="button" className="storyboard__add" onClick={(event) => { event.stopPropagation(); onAdd(); }}>
          <PlusIcon />
          <span>Add</span>
        </button>
      </div>
    </section>
  );
}
