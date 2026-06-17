import { rootRem } from './entityCanvasModel';

export const BOX_SELECT_DELAY_MS = 140;

const BOX_SELECT_MOVE_THRESHOLD = 0.24;

export function screenToStagePoint(stage, clientX, clientY) {
  const rect = stage?.getBoundingClientRect();
  const rem = rootRem();
  return {
    x: (clientX - (rect?.left || 0)) / rem,
    y: (clientY - (rect?.top || 0)) / rem,
  };
}

export function screenToWorldPoint(stage, viewport, clientX, clientY) {
  const local = screenToStagePoint(stage, clientX, clientY);
  return {
    x: (local.x - viewport.x) / viewport.scale,
    y: (local.y - viewport.y) / viewport.scale,
  };
}

export function stageBoxToWorldBounds(box, viewport) {
  return {
    minX: (box.x - viewport.x) / viewport.scale,
    minY: (box.y - viewport.y) / viewport.scale,
    maxX: (box.x + box.width - viewport.x) / viewport.scale,
    maxY: (box.y + box.height - viewport.y) / viewport.scale,
  };
}

export function selectionBoxFromPoints(origin, current) {
  return {
    x: Math.min(origin.x, current.x),
    y: Math.min(origin.y, current.y),
    width: Math.abs(current.x - origin.x),
    height: Math.abs(current.y - origin.y),
  };
}

export function makePanGesture(event, stage, viewport, forceSelect) {
  const origin = screenToStagePoint(stage, event.clientX, event.clientY);
  return {
    pointerId: event.pointerId,
    mode: forceSelect ? 'selecting' : 'pending',
    clientX: event.clientX,
    clientY: event.clientY,
    originX: origin.x,
    originY: origin.y,
    viewport,
    lastX: event.clientX,
    lastY: event.clientY,
    lastT: performance.now(),
    vx: 0,
    vy: 0,
  };
}

export function panGestureMovedPastThreshold(pan, event) {
  const rem = rootRem();
  const dx = (event.clientX - pan.clientX) / rem;
  const dy = (event.clientY - pan.clientY) / rem;
  return Math.hypot(dx, dy) > BOX_SELECT_MOVE_THRESHOLD;
}

export function updatePanVelocity(pan, event) {
  const rem = rootRem();
  const now = performance.now();
  const dt = now - pan.lastT;
  if (dt > 0) {
    const instVX = (event.clientX - pan.lastX) / rem / dt;
    const instVY = (event.clientY - pan.lastY) / rem / dt;
    pan.vx = pan.vx * 0.7 + instVX * 0.3;
    pan.vy = pan.vy * 0.7 + instVY * 0.3;
    pan.lastX = event.clientX;
    pan.lastY = event.clientY;
    pan.lastT = now;
  }
  return rem;
}

export function viewportForPanGesture(pan, event, rem) {
  return {
    ...pan.viewport,
    x: pan.viewport.x + (event.clientX - pan.clientX) / rem,
    y: pan.viewport.y + (event.clientY - pan.clientY) / rem,
  };
}

export function shouldDeleteCanvasSelection(event) {
  if (event.defaultPrevented || (event.key !== 'Delete' && event.key !== 'Backspace')) return false;
  const target = event.target;
  return !(
    target?.isContentEditable
    || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)
  );
}
