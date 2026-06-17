'use client';

import { useState } from 'react';
import { stop } from '@/components/canvas/entityConfig';
import ImageDeck from '@/components/shot/ImageDeck';
import { PlusIcon, GenerateIcon } from '@/components/shot/icons';

// One column per selected image: a deck of generated video options, one chosen.
function VideoColumn({ image, data }) {
  const entry = data.media.videos[image.id] || { options: [], selectedId: '' };
  const [active, setActive] = useState(0);
  const safeActive = Math.min(active, Math.max(entry.options.length - 1, 0));

  const grow = () => {
    const at = entry.options.length;
    data.generateVideos(image.id, 2);
    setActive(at);
  };

  return (
    <div className="video-col" onPointerDown={stop}>
      {entry.options.length ? (
        <ImageDeck
          small
          media="video"
          items={entry.options}
          activeIndex={safeActive}
          onActiveChange={setActive}
          isSelected={(item) => item.id === entry.selectedId}
          onToggleSelect={(item) => data.selectVideo(image.id, item.id)}
        />
      ) : (
        <div className="video-col__seed">
          <img src={image.src} alt="" draggable={false} />
          <button type="button" className="deck-gen" onClick={grow}>
            <GenerateIcon />
            <span>Generate</span>
          </button>
        </div>
      )}
      {entry.options.length > 0 && (
        <div className="deck-add-row">
          <button type="button" className="deck-add" onClick={grow} aria-label="Generate more video options">
            <PlusIcon />
          </button>
        </div>
      )}
    </div>
  );
}

// Videos tab: gives multiple video options for each image selected in the
// Images tab.
export default function VideosTab({ data }) {
  const selected = data.media.images.filter((image) => image.selected);

  if (!selected.length) {
    return (
      <div className="videos-tab" onPointerDown={stop}>
        <div className="deck-empty">
          <span>Select images in the Image tab to generate videos for them.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="videos-tab">
      <div className="videos-tab__cols">
        {selected.map((image) => (
          <VideoColumn key={image.id} image={image} data={data} />
        ))}
      </div>
    </div>
  );
}
