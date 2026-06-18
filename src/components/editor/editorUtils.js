export const TIMELINE_PADDING = 20;
export const MIN_ZOOM = 5;
export const MAX_ZOOM = 400;
const SHOTSTACK_WORKING_STATUSES = new Set(['queued', 'fetching', 'preprocessing', 'rendering', 'saving', 'pending']);

export const toFiniteNumber = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const snapTime = (value) => Math.max(0, Math.round(value * 10) / 10);

export function isShotstackWorking(status) {
  return SHOTSTACK_WORKING_STATUSES.has(String(status || '').toLowerCase());
}

export function shotstackStatusLabel(status) {
  const normalized = String(status || '').toLowerCase();
  if (!normalized) return 'Not Exported';
  if (normalized === 'done') return 'Ready';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function getExportErrorMessage(error) {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('timeout') || message.includes('temporarily unavailable')) {
    return 'Export is temporarily unavailable. Please try again soon.';
  }
  return 'Export could not be completed. Please try again.';
}

export function shotDuration(shot) {
  const start = toFiniteNumber(shot?.start);
  const end = toFiniteNumber(shot?.end);
  if (start !== null && end !== null && end > start) return Number((end - start).toFixed(2));

  const explicitDuration = toFiniteNumber(shot?.duration);
  if (explicitDuration !== null && explicitDuration > 0) return explicitDuration;

  return 5;
}

export function buildInitialTimeline(shots) {
  let cursor = 0;

  return shots.map((shot, index) => {
    const duration = shotDuration(shot);
    const start = toFiniteNumber(shot?.start, cursor);
    cursor = start + duration;

    return {
      id: `shot-${index}-${shot?.video_url || shot?.image_url || 'placeholder'}`,
      shotIndex: index,
      start,
      duration,
    };
  });
}

export function readableAudioName(audioUrl) {
  if (!audioUrl) return 'No Song Loaded';
  try {
    return decodeURIComponent(audioUrl.split('/').pop().split('-').slice(1).join('-')) || 'Audio Track';
  } catch {
    return 'Audio Track';
  }
}

export const formatSeconds = (time) => `${(Number(time) || 0).toFixed(1)}s`;

export const formatTime = (time) => {
  const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
  const mins = Math.floor(safeTime / 60);
  const secs = Math.floor(safeTime % 60);
  const ms = Math.floor((safeTime % 1) * 10);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
};
