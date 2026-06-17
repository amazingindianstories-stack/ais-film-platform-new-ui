'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildKnowledgeBase } from '@/lib/backendClient';

export function useShotPlanCheckpoint({
  navigateCanvas,
  studio,
  updateKnowledgeBase,
  updateShotPlan,
}) {
  const [gate, setGate] = useState({ open: false, continueOnSave: false });
  const hasShotPlan = Boolean(studio.shotList?.length);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (hasShotPlan) document.body.dataset.shotPlanReady = '1';
    else delete document.body.dataset.shotPlanReady;
  }, [hasShotPlan]);

  useEffect(() => {
    const openGate = () => setGate({ open: true, continueOnSave: true });
    window.addEventListener('canvas:shot-plan-required', openGate);
    return () => window.removeEventListener('canvas:shot-plan-required', openGate);
  }, []);

  const close = useCallback(() => {
    setGate({ open: false, continueOnSave: false });
  }, []);

  const openEditor = useCallback(() => {
    setGate({ open: true, continueOnSave: false });
  }, []);

  const buildKb = useCallback(async () => {
    if (!studio.projectId || studio.projectIsDemo) return null;
    const res = await buildKnowledgeBase(studio.projectId);
    if (res?.knowledge_base) updateKnowledgeBase(res.knowledge_base);
    return res?.knowledge_base || null;
  }, [studio.projectId, studio.projectIsDemo, updateKnowledgeBase]);

  const saved = useCallback((payload) => {
    updateShotPlan(payload);
    const shouldContinue = gate.continueOnSave;
    close();
    if (shouldContinue) navigateCanvas('/shots', { force: true });
  }, [close, gate.continueOnSave, navigateCanvas, updateShotPlan]);

  const checkpointProps = useMemo(() => ({
    continueOnSave: gate.continueOnSave,
    open: gate.open,
    projectId: studio.projectId,
    projectState: studio.projectState,
    shotList: studio.shotList || [],
    shotListMeta: studio.shotListMeta,
    onBuildKnowledgeBase: buildKb,
    onClose: close,
    onSaved: saved,
  }), [buildKb, close, gate.continueOnSave, gate.open, saved, studio]);

  return { checkpointProps, hasShotPlan, openShotPlanEditor: openEditor };
}
