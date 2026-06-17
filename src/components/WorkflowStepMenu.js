'use client';

import { useEffect, useRef, useState } from 'react';

// Mirrors the real screens this new UI ships, in workflow order. The Brain Hub is
// the always-available home; later steps unlock as project state is saved.
const STEPS = [
  { key: 'dashboard', name: 'Dashboard', route: '/dashboard' },
  { key: 'brain', name: 'Brain Hub', route: '/brain' },
  { key: 'audio', name: 'Audio Upload', route: '/audio' },
  { key: 'player', name: 'Music Player', route: '/player', needs: 'audio' },
  { key: 'analysis', name: 'Audio Analysis', route: '/analysis', needs: 'analysis' },
  { key: 'script', name: 'Script Upload', route: '/script', needs: 'analysis' },
  { key: 'script-analysis', name: 'Script Analysis', route: '/script-analysis', needs: 'script' },
  { key: 'characters', name: 'Characters', route: '/characters', needs: 'script' },
  { key: 'locations', name: 'Locations', route: '/locations', needs: 'script' },
  { key: 'shots', name: 'Shots', route: '/shots', needs: 'shots' },
  { key: 'clips', name: 'Clips', pending: true },
  { key: 'editor', name: 'Editor', pending: true },
];

const hasAnalysis = (studio) => studio.analysisStatus === 'ready' || Boolean(studio.analysis);

function canOpenStep(step, studio) {
  if (step.pending) return false;
  if (step.needs === 'audio') return Boolean(studio.previewUrl || studio.audioUrl || studio.uploadStatus === 'uploaded');
  if (step.needs === 'analysis') return hasAnalysis(studio);
  if (step.needs === 'script') return Boolean(studio.script);
  if (step.needs === 'shots') return hasAnalysis(studio) && Boolean(studio.script);
  return true; // dashboard, brain hub, audio upload — always available
}

function stepReason(step, studio) {
  if (step.pending) return 'Coming soon';
  if (canOpenStep(step, studio)) return 'Ready';
  if (step.needs === 'audio') return 'Needs audio';
  if (step.needs === 'analysis') return 'Needs analysis';
  if (step.needs === 'script') return 'Needs script';
  if (step.needs === 'shots') return 'Needs audio + script';
  return 'Ready';
}

function navigateTo(route) {
  window.dispatchEvent(new CustomEvent('canvas:navigate', { detail: { path: route } }));
}

export default function WorkflowStepMenu({ studio }) {
  const [activeRoute, setActiveRoute] = useState('/dashboard');
  const [isOpen, setIsOpen] = useState(false);
  const shellRef = useRef(null);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      setActiveRoute(document.body.dataset.route || '/dashboard');
    }

    const onRouteChange = (event) => {
      const path = event.detail?.path;
      if (typeof path === 'string') setActiveRoute(path);
    };

    window.addEventListener('canvas:route-change', onRouteChange);
    return () => window.removeEventListener('canvas:route-change', onRouteChange);
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;

    const onPointerDown = (event) => {
      if (!shellRef.current?.contains(event.target)) setIsOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  return (
    <aside className="workflow-menu-shell" ref={shellRef} aria-label="Workflow menu">
      <div className="pill pill-profile">
        <div className="avatar-ring">
          <svg className="avatar-placeholder" viewBox="0 0 44 44" fill="none">
            <defs>
              <radialGradient id="av" cx="50%" cy="35%" r="55%">
                <stop offset="0%" stopColor="#b8aeaa" />
                <stop offset="100%" stopColor="#3a3533" />
              </radialGradient>
            </defs>
            <circle cx="22" cy="22" r="22" fill="url(#av)" />
            <circle cx="22" cy="17" r="7" fill="rgba(255,255,255,0.25)" />
            <ellipse cx="22" cy="36" rx="12" ry="9" fill="rgba(255,255,255,0.2)" />
          </svg>
        </div>
        <button
          className="starburst-btn"
          aria-controls="workflow-step-menu"
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Close workflow menu' : 'Open workflow menu'}
          onClick={() => setIsOpen((value) => !value)}
          type="button"
        >
          <svg className="starburst-svg" viewBox="0 0 46 46" fill="none">
            <polygon
              points="23,1 27.4,6.6 34,3.95 35.02,10.98 42.05,12 39.42,18.6 45,23 39.42,27.4 42.05,34 35.02,35.02 34,42.05 27.4,39.42 23,45 18.6,39.42 12,42.05 10.98,35.02 3.95,34 6.58,27.4 1,23 6.58,18.6 3.95,12 10.98,10.98 12,3.95 18.6,6.58"
              fill="#ef7b41"
            />
          </svg>
          <span className="hamburger" aria-hidden="true"><span /><span /><span /></span>
        </button>
      </div>

      {isOpen && (
        <nav className="workflow-menu-panel" id="workflow-step-menu" aria-label="Production steps">
          <div className="workflow-menu-panel__header">
            <span>Workflow</span>
            <span>{STEPS.length}</span>
          </div>

          <div className="workflow-menu-panel__list">
            {STEPS.map((step, index) => {
              const isActive = step.route === activeRoute;
              const isEnabled = canOpenStep(step, studio);

              return (
                <button
                  aria-current={isActive ? 'step' : undefined}
                  className={`workflow-menu-step${isActive ? ' is-active' : ''}${!isEnabled ? ' is-disabled' : ''}`}
                  disabled={!isEnabled}
                  key={step.key}
                  onClick={() => {
                    if (!step.route) return;
                    navigateTo(step.route);
                    setIsOpen(false);
                  }}
                  title={`${step.name} - ${stepReason(step, studio)}`}
                  type="button"
                >
                  <span className="workflow-menu-step__index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="workflow-menu-step__copy">
                    <span className="workflow-menu-step__name">{step.name}</span>
                    <span className="workflow-menu-step__status">{stepReason(step, studio)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </aside>
  );
}
