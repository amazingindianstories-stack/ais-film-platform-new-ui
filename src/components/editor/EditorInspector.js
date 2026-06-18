'use client';

import { Scissors, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function EditorInspector({
  selectedClip = null,
  selectedShot = null,
  videoDurations = {},
  onDownloadClip,
  shouldReduceMotion = false,
}) {
  const formatTime = (time) => {
    const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
    const mins = Math.floor(safeTime / 60);
    const secs = Math.floor(safeTime % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatSeconds = (time) => `${(Number(time) || 0).toFixed(1)}s`;

  const getClipSourceIn = (clip, sourceDuration) => {
    if (!clip || !sourceDuration || sourceDuration <= clip.duration) return 0;
    return 0;
  };

  const getClipSourceOut = (clip, sourceDuration) => {
    if (!clip) return 0;
    const sourceIn = getClipSourceIn(clip, sourceDuration);
    return Number((sourceIn + Math.min(clip.duration, sourceDuration || clip.duration)).toFixed(2));
  };

  return (
    <div className="editor-inspector-panel">
      <div className="kicker" style={{ marginBottom: '0.875rem' }}>── Inspector</div>
      <AnimatePresence mode="wait">
        {selectedClip ? (
          <motion.div
            key={selectedClip.id}
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -4 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
          >
            <div className="editor-inspector-title">
              <span className="editor-inspector-index">
                {String(selectedClip.shotIndex + 1).padStart(2, '0')}
              </span>
              {selectedShot?.n || 'Selected clip'}
            </div>
            
            <div className="editor-inspector-prompt">
              {selectedShot?.video_prompt || selectedShot?.p || selectedShot?.prompt || 'No prompt available'}
            </div>

            <div className="editor-inspector-grid">
              <InfoPill label="Start" value={formatTime(selectedClip.start)} />
              <InfoPill label="Duration" value={formatSeconds(selectedClip.duration)} />
              <InfoPill label="Source In" value={formatSeconds(getClipSourceIn(selectedClip, videoDurations[selectedClip.shotIndex]))} />
              <InfoPill label="Source Out" value={formatSeconds(getClipSourceOut(selectedClip, videoDurations[selectedClip.shotIndex]))} />
            </div>

            <div className="editor-inspector-tip">
              <Scissors size={15} className="icon-cyan" style={{ marginTop: '0.0625rem', flexShrink: 0 }} />
              <div className="editor-inspector-tip-text">
                The clip is fit to the exact shot duration by trimming evenly from the head and tail when the generated video is longer.
              </div>
            </div>

            <button
              className="btn-outline editor-inspector-action"
              onClick={onDownloadClip}
              disabled={!selectedShot?.video_url}
              style={{ marginTop: 'auto' }}
            >
              <Download size={14} />
              Download Clip
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="inspector-empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.15 }}
          >
            <div className="editor-inspector-empty">
              Drop generated clips onto the timeline to build the final edit.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InfoPill({ label, value }) {
  return (
    <div className="editor-info-pill">
      <div className="editor-info-pill-label">
        {label}
      </div>
      <div className="editor-info-pill-value">
        {value}
      </div>
    </div>
  );
}
