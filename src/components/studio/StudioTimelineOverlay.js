'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import StudioSceneTimeline from '@/components/studio/StudioSceneTimeline';

export default function StudioTimelineOverlay({
  activeShotId = '',
  onClose,
  onDurationsChange,
  onSelect,
  open,
  sceneTitle = 'Scene',
  shots = [],
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <aside className="studio-timeline-overlay" data-canvas-ui role="dialog" aria-modal="true" aria-label="Full scene timeline">
      <button className="studio-timeline-overlay__scrim" aria-label="Close timeline" onClick={onClose} type="button" />
      <section className="studio-timeline-overlay__panel" onPointerDown={(event) => event.stopPropagation()}>
        <header className="studio-timeline-overlay__head">
          <span>{sceneTitle}</span>
          <span>{shots.length} shots</span>
        </header>

        <div className="studio-timeline-overlay__body">
          <StudioSceneTimeline
            activeShotId={activeShotId}
            expanded
            onDurationsChange={onDurationsChange}
            onSelect={onSelect}
            shots={shots}
          />
        </div>

        <footer className="studio-timeline-overlay__foot">
          <span>Drag the handles to rebalance shot duration.</span>
          <button type="button" onClick={onClose}>Done</button>
        </footer>
      </section>
    </aside>,
    document.body,
  );
}
