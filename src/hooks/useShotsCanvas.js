'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Studio scene-card geometry (rem). Each draggable unit is a standalone scene
// card that owns a stack of shots and a per-shot duration timeline.
const AREA_W = 23.5;
const SHOT_CARD_H = 26;       // tabbed shot card, fixed so geometry can place boards
const SHOT_CARD_GAP = 0.8;
const TIMELINE_H = 3.6;
const CARD_HEADER_H = 2.6;
const CARD_PAD_Y = 1.3;
const AREA_MIN_H = 24;
const AREA_GAP_X = 3.2;
const COMPACT_AREA_GAP_X = 1.6;
const ORIGIN_X = 4;
const ORIGIN_Y = 4;
const MIN_SHOTS = 0;
const CONTAINER_PAD_X = 2.2;
const CONTAINER_PAD_TOP = 3.6;
const CONTAINER_PAD_BOTTOM = 2.4;

const MIN_SCALE = 0.25;
const MAX_SCALE = 2;

const DEFAULT_SCENE_DUR = 5;   // seconds, for an empty scene with no shots/timing
const LAYOUT_VERSION = 'horizontal-scenes-v1';
const round1 = (n) => Math.round(n * 10) / 10;

function rootRem() {
  if (typeof window === 'undefined') return 16;
  return Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
}
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

function sceneSummary(scene) {
  return String(scene?.visual || scene?.description || scene?.text || scene?.lyrics || scene?.summary || '').trim();
}

// Which scene a shot belongs to: explicit source_scene number, else by time range.
function assignScene(shot, scenes) {
  const tagged = parseInt(String(shot?.source_scene ?? shot?.scene ?? '').match(/\d+/)?.[0], 10);
  if (Number.isFinite(tagged) && tagged >= 1 && tagged <= scenes.length) return tagged - 1;
  const start = Number(shot?.start);
  if (Number.isFinite(start)) {
    const idx = scenes.findIndex((s) => start >= Number(s?.start || 0) && (s?.end == null || start < Number(s.end)));
    if (idx >= 0) return idx;
  }
  return -1;
}

function buildAreas(scenes, shotList) {
  const groups = scenes.map(() => []);
  const extra = [];
  (Array.isArray(shotList) ? shotList : []).forEach((shot, i) => {
    const cell = {
      id: shot?.id || `shot-${i}`,
      n: shot?.n || shot?.title || `Shot ${i + 1}`,
      p: shot?.p || shot?.description || '',
      image_url: shot?.image_url || shot?.imageUrl || shot?.url || '',
      duration: Number(shot?.duration) || 0,
    };
    const idx = assignScene(shot, scenes);
    if (idx >= 0 && groups[idx]) groups[idx].push(cell);
    else extra.push(cell);
  });

  const areas = scenes.map((scene, i) => ({
    id: `scene-${i}`,
    index: i,
    title: `Scene ${i + 1}`,
    summary: sceneSummary(scene),
    sceneStart: Number(scene?.start),
    sceneEnd: Number(scene?.end),
    shots: groups[i],
    minShots: MIN_SHOTS,
  }));
  if (extra.length) {
    areas.push({ id: 'scene-extra', index: scenes.length, title: 'Additional shots', summary: '', shots: extra, minShots: 0 });
  }
  return areas;
}

// Effective scene duration: user override → sum of shot durations → scene span → default.
function effectiveDuration(area, durations) {
  const shotsDur = area.shots.reduce((sum, s) => sum + (Number(s.duration) || 0), 0);
  if (shotsDur > 0) return shotsDur;
  const override = durations?.[area.id];
  if (Number.isFinite(override)) return Math.max(override, 0.1);
  const span = (Number.isFinite(area.sceneEnd) && Number.isFinite(area.sceneStart)) ? area.sceneEnd - area.sceneStart : 0;
  return span > 0 ? span : DEFAULT_SCENE_DUR;
}

function shotDuration(shot, shotDurations = {}, fallback = 1) {
  const override = Number(shotDurations?.[shot?.id]);
  if (Number.isFinite(override) && override > 0) return round1(override);
  const raw = Number(shot?.duration);
  if (Number.isFinite(raw) && raw > 0) return round1(raw);
  return round1(Math.max(fallback, 0.1));
}

