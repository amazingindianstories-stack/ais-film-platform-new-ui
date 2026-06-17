import { useEffect, useState } from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import AgentCatIcon from '@/components/canvas/AgentCatIcon';

export default function BrainHubScreen({
  hasAnalysis, hasScript, shotsReady = false,
  hasProject = false, loading = false, loadError = '', onRetry,
  onNavigate,
}) {
  const isBrainReady = hasAnalysis || hasScript;
  const showShots = hasAnalysis && hasScript;
  // Distinguish a genuinely fresh project from one that's still loading or failed
  // to load — otherwise an in-progress project wrongly shows "click the orb".
  const isLoadingProject = !isBrainReady && hasProject && loading;
  const isErrorProject = !isBrainReady && hasProject && !loading && Boolean(loadError);
  const isFresh = !isBrainReady && !isLoadingProject && !isErrorProject;
  // Two-click gate: if characters/locations aren't ready, the first click is
  // denied with a cat warning; a second click launches anyway.
  const [warned, setWarned] = useState(false);
  useEffect(() => { if (shotsReady) setWarned(false); }, [shotsReady]);

  const handleShots = () => {
    if (!shotsReady && !warned) { setWarned(true); return; }
    setWarned(false);
    onNavigate('/shots');
  };

  return (
    <main className={`screen screen-start${isBrainReady ? ' is-brain' : ''}`} data-route="/brain">
      <div className="main">
        <div className="orb-wrap">
          {isFresh && (
            <div className="orb-popup" aria-hidden="true">
              <div className="popup-card">
                <span className="popup-label">audio</span>
                <span className="popup-arrow">→</span>
              </div>
              <div className="popup-connector">
                <svg width="10" height="44" viewBox="0 0 10 44" fill="none">
                  <path className="popup-tail-path" d="M5 44 Q9 35 5 28 Q1 21 5 14 Q9 7 5 0" stroke="rgba(239,123,65,0.35)" strokeWidth="1.5" strokeLinecap="round" pathLength="1" />
                </svg>
              </div>
            </div>
          )}

          <div className="orb-slot" data-orb-slot />

          {isBrainReady && (
            <>
              {hasAnalysis && (
                <button
                  type="button"
                  className="brain-node brain-node--audio"
                  onClick={() => onNavigate('/analysis')}
                >
                  <span className="brain-node__check" aria-hidden="true">✓</span>
                  <span className="brain-node__label">audio</span>
                  <span className="brain-node__status">done</span>
                </button>
              )}

              {!hasScript ? (
                <button
                  type="button"
                  className="brain-script"
                  onClick={() => onNavigate('/script')}
                >
                  <span className="brain-script__card">
                    <span className="popup-label">script</span>
                    <span className="popup-arrow">→</span>
                  </span>
                  <span className="brain-script__connector" aria-hidden="true">
                    <svg width="10" height="44" viewBox="0 0 10 44" fill="none">
                      <path d="M5 44 Q9 35 5 28 Q1 21 5 14 Q9 7 5 0" stroke="rgba(239,123,65,0.55)" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="brain-node brain-node--script"
                    onClick={() => onNavigate('/script-analysis')}
                  >
                    <span className="brain-node__check" aria-hidden="true">✓</span>
                    <span className="brain-node__label">script</span>
                    <span className="brain-node__status">done</span>
                  </button>

                  <button
                    type="button"
                    className="brain-choice brain-choice--characters"
                    onClick={() => onNavigate('/characters')}
                  >
                    <span className="brain-choice__label">Characters</span>
                    <span className="brain-choice__status">next</span>
                  </button>

                  <button
                    type="button"
                    className="brain-choice brain-choice--locations"
                    onClick={() => onNavigate('/locations')}
                  >
                    <span className="brain-choice__label">Locations</span>
                    <span className="brain-choice__status">next</span>
                  </button>
                </>
              )}

              {showShots && (
                <div className="brain-shots-wrap">
                  <button
                    type="button"
                    className={`brain-shots${shotsReady ? ' is-ready' : ''}`}
                    onClick={handleShots}
                  >
                    <img src="/rocket.png" alt="" className="brain-shots__icon" />
                    <span className="brain-shots__label">Shots</span>
                    <span className="brain-shots__status">{shotsReady ? 'launch' : 'next'}</span>
                  </button>

                  {warned && !shotsReady && (
                    <div className="brain-shots__warning" role="alert">
                      <span className="brain-shots__cat"><AgentCatIcon /></span>
                      <div className="brain-shots__warning-body">
                        <strong>Hold on —</strong> your characters or locations aren&apos;t generated yet.
                        Shots come out best once they are. Click again to launch anyway.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {isFresh && (
          <div className="cta-label" data-anim>
            <span className="cta-cursor" aria-hidden="true">
              <DotLottieReact src="/mouse-animation-warm.lottie" autoplay loop className="cta-lottie" />
            </span>
            <span className="cta-text"><span className="cta-word-click">CLICK</span> THE ORB TO START</span>
          </div>
        )}

        {isLoadingProject && (
          <div className="brain-status" role="status">
            <span className="brain-status__spinner" aria-hidden="true" />
            <span className="brain-status__text">Loading your project…</span>
          </div>
        )}

        {isErrorProject && (
          <div className="brain-status brain-status--error" role="alert">
            <span className="brain-status__text">Couldn&apos;t load this project. Check your connection and try again.</span>
            <button type="button" className="brain-status__retry" onClick={onRetry}>Retry</button>
          </div>
        )}
      </div>
    </main>
  );
}
