function EntityList({ emptyLabel, names }) {
  if (!names.length) {
    return <div className="entity-empty">{emptyLabel}</div>;
  }

  return (
    <div className="entity-list">
      {names.map((name, index) => (
        <article className="entity-card" key={name}>
          <span className="entity-card__index">{String(index + 1).padStart(2, '0')}</span>
          <span className="entity-card__name">{name}</span>
        </article>
      ))}
    </div>
  );
}

export default function EntityNameScreen({
  emptyLabel,
  names,
  nextLabel,
  onBack,
  onNext,
  route,
  title,
  type,
}) {
  return (
    <div className={`screen screen-entity screen-${type}`} data-route={route}>
      <section className="entity-screen">
        <h1 className="analysis-title" data-anim>{title}</h1>

        <div className="entity-actions" data-anim>
          <div className="analysis-actions">
            <button className="aa-btn" type="button" onClick={onBack}>Brain</button>
            {nextLabel && <button className="aa-btn aa-btn--next" type="button" onClick={onNext}>{nextLabel}</button>}
          </div>
        </div>

        <div className="entity-shell">
          <div className="aa-panel entity-panel" data-anim>
            <div className="entity-panel__head">
              <span>{title}</span>
              <span>{names.length}</span>
            </div>
            <EntityList emptyLabel={emptyLabel} names={names} />
          </div>
        </div>
      </section>
    </div>
  );
}
