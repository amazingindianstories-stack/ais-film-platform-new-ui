'use client';

import { useEffect, useMemo, useState } from 'react';
import { scriptEntityNames } from '@/lib/scriptEntities';

function truncate(value, length = 160) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length).trimEnd()}...` : text;
}

function sceneSummary(scene) {
  return truncate(
    scene?.visual
    || scene?.description
    || scene?.text
    || scene?.script
    || scene?.lyrics
    || scene?.summary
    || ''
  );
}

function makeScene(scene, index) {
  const visual = sceneSummary(scene) || String(scene || '').trim();
  return {
    ...(typeof scene === 'object' && scene ? scene : {}),
    id: scene?.id || scene?.scene_id || `scene-${index + 1}`,
    visual,
  };
}

function sceneSeed(scriptScenes, fallbackSections) {
  const source = scriptScenes.length ? scriptScenes : fallbackSections;
  return source.map(makeScene).filter((scene) => scene.visual);
}

function ScriptCat() {
  return (
    <div className="analysis-cat" aria-hidden="true">
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
    </div>
  );
}

export default function ScriptAnalysisScreen({ studio, onEditScript, onNext, onSaveScenes }) {
  const scriptObj = studio.script || {};
  const wholeScript = scriptObj.raw_text || scriptObj.storyline || scriptObj.summary || '';
  const scriptScenes = Array.isArray(scriptObj.scenes) ? scriptObj.scenes : [];
  const fallbackSections = !scriptScenes.length && wholeScript
    ? wholeScript.split(/\n{2,}/).map((section) => section.trim()).filter(Boolean).slice(0, 14)
    : [];
  const scriptCharacters = scriptEntityNames(studio, 'characters');
  const scriptLocations = scriptEntityNames(studio, 'locations');
  const seed = useMemo(() => sceneSeed(scriptScenes, fallbackSections), [scriptScenes, fallbackSections]);
  const seedSig = useMemo(() => seed.map((scene) => `${scene.id}:${scene.visual}`).join('|'), [seed]);
  const [draftScenes, setDraftScenes] = useState(seed);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [dragIndex, setDragIndex] = useState(-1);

  useEffect(() => {
    setDraftScenes(seed);
    setDirty(false);
    setStatus('');
  }, [seedSig]); // eslint-disable-line react-hooks/exhaustive-deps

  const markScenes = (updater) => {
    setDraftScenes((prev) => updater(prev));
    setDirty(true);
    setStatus('');
  };

  const updateScene = (index, value) => {
    markScenes((prev) => prev.map((scene, i) => (i === index ? { ...scene, visual: value } : scene)));
  };

  const insertScene = (index) => {
    markScenes((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, { id: `user-scene-${Date.now()}`, visual: '' });
      return next;
    });
  };

  const removeScene = (index) => {
    markScenes((prev) => prev.filter((_, i) => i !== index));
  };

  const moveScene = (from, to) => {
    if (from === to || from < 0 || to < 0) return;
    markScenes((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const saveScenes = async () => {
    const scenes = draftScenes.map((scene) => ({ ...scene, visual: String(scene.visual || '').trim() })).filter((scene) => scene.visual);
    if (!scenes.length) {
      setStatus('Add at least one scene');
      return false;
    }
    if (!onSaveScenes) return true;
    setBusy(true);
    setStatus('');
    try {
      await onSaveScenes(scenes);
      setDirty(false);
      setStatus('Scenes saved');
      return true;
    } catch (error) {
      setStatus(error.message || 'Save failed');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleNext = async () => {
    if (dirty) {
      const ok = await saveScenes();
      if (!ok) return;
    }
    onNext?.();
  };

  return (
    <div className="screen screen-script-analysis" data-route="/script-analysis">
      <section className="analysis-screen">
        <h1 className="analysis-title" data-anim>SCRIPT ANALYSIS</h1>

        <div className="analysis-speak" data-anim>
          <ScriptCat />
          <div className="analysis-actions">
            <button className="aa-btn" type="button" onClick={onEditScript}>Edit Script</button>
            <button className="aa-btn" type="button" disabled={busy || !dirty} onClick={saveScenes}>Save Scenes</button>
            <button className="aa-btn aa-btn--next" type="button" disabled={busy} onClick={handleNext}>Next</button>
          </div>
        </div>
        {status && <div className="sa-status" data-anim>{status}</div>}

        <div className="sa-grid">
          <div className="aa-panel sa-col sa-col--script" data-anim>
            <div className="sa-head"><span>Full Script</span></div>
            <div className="sa-scroll">
              {wholeScript
                ? <div className="sa-script-text">{wholeScript}</div>
                : <div className="sa-empty">Upload or generate a script to see it here</div>}
            </div>
          </div>

          <div className="aa-panel sa-col" data-anim>
            <div className="sa-head">
              <span>Scenes</span>
              <span>{scriptScenes.length || fallbackSections.length || 0}</span>
            </div>
            <div className="sa-scroll">
              {draftScenes.length ? (
                draftScenes.map((scene, index) => (
                  <div
                    className="sa-scene sa-scene--editable"
                    draggable
                    key={scene.id || index}
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => { event.preventDefault(); moveScene(dragIndex, index); setDragIndex(-1); }}
                  >
                    <div className="sa-scene__meta">
                      <span>Scene {index + 1}</span>
                      {Number.isFinite(Number(scene.start)) && <span>{Math.round(Number(scene.start))}s</span>}
                    </div>
                    <textarea
                      className="sa-scene__input"
                      value={scene.visual || ''}
                      onChange={(event) => updateScene(index, event.target.value)}
                    />
                    <div className="sa-scene__tools">
                      <button type="button" onClick={() => insertScene(index)}>Insert After</button>
                      <button type="button" disabled={index === 0} onClick={() => moveScene(index, index - 1)}>Up</button>
                      <button type="button" disabled={index === draftScenes.length - 1} onClick={() => moveScene(index, index + 1)}>Down</button>
                      <button type="button" onClick={() => removeScene(index)}>Remove</button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="sa-empty">No scenes yet</div>
              )}
            </div>
          </div>

          <div className="aa-panel sa-col" data-anim>
            <div className="sa-head"><span>Extracted</span></div>
            <div className="sa-scroll">
              <div className="sa-group">
                <div className="sa-group__label">Characters</div>
                {scriptCharacters.length
                  ? <div className="sa-chips">{scriptCharacters.map((name) => <span className="sa-chip" key={name}>{name}</span>)}</div>
                  : <div className="sa-empty">None detected</div>}
              </div>
              <div className="sa-group">
                <div className="sa-group__label">Locations</div>
                {scriptLocations.length
                  ? <div className="sa-chips">{scriptLocations.map((name) => <span className="sa-chip" key={name}>{name}</span>)}</div>
                  : <div className="sa-empty">None detected</div>}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
