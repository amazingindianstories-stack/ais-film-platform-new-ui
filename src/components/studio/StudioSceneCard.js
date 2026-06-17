'use client';

import { useState } from 'react';
import ShotCard from '@/components/ShotCard';
import StudioSceneTimeline from '@/components/studio/StudioSceneTimeline';
import StudioTimelineOverlay from '@/components/studio/StudioTimelineOverlay';

function formatTime(seconds) {
  const sec = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function StudioSceneCard({ area, activeShot, projectId, onSelectShot, onShotDurationsChange }) {
  const [timelineOpen, setTimelineOpen] = useState(false);
  const activeShotId = activeShot?.id || area?.shots?.[0]?.id || '';
  const shots = Array.isArray(area?.shots) ? area.shots : [];

  return (
    <section className="studio-scene-card">
      <header className="studio-scene-card__meta">
        <span>{String(area?.title || 'Scene 1').toUpperCase()}</span>
        <span>{formatTime(area?.start)} · {formatTime(area?.duration)}</span>
      </header>

      <div className="studio-scene-card__stack">
        {shots.length ? shots.map((shot, index) => (
          <ShotCard
            key={shot.id || `shot-${index}`}
            shot={shot}
            index={index}
            projectId={projectId}
            selected={Boolean(shot?.id && shot.id === activeShotId)}
            onSelect={onSelectShot}
          />
        )) : (
          <ShotCard shot={null} index={0} selected={false} onSelect={onSelectShot} />
        )}
      </div>

      <StudioSceneTimeline
        activeShotId={activeShotId}
        onDurationsChange={onShotDurationsChange}
        onOverflowClick={() => setTimelineOpen(true)}
        onSelect={onSelectShot}
        shots={shots}
      />

      <StudioTimelineOverlay
        activeShotId={activeShotId}
        onClose={() => setTimelineOpen(false)}
        onDurationsChange={onShotDurationsChange}
        onSelect={onSelectShot}
        open={timelineOpen}
        sceneTitle={area?.title || 'Scene'}
        shots={shots}
      />
    </section>
  );
}
