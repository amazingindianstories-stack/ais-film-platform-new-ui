'use client';

import StudioSceneCard from '@/components/studio/StudioSceneCard';

// One studio scene card: a draggable canvas node that owns its shot stack and
// per-shot timing strip.
export default function SceneArea({
  area,
  frameArea = area,
  projectId,
  onShotDurationsChange,
  onPointerDown,
  onShotSelect,
  selectedShotId,
}) {
  const hasSelectedShot = area.shots.some((shot) => shot?.id === selectedShotId);
  const activeShot = area.shots.find((shot) => shot?.id === selectedShotId) || area.shots[0] || null;
  const selectShot = (shotId, event) => {
    event?.stopPropagation?.();
    onShotSelect?.(shotId);
  };

  return (
    <article
      className={`scene-area studio-scene-unit${hasSelectedShot ? ' has-selected-shot' : ''}`}
      data-scene-area
      onPointerDown={(event) => onPointerDown(event, area)}
      style={{ '--area-x': frameArea.x, '--area-y': frameArea.y, '--area-w': frameArea.w, '--area-h': frameArea.h }}
    >
      <StudioSceneCard
        area={area}
        activeShot={activeShot}
        projectId={projectId}
        onSelectShot={selectShot}
        onShotDurationsChange={onShotDurationsChange}
      />
    </article>
  );
}
