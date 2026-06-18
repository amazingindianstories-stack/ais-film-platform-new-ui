'use client';

export default function PlayerCat() {
  return (
    <div className="player-cat" data-anim aria-hidden="true">
      <svg viewBox="0 0 120 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="34,26 28,4 52,24" fill="#ef7b41" />
        <polygon points="86,26 92,4 68,24" fill="#ef7b41" />
        <path d="M22 38 Q22 20 60 20 Q98 20 98 38 Q98 50 60 50 Q22 50 22 38 Z" fill="#ef7b41" />
        <ellipse cx="50" cy="33" rx="9" ry="11" fill="#fff" />
        <ellipse cx="70" cy="33" rx="9" ry="11" fill="#fff" />
        <circle cx="50" cy="31" r="4" fill="#272423" />
        <circle cx="70" cy="31" r="4" fill="#272423" />
        <ellipse cx="40" cy="54" rx="9" ry="6" fill="#ef7b41" />
        <ellipse cx="80" cy="54" rx="9" ry="6" fill="#ef7b41" />
      </svg>
    </div>
  );
}
