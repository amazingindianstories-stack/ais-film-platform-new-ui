'use client';

function ToolButton({ label, tool, onTool, children }) {
  return (
    <button className="tool-btn" aria-label={label} onClick={() => onTool(tool)} type="button">
      {children}
    </button>
  );
}

export default function CanvasToolsPill({ onTool }) {
  return (
    <div className="pill pill-tools">
      <ToolButton label="Undo" tool="undo" onTool={onTool}>
        <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 14 4 9l5-5" /><path d="M4 9h9.5a5.5 5.5 0 0 1 0 11H11" />
        </svg>
      </ToolButton>
      <ToolButton label="Redo" tool="redo" onTool={onTool}>
        <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 14l5-5-5-5" /><path d="M18 9H8.5a5.5 5.5 0 0 0 0 11H11" />
        </svg>
      </ToolButton>
      <ToolButton label="Fit view" tool="fit" onTool={onTool}>
        <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8V3h5M14 3h5v5M19 14v5h-5M8 19H3v-5" />
        </svg>
      </ToolButton>
      <ToolButton label="Rearrange canvas" tool="rearrange" onTool={onTool}>
        <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5h5v5H4zM13 5h5v5h-5zM4 14h5v3H4zM13 14h5v3h-5z" /><path d="M9 7.5h4M9 15.5h4" />
        </svg>
      </ToolButton>
      <ToolButton label="Toggle minimap" tool="minimap" onTool={onTool}>
        <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.75">
          <circle cx="13.5" cy="9.5" r="5.5" /><circle cx="8.5" cy="13.5" r="4" />
        </svg>
      </ToolButton>
      <ToolButton label="Zoom in" tool="zoom-in" onTool={onTool}>
        <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          <circle cx="10" cy="10" r="6.5" /><path d="M15 15L19.5 19.5M10 7v6M7 10h6" />
        </svg>
      </ToolButton>
      <ToolButton label="Zoom out" tool="zoom-out" onTool={onTool}>
        <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          <circle cx="10" cy="10" r="6.5" /><path d="M15 15L19.5 19.5M7 10h6" />
        </svg>
      </ToolButton>
    </div>
  );
}