function normalizeAreaShotDurations(area, shotDurations = {}) {
  if (!area.shots.length) return area;
  const rawTotal = area.shots.reduce((sum, shot) => sum + (Number(shot.duration) || 0), 0);
  const sceneSpan = (Number.isFinite(area.sceneEnd) && Number.isFinite(area.sceneStart))
    ? Math.max(area.sceneEnd - area.sceneStart, 0)
    : 0;
  const fallbackEach = rawTotal > 0
    ? 1
    : Math.max((sceneSpan || DEFAULT_SCENE_DUR) / area.shots.length, 0.1);
  return {
    ...area,
    shots: area.shots.map((shot) => ({
      ...shot,
      duration: shotDuration(shot, shotDurations, fallbackEach),
    })),
  };
}

function areaContentMetrics(area) {
  const count = Math.max(area.shots.length, area.minShots, 1);
  const stackH = count * SHOT_CARD_H + Math.max(count - 1, 0) * SHOT_CARD_GAP;
  const contentH = Math.max(AREA_MIN_H, CARD_HEADER_H + CARD_PAD_Y * 2 + stackH + TIMELINE_H);
  return { contentH, rows: count };
}

// Lay scenes out as a horizontal studio sequence. Timeline data stays inside
// each scene card instead of stretching the canvas by duration.
function layoutAreas(rawAreas, durations, shotDurations) {
  let x = ORIGIN_X;
  let start = 0;
  return rawAreas.map((rawArea) => {
    const area = normalizeAreaShotDurations(rawArea, shotDurations);
    const dur = effectiveDuration(area, durations);
    const { contentH, rows } = areaContentMetrics(area);
    const placed = { ...area, x, y: ORIGIN_Y, w: AREA_W, h: contentH, rows, duration: round1(dur), start: round1(start) };
    x += AREA_W + AREA_GAP_X;
    start += dur;
    return placed;
  });
}

function layoutCompactAreas(rawAreas, durations, shotDurations) {
  let x = ORIGIN_X;
  let start = 0;
  return rawAreas.map((rawArea) => {
    const area = normalizeAreaShotDurations(rawArea, shotDurations);
    const dur = effectiveDuration(area, durations);
    const { contentH, rows } = areaContentMetrics(area);
    const placed = { ...area, x, y: ORIGIN_Y, w: AREA_W, h: contentH, rows, duration: round1(dur), start: round1(start) };
    x += AREA_W + COMPACT_AREA_GAP_X;
    start += dur;
    return placed;
  });
}

function loadSaved(key) {
  const empty = { positions: {}, manualAreas: [], durations: {}, shotDurations: {} };
  if (!key || typeof window === 'undefined') return empty;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || 'null');
    const canUsePositions = parsed?.layoutVersion === LAYOUT_VERSION;
    return {
      positions: canUsePositions && typeof parsed.positions === 'object' ? parsed.positions : {},
      manualAreas: Array.isArray(parsed?.manualAreas) ? parsed.manualAreas : [],
      durations: parsed && typeof parsed.durations === 'object' ? parsed.durations : {},
      shotDurations: parsed && typeof parsed.shotDurations === 'object' ? parsed.shotDurations : {},
    };
  } catch {
    return empty;
  }
}

// A blank, user-added scene board (raw — layoutAreas handles placement/duration).
function makeManualArea(num) {
  return {
    id: `manual-${Date.now()}`,
    index: num - 1,
    title: `Scene ${num}`,
    summary: '',
    shots: [],
    minShots: MIN_SHOTS,
    manual: true,
  };
}

function buildSceneContainer(areas) {
  if (!areas.length) return null;
  const minX = Math.min(...areas.map((area) => area.x));
  const minY = Math.min(...areas.map((area) => area.y));
  const maxX = Math.max(...areas.map((area) => area.x + area.w));
  const maxY = Math.max(...areas.map((area) => area.y + area.h));
  const duration = areas.reduce((sum, area) => sum + (Number(area.duration) || 0), 0);
  const shots = areas.reduce((sum, area) => sum + area.shots.length, 0);
  return {
    x: minX - CONTAINER_PAD_X,
    y: minY - CONTAINER_PAD_TOP,
    w: maxX - minX + CONTAINER_PAD_X * 2,
    h: maxY - minY + CONTAINER_PAD_TOP + CONTAINER_PAD_BOTTOM,
    sceneCount: areas.length,
    shotCount: shots,
    duration: round1(duration),
  };
}

