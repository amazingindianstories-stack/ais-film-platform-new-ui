'use client';

export default function FoxMascot() {
  return (
    <div className="mascot" aria-hidden="true">
      <svg viewBox="0 0 80 68" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="8,42 3,12 28,34" fill="#ef7b41" />
        <polygon points="10,41 6,17 26,34" fill="#c85f2e" />
        <polygon points="60,42 65,12 40,34" fill="#ef7b41" />
        <polygon points="58,41 62,17 42,34" fill="#c85f2e" />
        <ellipse cx="34" cy="56" rx="31" ry="30" fill="#ef7b41" />
        <ellipse cx="34" cy="60" rx="21" ry="20" fill="#f8b58d" />
        <ellipse cx="22" cy="50" rx="4" ry="4" fill="#272423" />
        <ellipse cx="46" cy="50" rx="4" ry="4" fill="#272423" />
        <circle cx="23.5" cy="48.5" r="1.3" fill="white" />
        <circle cx="47.5" cy="48.5" r="1.3" fill="white" />
        <ellipse cx="34" cy="61" rx="2.5" ry="1.8" fill="#7e3519" />
        <path d="M30.5 64.5 Q34 67.5 37.5 64.5" stroke="#7e3519" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      </svg>
    </div>
  );
}
