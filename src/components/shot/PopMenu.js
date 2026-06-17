'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const rootRem = () => {
  if (typeof window === 'undefined') return 16;
  return Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
};

// A dropdown rendered into a body portal so it escapes the shot card's
// `overflow: hidden` and the canvas transform. Positioned at the trigger's
// screen rect (1:1, so it stays readable regardless of canvas zoom). Closes on
// outside pointer-down or on canvas pan/resize.
export default function PopMenu({ anchorRef, open, onClose, align = 'left', children }) {
  const [pos, setPos] = useState(null);
  const menuRef = useRef(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    const rem = rootRem();
    setPos({
      top: (r.bottom + 4) / rem,
      left: (align === 'right' ? r.right : r.left) / rem,
      width: r.width / rem,
    });
  }, [open, anchorRef, align]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (menuRef.current?.contains(event.target) || anchorRef.current?.contains(event.target)) return;
      onClose();
    };
    const onShift = () => onClose();
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', onShift, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', onShift, true);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !pos || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      className="pop-menu"
      role="listbox"
      style={{
        position: 'fixed',
        top: `${pos.top}rem`,
        left: `${pos.left}rem`,
        minWidth: `${pos.width}rem`,
        transform: align === 'right' ? 'translateX(-100%)' : 'none',
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}
