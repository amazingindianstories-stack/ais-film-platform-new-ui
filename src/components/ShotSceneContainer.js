function sceneLinks(areas = [], container) {
  if (!container || areas.length < 2) return [];
  return areas.slice(0, -1).map((area, index) => {
    const next = areas[index + 1];
    const startX = area.x - container.x + area.w + 0.55;
    const startY = area.y - container.y + area.h / 2;
    const endX = next.x - container.x - 0.55;
    const endY = next.y - container.y + next.h / 2;
    const midX = startX + Math.max((endX - startX) / 2, 1.8);
    return {
      id: `${area.id}-${next.id}`,
      d: `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`,
    };
  });
}

export default function ShotSceneContainer({ areas = [], container, children }) {
  if (!container) return null;
  const links = sceneLinks(areas, container);

  return (
    <section
      className="shot-scene-container"
      data-shot-scene-container
      style={{
        '--container-x': container.x,
        '--container-y': container.y,
        '--container-w': container.w,
        '--container-h': container.h,
      }}
    >
      <div className="shot-scene-container__chrome" aria-hidden="true" />
      {links.length > 0 && (
        <svg
          aria-hidden="true"
          className="studio-scene-links"
          preserveAspectRatio="none"
          viewBox={`0 0 ${container.w} ${container.h}`}
        >
          <defs>
            <marker id="studio-scene-link-arrow" markerHeight="0.7" markerWidth="0.7" orient="auto" refX="0.65" refY="0.35">
              <path d="M 0 0 L 0.7 0.35 L 0 0.7 Z" />
            </marker>
          </defs>
          {links.map((link) => (
            <path d={link.d} key={link.id} markerEnd="url(#studio-scene-link-arrow)" />
          ))}
        </svg>
      )}
      <div className="shot-scene-container__body">
        {children}
      </div>
    </section>
  );
}
