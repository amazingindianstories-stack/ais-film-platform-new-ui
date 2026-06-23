'use client';

import { formatTime, formatSeconds } from './editorUtils';
import { resolveAssetUrl } from '@/utils/mediaFallback';

export default function EditorPreview({
  activeClip = null,
  activeShot = null,
  previewVideoRef,
  fallbackPreviewCanvasRef,
  handleVideoMetadata,
}) {
  return (
    <div className="editor-preview-container">
      {activeShot?.video_url ? (
        <video
          key={`${activeClip?.id}-${activeShot.video_url}`}
          ref={previewVideoRef}
          src={resolveAssetUrl(activeShot.video_url, 'video', activeClip.shotIndex + 1)}
          poster={activeShot.image_url ? resolveAssetUrl(activeShot.image_url, 'image', activeClip.shotIndex + 1) : undefined}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => handleVideoMetadata(activeClip.shotIndex, e)}
          className="editor-preview-video"
        />
      ) : activeShot?.image_url ? (
        <img src={resolveAssetUrl(activeShot.image_url, 'image', activeClip.shotIndex + 1)} alt={activeShot.n || 'Preview source'} className="editor-preview-image" />
      ) : (
        <canvas ref={fallbackPreviewCanvasRef} width={800} height={450} className="editor-preview-fallback-canvas" />
      )}
      
      <div className="editor-preview-metadata-overlay">
        <div className="editor-preview-overlay-title">
          {activeClip ? `${activeClip.shotIndex + 1}. ${activeShot?.n || 'Timeline Clip'}` : 'Timeline Preview'}
        </div>
        <div className="editor-preview-overlay-sub">
          {activeClip ? `${formatTime(activeClip.start)} - ${formatTime(activeClip.start + activeClip.duration)} · trimmed to ${formatSeconds(activeClip.duration)}` : 'Drop clips onto the timeline'}
        </div>
      </div>
    </div>
  );
}
