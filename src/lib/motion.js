/**
 * Shared Framer Motion variants — Deep Studio theme.
 * All variants share hidden / visible / exit keys so they're swappable.
 *
 * Reduced motion: pass `shouldReduceMotion ? fadeIn : slideUp` etc.
 */

// ── Easing curves ──────────────────────────────────────────────────────────────

// Decisive ease-out: fast initial movement, clean stop.
export const EASE_OUT = [0.16, 1, 0.3, 1];

// Crisp: faster start than EASE_OUT — for snappy UI feedback.
export const EASE_CRISP = [0.2, 0, 0, 1];

// iOS drawer: aggressive deceleration, physically "pulled in".
export const EASE_DRAWER = [0.32, 0.72, 0, 1];

// Balanced ease-in-out for on-screen movement between two positions.
export const EASE_IN_OUT = [0.76, 0, 0.24, 1];

// ── Duration scale (seconds) ───────────────────────────────────────────────────
export const DUR = {
  instant: 0.10, // 100ms — press / active feedback
  micro:   0.14, // 140ms — hover color, border changes
  fast:    0.16, // 160ms — tooltips, small elements
  ui:      0.20, // 200ms — tabs, dropdowns, most entering UI
  panel:   0.26, // 260ms — side panels, modals
  slow:    0.40, // 400ms — marketing / decorative
};

// Exit is always faster than enter.
const EXIT = { duration: 0.14, ease: 'easeIn' };

// ── fadeIn ─────────────────────────────────────────────────────────────────────
export const fadeIn = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DUR.ui, ease: EASE_OUT } },
  exit:    { opacity: 0, transition: EXIT },
};

// ── scaleIn ────────────────────────────────────────────────────────────────────
// Scale from 0.96 — never from 0.
export const scaleIn = {
  hidden:  { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: DUR.ui, ease: EASE_OUT } },
  exit:    { opacity: 0, scale: 0.96, transition: EXIT },
};

// ── slideUp ────────────────────────────────────────────────────────────────────
export const slideUp = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: DUR.ui, ease: EASE_OUT } },
  exit:    { opacity: 0, y: 6, transition: EXIT },
};

// ── slideInFromLeft ────────────────────────────────────────────────────────────
// For StageRail or elements entering from the left edge.
export const slideInFromLeft = {
  hidden:  { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: { duration: DUR.panel, ease: EASE_CRISP } },
  exit:    { opacity: 0, x: -12, transition: EXIT },
};

// ── modalOverlay ───────────────────────────────────────────────────────────────
export const modalOverlay = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DUR.ui, ease: 'easeOut' } },
  exit:    { opacity: 0, transition: { duration: DUR.fast, ease: 'easeIn' } },
};

// ── modalContent ───────────────────────────────────────────────────────────────
// transform-origin stays center — modals are viewport-centered.
export const modalContent = {
  hidden:  { opacity: 0, scale: 0.96, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: DUR.panel, ease: EASE_OUT } },
  exit:    { opacity: 0, scale: 0.96, y: 8, transition: EXIT },
};

// ── dropdown ───────────────────────────────────────────────────────────────────
export const dropdown = {
  hidden:  { opacity: 0, scale: 0.95, y: -4 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: DUR.fast, ease: EASE_CRISP } },
  exit:    { opacity: 0, scale: 0.95, y: -4, transition: { duration: 0.11, ease: 'easeIn' } },
};

// ── drawer ─────────────────────────────────────────────────────────────────────
export const drawer = {
  hidden:  { opacity: 0, x: '100%' },
  visible: { opacity: 1, x: 0, transition: { duration: DUR.panel, ease: EASE_DRAWER } },
  exit:    { opacity: 0, x: '100%', transition: { duration: DUR.fast, ease: 'easeIn' } },
};

// ── sidePanel ──────────────────────────────────────────────────────────────────
// Inline panel entering from right within a flex-row layout.
export const sidePanel = {
  hidden:  { opacity: 0, x: 24 },
  visible: { opacity: 1, x: 0, transition: { duration: DUR.panel, ease: EASE_CRISP } },
  exit:    { opacity: 0, x: 24, transition: { duration: DUR.fast, ease: 'easeIn' } },
};

// ── listItemStagger ────────────────────────────────────────────────────────────
export const listItemStagger = {
  hidden:  { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.045, delayChildren: 0 },
  },
};

// ── listItem ───────────────────────────────────────────────────────────────────
export const listItem = {
  hidden:  { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: DUR.ui, ease: EASE_OUT } },
};
