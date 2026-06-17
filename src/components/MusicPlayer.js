'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDuration } from '@/lib/backendClient';

const SEEK_SECONDS = 10;

export default function MusicPlayer({
  artworkUrl,
  canAnalyze,
  isAnalyzing,
  onDurationChange,
  src,
  status,
  statusIsError,
  title,
}) {
  const audioRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState('');

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setPlaybackError('');

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.load();
    }
  }, [src]);

  const syncDuration = useCallback(() => {
    const audio = audioRef.current;
    const nextDuration = Number(audio?.duration || 0);
    if (!Number.isFinite(nextDuration) || nextDuration <= 0) return;

    setDuration(nextDuration);
    onDurationChange?.(nextDuration);
  }, [onDurationChange]);

  const syncTime = useCallback(() => {
    const audio = audioRef.current;
    const nextTime = Number(audio?.currentTime || 0);
    setCurrentTime(Number.isFinite(nextTime) ? nextTime : 0);
  }, []);

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !src) return;

    setPlaybackError('');
    if (audio.paused) {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setPlaybackError('Playback could not start. Try pressing play again.');
      }
      return;
    }

    audio.pause();
    setIsPlaying(false);
  }, [src]);

  const seekBy = useCallback((amount) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;

    const nextTime = Math.min(Math.max(audio.currentTime + amount, 0), audio.duration);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, []);

  const handleScrub = useCallback((event) => {
    const audio = audioRef.current;
    const nextTime = Number(event.target.value);
    if (!audio || !Number.isFinite(nextTime)) return;

    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(duration);
  }, [duration]);

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const visibleStatus = playbackError || status;
  const displayDuration = duration || 0;
  const playerLabel = title ? `${title} audio player` : 'Audio player';

  const artStyle = useMemo(() => {
    if (!artworkUrl) return undefined;
    return { backgroundImage: `url("${artworkUrl}")` };
  }, [artworkUrl]);

  return (
    <>
      <div className="player-body">
        <div className="player-card" aria-label={playerLabel}>
          <div className={`player-art${artworkUrl ? ' has-artwork' : ''}`} style={artStyle} aria-label={artworkUrl ? 'Embedded track artwork' : 'Track artwork placeholder'}>
            {!artworkUrl && <span aria-hidden="true">♪</span>}
          </div>

          <div className="player-controls">
            <input
              className="player-scrub"
              type="range"
              min="0"
              max={String(Math.max(displayDuration, 0))}
              step="0.01"
              value={String(Math.min(currentTime, displayDuration))}
              onChange={handleScrub}
              disabled={!src || !displayDuration}
              aria-label="Seek through audio"
              style={{ '--player-progress': `${progress}%` }}
            />

            <div className="player-time">
              <span>{formatDuration(currentTime)}</span>
              <span>{displayDuration ? formatDuration(displayDuration) : '--:--'}</span>
            </div>

            <div className="player-transport">
              <button type="button" aria-label="Rewind 10 seconds" disabled={!src} onClick={() => seekBy(-SEEK_SECONDS)}>
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 6 4 12l7 6V6zm9 0-7 6 7 6V6z" /></svg>
              </button>
              <button type="button" className="player-play-btn" aria-label={isPlaying ? 'Pause audio' : 'Play audio'} disabled={!src} onClick={togglePlayback}>
                {isPlaying ? (
                  <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7L8 5z" /></svg>
                )}
              </button>
              <button type="button" aria-label="Forward 10 seconds" disabled={!src} onClick={() => seekBy(SEEK_SECONDS)}>
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 6l7 6-7 6V6zM4 6l7 6-7 6V6z" /></svg>
              </button>
            </div>
          </div>

          <audio
            ref={audioRef}
            src={src || undefined}
            preload="metadata"
            onLoadedMetadata={syncDuration}
            onDurationChange={syncDuration}
            onTimeUpdate={syncTime}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={handleEnded}
          />
        </div>

        <div className="player-right">
          <div className="player-dots">•••</div>
          <button className="analyse-btn" type="button" disabled={!canAnalyze}>
            {isAnalyzing ? 'Analysing' : 'Analyse'}
          </button>
        </div>
      </div>

      <div className={`player-status${statusIsError || playbackError ? ' is-error' : ''}`}>{visibleStatus}</div>
    </>
  );
}
