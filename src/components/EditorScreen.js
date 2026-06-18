'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Film, GripHorizontal, Loader2, Music, Pause, Play, Scissors, X, ZoomIn, ZoomOut } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { drawClubScene } from '@/utils/drawClubScene';
import { getProjectAudioDuration, normalizeShotListForVeo } from '@/utils/shotList';
import { sidePanel } from '@/lib/motion';

import EditorTimeline from './editor/EditorTimeline';
import EditorInspector from './editor/EditorInspector';
import EditorExportPanel from './editor/EditorExportPanel';
import EditorLibrary from './editor/EditorLibrary';
import EditorPreview from './editor/EditorPreview';
import {
  TIMELINE_PADDING,
  MIN_ZOOM,
  MAX_ZOOM,
  toFiniteNumber,
  clamp,
  snapTime,
  isShotstackWorking,
  shotstackStatusLabel,
  getExportErrorMessage,
  shotDuration,
  buildInitialTimeline,
  readableAudioName,
  formatSeconds,
  formatTime,
} from './editor/editorUtils';

export default function EditorScreen({
  projectId,
  audioUrl,
  projectData,
  onSaveShotstackExport,
}) {
  const libraryCanvasRefs = useRef([]);
  const fallbackPreviewCanvasRef = useRef(null);
  const previewVideoRef = useRef(null);
  const audioRef = useRef(null);

  const shouldReduceMotion = useReducedMotion();
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      setIsActive(document.body.dataset.route === '/editor');
    }
    const onRouteChange = (event) => {
      setIsActive(event.detail?.path === '/editor');
    };
    window.addEventListener('canvas:route-change', onRouteChange);
    return () => window.removeEventListener('canvas:route-change', onRouteChange);
  }, []);

  const projectAudioDuration = useMemo(() => getProjectAudioDuration(projectData), [projectData]);
  const shots = useMemo(
    () => normalizeShotListForVeo(projectData?.shot_list || [], { audioDuration: projectAudioDuration }),
    [projectAudioDuration, projectData?.shot_list]
  );

  const [showExport, setShowExport] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [zoom, setZoom] = useState(12);
  const [clipStarts, setClipStarts] = useState({});
  const [selectedClipId, setSelectedClipId] = useState(null);
  const [videoDurations, setVideoDurations] = useState({});

  const [exportResolution, setExportResolution] = useState(projectData?.shotstack_export?.resolution || '1080');
  const [exportQuality, setExportQuality] = useState(projectData?.shotstack_export?.quality || 'high');
  const [exportRender, setExportRender] = useState(projectData?.shotstack_export || null);
  const [exportStatusMessage, setExportStatusMessage] = useState('');
  const [exportError, setExportError] = useState('');
  const [isSubmittingExport, setIsSubmittingExport] = useState(false);

  useEffect(() => {
    if (projectData?.shotstack_export) {
      setExportRender(projectData.shotstack_export);
      setExportResolution(projectData.shotstack_export.resolution || '1080');
      setExportQuality(projectData.shotstack_export.quality || 'high');
    }
  }, [projectData?.shotstack_export]);

  const baseTimelineClips = useMemo(() => buildInitialTimeline(shots), [shots]);

  const timelineClips = useMemo(
    () => baseTimelineClips.map(clip => ({
      ...clip,
      start: clipStarts[clip.id] ?? clip.start,
    })),
    [baseTimelineClips, clipStarts]
  );

  const sortedClips = useMemo(
    () => [...timelineClips].sort((a, b) => a.start - b.start),
    [timelineClips]
  );

  const timelineEnd = useMemo(
    () => sortedClips.reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0),
    [sortedClips]
  );

  const displayDuration = Math.max(audioDuration || projectAudioDuration || 0, timelineEnd, 60);
  
  const activeClip = sortedClips.find(clip => currentTime >= clip.start && currentTime < clip.start + clip.duration)
    || sortedClips.find(clip => clip.id === selectedClipId)
    || sortedClips[0]
    || null;
  const activeShot = activeClip ? shots[activeClip.shotIndex] : null;
  const selectedClip = sortedClips.find(clip => clip.id === selectedClipId) || activeClip;
  const selectedShot = selectedClip ? shots[selectedClip.shotIndex] : null;
  const generatedCount = shots.filter(shot => shot.video_url).length;
  const audioFileName = readableAudioName(audioUrl);
  const exportRenderId = exportRender?.renderId || exportRender?.id || null;
  const exportRenderStatus = exportRender?.status || '';
  const exportVideoUrl = exportRender?.hostedUrl || exportRender?.url || null;
  const isShotstackRendering = isSubmittingExport || isShotstackWorking(exportRenderStatus);

  useEffect(() => {
    if (!isActive) return;

    const timer = setTimeout(() => {
      libraryCanvasRefs.current.forEach((canvas, index) => {
        if (canvas && !shots[index]?.video_url && !shots[index]?.image_url) {
          drawClubScene(canvas, index * 2 + 1);
        }
      });

      if (fallbackPreviewCanvasRef.current && !activeShot?.video_url && !activeShot?.image_url) {
        drawClubScene(fallbackPreviewCanvasRef.current, (activeClip?.shotIndex || 0) * 2 + 1);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [isActive, shots, activeShot, activeClip]);

  useEffect(() => {
    let interval;

    if (isPlaying) {
      interval = setInterval(() => {
        if (audioRef.current) {
          setCurrentTime(audioRef.current.currentTime);
          return;
        }

        setCurrentTime(prev => {
          const next = prev + 0.1;
          if (next >= displayDuration) {
            setIsPlaying(false);
            return displayDuration;
          }
          return next;
        });
      }, 100);
    }

    return () => clearInterval(interval);
  }, [isPlaying, displayDuration]);

  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video || !activeClip || !activeShot?.video_url) return;

    const sourceDuration = videoDurations[activeClip.shotIndex] || video.duration || 0;
    const sourceIn = 0;
    const localTime = clamp(currentTime - activeClip.start, 0, activeClip.duration);
    const targetTime = sourceIn + localTime;

    if (Number.isFinite(targetTime) && Math.abs(video.currentTime - targetTime) > 0.35) {
      video.currentTime = targetTime;
    }

    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [activeClip, activeShot, currentTime, isPlaying, videoDurations]);

  useEffect(() => {
    if (!exportRenderId || !isShotstackWorking(exportRenderStatus)) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/shotstack/render/${encodeURIComponent(exportRenderId)}`);
        const text = await response.text();
        const result = text ? JSON.parse(text) : {};

        if (!response.ok || result.error) {
          const error = new Error(result.error || `Export status failed with ${response.status}`);
          error.status = result.status || response.status;
          throw error;
        }
        if (cancelled) return;

        const nextRender = {
          ...exportRender,
          ...result,
          renderId: result.renderId || exportRenderId,
          resolution: exportResolution,
          quality: exportQuality,
          checkedAt: new Date().toISOString(),
        };

        setExportRender(nextRender);
        setExportStatusMessage(result.status === 'done' ? 'Export ready.' : `Export ${shotstackStatusLabel(result.status).toLowerCase()}...`);
        if (result.status === 'done') {
          await onSaveShotstackExport?.(nextRender);
        }
      } catch (error) {
        if (cancelled) return;
        setExportError(getExportErrorMessage(error));
      }
    }, exportRenderStatus === 'queued' ? 6000 : 9000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [exportRender, exportRenderId, exportRenderStatus, exportQuality, exportResolution, onSaveShotstackExport]);

  const seekTo = (time) => {
    const safeTime = clamp(time, 0, displayDuration);
    if (audioRef.current) audioRef.current.currentTime = safeTime;
    setCurrentTime(safeTime);
  };

  const togglePlay = () => {
    if (isPlaying) {
      audioRef.current?.pause();
      previewVideoRef.current?.pause();
      setIsPlaying(false);
      return;
    }

    if (audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
    previewVideoRef.current?.play().catch(() => {});
    setIsPlaying(true);
  };

  const setTimelineZoom = (nextZoom, anchorClientX = null, scrollContainer = null) => {
    const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    if (clampedZoom === zoom) return;

    let nextScrollLeft = null;
    if (scrollContainer) {
      const rect = scrollContainer.getBoundingClientRect();
      const anchorOffset = anchorClientX !== null
        ? clamp(anchorClientX - rect.left, 0, scrollContainer.clientWidth)
        : scrollContainer.clientWidth / 2;
      const anchorTime = Math.max(0, (scrollContainer.scrollLeft + anchorOffset - TIMELINE_PADDING) / zoom);
      const nextTimelineWidth = Math.max(displayDuration * clampedZoom, 960) + TIMELINE_PADDING * 2;
      const maxScrollLeft = Math.max(0, nextTimelineWidth - scrollContainer.clientWidth);
      nextScrollLeft = clamp(anchorTime * clampedZoom - anchorOffset + TIMELINE_PADDING, 0, maxScrollLeft);
    }

    setZoom(clampedZoom);

    if (nextScrollLeft !== null) {
      requestAnimationFrame(() => {
        if (scrollContainer) {
          scrollContainer.scrollLeft = nextScrollLeft;
        }
      });
    }
  };

  const handleTimelineWheel = (e, scrollContainer) => {
    if (!scrollContainer) return;

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomDelta = e.deltaY < 0 ? 4 : -4;
      setTimelineZoom(zoom + zoomDelta, e.clientX, scrollContainer);
      return;
    }

    const dominantDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!Number.isFinite(dominantDelta) || dominantDelta === 0) return;

    e.preventDefault();
    scrollContainer.scrollLeft += dominantDelta;
  };

  const handleTimelineMouseDown = (e, timelineEl) => {
    if (!timelineEl) return;
    const rect = timelineEl.getBoundingClientRect();
    const seekTime = (e.clientX - rect.left - TIMELINE_PADDING) / zoom;
    seekTo(seekTime);

    const onMouseMove = (moveEvent) => {
      const moveRect = timelineEl.getBoundingClientRect();
      seekTo((moveEvent.clientX - moveRect.left - TIMELINE_PADDING) / zoom);
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleLibraryDragStart = (e, shotIndex) => {
    const shot = shots[shotIndex];
    if (!shot?.video_url) return;

    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'library-shot',
      shotIndex,
    }));
  };

  const handleTimelineClipDragStart = (e, clipId) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'timeline-clip',
      clipId,
    }));
  };

  const handleTimelineDrop = (e, timelineEl) => {
    e.preventDefault();
    if (!timelineEl) return;

    let payload;
    try {
      payload = JSON.parse(e.dataTransfer.getData('application/json'));
    } catch {
      return;
    }

    const rect = timelineEl.getBoundingClientRect();
    const start = snapTime((e.clientX - rect.left - TIMELINE_PADDING) / zoom);

    if (payload.type === 'timeline-clip') {
      setClipStarts(prev => ({ ...prev, [payload.clipId]: start }));
      setSelectedClipId(payload.clipId);
      seekTo(start);
      return;
    }

    if (payload.type === 'library-shot') {
      const shot = shots[payload.shotIndex];
      if (!shot?.video_url) return;

      const existingClip = timelineClips.find(clip => clip.shotIndex === payload.shotIndex);
      if (!existingClip) return;

      setClipStarts(prev => ({ ...prev, [existingClip.id]: start }));
      setSelectedClipId(existingClip.id);
      seekTo(start);
    }
  };

  const handleVideoMetadata = (shotIndex, e) => {
    const sourceDuration = e.currentTarget.duration;
    if (!Number.isFinite(sourceDuration)) return;

    setVideoDurations(prev => ({
      ...prev,
      [shotIndex]: sourceDuration,
    }));
  };

  const handleDownloadClip = () => {
    if (!selectedShot?.video_url) return;
    const a = document.createElement('a');
    a.href = selectedShot.video_url;
    a.download = `shot_${(selectedClip?.shotIndex || 0) + 1}.mp4`;
    a.click();
  };

  const buildShotstackExportClips = () => sortedClips
    .map((clip) => {
      const shot = shots[clip.shotIndex];
      const sourceUrl = shot?.video_url || shot?.image_url;
      if (!sourceUrl) return null;

      const sourceType = shot.video_url ? 'video' : 'image';
      const knownDuration = videoDurations[clip.shotIndex] || toFiniteNumber(shot.video_duration_seconds, clip.duration);

      return {
        id: clip.id,
        shotIndex: clip.shotIndex,
        name: shot?.n || `Shot ${clip.shotIndex + 1}`,
        sourceUrl,
        sourceType,
        start: Number(clip.start.toFixed(3)),
        length: Number(clip.duration.toFixed(3)),
        trim: 0,
      };
    })
    .filter(Boolean);

  const handleShotstackExport = async () => {
    setExportError('');
    const clips = buildShotstackExportClips();
    if (!clips.length) {
      setExportError('Add at least one generated clip or source image before exporting.');
      return;
    }

    setIsSubmittingExport(true);
    setExportStatusMessage('Preparing final export...');

    try {
      const response = await fetch('/api/shotstack/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          audioUrl,
          resolution: exportResolution,
          quality: exportQuality,
          aspectRatio: '16:9',
          fps: 25,
          allowEffects: false,
          allowTransitions: false,
          clips,
        }),
      });
      const text = await response.text();
      const result = text ? JSON.parse(text) : {};

      if (!response.ok || result.error) {
        const error = new Error(result.error || `Export failed with ${response.status}`);
        error.status = result.status || response.status;
        throw error;
      }

      const renderState = {
        renderId: result.renderId,
        status: result.status || 'queued',
        message: result.message,
        resolution: exportResolution,
        quality: exportQuality,
        submittedAt: new Date().toISOString(),
      };

      setExportRender(renderState);
      setExportStatusMessage('Export queued.');
      await onSaveShotstackExport?.(renderState);
    } catch (error) {
      setExportError(getExportErrorMessage(error));
      setExportStatusMessage('');
    } finally {
      setIsSubmittingExport(false);
    }
  };

  const handleExportDownload = () => {
    if (!exportVideoUrl) return;
    const a = document.createElement('a');
    a.href = exportVideoUrl;
    a.download = `music-video-${projectId || 'final'}.mp4`;
    a.click();
  };

  return (
    <div className={`screen screen-editor ${isActive ? 'is-active' : ''}`} data-route="/editor">
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onLoadedMetadata={(e) => setAudioDuration(e.target.duration || 0)}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      {/* Left sidebar: Library */}
      <EditorLibrary
        shots={shots}
        timelineClips={timelineClips}
        generatedCount={generatedCount}
        setSelectedClipId={setSelectedClipId}
        seekTo={seekTo}
        handleLibraryDragStart={handleLibraryDragStart}
        handleVideoMetadata={handleVideoMetadata}
        libraryCanvasRefs={libraryCanvasRefs}
        shouldReduceMotion={shouldReduceMotion}
      />

      {/* Main Workspace */}
      <div className="editor-main-workspace">
        <div className="editor-preview-inspector-row">
          <EditorPreview
            activeClip={activeClip}
            activeShot={activeShot}
            previewVideoRef={previewVideoRef}
            fallbackPreviewCanvasRef={fallbackPreviewCanvasRef}
            handleVideoMetadata={handleVideoMetadata}
          />

          <EditorInspector
            selectedClip={selectedClip}
            selectedShot={selectedShot}
            videoDurations={videoDurations}
            onDownloadClip={handleDownloadClip}
            shouldReduceMotion={shouldReduceMotion}
          />
        </div>

        {/* Timeline Section Panel */}
        <div className="editor-timeline-section-card">
          <EditorTimeline
            shots={shots}
            sortedClips={sortedClips}
            selectedClipId={selectedClipId}
            setSelectedClipId={setSelectedClipId}
            currentTime={currentTime}
            displayDuration={displayDuration}
            audioDuration={audioDuration}
            audioFileName={audioFileName}
            zoom={zoom}
            setTimelineZoom={setTimelineZoom}
            onTimelineWheel={handleTimelineWheel}
            onTimelineMouseDown={handleTimelineMouseDown}
            onTimelineDrop={handleTimelineDrop}
            onTimelineClipDragStart={handleTimelineClipDragStart}
            seekTo={seekTo}
          />

          {/* Playback Controls & Action */}
          <div className="editor-timeline-bottom-bar">
            <motion.button
              onClick={togglePlay}
              whileTap={!shouldReduceMotion ? { scale: 0.92 } : undefined}
              transition={{ duration: 0.1, ease: [0.16, 1, 0.3, 1] }}
              className={`editor-play-btn ${isPlaying ? 'playing' : ''}`}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
            </motion.button>

            <button className="btn-secondary editor-export-trigger-btn" onClick={() => setShowExport(true)}>
              Export Video
            </button>
          </div>
        </div>
      </div>

      {/* Export Panel Overlay */}
      <AnimatePresence>
        {showExport && (
          <motion.div
            key="export-panel"
            variants={sidePanel}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{ height: '100%', flexShrink: 0, zIndex: 30 }}
          >
            <EditorExportPanel
              onClose={() => setShowExport(false)}
              exportResolution={exportResolution}
              setExportResolution={setExportResolution}
              exportQuality={exportQuality}
              setExportQuality={setExportQuality}
              isShotstackRendering={isShotstackRendering}
              displayDuration={displayDuration}
              exportRenderStatus={exportRenderStatus}
              exportRenderId={exportRenderId}
              exportStatusMessage={exportStatusMessage}
              exportError={exportError}
              exportVideoUrl={exportVideoUrl}
              onStartExport={handleShotstackExport}
              onDownloadExport={handleExportDownload}
              shouldReduceMotion={shouldReduceMotion}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
