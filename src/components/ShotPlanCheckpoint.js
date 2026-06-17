'use client';

import { useEffect, useRef, useState } from 'react';
import AgentCatIcon from '@/components/canvas/AgentCatIcon';
import { generateShotPlan, parseShotPlanText, saveShotPlan } from '@/lib/shotPlanClient';

function planText(shots) {
  return Array.isArray(shots) && shots.length ? JSON.stringify(shots, null, 2) : '';
}

export default function ShotPlanCheckpoint({
  continueOnSave = false,
  open,
  projectId,
  projectState,
  shotList = [],
  shotListMeta,
  onBuildKnowledgeBase,
  onClose,
  onSaved,
}) {
  const fileRef = useRef(null);
  const [manualText, setManualText] = useState('');
  const [shots, setShots] = useState([]);
  const [source, setSource] = useState('');
  const [coverageNotes, setCoverageNotes] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!open) return;
    const initialShots = Array.isArray(shotList) ? shotList : [];
    setShots(initialShots);
    setManualText(planText(initialShots));
    setSource(shotListMeta?.source || (initialShots.length ? 'existing' : ''));
    setCoverageNotes(shotListMeta?.coverage_notes || '');
    setStatus(initialShots.length ? `${initialShots.length} saved shots loaded` : 'Shot plan required before Studio');
    setBusy('');
  }, [open, shotList, shotListMeta]);

  if (!open) return null;

  const loadShots = (value, nextSource) => {
    const parsed = parseShotPlanText(value);
    if (!parsed.length) {
      setStatus('No shots found');
      return;
    }
    setShots(parsed);
    setManualText(planText(parsed));
    setSource(nextSource);
    setCoverageNotes(`${parsed.length} shots ready from ${nextSource}.`);
    setStatus(`${parsed.length} shots loaded`);
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (/pdf/i.test(file.type) || /\.pdf$/i.test(file.name || '')) {
        setStatus('PDF parsing is coming next. Use JSON, TXT, or paste for now.');
        return;
      }
      const text = await file.text();
      setManualText(text);
      loadShots(text, 'upload');
    } catch (error) {
      setStatus(error.message || 'File could not be read');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleGenerate = async () => {
    if (!projectId) {
      setStatus('Open a saved project first');
      return;
    }
    setBusy('generate');
    setStatus('Building project context');
    try {
      const kb = await onBuildKnowledgeBase?.();
      const planningState = {
        ...(projectState || {}),
        ...(kb ? { knowledge_base: kb } : {}),
      };
      setStatus('Generating shot plan');
      const data = await generateShotPlan(planningState);
      const generated = data.shots || data.shot_list || [];
      if (!generated.length) throw new Error('No shots were generated');
      setShots(generated);
      setManualText(planText(generated));
      setSource('ai');
      setCoverageNotes(data.coverage_notes || 'Shot plan generated from project context.');
      setStatus(`${generated.length} shots generated`);
    } catch (error) {
      setStatus(error.message || 'Shot plan generation failed');
    } finally {
      setBusy('');
    }
  };

  const handleSave = async () => {
    const parsed = parseShotPlanText(manualText);
    const currentShots = parsed.length ? parsed : shots;
    if (!currentShots.length) {
      setStatus('Load, paste, or generate shots first');
      return;
    }
    if (!projectId) {
      setStatus('Open a saved project first');
      return;
    }

    setBusy('save');
    setStatus('Saving shot plan');
    try {
      const data = await saveShotPlan({
        projectId,
        shots: currentShots,
        source: source || 'manual',
        coverage_notes: coverageNotes,
      });
      onSaved?.({ shotList: data.shot_list || [], shotListMeta: data.shot_list_meta || null });
    } catch (error) {
      setStatus(error.message || 'Shot plan save failed');
    } finally {
      setBusy('');
    }
  };

  return (
    <aside className="shot-plan-checkpoint" data-canvas-ui role="dialog" aria-modal="true" aria-label="Shot plan checkpoint">
      <div className="shot-plan-checkpoint__scrim" onClick={onClose} />
      <section className="shot-plan-checkpoint__panel">
        <div className="shot-plan-checkpoint__cat" aria-hidden="true"><AgentCatIcon /></div>
        <header className="shot-plan-checkpoint__head">
          <span>{continueOnSave ? 'Flight Checkpoint' : 'Edit Shot Plan'}</span>
          <span>{shots.length ? `${shots.length} shots` : 'Draft required'}</span>
        </header>

        <div className="shot-plan-checkpoint__actions">
          <button type="button" disabled={Boolean(busy)} onClick={() => fileRef.current?.click()}>Upload</button>
          <button type="button" disabled={Boolean(busy)} onClick={() => loadShots(manualText, 'manual')}>Preview Text</button>
          <button type="button" disabled={Boolean(busy)} onClick={handleGenerate}>
            {busy === 'generate' ? 'Generating' : 'Generate'}
          </button>
        </div>

        <input
          ref={fileRef}
          className="shot-plan-checkpoint__file"
          type="file"
          accept=".json,.txt,.pdf,application/json,text/plain,application/pdf"
          onChange={handleFile}
        />

        <textarea
          className="shot-plan-checkpoint__paste"
          value={manualText}
          placeholder="Paste or edit shot-list text / JSON"
          onChange={(event) => setManualText(event.target.value)}
        />

        <div className="shot-plan-checkpoint__preview">
          {shots.length ? shots.slice(0, 5).map((shot, index) => (
            <span key={shot.id || shot.n || shot.title || index}>{shot.n || shot.title || `Shot ${index + 1}`}</span>
          )) : <span>No draft loaded yet</span>}
        </div>

        {status && <div className="shot-plan-checkpoint__status">{status}</div>}

        <footer className="shot-plan-checkpoint__foot">
          <button type="button" disabled={Boolean(busy)} onClick={onClose}>
            {continueOnSave ? 'Back to Brain' : 'Close'}
          </button>
          <button type="button" disabled={Boolean(busy)} onClick={handleSave}>
            {busy === 'save' ? 'Saving' : continueOnSave ? 'Save & Launch' : 'Save Plan'}
          </button>
        </footer>
      </section>
    </aside>
  );
}
