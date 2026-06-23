'use client';

import { motion } from 'framer-motion';
import { formatSeconds, shotDuration } from './editorUtils';
import { resolveAssetUrl } from '@/utils/mediaFallback';

export default function EditorLibrary({
  shots = [],
  timelineClips = [],
  generatedCount = 0,
  setSelectedClipId,
  seekTo,
  handleLibraryDragStart,
  handleVideoMetadata,
  libraryCanvasRefs,
  shouldReduceMotion = false,
}) {
  return (
    <div className="editor-sidebar-left">
      <div className="editor-library-header">
        <div className="kicker">── Library</div>
        <div className="editorial-title editorial-h3">
          Generated clips.
        </div>
        <div className="editor-library-ready-count">
          {String(generatedCount).padStart(2, '0')} / {String(shots.length || 0).padStart(2, '0')} ready
        </div>
      </div>

      <div className="visible-scrollbar editor-clip-library">
        {shots.map((shot, index) => {
          const isReady = Boolean(shot.video_url);
          return (
            <motion.div
              className="editor-clip-card"
              key={`${shot.n}-${index}`}
              draggable={isReady}
              onDragStart={(e) => handleLibraryDragStart(e, index)}
              onClick={() => {
                const clip = timelineClips.find(item => item.shotIndex === index);
                if (clip) {
                  setSelectedClipId(clip.id);
                  seekTo(clip.start);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  const clip = timelineClips.find(item => item.shotIndex === index);
                  if (clip) {
                    setSelectedClipId(clip.id);
                    seekTo(clip.start);
                  }
                }
              }}
              tabIndex={isReady ? 0 : -1}
              role="button"
              aria-label={`${shot.n || `Shot ${index + 1}`} — ${isReady ? 'ready' : 'missing'}`}
              whileHover={isReady && !shouldReduceMotion ? { scale: 1.025 } : undefined}
              whileTap={isReady && !shouldReduceMotion ? { scale: 0.97 } : undefined}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="editor-clip-frame">
                <div className="editor-clip-frame-inner">
                  {shot.video_url ? (
                    <video
                      src={resolveAssetUrl(shot.video_url, 'video', index + 1)}
                      poster={shot.image_url ? resolveAssetUrl(shot.image_url, 'image', index + 1) : undefined}
                      muted
                      playsInline
                      preload="metadata"
                      onLoadedMetadata={(e) => handleVideoMetadata(index, e)}
                      className="editor-clip-media"
                    />
                  ) : shot.image_url ? (
                    <img src={resolveAssetUrl(shot.image_url, 'image', index + 1)} alt={shot.n || `Shot ${index + 1}`} className="editor-clip-media" />
                  ) : (
                    <canvas
                      ref={(el) => {
                        if (libraryCanvasRefs.current) {
                          libraryCanvasRefs.current[index] = el;
                        }
                      }}
                      width={320}
                      height={180}
                      className="editor-clip-media"
                    />
                  )}
                </div>
                <div className="editor-clip-shadow" />
                <div className="editor-clip-meta-container">
                  <div className="editor-clip-title">
                    {index + 1}. {shot.n || `Shot ${index + 1}`}
                  </div>
                  <div className="editor-clip-sub-row">
                    <span className={`editor-clip-status-badge ${isReady ? 'ready' : 'missing'}`}>
                      {isReady ? 'READY' : 'MISSING'}
                    </span>
                    <span className="editor-clip-duration">
                      {formatSeconds(shotDuration(shot))}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
