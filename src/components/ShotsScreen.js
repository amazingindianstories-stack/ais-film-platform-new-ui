'use client';

import { useCallback } from 'react';
import { useShotsCanvas } from '@/hooks/useShotsCanvas';
import { useShotTimingPersistence } from '@/hooks/useShotTimingPersistence';
import SceneArea from '@/components/SceneArea';
import ShotSceneContainer from '@/components/ShotSceneContainer';

// Infinite studio canvas: one draggable scene card per script scene. Each card
// owns its shot stack and a bottom strip for per-shot duration adjustment.
export default function ShotsScreen({
  scenes = [],
  shotList = [],
  projectId,
  onEditShotPlan,
  onShotPlanSaved,
  onBack,
}) {
  const canvas = useShotsCanvas({ scenes, shotList, projectId, route: '/shots' });
  const persistShotTiming = useShotTimingPersistence({ projectId, shotList, onSaved: onShotPlanSaved });
  const handleShotDurationsChange = useCallback((updates) => {
    canvas.setShotDurations(updates);
    persistShotTiming(updates);
  }, [canvas.setShotDurations, persistShotTiming]);

  return (
    <div className="screen screen-shots" data-route="/shots">
      <section
        className="entity-canvas-screen shots-canvas"
        ref={canvas.stageRef}
        onPointerDown={canvas.onStagePointerDown}
        onPointerMove={canvas.onStagePointerMove}
        onPointerUp={canvas.finishPointer}
        onPointerCancel={canvas.finishPointer}
        style={{ '--canvas-x': canvas.viewport.x, '--canvas-y': canvas.viewport.y, '--canvas-scale': canvas.viewport.scale }}
      >
        <h1 className="entity-canvas-title studio-title" data-anim>STUDIO</h1>

        <div className="shots-world entity-canvas-world">
          <ShotSceneContainer areas={canvas.areas} container={canvas.sceneContainer}>
            {canvas.areas.map((area) => {
              const frameArea = canvas.sceneContainer
                ? { ...area, x: area.x - canvas.sceneContainer.x, y: area.y - canvas.sceneContainer.y }
                : area;
              return (
                <SceneArea
                  key={area.id}
                  area={area}
                  frameArea={frameArea}
                  projectId={projectId}
                  onShotDurationsChange={handleShotDurationsChange}
                  onPointerDown={canvas.startAreaDrag}
                  onShotSelect={canvas.selectShot}
                  selectedShotId={canvas.selectedShotId}
                />
              );
            })}
          </ShotSceneContainer>
        </div>

        {!canvas.areas.length && (
          <div className="shots-empty" data-anim>
            <span className="shots-empty__badge" aria-hidden="true">🎬</span>
            <p className="shots-empty__title">No scenes yet</p>
            <p className="shots-empty__sub">Generate a script and the scene boards will lay out here.</p>
          </div>
        )}

        <div className="entity-canvas-actions" data-canvas-ui data-anim>
          {onEditShotPlan && (
            <button className="entity-canvas-action" onClick={onEditShotPlan} type="button">
              <span aria-hidden="true">✎</span>
              <span>Edit Shot Plan</span>
            </button>
          )}
          <button className="entity-canvas-action" onClick={canvas.addScene} type="button">
            <span aria-hidden="true">+</span>
            <span>Scene Template</span>
          </button>
          <button className="entity-canvas-action" onClick={onBack} type="button">
            <span aria-hidden="true">⌂</span>
            <span>Brain</span>
          </button>
        </div>
      </section>
    </div>
  );
}
