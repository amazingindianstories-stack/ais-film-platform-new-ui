/* ─────────────────────────────────────────────────────────────────
   Client router + GSAP "cat transform" transition
   ----------------------------------------------------------------
   Route changes use history.pushState (no reload). The orb is the cat:
   on the way to /audio it dives to the bottom (only ~30% in frame),
   then the cat's head unfolds upward into the middle, opens its mouth
   (the upload dropzone) and sprouts ears, glasses, paws and text —
   piece by piece, like a cartoon. Back reverses the whole thing.

   GSAP owns every transform on the orb and the cat pieces. The lone
   start-screen CTA still uses the small CSS build (animateScreen).
   ───────────────────────────────────────────────────────────────── */

const gsap = window.gsap;
const gsapReady = typeof gsap !== 'undefined';

const orb     = document.getElementById('orb');
const orbBtn  = orb?.querySelector('.orb-btn');
const screens = [...document.querySelectorAll('.screen')];

const HOME = '/';

/* CSS-build timing for the start-screen CTA only. */
const ENTER_DUR = 520, EXIT_DUR = 300, STAGGER = 70, ENTER_LEAD = 130;
const ENTER_EASE = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const EXIT_EASE  = 'cubic-bezier(0.4, 0, 1, 1)';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let activeTL = null;
let leavingScreen = null;

function screenFor(path) {
  return screens.find((s) => s.dataset.route === path) || screens[0];
}

/* ── Start-screen CTA build (CSS keyframes) ────────────────────── */
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

/* ── Orb target (overlay the active screen's slot) ─────────────── */
function orbTargetFor(path) {
  const slot = screenFor(path).querySelector('[data-orb-slot]');
  if (!slot) return null;                       // screens without an orb (e.g. /analysis)
  const r = slot.getBoundingClientRect();
  const base = orb.offsetWidth || 1;          // --orb-base px (ignores transform)
  return { x: r.left, y: r.top, scale: r.width / base };
}

function primeOrbOrigins() {
  gsap.set(orb,    { transformOrigin: '0 0' });        // position/scale anchor
  gsap.set(orbBtn, { transformOrigin: '50% 100%' });   // squash/stretch from the feet
}

/* ── Cat piece state (open = assembled, closed = collapsed) ────── */
const EARS = ['#cat-ear-l', '#cat-ear-r'];
const PAWS = ['#cat-paw-l', '#cat-paw-r'];

function setCatState(state) {
  const open = state === 'open';
  gsap.set('#cat-card',       { xPercent: -50, scaleX: open ? 1 : 0.6, scaleY: open ? 1 : 0, opacity: open ? 1 : 0, transformOrigin: '50% 100%' });
  gsap.set('#cat-mouth',      { scaleY: open ? 1 : 0, opacity: open ? 1 : 0, transformOrigin: '50% 0%' });
  gsap.set('#cat-mouth-text', { scale: open ? 1 : 0.5, opacity: open ? 1 : 0 });
  gsap.set('#cat-ear-l',      { rotation: -14, scaleY: open ? 1 : 0, opacity: open ? 1 : 0, transformOrigin: '50% 100%' });
  gsap.set('#cat-ear-r',      { rotation:  14, scaleY: open ? 1 : 0, opacity: open ? 1 : 0, transformOrigin: '50% 100%' });
  gsap.set('#cat-glasses',    { xPercent: -50, y: open ? 0 : -32, opacity: open ? 1 : 0, transformOrigin: '50% 50%' });
  gsap.set(PAWS,              { scaleY: open ? 1 : 0, opacity: open ? 1 : 0, transformOrigin: '50% 0%' });
  gsap.set('.screen-label',   { xPercent: -50, scale: open ? 1 : 0.6, opacity: open ? 1 : 0, transformOrigin: '50% 50%' });
  gsap.set('.particle-stream',{ xPercent: -50, scaleY: open ? 1 : 0, opacity: open ? 1 : 0, transformOrigin: '50% 0%' });
}

function dropLeaving() {
  if (leavingScreen) leavingScreen.classList.remove('is-leaving');
}

