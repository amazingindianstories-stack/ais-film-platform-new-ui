'use client';

import { stop } from '@/components/canvas/entityConfig';
import { CloseIcon } from '@/components/shot/icons';

// A stacked carousel of media cards: the active card sits centred and large,
// neighbours peek behind it. Click a neighbour to bring it forward; click the
// active card to toggle its selection. Used for the Images pool and for each
// selected image's Video options.
export default function ImageDeck({
  items = [],
  activeIndex = 0,
  onActiveChange,
  isSelected,
  onToggleSelect,
  onRemove,
  media = 'image',
  small = false,
}) {
  const count = items.length;

  return (
    <div className={`deck${small ? ' deck--sm' : ''}`} onPointerDown={stop}>
      <div className="deck__stage">
        {items.map((item, index) => {
          const offset = index - activeIndex;
          const abs = Math.abs(offset);
          if (abs > 2) return null;
          const active = offset === 0;
          const selected = isSelected?.(item);
          return (
            <div
              key={item.id}
              className={`deck__card${active ? ' is-active' : ''}${selected ? ' is-selected' : ''}`}
              style={{
                transform: `translateX(${offset * 42}%) scale(${1 - abs * 0.13})`,
                zIndex: 10 - abs,
                opacity: abs > 1 ? 0.4 : 1,
              }}
              onClick={() => (active ? onToggleSelect?.(item) : onActiveChange?.(index))}
            >
              <img src={item.src} alt="" draggable={false} />
              {media === 'video' && <span className="deck__play" aria-hidden="true">▶</span>}
              {selected && <span className="deck__badge">Selected</span>}
              {active && onRemove && (
                <button
                  type="button"
                  className="deck__remove"
                  onClick={(event) => { event.stopPropagation(); onRemove(item); }}
                  aria-label="Remove"
                >
                  <CloseIcon />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {count > 1 && (
        <div className="deck__nav">
          <button type="button" onClick={() => onActiveChange?.(Math.max(0, activeIndex - 1))} disabled={activeIndex <= 0} aria-label="Previous">‹</button>
          <span className="deck__count">{activeIndex + 1} / {count}</span>
          <button type="button" onClick={() => onActiveChange?.(Math.min(count - 1, activeIndex + 1))} disabled={activeIndex >= count - 1} aria-label="Next">›</button>
        </div>
      )}
    </div>
  );
}
