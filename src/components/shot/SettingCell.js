'use client';

import { useRef, useState } from 'react';
import { stop } from '@/components/canvas/entityConfig';
import PopMenu from '@/components/shot/PopMenu';
import { ChevronIcon } from '@/components/shot/icons';

const optValue = (opt) => (opt && typeof opt === 'object' ? opt.value : opt);
const optLabel = (opt) => (opt && typeof opt === 'object' ? opt.label : opt);
const optSub = (opt) => (opt && typeof opt === 'object' ? opt.sub : undefined);

// One Technicals control: a labelled trigger that opens a portal dropdown of
// presets. `compact` is the top-row camera/lens/focal/aperture cell; `large` is
// the Shot Type / Angle picker that shows the label as a watermark until set.
export default function SettingCell({
  label,
  value,
  sub,
  icon,
  options = [],
  onChange,
  variant = 'compact',
  placeholder = 'Select',
  menuAlign = 'left',
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const hasValue = value !== '' && value != null;
  const display = hasValue ? value : placeholder;

  const choose = (opt) => {
    onChange?.(opt);
    setOpen(false);
  };

  return (
    <div className={`setting-cell setting-cell--${variant}${open ? ' is-open' : ''}${hasValue ? ' has-value' : ''}`} onPointerDown={stop}>
      <button
        ref={anchorRef}
        type="button"
        className="setting-cell__btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="setting-cell__label">{label}</span>
        {variant === 'compact' && icon && <span className="setting-cell__icon">{icon}</span>}
        <span className="setting-cell__value">{display}</span>
        {sub && <span className="setting-cell__sub">{sub}</span>}
        {variant === 'large' && <span className="setting-cell__chevron"><ChevronIcon /></span>}
      </button>

      <PopMenu anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} align={menuAlign}>
        {options.map((opt) => {
          const v = optValue(opt);
          const l = optLabel(opt);
          const s = optSub(opt);
          return (
            <button
              key={String(v)}
              type="button"
              role="option"
              aria-selected={v === value}
              className={`pop-menu__opt${v === value ? ' is-active' : ''}`}
              onClick={() => choose(opt)}
            >
              <span>{l}</span>
              {s && <small>{s}</small>}
            </button>
          );
        })}
      </PopMenu>
    </div>
  );
}
