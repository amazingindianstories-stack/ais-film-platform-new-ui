'use client';

import { useCallback, useEffect, useRef } from 'react';
import { saveShotTiming } from '@/lib/shotPlanClient';

const round1 = (value) => Math.round(value * 10) / 10;

function shotId(shot, index) {
  return shot?.id || `shot-${index}`;
}

function toDuration(value, fallback = 1) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function buildTimedShots(shots, changes) {
  let cursor = 0;
  return (Array.isArray(shots) ? shots : []).map((shot, index) => {
    const id = shotId(shot, index);
    const duration = Math.max(round1(toDuration(changes[id], toDuration(shot?.duration, 1))), 0.1);
    const start = round1(cursor);
    const end = round1(cursor + duration);
    cursor = end;
    return { ...shot, id, start, end, duration };
  });
}

export function useShotTimingPersistence({ projectId, shotList, onSaved }) {
  const shotListRef = useRef(shotList);
  const pendingRef = useRef({});
  const saveTimerRef = useRef(null);

  useEffect(() => {
    shotListRef.current = shotList;
  }, [shotList]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  return useCallback((updates = []) => {
    if (!Array.isArray(updates) || !updates.length) return;
    updates.forEach((item) => {
      const shotIdValue = item?.shotId || item?.id;
      const seconds = Number(item?.seconds ?? item?.duration);
      if (!shotIdValue || !Number.isFinite(seconds)) return;
      pendingRef.current[shotIdValue] = Math.max(round1(seconds), 0.1);
    });

    if (!projectId || !shotListRef.current?.length) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const changes = { ...pendingRef.current };
      const nextShots = buildTimedShots(shotListRef.current, changes);
      try {
        const data = await saveShotTiming({ projectId, shots: nextShots });
        Object.entries(changes).forEach(([shotIdValue, seconds]) => {
          if (pendingRef.current[shotIdValue] === seconds) delete pendingRef.current[shotIdValue];
        });
        onSaved?.({ shotList: data.shot_list || [], shotListMeta: data.shot_list_meta || null });
      } catch (error) {
        console.error('[studio/save-shot-timing] failed:', error);
      }
    }, 700);
  }, [onSaved, projectId]);
}
