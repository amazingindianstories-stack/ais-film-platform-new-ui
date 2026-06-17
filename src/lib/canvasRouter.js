'use client';

/* ─────────────────────────────────────────────────────────────────
   GSAP "cat transform" router — ported from the static prototype's
   router.js into a single init function driven by React (no history;
   navigation is state-free and operates on the already-rendered DOM).

   The orb is the cat: → /audio it dives to the bottom then the head
   unfolds, mouth (dropzone) opens, ears/glasses/paws/text build in.
   → /player the orb glides to the bottom (no cat assembly).
   → /analysis the orb hides and the result panels build in.
   ───────────────────────────────────────────────────────────────── */

import { gsap } from 'gsap';

export function initCanvas({ onAudioFileSelected, onAnalyzeRequested } = {}) {
  const gsapReady = typeof gsap !== 'undefined';
  const orb = document.getElementById('orb');
  const orbBtn = orb?.querySelector('.orb-btn');
  const screens = [...document.querySelectorAll('.screen')];
  const DASHBOARD = '/dashboard';
  const START = '/brain';
  const HOME = DASHBOARD;

  const ENTER_DUR = 520, EXIT_DUR = 300, STAGGER = 70, ENTER_LEAD = 130;
  const ENTER_EASE = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
  const EXIT_EASE = 'cubic-bezier(0.4, 0, 1, 1)';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let activeTL = null;
  let leavingScreen = null;
  let currentPath = HOME;
  let isHandlingFile = false;
  let isHandlingAnalyze = false;

  // ── URL ⇄ screen mapping (seamless per-screen routing: /<projectId>/<screen>) ──
  const SCREEN_SEGMENT = {
    '/audio': 'audio',
    '/player': 'player',
    '/analysis': 'analysis',
    '/script': 'script',
    '/script-analysis': 'script-analysis',
    '/characters': 'characters',
    '/locations': 'locations',
    '/shots': 'shots',
  };
  const SEGMENT_ROUTE = {
    audio: '/audio',
    player: '/player',
    analysis: '/analysis',
    script: '/script',
    'script-analysis': '/script-analysis',
    characters: '/characters',
    locations: '/locations',
    shots: '/shots',
    brain: START,
  };
  const KNOWN_SEGMENTS = new Set([
    'dashboard',
    'audio',
    'player',
    'analysis',
    'start',
    'brain',
    'script',
    'script-analysis',
    'characters',
    'locations',
    'shots',
  ]);

  // The projectId comes from (in order): CanvasApp's body dataset, the path's first
  // segment (when not a screen word), or the legacy ?projectId= query.
  function getProjectId() {
    if (document.body.dataset.projectId) return document.body.dataset.projectId;
    const seg = location.pathname.split('/').filter(Boolean)[0];
    if (seg && !KNOWN_SEGMENTS.has(seg)) return decodeURIComponent(seg);
    return new URLSearchParams(location.search).get('projectId') || '';
  }

  function normalizeRoute(path) {
    return path === '/' ? START : path;
  }

  function urlForRoute(path) {
    path = normalizeRoute(path);
    const pid = getProjectId();
    if (path === DASHBOARD) return '/dashboard';
    if (path === START) return pid ? `/${pid}/brain` : '/';
    const seg = SCREEN_SEGMENT[path];
    if (seg) return pid ? `/${pid}/${seg}` : `/${seg}`;
    return pid ? `/${pid}` : '/';
  }

  function routeFromLocation() {
    const segs = location.pathname.split('/').filter(Boolean);
    if (!segs.length) return DASHBOARD;                       // bare '/' → dashboard (home)
    if (segs[0] === 'dashboard') return DASHBOARD;
    if (KNOWN_SEGMENTS.has(segs[0])) return SEGMENT_ROUTE[segs[0]] || START; // legacy /audio
    const screen = segs[1];                                   // segs[0] is the projectId
    if (screen && SEGMENT_ROUTE[screen]) return SEGMENT_ROUTE[screen];
    return START;                                             // /<projectId> → brain hub
  }

  const screenFor = (path) => (
    screens.find((s) => s.dataset.route === normalizeRoute(path))
    || (path === START ? screens.find((s) => s.dataset.route === '/') : null)
    || screens.find((s) => s.dataset.route === path)
    || screens.find((s) => s.dataset.route === HOME)
    || screens[0]
  );

  function animateScreen(screen, mode) {
    const items = [...screen.querySelectorAll('[data-anim]')];
    if (reduceMotion) {
      items.forEach((el) => { el.style.animation = ''; el.style.opacity = mode === 'in' ? '1' : '0'; });
      return;
    }
    items.forEach((el, i) => {
      el.style.animation = 'none';
      void el.offsetWidth;
      if (mode === 'in') {
        el.style.animation = `build-in ${ENTER_DUR}ms ${ENTER_EASE} ${ENTER_LEAD + i * STAGGER}ms both`;
      } else {
        el.style.animation = `build-out ${EXIT_DUR}ms ${EXIT_EASE} ${i * 40}ms both`;
      }
    });
  }

  function orbTargetFor(path) {
    const slot = screenFor(path).querySelector('[data-orb-slot]');
    if (!slot) return null;
    const r = slot.getBoundingClientRect();
    const base = orb.offsetWidth || 1;
    return { x: r.left, y: r.top, scale: r.width / base };
  }

  function primeOrbOrigins() {
    gsap.set(orb, { transformOrigin: '0 0' });
    gsap.set(orbBtn, { transformOrigin: '50% 100%' });
  }

  // Cat pieces are queried by class WITHIN a given screen, so the same
  // assembly works on every cat-dropzone screen (Audio, Script, …).
  function catParts(screenEl) {
    if (!screenEl) return null;
    const q = (sel) => screenEl.querySelector(sel);
    return {
      card: q('.upload-card'),
      mouth: q('.dropzone'),
      mouthText: q('.dropzone-text'),
      ears: [q('.card-ear--l'), q('.card-ear--r')].filter(Boolean),
      glasses: q('.card-glasses'),
      paws: [q('.card-foot--l'), q('.card-foot--r')].filter(Boolean),
      label: q('.screen-label'),
      stream: q('.particle-stream'),
    };
  }

  function setCatState(screenEl, state) {
    const p = catParts(screenEl);
    if (!p) return;
    const open = state === 'open';
    if (p.card) gsap.set(p.card, { xPercent: -50, scaleX: open ? 1 : 0.6, scaleY: open ? 1 : 0, opacity: open ? 1 : 0, transformOrigin: '50% 100%' });
    if (p.mouth) gsap.set(p.mouth, { scaleY: open ? 1 : 0, opacity: open ? 1 : 0, transformOrigin: '50% 0%' });
    if (p.mouthText) gsap.set(p.mouthText, { scale: open ? 1 : 0.5, opacity: open ? 1 : 0 });
    if (p.ears[0]) gsap.set(p.ears[0], { rotation: -14, scaleY: open ? 1 : 0, opacity: open ? 1 : 0, transformOrigin: '50% 100%' });
    if (p.ears[1]) gsap.set(p.ears[1], { rotation: 14, scaleY: open ? 1 : 0, opacity: open ? 1 : 0, transformOrigin: '50% 100%' });
    if (p.glasses) gsap.set(p.glasses, { xPercent: -50, y: open ? 0 : -32, opacity: open ? 1 : 0, transformOrigin: '50% 50%' });
    if (p.paws.length) gsap.set(p.paws, { scaleY: open ? 1 : 0, opacity: open ? 1 : 0, transformOrigin: '50% 0%' });
    if (p.label) gsap.set(p.label, { xPercent: -50, scale: open ? 1 : 0.6, opacity: open ? 1 : 0, transformOrigin: '50% 50%' });
    if (p.stream) gsap.set(p.stream, { xPercent: -50, scaleY: open ? 1 : 0, opacity: open ? 1 : 0, transformOrigin: '50% 0%' });
  }

  function dropLeaving() {
    if (leavingScreen) leavingScreen.classList.remove('is-leaving');
  }

  // The rocket launch warps the brain hub's `.main` and shows a full-screen rocket
  // overlay; both are normally cleared by the launch timeline's onComplete. If a
  // launch is interrupted (rapid nav, router re-init) that never runs and the brain
  // is left scaled/transparent/offset — so reset both defensively on every other
  // transition. This keeps the main hub clean and clickable no matter what.
  function resetLaunchArtifacts() {
    const rocket = document.getElementById('launch-rocket');
    const brainMain = screenFor(START)?.querySelector('.main');
    if (gsapReady) {
      if (rocket) gsap.set(rocket, { display: 'none', autoAlpha: 0 });
      if (brainMain) gsap.set(brainMain, { clearProps: 'transform,opacity,filter' });
    } else {
      if (rocket) rocket.style.display = 'none';
      if (brainMain) {
        brainMain.style.transform = '';
        brainMain.style.opacity = '';
        brainMain.style.filter = '';
      }
    }
  }

  function buildForwardTL(screenEl, target) {
    setCatState(screenEl, 'closed');
    const p = catParts(screenEl) || {};
    const tl = gsap.timeline({ onComplete: dropLeaving });
    tl.to(orbBtn, { scaleX: 1.18, scaleY: 0.8, duration: 0.16, ease: 'power2.in' });
    tl.to(orb, { x: target.x, y: target.y, scale: target.scale, duration: 0.6, ease: 'power3.inOut' }, 0.1);
    tl.to(orbBtn, { scaleX: 0.84, scaleY: 1.28, duration: 0.3, ease: 'power2.out' }, '<');
    tl.to(orbBtn, { scaleX: 1, scaleY: 1, duration: 0.45, ease: 'elastic.out(1, 0.45)' }, '>');
    if (p.label) tl.to(p.label, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.6)' }, 0.28);
    if (p.card) tl.to(p.card, { scaleY: 1, scaleX: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.5)' }, 0.42);
    if (p.mouth) tl.to(p.mouth, { scaleY: 1, opacity: 1, duration: 0.36, ease: 'power2.out' }, '-=0.16');
    if (p.ears?.length) tl.to(p.ears, { scaleY: 1, opacity: 1, duration: 0.34, ease: 'back.out(2.4)', stagger: 0.09 }, '-=0.24');
    if (p.glasses) tl.to(p.glasses, { y: 0, opacity: 1, duration: 0.32, ease: 'back.out(1.8)' }, '-=0.2');
    if (p.paws?.length) tl.to(p.paws, { scaleY: 1, opacity: 1, duration: 0.28, ease: 'back.out(2)', stagger: 0.09 }, '-=0.22');
    if (p.mouthText) tl.to(p.mouthText, { scale: 1, opacity: 1, duration: 0.28, ease: 'power2.out' }, '-=0.1');
    if (p.stream) tl.to(p.stream, { scaleY: 1, opacity: 1, duration: 0.42, ease: 'power2.out' }, '-=0.28');
    return tl;
  }

  function buildReverseTL(screenEl, target) {
    const p = catParts(screenEl) || {};
    const tl = gsap.timeline({ onComplete: dropLeaving });
    if (p.mouthText) tl.to(p.mouthText, { scale: 0.5, opacity: 0, duration: 0.15 });
    if (p.stream) tl.to(p.stream, { scaleY: 0, opacity: 0, duration: 0.18 }, '<');
    if (p.paws?.length) tl.to(p.paws, { scaleY: 0, opacity: 0, duration: 0.2, stagger: 0.05 }, '-=0.06');
    if (p.glasses) tl.to(p.glasses, { y: -32, opacity: 0, duration: 0.2 }, '<');
    if (p.ears?.length) tl.to(p.ears, { scaleY: 0, opacity: 0, duration: 0.2, stagger: 0.05 }, '-=0.12');
    if (p.mouth) tl.to(p.mouth, { scaleY: 0, opacity: 0, duration: 0.2 }, '-=0.12');
    if (p.label) tl.to(p.label, { scale: 0.6, opacity: 0, duration: 0.2 }, '<');
    if (p.card) tl.to(p.card, { scaleY: 0, scaleX: 0.6, opacity: 0, duration: 0.3, ease: 'back.in(1.4)' }, '-=0.08');
    tl.to(orb, { x: target.x, y: target.y, scale: target.scale, duration: 0.6, ease: 'power3.inOut' }, '-=0.28');
    tl.to(orbBtn, { scaleX: 1.12, scaleY: 0.88, duration: 0.16, ease: 'power2.in' }, '<');
    tl.to(orbBtn, { scaleX: 1, scaleY: 1, duration: 0.36, ease: 'elastic.out(1, 0.5)' }, '>');
    return tl;
  }

  function buildGlideTL(target) {
    const tl = gsap.timeline({ onComplete: dropLeaving });
    tl.to(orbBtn, { scaleX: 1.12, scaleY: 0.88, duration: 0.16, ease: 'power2.in' });
    tl.to(orb, { x: target.x, y: target.y, scale: target.scale, duration: 0.6, ease: 'power3.inOut' }, 0.1);
    tl.to(orbBtn, { scaleX: 1, scaleY: 1, duration: 0.4, ease: 'elastic.out(1, 0.5)' }, '>');
    return tl;
  }

  function parkOrbAtStart(hidden) {
    const target = orbTargetFor(START);
    if (!target) return;

    if (gsapReady) {
      primeOrbOrigins();
      gsap.set(orb, {
        x: target.x,
        y: target.y,
        scale: target.scale,
        autoAlpha: hidden ? 0 : 1,
      });
      gsap.set(orbBtn, { scaleX: 1, scaleY: 1 });
    } else {
      orb.style.opacity = hidden ? '0' : '1';
      orb.style.transform = `translate(${target.x}px, ${target.y}px) scale(${target.scale})`;
    }
  }

  function runTransition(path, animate) {
    // Any time we're not launching, make sure a previous (possibly interrupted)
    // launch left nothing behind: kill its timeline and reset the brain + rocket.
    if (path !== '/shots') {
      if (activeTL) { activeTL.kill(); activeTL = null; }
      resetLaunchArtifacts();
    }

    // Dashboard: no orb on the library surface; keep it parked for a clean start.
    if (path === DASHBOARD) {
      if (activeTL) activeTL.kill();
      if (animate && leavingScreen) animateScreen(leavingScreen, 'out');
      if (gsapReady && leavingScreen) setCatState(leavingScreen, 'closed');
      parkOrbAtStart(true);
      animateScreen(screenFor(DASHBOARD), 'in');
      dropLeaving();
      return;
    }

    // Start: the parked orb becomes interactive again.
    if (path === START) {
      const target = orbTargetFor(START);
      if (animate && leavingScreen) animateScreen(leavingScreen, 'out');
      animateScreen(screenFor(START), 'in');

      if (!target) { dropLeaving(); return; }

      if (!gsapReady) {
        orb.style.opacity = '1';
        orb.style.transform = `translate(${target.x}px, ${target.y}px) scale(${target.scale})`;
        dropLeaving();
        return;
      }

      primeOrbOrigins();
      if (activeTL) activeTL.kill();

      if (animate && (leavingScreen?.dataset.route === '/audio' || leavingScreen?.dataset.route === '/script')) {
        activeTL = buildReverseTL(leavingScreen, target);
        return;
      }

      activeTL = gsap.timeline({ onComplete: dropLeaving });
      activeTL.set(orb, { autoAlpha: 1 });
      activeTL.to(orb, {
        x: target.x,
        y: target.y,
        scale: target.scale,
        duration: animate ? 0.36 : 0,
        ease: 'power2.out',
      }, 0);
      activeTL.set(orbBtn, { scaleX: 1, scaleY: 1 }, 0);
      return;
    }

    // Player: orb peeks from the bottom with no cat assembly.
    if (path === '/player') {
      if (gsapReady) gsap.set(orb, { autoAlpha: 1 }); else orb.style.opacity = '1';
      animateScreen(screenFor('/player'), 'in');
      const slotTarget = orbTargetFor('/player');
      if (!gsapReady || !slotTarget) {
        if (slotTarget) orb.style.transform = `translate(${slotTarget.x}px, ${slotTarget.y}px) scale(${slotTarget.scale})`;
        dropLeaving();
        return;
      }
      primeOrbOrigins();
      if (activeTL) activeTL.kill();
      if (leavingScreen) setCatState(leavingScreen, 'closed');
      if (animate) {
        activeTL = buildGlideTL(slotTarget);
        if (leavingScreen) animateScreen(leavingScreen, 'out');
      } else {
        gsap.set(orb, { x: slotTarget.x, y: slotTarget.y, scale: slotTarget.scale });
        gsap.set(orbBtn, { scaleX: 1, scaleY: 1 });
        dropLeaving();
      }
      return;
    }

    // Shots: rocket launch — the cat boards the rocket, the brain warps into the
    // distance, and the infinite shots canvas zooms in from far away.
    if (path === '/shots') {
      if (activeTL) activeTL.kill();
      const shotsScreen = screenFor('/shots');
      const shotsCanvas = shotsScreen?.querySelector('.shots-canvas');
      const brainMain = screenFor(START)?.querySelector('.main');
      const rocket = document.getElementById('launch-rocket');
      const craft = rocket?.querySelector('.launch-rocket__craft');

      animateScreen(shotsScreen, 'in');

      const fancy = gsapReady && !reduceMotion && rocket && craft && brainMain
        && leavingScreen?.dataset.route === '/brain';

      if (!fancy) {
        if (gsapReady) gsap.set(orb, { autoAlpha: 0 }); else orb.style.opacity = '0';
        dropLeaving();
        return;
      }

      if (gsapReady) gsap.set(orb, { autoAlpha: 0 });
      gsap.set(rocket, { display: 'grid', autoAlpha: 1 });
      gsap.set(craft, { scale: 0.32, yPercent: 12, autoAlpha: 0, rotation: 0 });
      gsap.set(shotsCanvas, { transformOrigin: '50% 50%', scale: 1.35, autoAlpha: 0 });

      activeTL = gsap.timeline({
        onComplete: () => {
          gsap.set(rocket, { display: 'none' });
          gsap.set(craft, { clearProps: 'all' });
          if (brainMain) gsap.set(brainMain, { clearProps: 'transform,opacity,filter' });
          gsap.set(shotsCanvas, { clearProps: 'transform,opacity' });
          dropLeaving();
        },
      });
      // Cat boards + the rocket charges with a little shake.
      activeTL.to(craft, { scale: 0.72, yPercent: 4, autoAlpha: 1, duration: 0.42, ease: 'back.out(1.7)' });
      activeTL.to(craft, { x: '+=0.5rem', duration: 0.05, repeat: 5, yoyo: true, ease: 'none' }, '>-0.05');
      // Liftoff: brain warps into the distance, rocket zooms up and away.
      activeTL.to(brainMain, { scale: 1.8, autoAlpha: 0, filter: 'blur(12px)', duration: 0.8, ease: 'power2.in' }, '>');
      activeTL.to(craft, { yPercent: -160, scale: 1.5, duration: 0.85, ease: 'power2.in' }, '<');
      // The infinite shots canvas arrives from far away.
      activeTL.to(shotsCanvas, { scale: 1, autoAlpha: 1, duration: 0.7, ease: 'power2.out' }, '<0.28');
      activeTL.to(craft, { autoAlpha: 0, duration: 0.2 }, '>-0.25');
      return;
    }

    // Analysis and name-detail screens: no orb — hide it and build the panels in.
    if (path === '/analysis' || path === '/script-analysis' || path === '/characters' || path === '/locations') {
      if (activeTL) activeTL.kill();
      if (gsapReady) gsap.to(orb, { autoAlpha: 0, duration: 0.3, ease: 'power2.out' });
      else orb.style.opacity = '0';
      if (animate && leavingScreen) animateScreen(leavingScreen, 'out');
      animateScreen(screenFor(path), 'in');
      dropLeaving();
      return;
    }

    if (gsapReady) gsap.set(orb, { autoAlpha: 1 }); else orb.style.opacity = '1';

    const target = orbTargetFor(path);
    if (!target) { dropLeaving(); return; }

    if (!gsapReady) {
      orb.style.transform = `translate(${target.x}px, ${target.y}px) scale(${target.scale})`;
      dropLeaving();
      return;
    }

    primeOrbOrigins();
    if (activeTL) activeTL.kill();

    if (!animate) {
      gsap.set(orb, { x: target.x, y: target.y, scale: target.scale });
      gsap.set(orbBtn, { scaleX: 1, scaleY: 1 });
      setCatState(screenFor(path), (path === '/audio' || path === '/script') ? 'open' : 'closed');
      animateScreen(screenFor(path), 'in');
      dropLeaving();
      if (path === HOME) animateScreen(screenFor(HOME), 'in');
      return;
    }

    if (path === '/audio' || path === '/script') {
      activeTL = buildForwardTL(screenFor(path), target);
      animateScreen(screenFor(path), 'in');
      if (leavingScreen) animateScreen(leavingScreen, 'out');
    } else {
      activeTL = buildReverseTL(screenFor(path), target);
      animateScreen(screenFor(HOME), 'in');
    }
  }

  function render(path, animate) {
    const toScreen = screenFor(path);
    leavingScreen = screens.find((s) => s.classList.contains('is-active') && s !== toScreen) || null;
    document.body.dataset.route = path;
    window.dispatchEvent(new CustomEvent('canvas:route-change', { detail: { path } }));

    toScreen.classList.add('is-active');
    toScreen.classList.remove('is-leaving');
    if (leavingScreen) {
      leavingScreen.classList.remove('is-active');
      leavingScreen.classList.add('is-leaving');
    }
    requestAnimationFrame(() => runTransition(path, animate));
  }

  function navigate(path) {
    path = normalizeRoute(path);
    if (path === currentPath) return;
    // No-op if the target screen isn't built yet — avoids the
    // screenFor() fallback jumping to the wrong screen. Auto-works once added.
    if (!screens.some((s) => s.dataset.route === path || (path === START && s.dataset.route === '/'))) return;
    currentPath = path;
    const url = urlForRoute(path);
    if (url !== location.pathname) history.pushState({}, '', url);
    render(path, true);
  }

  // ── Wire interactions ──
  const onOrbClick = () => {
    // Fresh brain → the orb is the CTA to upload audio. Once the brain is
    // populated the orb is the knowledge base and the surrounding nodes drive nav.
    if (currentPath === START && !document.body.dataset.brainReady) navigate('/audio');
  };
  orbBtn?.addEventListener('click', onOrbClick);

  const onCanvasNavigate = (event) => {
    const path = event.detail?.path;
    if (path === '/shots' && !event.detail?.force && !document.body.dataset.shotPlanReady) {
      window.dispatchEvent(new CustomEvent('canvas:shot-plan-required'));
      return;
    }
    if (typeof path === 'string') navigate(path);
  };
  window.addEventListener('canvas:navigate', onCanvasNavigate);

  const onResize = () => {
    if (!gsapReady) return;
    primeOrbOrigins();
    const t = orbTargetFor(currentPath);
    if (t) gsap.set(orb, t);
  };
  window.addEventListener('resize', onResize);

  // Back/forward: re-derive the screen from the URL (no push).
  const onPopState = () => {
    const route = routeFromLocation();
    if (route === currentPath) return;
    currentPath = route;
    render(route, true);
  };
  window.addEventListener('popstate', onPopState);

  const dropzone = document.querySelector('.dropzone');
  const dragOn = (e) => { e.preventDefault(); dropzone.classList.add('is-drag'); };
  const dragOff = (e) => { e.preventDefault(); dropzone.classList.remove('is-drag'); };
  async function handleFiles(files) {
    const file = files?.[0];
    if (!file || isHandlingFile) return;
    isHandlingFile = true;
    try {
      const result = onAudioFileSelected
        ? await onAudioFileSelected(file)
        : { ok: true };
      if (result?.ok !== false) navigate('/player');
    } finally {
      isHandlingFile = false;
      if (dropInput) dropInput.value = '';
    }
  }

  const onDrop = (e) => {
    e.preventDefault();
    dropzone.classList.remove('is-drag');
    void handleFiles(e.dataTransfer?.files);
  };
  if (dropzone) {
    ['dragenter', 'dragover'].forEach((ev) => dropzone.addEventListener(ev, dragOn));
    ['dragleave', 'drop'].forEach((ev) => dropzone.addEventListener(ev, dragOff));
    dropzone.addEventListener('drop', onDrop);
  }

  const dropInput = document.querySelector('.dropzone-input');
  const onInput = () => { void handleFiles(dropInput.files); };
  dropInput?.addEventListener('change', onInput);

  const analyseBtn = document.querySelector('.analyse-btn');
  const onAnalyse = async () => {
    if (isHandlingAnalyze) return;
    isHandlingAnalyze = true;
    try {
      const result = onAnalyzeRequested
        ? await onAnalyzeRequested()
        : { ok: true };
      if (result?.ok !== false) navigate('/analysis');
    } finally {
      isHandlingAnalyze = false;
    }
  };
  analyseBtn?.addEventListener('click', onAnalyse);

  // ── Init ── (derive the starting screen from the current URL)
  document.body.classList.add('anim-ready');
  currentPath = routeFromLocation();
  render(currentPath, false);

  // ── Cleanup (React unmount / strict-mode re-run) ──
  return () => {
    if (activeTL) activeTL.kill();
    orbBtn?.removeEventListener('click', onOrbClick);
    window.removeEventListener('canvas:navigate', onCanvasNavigate);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('popstate', onPopState);
    if (dropzone) {
      ['dragenter', 'dragover'].forEach((ev) => dropzone.removeEventListener(ev, dragOn));
      ['dragleave', 'drop'].forEach((ev) => dropzone.removeEventListener(ev, dragOff));
      dropzone.removeEventListener('drop', onDrop);
    }
    dropInput?.removeEventListener('change', onInput);
    analyseBtn?.removeEventListener('click', onAnalyse);
  };
}
