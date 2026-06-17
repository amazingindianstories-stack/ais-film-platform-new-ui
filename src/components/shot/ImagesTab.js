'use client';

import { useState } from 'react';
import { stop } from '@/components/canvas/entityConfig';
import ImageDeck from '@/components/shot/ImageDeck';
import { PlusIcon, GenerateIcon } from '@/components/shot/icons';

// Images tab: generate a pool of candidate frames, scroll the deck, select the
// good ones, and grow more. Selected images flow into the Videos tab.
export default function ImagesTab({ data }) {
  const images = data.media.images;
  const [active, setActive] = useState(0);
  const safeActive = Math.min(active, Math.max(images.length - 1, 0));

  const grow = () => {
    const at = images.length;
    data.generateImages(3);
    setActive(at);
  };

  if (!images.length) {
    return (
      <div className="images-tab" onPointerDown={stop}>
        <div className="deck-empty">
          <span>No images yet</span>
          <button type="button" className="deck-gen" onClick={grow}>
            <GenerateIcon />
            <span>Generate images</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="images-tab">
      <ImageDeck
        items={images}
        activeIndex={safeActive}
        onActiveChange={setActive}
        isSelected={(item) => item.selected}
        onToggleSelect={(item) => data.toggleImageSelect(item.id)}
        onRemove={(item) => data.removeImage(item.id)}
      />
      <div className="deck-add-row" onPointerDown={stop}>
        <button type="button" className="deck-add" onClick={grow} aria-label="Generate more images">
          <PlusIcon />
        </button>
      </div>
    </div>
  );
}
