'use client';

import { AlertTriangle, CheckCircle2, Download, Film, Loader2, X } from 'lucide-react';
import { motion } from 'framer-motion';

export default function EditorExportPanel({
  onClose,
  exportResolution = '1080',
  setExportResolution,
  exportQuality = 'high',
  setExportQuality,
  isShotstackRendering = false,
  displayDuration = 60,
  exportRenderStatus = '',
  exportRenderId = null,
  exportStatusMessage = '',
  exportError = '',
  exportVideoUrl = null,
  onStartExport,
  onDownloadExport,
  shouldReduceMotion = false,
}) {
  const formatTime = (time) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const shotstackStatusLabel = (status) => {
    const normalized = String(status || '').toLowerCase();
    if (!normalized) return 'Not Exported';
    if (normalized === 'done') return 'Ready';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  };

  return (
    <div className="editor-export-sidebar">
      <div className="editor-export-header">
        <div className="editorial-title editorial-h3" style={{ fontSize: '1.5rem', marginBottom: 0 }}>
          Final <span className="text-grad">export.</span>
        </div>
        <motion.button
          onClick={onClose}
          whileHover={!shouldReduceMotion ? { backgroundColor: 'rgba(var(--cyan-300-rgb), 0.08)', scale: 1.06 } : undefined}
          whileTap={!shouldReduceMotion ? { scale: 0.9 } : undefined}
          transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
          className="editor-export-close-btn"
          aria-label="Close export settings"
        >
          <X size={16} />
        </motion.button>
      </div>

      <div className="editor-export-body">
        <div className="editor-export-field">
          <label className="editor-export-label">
            Resolution
          </label>
          <select
            value={exportResolution}
            onChange={(e) => setExportResolution(e.target.value)}
            disabled={isShotstackRendering}
            className="editor-export-select"
          >
            <option value="4k">3840 x 2160 (4K)</option>
            <option value="1080">1920 x 1080 (1080p)</option>
            <option value="hd">1280 x 720 (720p)</option>
            <option value="sd">1024 x 576 (SD)</option>
          </select>
        </div>

        <div className="editor-export-field">
          <label className="editor-export-label">
            Quality
          </label>
          <select
            value={exportQuality}
            onChange={(e) => setExportQuality(e.target.value)}
            disabled={isShotstackRendering}
            className="editor-export-select"
          >
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="low">Low</option>
          </select>
        </div>

        <div className="editor-export-stat-box">
          <span className="editor-export-stat-label">Edit Length</span>
          <span className="editor-export-stat-value">{formatTime(displayDuration)}</span>
        </div>

        <div className="editor-export-status-box">
          <div className="editor-export-status-row">
            <span className="editor-export-stat-label">Export Status</span>
            <span
              className="editor-export-status-badge"
              style={{ color: exportRenderStatus === 'done' ? 'var(--jaffa-200)' : 'var(--mine-100)' }}
            >
              {isShotstackRendering ? (
                <Loader2 size={12} className="spin icon-orange" />
              ) : exportRenderStatus === 'done' ? (
                <CheckCircle2 size={12} className="icon-cyan" />
              ) : (
                <Film size={12} />
              )}
              {shotstackStatusLabel(exportRenderStatus)}
            </span>
          </div>
          {exportRenderId && (
            <div className="editor-export-id-text">
              {exportRenderId}
            </div>
          )}
          {exportStatusMessage && (
            <div className="editor-export-msg-text">
              {exportStatusMessage}
            </div>
          )}
          {exportError && (
            <div className="editor-export-error-text">
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: '0.0625rem' }} />
              <span>{exportError}</span>
            </div>
          )}
        </div>
      </div>

      <button
        className="btn-orange editor-export-action-btn"
        onClick={exportVideoUrl ? onDownloadExport : onStartExport}
        disabled={isShotstackRendering}
        style={{ opacity: isShotstackRendering ? 0.72 : 1 }}
      >
        {isShotstackRendering ? (
          <>
            <Loader2 size={14} className="spin" />
            Rendering
          </>
        ) : exportVideoUrl ? (
          <>
            <Download size={14} />
            Download Video
          </>
        ) : (
          <>
            <Film size={14} />
            Start Export
          </>
        )}
      </button>
      
      {exportVideoUrl && (
        <button
          className="btn-outline editor-export-re-btn"
          onClick={onStartExport}
          disabled={isShotstackRendering}
        >
          <Film size={13} />
          Export Again
        </button>
      )}
    </div>
  );
}
