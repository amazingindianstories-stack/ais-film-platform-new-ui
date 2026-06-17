'use client';

import { useRef, useState } from 'react';
import { stop } from '@/components/canvas/entityConfig';
import { SHOT_TABS, DEFAULT_SHOT_TAB, shotTab } from '@/components/shotCardTabs';
import { actionIcon } from '@/components/shot/icons';
import { useShotCardData } from '@/hooks/useShotCardData';
import StoryTab from '@/components/shot/StoryTab';
import TechnicalsTab from '@/components/shot/TechnicalsTab';
import ImagesTab from '@/components/shot/ImagesTab';
import VideosTab from '@/components/shot/VideosTab';

// A single shot — its own card, grouped inside a scene board by default but
// first-class enough to live anywhere on the canvas later. Four tabs along the
// bottom (Story, Technicals, Images, Videos) flip the body between the shot's
// faces; the active tab grows into an action bar carrying contextual controls.
export default function ShotCard({ shot, index, selected = false, onSelect, projectId }) {
  const [activeTab, setActiveTab] = useState(DEFAULT_SHOT_TAB);
  const data = useShotCardData({ projectId, shotId: shot?.id });
  const scriptRef = useRef(null);
  const uploadRef = useRef(null);

  if (!shot) {
    return (
      <article className="shot-card is-empty" data-shot-card aria-hidden="true">
        <div className="shot-card__empty">No shots yet</div>
      </article>
    );
  }

  const title = shot.n || `Shot ${index + 1}`;
  const shotNumber = String(index + 1).padStart(2, '0');
  const duration = Number(shot.duration) || 0;
  const tab = shotTab(activeTab);
  const cardId = `shot-card-${shot.id || index}`;

  const select = (event) => {
    event.stopPropagation();
    onSelect?.(shot.id, event);
  };

  const switchTab = (event, id) => {
    event.stopPropagation();
    setActiveTab(id);
    onSelect?.(shot.id, event);
  };

  // Contextual bottom-bar actions for the active tab.
  const runAction = (event, actionId) => {
    event.stopPropagation();
    if (activeTab === 'story') {
      if (actionId === 'generate') data.generatePalette();
      if (actionId === 'upload') uploadRef.current?.click();
    } else if (activeTab === 'technicals') {
      if (actionId === 'script') scriptRef.current?.focus();
    } else if (activeTab === 'images') {
      if (actionId === 'generate') data.generateImages(3);
    }
  };

  const onUploadFile = (event) => {
    const file = event.target.files?.[0];
    if (file) data.appendFrame(file);
    event.target.value = '';
  };

  return (
    <article
      aria-label={`${title} shot`}
      className={`shot-card${selected ? ' is-selected' : ''}`}
      data-shot-card
      onPointerDown={select}
      role="group"
      title={shot.p || title}
    >
      <header className="shot-card__head">
        <span className="shot-card__no">Shot {shotNumber}</span>
        <span className="shot-card__title">{title}</span>
        {duration > 0 && <span className="shot-card__dur">{duration}s</span>}
      </header>

      <div
        className="shot-card__body"
        id={`${cardId}-panel`}
        role="tabpanel"
        aria-labelledby={`${cardId}-tab-${tab.id}`}
      >
        {activeTab === 'story' && <StoryTab data={data} />}
        {activeTab === 'technicals' && <TechnicalsTab data={data} scriptRef={scriptRef} />}
        {activeTab === 'images' && <ImagesTab data={data} />}
        {activeTab === 'videos' && <VideosTab data={data} />}
      </div>

      <nav className="shot-card__tabs" role="tablist" aria-label="Shot detail tabs" onPointerDown={stop}>
        {SHOT_TABS.map((item) => {
          if (item.id === activeTab) {
            return (
              <div
                key={item.id}
                id={`${cardId}-tab-${item.id}`}
                role="tab"
                aria-selected="true"
                aria-controls={`${cardId}-panel`}
                className="shot-card__tab is-active"
              >
                <span className="shot-card__tab-lead">
                  {(item.leadActions || []).map((action) => {
                    const Icon = actionIcon(action.icon);
                    return (
                      <button key={action.id} type="button" className="shot-card__act" title={action.title} aria-label={action.title} onClick={(event) => runAction(event, action.id)}>
                        <Icon />
                      </button>
                    );
                  })}
                </span>
                <span className="shot-card__tab-name">{item.label}</span>
                <span className="shot-card__tab-actions">
                  {(item.actions || []).map((action) => {
                    const Icon = actionIcon(action.icon);
                    return (
                      <button key={action.id} type="button" className="shot-card__act" title={action.title} aria-label={action.title} onClick={(event) => runAction(event, action.id)}>
                        <Icon />
                      </button>
                    );
                  })}
                </span>
              </div>
            );
          }
          return (
            <button
              key={item.id}
              id={`${cardId}-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected="false"
              aria-controls={`${cardId}-panel`}
              tabIndex={-1}
              className="shot-card__tab"
              onClick={(event) => switchTab(event, item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      <input ref={uploadRef} type="file" accept="image/*" hidden onChange={onUploadFile} />
    </article>
  );
}
