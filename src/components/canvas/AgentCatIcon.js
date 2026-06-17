// Shared "cat agent" mark — used by the canvas agent bubble and the brain-hub
// shots warning.
export default function AgentCatIcon() {
  return (
    <span className="entity-agent__cat" aria-hidden="true">
      <svg viewBox="0 0 120 92" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="22,40 13,6 48,32" fill="#ef7b41" />
        <polygon points="98,40 107,6 72,32" fill="#ef7b41" />
        <polygon points="25,38 20,15 44,33" fill="#c85f2e" />
        <polygon points="95,38 100,15 76,33" fill="#c85f2e" />
        <path d="M14 46 Q14 78 60 78 Q106 78 106 46 Q106 30 60 30 Q14 30 14 46 Z" fill="#ef7b41" />
        <ellipse cx="60" cy="52" rx="35" ry="20" fill="#f8b58d" />
        <path d="M42 51 q6 -7 12 0" stroke="#272423" strokeWidth="3.2" fill="none" strokeLinecap="round" />
        <path d="M66 51 q6 -7 12 0" stroke="#272423" strokeWidth="3.2" fill="none" strokeLinecap="round" />
        <path d="M55 59 q5 5 10 0" stroke="#272423" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <ellipse cx="38" cy="80" rx="10" ry="7.5" fill="#ef7b41" />
        <ellipse cx="82" cy="80" rx="10" ry="7.5" fill="#ef7b41" />
      </svg>
    </span>
  );
}
