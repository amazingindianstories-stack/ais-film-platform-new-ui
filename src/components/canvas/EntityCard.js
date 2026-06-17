'use client';

import { stop } from './entityConfig';

/* Output card shared by Characters and Locations. A card linked to a filled
   template runs "Generate" (costs credits) to purify it into the knowledge base. */
export default function EntityCard({
  card, config, onPointerDown, onDelete, onFocus, onWireDrag, onGenerate,
  linkedName, canGenerate, cost = 0, selected, showToolbar = selected, showPort, pushY = 0, viewportScale = 1,
}) {
  const isGenerating = card.status === 'generating';
  const isGenerated = card.status === 'generated';
  const fire = (event) => { event.stopPropagation(); onGenerate?.(); };

  return (
    <article
      className={`entity-template entity-template--card${selected ? ' entity-template--selected' : ''}`}
      data-character-card
      onPointerDown={(event) => onPointerDown(event, card)}
      style={{ '--template-x': card.x, '--template-y': card.y, marginTop: `${pushY}rem` }}
    >
      {showToolbar && (
        <div className="entity-template__toolbar" onPointerDown={stop}
          style={{ transform: `scale(${1 / Math.max(viewportScale, 0.01)})`, transformOrigin: 'bottom right' }}>
          <button type="button" className="entity-template__tool" title="Fit to window" aria-label="Fit to window" onClick={onFocus}>⤢</button>
          <button type="button" className="entity-template__tool entity-template__tool--danger" title="Delete card" aria-label="Delete card" onClick={onDelete}>×</button>
        </div>
      )}

      {showPort && (
        <button className="entity-port entity-port--input" title="Drag to a template to connect"
          onPointerDown={(e) => onWireDrag(e, card.id, false)}
          style={{ transform: `scale(${1 / Math.max(viewportScale, 0.01)})` }}>
          +
        </button>
      )}

      <div className="entity-template__panel entity-card__panel">
        <h2>{card.name}</h2>
        <div className="entity-card__body">
          {isGenerating && (
            <span className="entity-card__status">
              <span className="entity-card__spinner" aria-hidden="true" />
              {config.generatingVerb}
            </span>
          )}
          {isGenerated && !isGenerating && (
            <div className="entity-card__done">
              <span className="entity-card__check" aria-hidden="true">✓</span>
              <span className="entity-card__done-name">{card.entityName || linkedName || config.doneFallback}</span>
              <span className="entity-card__done-sub">{config.doneSub}</span>
              <button type="button" className="entity-card__regen" disabled={!canGenerate} onPointerDown={stop} onClick={fire}>
                Regenerate · {cost} cr
              </button>
            </div>
          )}
          {!isGenerating && !isGenerated && (
            <>
              <button type="button" className="entity-card__generate" disabled={!canGenerate} onPointerDown={stop} onClick={fire}>
                {config.generateVerb}
                <span className="entity-card__cost">{cost} cr</span>
              </button>
              <span className="entity-card__hint">
                {card.error
                  ? card.error
                  : linkedName
                    ? `Source: ${linkedName}`
                    : 'Link a template to its input ◦'}
              </span>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
