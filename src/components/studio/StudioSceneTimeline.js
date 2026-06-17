'use client';

import { useRef } from 'react';

const MIN_SHOT_DURATION = 0.2;
const DEFAULT_PREVIEW_LIMIT = 7;
const round1 = (value) => Math.round(value * 10) / 10;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function stop(event) {
  event.stopPropagation();
}

function shotLabel(shot, index) {
  return `Shot ${index + 1}`;
}

export default function StudioSceneTimeline({
  activeShotId = '',
  expanded = false,
  onDurationsChange,
  onOverflowClick,
  onSelect,
  previewLimit = DEFAULT_PREVIEW_LIMIT,
  shots = [],
}) {
  const trackRef = useRef(null);
  const dragRef = useRef(null);
  const allShots = Array.isArray(shots) && shots.length ? shots : [null];
  const hasOverflow = !expanded && allShots.length > previewLimit;
  const timelineShots = hasOverflow ? allShots.slice(0, Math.max(previewLimit - 1, 1)) : allShots;
  const hiddenCount = Math.max(allShots.length - timelineShots.length, 0);
  const activeHidden = hasOverflow && allShots.some((shot, index) => index >= timelineShots.length && shot?.id === activeShotId);
  const total = timelineShots.reduce((sum, shot) => sum + Math.max(Number(shot?.duration) || MIN_SHOT_DURATION, MIN_SHOT_DURATION), 0);

  const applyPairDurations = (left, right, leftDuration, rightDuration) => {
    onDurationsChange?.([
      { shotId: left.id, seconds: round1(leftDuration) },
      { shotId: right.id, seconds: round1(rightDuration) },
    ]);
  };

  const nudgeBoundary = (index, delta) => {
    const left = timelineShots[index];
    const right = timelineShots[index + 1];
    if (!left?.id || !right?.id) return;
    const leftStart = Math.max(Number(left.duration) || 1, MIN_SHOT_DURATION);
    const rightStart = Math.max(Number(right.duration) || 1, MIN_SHOT_DURATION);
    const pairTotal = leftStart + rightStart;
    const nextLeft = clamp(leftStart + delta, MIN_SHOT_DURATION, pairTotal - MIN_SHOT_DURATION);
    applyPairDurations(left, right, nextLeft, pairTotal - nextLeft);
  };

  const startBoundaryDrag = (event, index) => {
    const track = trackRef.current;
    const rect = track?.getBoundingClientRect();
    const left = timelineShots[index];
    const right = timelineShots[index + 1];
    if (!rect?.width || !left?.id || !right?.id || total <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      id: event.pointerId,
      target: event.currentTarget,
      startX: event.clientX,
      trackWidth: rect.width,
      total,
      left,
      right,
      leftStart: Math.max(Number(left.duration) || 1, MIN_SHOT_DURATION),
      rightStart: Math.max(Number(right.duration) || 1, MIN_SHOT_DURATION),
    };
  };

  const moveBoundary = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const pairTotal = drag.leftStart + drag.rightStart;
    const deltaSeconds = ((event.clientX - drag.startX) / drag.trackWidth) * drag.total;
    const nextLeft = clamp(drag.leftStart + deltaSeconds, MIN_SHOT_DURATION, pairTotal - MIN_SHOT_DURATION);
    applyPairDurations(drag.left, drag.right, nextLeft, pairTotal - nextLeft);
  };

  const finishBoundary = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    event.stopPropagation();
    drag.target?.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
  };

  return (
    <div
      className={`studio-shot-timeline${expanded ? ' is-expanded' : ''}${hasOverflow ? ' has-overflow' : ''}`}
      onPointerDown={stop}
      onPointerMove={moveBoundary}
      onPointerUp={finishBoundary}
      onPointerCancel={finishBoundary}
      ref={trackRef}
      style={{ '--shot-count': allShots.length }}
    >
      {timelineShots.map((shot, index) => {
        const id = shot?.id || `empty-${index}`;
        const duration = Math.max(Number(shot?.duration) || MIN_SHOT_DURATION, MIN_SHOT_DURATION);
        const selected = Boolean(shot?.id && shot.id === activeShotId);

        return (
          <div
            aria-pressed={selected}
            className={`studio-shot-timeline__segment${selected ? ' is-active' : ''}`}
            key={id}
            onClick={(event) => {
              event.stopPropagation();
              if (shot?.id) onSelect?.(shot.id, event);
            }}
            onKeyDown={(event) => {
              if (!shot?.id || (event.key !== 'Enter' && event.key !== ' ')) return;
              event.preventDefault();
              event.stopPropagation();
              onSelect?.(shot.id, event);
            }}
            role={shot?.id ? 'button' : undefined}
            style={{ '--shot-flex': total > 0 ? duration : 1 }}
            tabIndex={shot?.id ? 0 : -1}
            title={shotLabel(shot, index)}
          >
            <span>Shot {index + 1}</span>
            {shot?.id && <small>{round1(duration)}s</small>}
            {index < timelineShots.length - 1 && shot?.id && timelineShots[index + 1]?.id && (
              <button
                aria-label={`Adjust boundary after Shot ${index + 1}`}
                className="studio-shot-timeline__handle"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                  event.preventDefault();
                  event.stopPropagation();
                  nudgeBoundary(index, event.key === 'ArrowRight' ? 0.2 : -0.2);
                }}
                onPointerDown={(event) => startBoundaryDrag(event, index)}
                type="button"
              />
            )}
          </div>
        );
      })}
      {hasOverflow && (
        <button
          className={`studio-shot-timeline__overflow${activeHidden ? ' is-active' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            onOverflowClick?.(event);
          }}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          <span>+{hiddenCount}</span>
          <small>more</small>
        </button>
      )}
    </div>
  );
}
