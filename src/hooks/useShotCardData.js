'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_TECHNICALS, SEED_PALETTE, DEFAULT_STORYBOARD } from '@/components/shot/shotCardOptions';
import { extractPalette, randomCinematicPalette, svgGradientDataUrl, placeholderArt, fileToUrl } from '@/components/shot/shotCardUtils';
import { resolveAssetUrl } from '@/utils/mediaFallback';

let seq = 0;
const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${(seq += 1)}`;

const STORE_PREFIX = 'aisStudio:shot-card';

function keyFor(projectId, shotId) {
  if (!shotId) return '';
  return `${STORE_PREFIX}:${projectId || 'demo'}:${shotId}`;
}

// Only the lightweight, serialisable fields are persisted. Uploaded images are
// kept as session object URLs (not written to localStorage to avoid blowing the
// quota) until a real asset backend is wired.
function loadPersisted(key) {
  if (!key || typeof window === 'undefined') return null;
  try {
    return JSON.parse(window.localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

const emptyPersisted = () => ({ palette: SEED_PALETTE, technicals: DEFAULT_TECHNICALS, script: '' });
const emptyMedia = (shot, index) => {
  const images = [];
  const videos = {};
  const storyboard = [...DEFAULT_STORYBOARD];

  const getFallbackSrc = (url, type) => resolveAssetUrl(url, type, (index || 0) + 1);

  const imageSrc = getFallbackSrc(shot?.image_url, 'image');

  const videoSrc = getFallbackSrc(shot?.video_url, 'video');

  if (imageSrc) {
    images.push({
      id: 'img-db-default',
      src: imageSrc,
      selected: true,
    });

    if (videoSrc) {
      videos['img-db-default'] = {
        options: [
          {
            id: 'vid-db-default',
            src: videoSrc,
          },
        ],
        selectedId: 'vid-db-default',
      };
    }
  }

  return {
    paletteImage: null,
    lightingImage: null,
    storyboard,
    images,
    videos,
  };
};

// Per-shot card state: colour palette, reference/lighting images, storyboard
// frames, technical settings, and the shot script. Exposes high-level actions so
// the card and its tabs stay thin orchestration shells.
export function useShotCardData({ projectId, shotId, shot, index }) {
  const key = keyFor(projectId, shotId);
  const [persisted, setPersisted] = useState(() => ({ ...emptyPersisted(), ...(loadPersisted(key) || {}) }));
  const [media, setMedia] = useState(() => emptyMedia(shot, index));
  const [paletteBusy, setPaletteBusy] = useState(false);
  const mediaRef = useRef(media);
  const persistedRef = useRef(persisted);
  useEffect(() => { mediaRef.current = media; }, [media]);
  useEffect(() => { persistedRef.current = persisted; }, [persisted]);

  // Reload when the shot/project key changes (card reused for another shot).
  const keyRef = useRef(key);
  useEffect(() => {
    if (keyRef.current !== key) {
      keyRef.current = key;
      setPersisted({ ...emptyPersisted(), ...(loadPersisted(key) || {}) });
    }
    setMedia(emptyMedia(shot, index));
  }, [key, shot, index]);

  // Debounced persistence of the serialisable slice.
  const timer = useRef(null);
  useEffect(() => {
    if (!key) return undefined;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try { window.localStorage.setItem(key, JSON.stringify(persisted)); } catch { /* quota — ignore */ }
    }, 400);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [persisted, key]);

  const setPalette = useCallback((palette) => setPersisted((p) => ({ ...p, palette })), []);
  const setTechnical = useCallback((patch) => setPersisted((p) => ({ ...p, technicals: { ...p.technicals, ...patch } })), []);
  const setScript = useCallback((script) => setPersisted((p) => ({ ...p, script })), []);

  const setImage = useCallback((field, file) => {
    const url = fileToUrl(file);
    if (!url) return;
    setMedia((m) => ({ ...m, [field]: url }));
  }, []);
  const clearImage = useCallback((field) => setMedia((m) => ({ ...m, [field]: null })), []);

  // Generate the palette from the uploaded reference image if present, else a
  // curated cinematic set.
  const generatePalette = useCallback(async () => {
    setPaletteBusy(true);
    try {
      const ref = mediaRef.current.paletteImage;
      const colors = ref ? await extractPalette(ref, 5) : [];
      setPalette(colors.length ? colors : randomCinematicPalette());
    } finally {
      setPaletteBusy(false);
    }
  }, [setPalette]);

  const addFrame = useCallback(() => setMedia((m) => ({ ...m, storyboard: [...m.storyboard, null] })), []);
  const appendFrame = useCallback((file) => {
    const url = fileToUrl(file);
    if (!url) return;
    setMedia((m) => ({ ...m, storyboard: [...m.storyboard, url] }));
  }, []);
  const uploadFrame = useCallback((index, file) => {
    const url = fileToUrl(file);
    if (!url) return;
    setMedia((m) => ({ ...m, storyboard: m.storyboard.map((f, i) => (i === index ? url : f)) }));
  }, []);
  const clearFrame = useCallback((index) => {
    setMedia((m) => ({ ...m, storyboard: m.storyboard.map((f, i) => (i === index ? null : f)) }));
  }, []);
  // Placeholder generation: paints a palette gradient into the frame.
  const generateFrame = useCallback((index) => {
    const frame = svgGradientDataUrl(persistedRef.current.palette);
    setMedia((m) => ({ ...m, storyboard: m.storyboard.map((f, i) => (i === index ? frame : f)) }));
  }, []);

  // Images tab — a pool of generated images to scroll, select, and regrow.
  const generateImages = useCallback((count = 3) => {
    setMedia((m) => {
      const palette = persistedRef.current.palette;
      const base = m.images.length;
      const next = Array.from({ length: count }, (_, i) => ({
        id: uid('img'),
        src: placeholderArt(palette, base + i + 1),
        selected: false,
      }));
      return { ...m, images: [...m.images, ...next] };
    });
  }, []);
  const toggleImageSelect = useCallback((id) => {
    setMedia((m) => ({ ...m, images: m.images.map((im) => (im.id === id ? { ...im, selected: !im.selected } : im)) }));
  }, []);
  const removeImage = useCallback((id) => {
    setMedia((m) => {
      const videos = { ...m.videos };
      delete videos[id];
      return { ...m, images: m.images.filter((im) => im.id !== id), videos };
    });
  }, []);

  // Videos tab — each selected image owns a set of generated video options.
  const generateVideos = useCallback((imageId, count = 2) => {
    setMedia((m) => {
      const palette = persistedRef.current.palette;
      const entry = m.videos[imageId] || { options: [], selectedId: '' };
      const base = entry.options.length;
      const opts = Array.from({ length: count }, (_, i) => ({
        id: uid('vid'),
        src: placeholderArt(palette, base + i + 11),
      }));
      const options = [...entry.options, ...opts];
      return {
        ...m,
        videos: { ...m.videos, [imageId]: { options, selectedId: entry.selectedId || options[0].id } },
      };
    });
  }, []);
  const selectVideo = useCallback((imageId, videoId) => {
    setMedia((m) => {
      const entry = m.videos[imageId];
      if (!entry) return m;
      return { ...m, videos: { ...m.videos, [imageId]: { ...entry, selectedId: videoId } } };
    });
  }, []);

  return {
    palette: persisted.palette,
    technicals: persisted.technicals,
    script: persisted.script,
    media,
    paletteBusy,
    setPalette,
    setTechnical,
    setScript,
    setImage,
    clearImage,
    generatePalette,
    addFrame,
    appendFrame,
    uploadFrame,
    clearFrame,
    generateFrame,
    generateImages,
    toggleImageSelect,
    removeImage,
    generateVideos,
    selectVideo,
  };
}
