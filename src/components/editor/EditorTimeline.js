'use client';

import { useRef } from 'react';
import { Film, GripHorizontal, Music, ZoomIn, ZoomOut } from 'lucide-react';
import { motion } from 'framer-motion';

const TIMELINE_PADDING = 20; // in px for zoom alignment layout math
const MIN_ZOOM = 5;
const MAX_ZOOM = 400;

export default function EditorTimeline({
  shots = [],
  sortedClips = [],
  selectedClipId = null,
  setSelectedClipId,
  currentTime = 0,
  displayDuration = 60,
  audioDuration = 0,
  audioFileName = '',
  zoom = 12,
  setTimelineZoom,
  onTimelineWheel,
  onTimelineMouseDown,
  onTimelineDrop,
  onTimelineClipDragStart,
  seekTo,
}) {
  const timelineRef = useRef(null);
  const timelineScrollRef = useRef(null);

  const timelineWidth = Math.max(displayDuration * zoom, 960);
  const playheadPosition = currentTime * zoom + TIMELINE_PADDING;

  const tickStep = zoom < 8 ? 20 : 10;
  const ticksCount = Math.ceil(displayDuration / tickStep) + 1;
  const ticks = Array.from({ length: ticksCount });

  const formatTime = (time) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatSeconds = (time) => `${(Number(time) || 0).toFixed(1)}s`;

  const handleMouseDown = (e) => {
    if (e.target.closest('[data-timeline-clip="true"]')) return;
    onTimelineMouseDown(e, timelineRef.current);
  };

  const handleWheel = (e) => {
    onTimelineWheel(e, timelineScrollRef.current);
  };

  const handleDrop = (e) => {
    onTimelineDrop(e, timelineRef.current);
  };

  return (
    <div className="editor-timeline-outer">
      <div className="editor-timeline-controls">
        <span className="editor-time-indicator">{formatTime(currentTime)}</span>
        <span className="editor-time-indicator muted">/ {formatTime(displayDuration)}</span>

        <div className="editor-timeline-zoom-container">
          <button
            className="btn-outline editor-zoom-btn"
            onClick={() => setTimelineZoom(zoom - 3, null, timelineScrollRef.current)}
            aria-label="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
          <div className="editor-timeline-zoom-slider-wrap">
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step="1"
              value={zoom}
              onChange={(e) => setTimelineZoom(Number(e.target.value), null, timelineScrollRef.current)}
              aria-label="Timeline zoom"
              className="editor-zoom-slider"
            />
            <span className="editor-zoom-label">
              {zoom}px/s
            </span>
          </div>
          <button
            className="btn-outline editor-zoom-btn"
            onClick={() => setTimelineZoom(zoom + 5, null, timelineScrollRef.current)}
            aria-label="Zoom in"
          >
            <ZoomIn size={14} />
          </button>
        </div>
      </div>

      <div className="editor-timeline-panel">
        <div className="editor-timeline-inner-container">
          <div className="editor-timeline-header-bar">
            <div className="editor-timeline-header-label">
              <Film size={14} className="icon-cyan" />
              Timeline
            </div>
            <div className="editor-timeline-header-hint">
              Drag clips, scroll to pan, pinch or Ctrl+wheel to zoom
            </div>
          </div>

          <div className="editor-timeline-track-workspace">
            {/* Fixed Left Sidebar for Track Headers */}
            <div className="editor-track-headers">
              <div className="editor-track-header ruler-header">
                <span className="editor-track-header-text">Time</span>
              </div>
              <div className="editor-track-header video-header">
                <Film size={12} className="icon-cyan" />
                <span className="editor-track-header-text">Video</span>
              </div>
              <div className="editor-track-header audio-header">
                <Music size={12} className="icon-orange" />
                <span className="editor-track-header-text">Audio</span>
              </div>
            </div>

            {/* Horizontally Scrollable Timeline content */}
            <div
              ref={timelineScrollRef}
              className="visible-scrollbar editor-timeline-scroll"
              onWheel={handleWheel}
            >
              <div
                ref={timelineRef}
                onMouseDown={handleMouseDown}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                style={{
                  width: `${timelineWidth + TIMELINE_PADDING * 2}px`,
                  minHeight: '100%',
                  position: 'relative',
                  padding: `0 ${TIMELINE_PADDING}px 1rem`,
                  boxSizing: 'border-box',
                  cursor: 'pointer',
                }}
              >
                {/* Ticks/Ruler */}
                <div className="editor-timeline-ruler">
                  {ticks.map((_, index) => (
                    <div
                      key={index}
                      style={{
                        position: 'absolute',
                        left: `${TIMELINE_PADDING + index * tickStep * zoom}px`,
                        top: 0,
                        height: '100%',
                        borderLeft: '0.0625rem solid rgba(var(--cyan-300-rgb), 0.08)',
                        paddingLeft: '0.375rem',
                        display: 'flex',
                        alignItems: 'center',
                        color: 'var(--text-muted)',
                        fontSize: '0.625rem',
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {formatTime(index * tickStep)}
                    </div>
                  ))}
                </div>

                {/* Video Track */}
                <div className="editor-track-row video-track">
                  {sortedClips.map((clip) => {
                    const shot = shots[clip.shotIndex];
                    const isSelected = selectedClipId === clip.id;
                    const clipWidth = clip.duration * zoom;
                    const left = clip.start * zoom;
                    return (
                      <motion.div
                        key={clip.id}
                        data-timeline-clip="true"
                        className={`editor-timeline-clip ${shot?.video_url ? 'is-ready' : 'is-missing'} ${isSelected ? 'is-selected' : ''}`}
                        draggable
                        onDragStart={(e) => onTimelineClipDragStart(e, clip.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedClipId(clip.id);
                          seekTo(clip.start);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedClipId(clip.id);
                            seekTo(clip.start);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`${shot?.n || 'Clip'} — ${formatSeconds(clip.duration)}`}
                        aria-pressed={isSelected}
                        style={{
                          position: 'absolute',
                          left: `${left}px`,
                          top: '0.5rem',
                          width: `${clipWidth}px`,
                          height: '2.25rem',
                          borderRadius: '0.375rem',
                          background: shot?.video_url
                            ? 'linear-gradient(90deg, rgba(var(--violet-rgb), 0.95), rgba(var(--violet-rgb), 0.75))'
                            : 'rgba(var(--cyan-300-rgb), 0.12)',
                          border: `0.0625rem solid ${isSelected ? 'var(--mine-100)' : 'rgba(var(--cyan-300-rgb), 0.18)'}`,
                          boxShadow: isSelected ? '0 0 0 0.125rem rgba(var(--violet-rgb), 0.25)' : 'none',
                          color: 'var(--mine-900)',
                          overflow: 'hidden',
                          cursor: 'grab',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.375rem',
                          padding: '0 0.5rem',
                        }}
                      >
                        <GripHorizontal size={13} style={{ flexShrink: 0 }} />
                        <span className="editor-timeline-clip-text">
                          {clip.shotIndex + 1}. {shot?.n || 'Clip'} · {formatSeconds(clip.duration)}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Audio Track */}
                <div className="editor-track-row audio-track">
                  <div
                    className="editor-timeline-audio-clip"
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: '0.5rem',
                      width: `${Math.max((audioDuration || displayDuration) * zoom, 160)}px`,
                      height: '1.5rem',
                      borderRadius: '0.3125rem',
                      background: 'linear-gradient(90deg, var(--jaffa-600), rgba(var(--jaffa-400-rgb), 0.7))',
                      color: 'var(--mine-100)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0 0.625rem',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      border: '0.0625rem solid rgba(var(--cyan-300-rgb), 0.12)',
                    }}
                  >
                    <Music size={12} style={{ flexShrink: 0 }} />
                    <span className="editor-timeline-clip-text">
                      {audioFileName}
                    </span>
                  </div>
                </div>

                {/* Playhead */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: `${playheadPosition}px`,
                    width: '0.125rem',
                    height: '100%',
                    background: 'var(--jaffa-400)',
                    zIndex: 12,
                    pointerEvents: 'none',
                  }}
                >
                  <div
                    style={{
                      width: '0.625rem',
                      height: '0.625rem',
                      background: 'var(--jaffa-400)',
                      borderRadius: '50%',
                      position: 'absolute',
                      top: '1.625rem',
                      left: '-0.25rem',
                      border: '0.0938rem solid rgba(var(--mine-900-rgb), 0.5)',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrackLabel({ icon, label }) {
  return (
    <div className="editor-track-label">
      {icon}
      {label}
    </div>
  );
}