/* ── Forward: start → /audio  (the cat assembles) ──────────────── */
function buildForwardTL(target) {
  setCatState('closed');
  const tl = gsap.timeline({ onComplete: dropLeaving });

  // 1. Anticipation crouch
  tl.to(orbBtn, { scaleX: 1.18, scaleY: 0.8, duration: 0.16, ease: 'power2.in' });

  // 2. Cat dives to the bottom, stretching, then settles with a wobble
  tl.to(orb,    { x: target.x, y: target.y, scale: target.scale, duration: 0.6, ease: 'power3.inOut' }, 0.1);
  tl.to(orbBtn, { scaleX: 0.84, scaleY: 1.28, duration: 0.3, ease: 'power2.out' }, '<');
  tl.to(orbBtn, { scaleX: 1, scaleY: 1, duration: 0.45, ease: 'elastic.out(1, 0.45)' }, '>');

  // 3. Title pops in
  tl.to('.screen-label', { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.6)' }, 0.28);

  // 4. The head unfolds upward into the middle
  tl.to('#cat-card', { scaleY: 1, scaleX: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.5)' }, 0.42);

  // 5. The mouth opens (audio dropzone)
  tl.to('#cat-mouth', { scaleY: 1, opacity: 1, duration: 0.36, ease: 'power2.out' }, '-=0.16');

  // 6. Ears sprout, glasses drop, paws pop
  tl.to(EARS,        { scaleY: 1, opacity: 1, duration: 0.34, ease: 'back.out(2.4)', stagger: 0.09 }, '-=0.24');
  tl.to('#cat-glasses', { y: 0, opacity: 1, duration: 0.32, ease: 'back.out(1.8)' }, '-=0.2');
  tl.to(PAWS,        { scaleY: 1, opacity: 1, duration: 0.28, ease: 'back.out(2)', stagger: 0.09 }, '-=0.22');

  // 7. Text in the mouth + the particle stream down to the body
  tl.to('#cat-mouth-text', { scale: 1, opacity: 1, duration: 0.28, ease: 'power2.out' }, '-=0.1');
  tl.to('.particle-stream', { scaleY: 1, opacity: 1, duration: 0.42, ease: 'power2.out' }, '-=0.28');

  return tl;
}

/* ── Reverse: /audio → start  (the cat folds away) ─────────────── */
function buildReverseTL(target) {
  const tl = gsap.timeline({ onComplete: dropLeaving });

  tl.to('#cat-mouth-text', { scale: 0.5, opacity: 0, duration: 0.15 });
  tl.to('.particle-stream', { scaleY: 0, opacity: 0, duration: 0.18 }, '<');
  tl.to(PAWS, { scaleY: 0, opacity: 0, duration: 0.2, stagger: 0.05 }, '-=0.06');
  tl.to('#cat-glasses', { y: -32, opacity: 0, duration: 0.2 }, '<');
  tl.to(EARS, { scaleY: 0, opacity: 0, duration: 0.2, stagger: 0.05 }, '-=0.12');
  tl.to('#cat-mouth', { scaleY: 0, opacity: 0, duration: 0.2 }, '-=0.12');
  tl.to('.screen-label', { scale: 0.6, opacity: 0, duration: 0.2 }, '<');
  tl.to('#cat-card', { scaleY: 0, scaleX: 0.6, opacity: 0, duration: 0.3, ease: 'back.in(1.4)' }, '-=0.08');

  // Body hops back up to the centre
  tl.to(orb, { x: target.x, y: target.y, scale: target.scale, duration: 0.6, ease: 'power3.inOut' }, '-=0.28');
  tl.to(orbBtn, { scaleX: 1.12, scaleY: 0.88, duration: 0.16, ease: 'power2.in' }, '<');
  tl.to(orbBtn, { scaleX: 1, scaleY: 1, duration: 0.36, ease: 'elastic.out(1, 0.5)' }, '>');

  return tl;
}

/* ── Generic orb glide (no cat assembly) — used for /player ─────── */
function buildGlideTL(target) {
  const tl = gsap.timeline({ onComplete: dropLeaving });
  tl.to(orbBtn, { scaleX: 1.12, scaleY: 0.88, duration: 0.16, ease: 'power2.in' });
  tl.to(orb,    { x: target.x, y: target.y, scale: target.scale, duration: 0.6, ease: 'power3.inOut' }, 0.1);
  tl.to(orbBtn, { scaleX: 1, scaleY: 1, duration: 0.4, ease: 'elastic.out(1, 0.5)' }, '>');
  return tl;
}

/* ── Orchestration ─────────────────────────────────────────────── */
function runTransition(path, animate) {
  // ── Player screen: orb peeks from the bottom (like /audio) but with no
  //    cat-card assembly; the panel + cat build in. ──
  if (path === '/player') {
    if (gsapReady) gsap.set(orb, { autoAlpha: 1 });
    else orb.style.opacity = '1';
    animateScreen(screenFor('/player'), 'in');
    const slotTarget = orbTargetFor('/player');
    if (!gsapReady || !slotTarget) {
      if (slotTarget) orb.style.transform = `translate(${slotTarget.x}px, ${slotTarget.y}px) scale(${slotTarget.scale})`;
      dropLeaving();
      return;
    }
    primeOrbOrigins();
    if (activeTL) activeTL.kill();
    setCatState('closed');
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

  // ── Analysis screen has no orb — hide it and build the panels in ──
  if (path === '/analysis') {
    if (activeTL) activeTL.kill();
    if (gsapReady) gsap.to(orb, { autoAlpha: 0, duration: 0.3, ease: 'power2.out' });
    else orb.style.opacity = '0';
    if (animate && leavingScreen) animateScreen(leavingScreen, 'out');
    animateScreen(screenFor('/analysis'), 'in');
    dropLeaving();
    return;
  }

  // Any other screen owns the orb — make sure it's visible again.
  if (gsapReady) gsap.set(orb, { autoAlpha: 1 });
  else orb.style.opacity = '1';

  const target = orbTargetFor(path);
  if (!target) { dropLeaving(); return; }

  if (!gsapReady) {                              // graceful fallback: snap
    orb.style.transform = `translate(${target.x}px, ${target.y}px) scale(${target.scale})`;
    dropLeaving();
    return;
  }

  primeOrbOrigins();
  if (activeTL) activeTL.kill();

  if (!animate) {                                // initial load / resize snap
    gsap.set(orb, { x: target.x, y: target.y, scale: target.scale });
    gsap.set(orbBtn, { scaleX: 1, scaleY: 1 });
    setCatState(path === '/audio' ? 'open' : 'closed');
    dropLeaving();
    if (path === HOME) animateScreen(screenFor(HOME), 'in');
    return;
  }

  if (path === '/audio') {
    activeTL = buildForwardTL(target);
    if (leavingScreen) animateScreen(leavingScreen, 'out');   // start CTA out
  } else {
    activeTL = buildReverseTL(target);
    animateScreen(screenFor(HOME), 'in');                     // start CTA in
  }
}

function render(path, animate) {
  const toScreen = screenFor(path);
  leavingScreen = screens.find((s) => s.classList.contains('is-active') && s !== toScreen) || null;
  document.body.dataset.route = path;

  toScreen.classList.add('is-active');
  toScreen.classList.remove('is-leaving');
  if (leavingScreen) {
    leavingScreen.classList.remove('is-active');
    leavingScreen.classList.add('is-leaving');     // stay painted during the timeline
  }

  requestAnimationFrame(() => runTransition(path, animate));
}

function navigate(path) {
  if (path === location.pathname) return;
  history.pushState({}, '', path);
  render(path, true);
}

orbBtn?.addEventListener('click', () => {
  if (location.pathname === HOME) navigate('/audio');
});

window.addEventListener('popstate', () => render(location.pathname, true));
window.addEventListener('resize', () => {
  if (!gsapReady) return;
  primeOrbOrigins();
  gsap.set(orb, orbTargetFor(location.pathname));
});

/* ── Drag & drop on the dropzone (click-to-browse via <label>) ─── */
const dropzone = document.querySelector('.dropzone');
if (dropzone) {
  ['dragenter', 'dragover'].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('is-drag'); }),
  );
  ['dragleave', 'drop'].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('is-drag'); }),
  );
  // Dropping an audio file advances to the player screen.
  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length) navigate('/player');
  });
}

// Choosing a file via the browse picker advances to the player screen.
const dropInput = document.querySelector('.dropzone-input');
if (dropInput) {
  dropInput.addEventListener('change', () => {
    if (dropInput.files && dropInput.files.length) navigate('/player');
  });
}

// Player screen → ANALYSE runs the (mock) analysis and shows results.
const analyseBtn = document.querySelector('.analyse-btn');
if (analyseBtn) analyseBtn.addEventListener('click', () => navigate('/analysis'));

// Analysis screen actions: Upload New → back to upload, Analyse Again → player.
const analysisActions = document.querySelectorAll('.analysis-actions .aa-btn');
if (analysisActions.length === 2) {
  analysisActions[0].addEventListener('click', () => navigate('/audio'));   // Upload New
  analysisActions[1].addEventListener('click', () => navigate('/player'));  // Analyse Again
}

/* ── Init ──────────────────────────────────────────────────────── */
document.body.classList.add('anim-ready');
render(location.pathname, false);