function timelineStartViewport(rect, container) {
  if (!rect || !container) return null;
  const rem = rootRem();
  const stageW = rect.width / rem;
  const stageH = rect.height / rem;
  const pad = 4;
  const contentW = Math.max(container.w, AREA_W);
  const contentH = Math.max(container.h, 20);
  const focusW = Math.min(contentW, AREA_W + CONTAINER_PAD_X * 2);
  const scale = clamp(
    Math.min((stageH - pad * 2) / contentH, (stageW - pad * 2) / focusW),
    MIN_SCALE,
    1,
  );
  return {
    x: pad - container.x * scale,
    y: Math.max(pad, (stageH - contentH * scale) / 2) - container.y * scale,
    scale,
  };
}

export function useShotsCanvas({ scenes = [], shotList = [], projectId, route = '/shots' }) {
  const storageKey = projectId ? `aisStudio:studio-shots:${projectId}` : '';
  const stageRef = useRef(null);
  const panRef = useRef(null);
  const dragRef = useRef(null);
  const persistRef = useRef(null);
  const didFitRef = useRef(false);

  const scenesSig = useMemo(() => scenes.map((s) => sceneSummary(s)).join('|'), [scenes]);
  const shotsSig = useMemo(
    () => (Array.isArray(shotList) ? shotList.map((s) => [s?.id, s?.n, s?.p, s?.duration, s?.image_url].join(':')).join('|') : ''),
    [shotList],
  );

  // Raw scene boards (no geometry) — recomputed only when the scene/shot set changes.
  const baseRaw = useMemo(() => buildAreas(scenes, shotList), [scenesSig, shotsSig]); // eslint-disable-line react-hooks/exhaustive-deps

  const [positions, setPositions] = useState(() => loadSaved(storageKey).positions);
  const [manualAreas, setManualAreas] = useState(() => loadSaved(storageKey).manualAreas);
  const [durations, setDurationsState] = useState(() => loadSaved(storageKey).durations);
  const [shotDurations, setShotDurationsState] = useState(() => loadSaved(storageKey).shotDurations);
  const [selectedShotId, setSelectedShotId] = useState('');
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const [viewport, setViewport] = useState({ x: 4, y: 4, scale: 0.7 });
  const viewportRef = useRef(viewport);
  const positionsRef = useRef(positions);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);
  useEffect(() => { positionsRef.current = positions; }, [positions]);

  // Re-load saved state when the project key resolves/changes.
  const hydratedRef = useRef(storageKey ? '' : 'none');
  useEffect(() => {
    if (!storageKey || hydratedRef.current === storageKey) return;
    hydratedRef.current = storageKey;
    const saved = loadSaved(storageKey);
    setPositions(saved.positions);
    setManualAreas(saved.manualAreas);
    setDurationsState(saved.durations);
    setShotDurationsState(saved.shotDurations);
    setSelectedShotId('');
    setPast([]);
    setFuture([]);
    didFitRef.current = false;
  }, [storageKey]);

  // Duration-driven layout (script + manual boards), then user-moved positions overlaid.
  const areas = useMemo(() => {
    const laid = layoutAreas([...baseRaw, ...manualAreas], durations, shotDurations);
    return laid.map((a) => (positions[a.id] ? { ...a, x: positions[a.id].x, y: positions[a.id].y } : a));
  }, [baseRaw, manualAreas, durations, positions, shotDurations]);
  const sceneContainer = useMemo(() => buildSceneContainer(areas), [areas]);
  const areasRef = useRef(areas);
  useEffect(() => { areasRef.current = areas; }, [areas]);

  useEffect(() => {
    if (!selectedShotId) return;
    const exists = areas.some((area) => area.shots.some((shot) => shot?.id === selectedShotId));
    if (!exists) setSelectedShotId('');
  }, [areas, selectedShotId]);

  useEffect(() => {
    if (!storageKey) return undefined;
    if (persistRef.current) clearTimeout(persistRef.current);
    persistRef.current = setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify({ layoutVersion: LAYOUT_VERSION, positions, manualAreas, durations, shotDurations }));
      } catch { /* ignore */ }
    }, 400);
    return () => { if (persistRef.current) clearTimeout(persistRef.current); };
  }, [positions, manualAreas, durations, shotDurations, storageKey]);

  // Add a blank scene board (appended to the sequence; layout places it).
  const addScene = useCallback(() => {
    setManualAreas((prev) => [...prev, makeManualArea((areasRef.current?.length || 0) + 1)]);
  }, []);

  // Edit a scene's duration → re-lays out + cascades start times for later scenes.
  const setDuration = useCallback((areaId, seconds) => {
    const val = Number(seconds);
    if (!Number.isFinite(val)) return;
    setDurationsState((prev) => ({ ...prev, [areaId]: Math.max(val, 0) }));
  }, []);

  const setSceneDurations = useCallback((updates = []) => {
    if (!Array.isArray(updates) || !updates.length) return;
    setDurationsState((prev) => {
      const next = { ...prev };
      updates.forEach((item) => {
        const areaId = item?.areaId || item?.id;
        const seconds = Number(item?.seconds ?? item?.duration);
        if (!areaId || !Number.isFinite(seconds)) return;
        next[areaId] = Math.max(round1(seconds), 0.1);
      });
      return next;
    });
  }, []);

  const setShotDurations = useCallback((updates = []) => {
    if (!Array.isArray(updates) || !updates.length) return;
    setShotDurationsState((prev) => {
      const next = { ...prev };
      updates.forEach((item) => {
        const shotId = item?.shotId || item?.id;
        const seconds = Number(item?.seconds ?? item?.duration);
        if (!shotId || !Number.isFinite(seconds)) return;
        next[shotId] = Math.max(round1(seconds), 0.1);
      });
      return next;
    });
  }, []);

  const selectShot = useCallback((shotId) => {
    if (!shotId) return;
    setSelectedShotId(shotId);
  }, []);

  const fitView = useCallback(() => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || !areas.length) return;
    const rem = rootRem();
    const stageW = rect.width / rem;
    const stageH = rect.height / rem;
    const minX = sceneContainer?.x ?? Math.min(...areas.map((a) => a.x));
    const minY = sceneContainer?.y ?? Math.min(...areas.map((a) => a.y));
    const contentW = Math.max(sceneContainer?.w ?? AREA_W, AREA_W);
    const contentH = Math.max(sceneContainer?.h ?? 20, 20);
    const pad = 4;
    const scale = clamp(Math.min((stageW - pad * 2) / contentW, (stageH - pad * 2) / contentH), MIN_SCALE, 1);
    setViewport({ x: (stageW - contentW * scale) / 2 - minX * scale, y: pad - minY * scale, scale });
  }, [areas, sceneContainer]);

  // Initial/rearranged view: keep scene cards readable, left-anchored, and let
  // the user pan across the timeline instead of shrinking every scene to fit.
  const fitTimelineStart = useCallback(() => {
    const rect = stageRef.current?.getBoundingClientRect();
    const nextViewport = timelineStartViewport(rect, sceneContainer);
    if (nextViewport) setViewport(nextViewport);
  }, [sceneContainer]);

  useEffect(() => {
    if (didFitRef.current || !areas.length) return;
    didFitRef.current = true;
    requestAnimationFrame(fitTimelineStart);
  }, [areas.length, fitTimelineStart]);

  const zoomBy = useCallback((factor) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rem = rootRem();
    const cx = rect.width / 2 / rem;
    const cy = rect.height / 2 / rem;
    setViewport((cur) => {
      const next = clamp(cur.scale * factor, MIN_SCALE, MAX_SCALE);
      const wx = (cx - cur.x) / cur.scale;
      const wy = (cy - cur.y) / cur.scale;
      return { x: cx - wx * next, y: cy - wy * next, scale: next };
    });
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      setFuture((f) => [positionsRef.current, ...f]);
      setPositions(p[p.length - 1]);
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      setPast((p) => [...p, positionsRef.current]);
      setPositions(f[0]);
      return f.slice(1);
    });
  }, []);

  const rearrangeScenes = useCallback(() => {
    const cleanAreas = layoutCompactAreas([...baseRaw, ...manualAreas], durations, shotDurations);
    const cleanContainer = buildSceneContainer(cleanAreas);
    const cleanPositions = Object.fromEntries(cleanAreas.map((area) => [area.id, { x: area.x, y: area.y }]));
    setPast((items) => [...items, positionsRef.current]);
    setFuture([]);
    setPositions(cleanPositions);
    setSelectedShotId('');
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || !cleanContainer) return;
    const nextViewport = timelineStartViewport(rect, cleanContainer);
    if (nextViewport) setViewport(nextViewport);
  }, [baseRaw, durations, manualAreas, shotDurations]);

  const onWheel = useCallback((event) => {
    event.preventDefault();
    const rem = rootRem();
    const rect = stageRef.current?.getBoundingClientRect();
    if (event.ctrlKey || event.metaKey) {
      const factor = event.deltaY < 0 ? 1.08 : 0.92;
      const localX = (event.clientX - (rect?.left || 0)) / rem;
      const localY = (event.clientY - (rect?.top || 0)) / rem;
      setViewport((cur) => {
        const next = clamp(cur.scale * factor, MIN_SCALE, MAX_SCALE);
        const wx = (localX - cur.x) / cur.scale;
        const wy = (localY - cur.y) / cur.scale;
        return { x: localX - wx * next, y: localY - wy * next, scale: next };
      });
      return;
    }
    setViewport((cur) => ({ ...cur, x: cur.x - event.deltaX / rem, y: cur.y - event.deltaY / rem }));
  }, []);

  // Attach wheel natively as NON-passive so preventDefault actually works —
  // React's onWheel is passive, which lets ⌘/Ctrl-wheel page-zoom and logs warnings.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  const onStagePointerDown = useCallback((event) => {
    if (event.button !== 0 || event.target.closest?.('[data-scene-area], [data-canvas-ui], button')) return;
    setSelectedShotId('');
    event.currentTarget.setPointerCapture?.(event.pointerId);
    panRef.current = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY, viewport: viewportRef.current };
  }, []);

  const onStagePointerMove = useCallback((event) => {
    const rem = rootRem();
    const pan = panRef.current;
    if (pan?.id === event.pointerId) {
      setViewport({ ...pan.viewport, x: pan.viewport.x + (event.clientX - pan.clientX) / rem, y: pan.viewport.y + (event.clientY - pan.clientY) / rem });
      return;
    }
    const drag = dragRef.current;
    if (drag?.id !== event.pointerId) return;
    drag.moved = true;
    const scale = viewportRef.current.scale;
    const nx = drag.x + (event.clientX - drag.clientX) / rem / scale;
    const ny = drag.y + (event.clientY - drag.clientY) / rem / scale;
    setPositions((prev) => ({ ...prev, [drag.areaId]: { x: nx, y: ny } }));
  }, []);

  const finishPointer = useCallback((event) => {
    if (panRef.current?.id === event.pointerId) panRef.current = null;
    const drag = dragRef.current;
    if (drag?.id === event.pointerId) {
      dragRef.current = null;
      if (drag.moved && drag.before) { setPast((p) => [...p, drag.before]); setFuture([]); }
    }
  }, []);

  const startAreaDrag = useCallback((event, area) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      id: event.pointerId, areaId: area.id, clientX: event.clientX, clientY: event.clientY,
      x: area.x, y: area.y, before: positionsRef.current, moved: false,
    };
  }, []);

  // The left tools pill drives the canvas via these
  // events — handled only while this screen owns the route.
  useEffect(() => {
    const onTool = (event) => {
      if (document.body.dataset.route !== route) return;
      const tool = event.detail?.tool;
      if (tool === 'undo') undo();
      if (tool === 'redo') redo();
      if (tool === 'fit') fitView();
      if (tool === 'rearrange') rearrangeScenes();
      if (tool === 'zoom-in') zoomBy(1.16);
      if (tool === 'zoom-out') zoomBy(0.86);
    };
    window.addEventListener('entity-canvas:tool', onTool);
    return () => window.removeEventListener('entity-canvas:tool', onTool);
  }, [fitView, rearrangeScenes, redo, route, undo, zoomBy]);

  return {
    stageRef,
    viewport,
    areas,
    sceneContainer,
    selectedShotId,
    addScene,
    setDuration,
    setSceneDurations,
    setShotDurations,
    selectShot,
    onWheel,
    onStagePointerDown,
    onStagePointerMove,
    finishPointer,
    startAreaDrag,
    fitView,
  };
}
