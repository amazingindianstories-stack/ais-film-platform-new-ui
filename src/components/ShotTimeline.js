'use client';

import { useMemo, useRef } from 'react';

const MIN_SCENE_DURATION = 0.5;

const round1 = (value) => Math.round(value * 10) / 10;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function stopInteraction(event) {
  event.stopPropagation();
}

function formatSeconds(value) {
  const seconds = Math.max(0, Math.round(Number(value) || 0));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function segmentTitle(area, index) {
  return String(area?.title || `Scene ${index + 1}`).replace(/^Scene\s+/i, 'S');
}

export default function ShotTimeline({ areas = [], onDurationsChange }) {
  const trackRef = useRef(null);
  const dragRef = useRef(null);

  const timelineAreas = useMemo(
    () => areas.filter((area) => Number(area?.duration) > 0),
    [areas],
  );
  const totalDuration = timelineAreas.reduce((sum, area) => sum + (Number(area.duration) || 0), 0);

  const applyPairDurations = (left, right, leftDuration, rightDuration) => {
    onDurationsChange?.([
      { areaId: left.id, seconds: round1(leftDuration) },
      { areaId: right.id, seconds: round1(rightDuration) },
    ]);
  };

  const nudgeBoundary = (index, delta) => {
    const left = timelineAreas[index];
    const right = timelineAreas[index + 1];
    if (!left || !right) return;
    const leftStart = Number(left.duration) || MIN_SCENE_DURATION;
    const rightStart = Number(right.duration) || MIN_SCENE_DURATION;
    const pairTotal = leftStart + rightStart;
    const nextLeft = clamp(leftStart + delta, MIN_SCENE_DURATION, pairTotal - MIN_SCENE_DURATION);
    applyPairDurations(left, right, nextLeft, pairTotal - nextLeft);
  };

  const startBoundaryDrag = (event, index) => {
    const track = trackRef.current;
    const rect = track?.getBoundingClientRect();
    const left = timelineAreas[index];
    const right = timelineAreas[index + 1];
    if (!rect?.width || !left || !right || totalDuration <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      id: event.pointerId,
      index,
      startX: event.clientX,
      trackWidth: rect.width,
      totalDuration,
      left,
      right,
      leftStart: Number(left.duration) || MIN_SCENE_DURATION,
      rightStart: Number(right.duration) || MIN_SCENE_DURATION,
    };
  };

  const moveBoundary = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const pairTotal = drag.leftStart + drag.rightStart;
    const deltaSeconds = ((event.clientX - drag.startX) / drag.trackWidth) * drag.totalDuration;
    const nextLeft = clamp(drag.leftStart + deltaSeconds, MIN_SCENE_DURATION, pairTotal - MIN_SCENE_DURATION);
    applyPairDurations(drag.left, drag.right, nextLeft, pairTotal - nextLeft);
  };

  const finishBoundary = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
  };

  if (!timelineAreas.length) return null;

  return (
    <div
      className="shot-timeline"
      data-shot-timeline
      onPointerDown={stopInteraction}
      onPointerMove={moveBoundary}
      onPointerUp={finishBoundary}
      onPointerCancel={finishBoundary}
    >
      <div className="shot-timeline__head">
        <span>Scene Timeline</span>
        <span>{formatSeconds(totalDuration)}</span>
      </div>

      <div className="shot-timeline__track" ref={trackRef}>
        {timelineAreas.map((area, index) => (
          <div
            className="shot-timeline__segment"
            key={area.id}
            style={{ '--segment-flex': Math.max(Number(area.duration) || 0, MIN_SCENE_DURATION) }}
          >
            <span className="shot-timeline__name">{segmentTitle(area, index)}</span>
            <span className="shot-timeline__duration">{round1(Number(area.duration) || 0)}s</span>
            {index < timelineAreas.length - 1 && (
              <button
                aria-label={`Adjust boundary after ${area.title || segmentTitle(area, index)}`}
                className="shot-timeline__handle"
                onPointerDown={(event) => startBoundaryDrag(event, index)}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                  event.preventDefault();
                  event.stopPropagation();
                  nudgeBoundary(index, event.key === 'ArrowRight' ? 0.5 : -0.5);
                }}
                type="button"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
