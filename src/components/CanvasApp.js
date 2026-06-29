'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AnalysisLyricsPanel from '@/components/AnalysisLyricsPanel';
import BrainHubScreen from '@/components/BrainHubScreen';
import CanvasToolsPill from '@/components/CanvasToolsPill';
import ShotsScreen from '@/components/ShotsScreen';
import AgentCatIcon from '@/components/canvas/AgentCatIcon';
import DashboardScreen from '@/components/DashboardScreen';
import EntityCanvasScreen from '@/components/EntityCanvasScreen';
import FoxMascot from '@/components/canvas/FoxMascot';
import PlayerCat from '@/components/canvas/PlayerCat';
import AnalysisCat from '@/components/canvas/AnalysisCat';
import LoginScreen from '@/components/LoginScreen';
import MusicPlayer from '@/components/MusicPlayer';
import ScriptAnalysisScreen from '@/components/ScriptAnalysisScreen';
import ScriptUploadScreen from '@/components/ScriptUploadScreen';
import ShotPlanCheckpoint from '@/components/ShotPlanCheckpoint';
import WorkflowStepMenu from '@/components/WorkflowStepMenu';
import { initCanvas } from '@/lib/canvasRouter';
import {
  buildKnowledgeBase,
  saveCharacter,
  generateCharacter,
  GENERATE_CHARACTER_COST,
  saveLocation,
  generateLocation,
  GENERATE_LOCATION_COST,
  saveScriptAnalysis,
  saveWardrobe,
  saveShotstackExport,
} from '@/lib/backendClient';
import EditorScreen from '@/components/EditorScreen';
import { countTimedWords } from '@/lib/backendClient';
import { scriptEntityNames } from '@/lib/scriptEntities';
import { useShotPlanCheckpoint } from '@/hooks/useShotPlanCheckpoint';
import { useStudioBackend } from '@/hooks/useStudioBackend';

/* The full canvas: persistent orb + pills + mascot + all screens.
   GSAP transition engine is initialised against this DOM after mount. */
export default function CanvasApp() {
  const [currentRoute, setCurrentRoute] = useState('/dashboard');

  useEffect(() => {
    if (typeof document !== 'undefined') {
      setCurrentRoute(document.body.dataset.route || '/dashboard');
    }
    const onRouteChange = (event) => {
      const path = event.detail?.path;
      if (typeof path === 'string') setCurrentRoute(path);
    };
    window.addEventListener('canvas:route-change', onRouteChange);
    return () => window.removeEventListener('canvas:route-change', onRouteChange);
  }, []);
  const {
    state: studio,
    projectLabel,
    formattedDuration,
    selectAudioFile,
    analyzeTrack,
    selectScriptFile,
    generateScript,
    analyzeScript,
    setAudioDuration,
    selectProject,
    hydrateProject,
    updateCharacters,
    updateLocations,
    updateWardrobe,
    updateScript,
    updateShotPlan,
    updateKnowledgeBase,
    updateCredits,
    updateShotstackExport,
  } = useStudioBackend();
  const backendHandlers = useRef({ selectAudioFile, analyzeTrack });
  const hasAutoOpenedProjectRef = useRef(false);

  useEffect(() => {
    backendHandlers.current = { selectAudioFile, analyzeTrack };
  }, [selectAudioFile, analyzeTrack]);

  // Self-heal the brain hub: the rocket launch warps `.main` and shows a rocket
  // overlay; if a launch is interrupted those inline styles can linger and leave
  // the hub invisible/offset/unclickable. Whenever we land on /brain, strip them.
  // (Lives here so it survives Fast Refresh even if the router module is stale.)
  useEffect(() => {
    const heal = () => {
      const main = document.querySelector('.screen-start .main');
      if (main) { main.style.transform = ''; main.style.opacity = ''; main.style.filter = ''; }
      const rocket = document.getElementById('launch-rocket');
      if (rocket) rocket.style.display = 'none';
    };
    const onRoute = (event) => { if (event.detail?.path === '/brain') requestAnimationFrame(heal); };
    window.addEventListener('canvas:route-change', onRoute);
    if (document.body.dataset.route === '/brain') heal();
    return () => window.removeEventListener('canvas:route-change', onRoute);
  }, []);

  useEffect(() => {
    const cleanup = initCanvas({
      onAudioFileSelected: (file) => backendHandlers.current.selectAudioFile(file),
      onAnalyzeRequested: () => backendHandlers.current.analyzeTrack(),
    });
    return cleanup;
  }, []);

  // Auto-recover a project that failed to hydrate: when the tab regains focus
  // (e.g. after the backend is brought back up), retry the load in the background.
  useEffect(() => {
    const retry = () => {
      if (!document.hidden && studio.projectId && !studio.projectIsDemo && studio.loadError) {
        hydrateProject(studio.projectId);
      }
    };
    window.addEventListener('focus', retry);
    document.addEventListener('visibilitychange', retry);
    return () => {
      window.removeEventListener('focus', retry);
      document.removeEventListener('visibilitychange', retry);
    };
  }, [studio.projectId, studio.projectIsDemo, studio.loadError, hydrateProject]);

  // Global scroll listener for infinite background pattern parallax.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleScroll = (e) => {
      const target = e.target;
      if (target && target.closest) {
        const screenNode = target.closest('.screen');
        // Update the global background scroll if the scrolling element is the screen layer itself,
        // or its immediate container (like .dashboard-screen, .analysis-screen)
        if (screenNode && (target === screenNode || target.parentElement === screenNode)) {
          const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
          document.documentElement.style.setProperty('--bg-scroll-x', `-${target.scrollLeft / rem}rem`);
          document.documentElement.style.setProperty('--bg-scroll-y', `-${target.scrollTop / rem}rem`);
        }
      }
    };
    // Capture phase so we can catch non-bubbling scroll events on scrollable children.
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, []);

  const navigateCanvas = useCallback((path, detail = {}) => {
    window.dispatchEvent(new CustomEvent('canvas:navigate', { detail: { ...detail, path } }));
  }, []);
  const dispatchCanvasTool = useCallback((tool) => {
    window.dispatchEvent(new CustomEvent('entity-canvas:tool', { detail: { tool } }));
  }, []);

  const handleOpenProject = useCallback((project) => {
    const projectId = typeof project === 'string' ? project : project?.id;
    if (!projectId) return;

    const isDemo = Boolean(project?.is_demo || String(projectId).startsWith('demo-'));
    selectProject(projectId, {
      audioName: project?.title,
      audioUrl: project?.audio_url,
      isDemo,
      project,
    });

    // Hand the projectId to the router so it builds /<projectId>/<screen> URLs.
    if (isDemo) delete document.body.dataset.projectId;
    else document.body.dataset.projectId = projectId;

    const analysis = project?.project_state?.analysis || {};
    const hasSavedAnalysis = Boolean(
      project?.has_analysis
      || analysis.summary
      || analysis.genre
      || analysis.mood
      || analysis.bpm
      || analysis.lyrics?.length
    );
    const hasSavedAudio = Boolean(project?.audio_url || project?.has_audio);
    const targetPath = isDemo
      ? '/'
      : hasSavedAnalysis ? '/analysis' : hasSavedAudio ? '/player' : '/';

    hasAutoOpenedProjectRef.current = true;
    window.dispatchEvent(new CustomEvent('canvas:navigate', { detail: { path: targetPath } }));
  }, [selectProject]);

  // Keep the router's projectId (used to build /<projectId>/<screen> URLs) in sync
  // whenever the backend hydrates a project — e.g. from a deep-linked path on load.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (studio.projectId && !studio.projectIsDemo) {
      document.body.dataset.projectId = studio.projectId;
    } else if (studio.projectIsDemo) {
      delete document.body.dataset.projectId;
    }
  }, [studio.projectId, studio.projectIsDemo]);

  useEffect(() => {
    if (hasAutoOpenedProjectRef.current) return;
    if (!studio.projectId || studio.projectIsDemo) return;
    // Only auto-jump from the dashboard. If the user deep-linked / navigated to a
    // specific screen (e.g. /script-analysis), respect it — don't bounce to /analysis.
    if (typeof document !== 'undefined' && document.body.dataset.route !== '/dashboard') return;

    if (studio.analysisStatus === 'ready') {
      hasAutoOpenedProjectRef.current = true;
      window.dispatchEvent(new CustomEvent('canvas:navigate', { detail: { path: '/analysis' } }));
      return;
    }

    if (studio.uploadStatus === 'uploaded' && studio.audioUrl) {
      hasAutoOpenedProjectRef.current = true;
      window.dispatchEvent(new CustomEvent('canvas:navigate', { detail: { path: '/player' } }));
    }
  }, [
    studio.analysisStatus,
    studio.audioUrl,
    studio.projectId,
    studio.projectIsDemo,
    studio.uploadStatus,
  ]);

  const lyrics = useMemo(() => studio.analysis?.lyrics || [], [studio.analysis]);
  const timedWordCount = useMemo(() => countTimedWords(lyrics), [lyrics]);
  const isUploading = studio.uploadStatus === 'uploading';
  const isAnalyzing = studio.analysisStatus === 'analyzing';
  const canAnalyze = Boolean(studio.projectId && studio.audioUrl && !isUploading && !isAnalyzing);
  const hasAudio = studio.uploadStatus === 'uploaded' || Boolean(studio.audioUrl);
  const playerStatus = studio.error
    || (isUploading ? 'Saving audio to the backend...'
      : studio.analysisStatus === 'ready' ? 'Saved analysis loaded. You can review it or analyse again.'
      : studio.uploadStatus === 'uploaded' ? 'Audio saved. Ready for analysis.'
        : studio.uploadStatus === 'local' ? 'Local preview only. Connect a project before analysis.'
          : `${projectLabel} · backend bridge ready`);
  const analysisSummary = studio.analysis?.summary || 'Run analysis to extract the song insights.';
  const analysisMood = studio.analysis?.mood || 'Pending';
  const analysisGenre = studio.analysis?.genre || 'Pending';
  const analysisBpm = studio.analysis?.bpm || '—';
  // Brain becomes the hub once audio analysis or script-derived entity work exists.
  const hasAnalysis = studio.analysisStatus === 'ready'
    || Boolean(studio.analysis && (studio.analysis.summary || studio.analysis.lyrics?.length));
  const isExtractingScript = studio.scriptStatus === 'extracting';
  const isGeneratingScript = studio.scriptStatus === 'generating';
  const scriptBusy = isExtractingScript || isGeneratingScript;
  const hasScript = Boolean(studio.script);
  const hasLyrics = Boolean(studio.analysis?.lyrics?.length);
  const savedCharacters = useMemo(() => (Array.isArray(studio.characters) ? studio.characters : []), [studio.characters]);
  const characterNames = useMemo(() => {
    const scriptNames = scriptEntityNames(studio, 'characters');
    const savedNames = savedCharacters.map((c) => c?.name).filter(Boolean);
    return Array.from(new Set([...scriptNames, ...savedNames]));
  }, [studio, savedCharacters]);
  const savedLocations = useMemo(() => (Array.isArray(studio.locations) ? studio.locations : []), [studio.locations]);
  const locationNames = useMemo(() => {
    const scriptNames = scriptEntityNames(studio, 'locations');
    const savedNames = savedLocations.map((l) => l?.name).filter(Boolean);
    return Array.from(new Set([...scriptNames, ...savedNames]));
  }, [studio, savedLocations]);
  const hasScriptFlow = hasScript || characterNames.length > 0 || locationNames.length > 0;
  const { checkpointProps, hasShotPlan, openShotPlanEditor } = useShotPlanCheckpoint({
    navigateCanvas,
    studio,
    updateKnowledgeBase,
    updateShotPlan,
  });

  // Shots are "ready" once at least one character AND one location have been
  // generated (their canonical lock is in the knowledge base). Otherwise the
  // rocket still launches, but the cat warns first.
  const shotsReady = savedCharacters.some((c) => c?.generated) && savedLocations.some((l) => l?.generated);

  // Automatic, debounced knowledge-base build after character edits. The server
  // route also enforces its own cooldown, so rapid edits never spam the agent.
  const kbTimerRef = useRef(null);
  const scheduleKnowledgeBuild = useCallback(() => {
    if (!studio.projectId || studio.projectIsDemo) return;
    if (kbTimerRef.current) clearTimeout(kbTimerRef.current);
    kbTimerRef.current = setTimeout(() => {
      buildKnowledgeBase(studio.projectId).catch(() => {});
    }, 6000);
  }, [studio.projectId, studio.projectIsDemo]);

  const handleSaveScriptScenes = useCallback(async (scenes) => {
    if (!studio.projectId || studio.projectIsDemo) {
      throw new Error('Open a saved project to save script scenes.');
    }
    const res = await saveScriptAnalysis({ projectId: studio.projectId, scenes });
    if (res?.script) updateScript(res.script);
    return res;
  }, [studio.projectId, studio.projectIsDemo, updateScript]);

  const handleSaveCharacter = useCallback(async (payload) => {
    const res = await saveCharacter({ projectId: studio.projectId, ...payload });
    if (Array.isArray(res?.characters)) updateCharacters(res.characters);
    scheduleKnowledgeBuild();
    return res;
  }, [studio.projectId, scheduleKnowledgeBuild, updateCharacters]);

  // "Generate Character" on a card: purify the linked template into a canonical
  // identity lock + feed the knowledge base. Costs placeholder credits.
  const handleGenerateCharacter = useCallback(async (characterName) => {
    if (!studio.projectId || studio.projectIsDemo) {
      throw new Error('Open a saved project to generate characters.');
    }
    const res = await generateCharacter({ projectId: studio.projectId, characterName });
    if (Array.isArray(res?.characters)) updateCharacters(res.characters);
    if (Number.isFinite(res?.credits)) updateCredits(res.credits);
    return res;
  }, [studio.projectId, studio.projectIsDemo, updateCharacters, updateCredits]);

  const handleSaveLocation = useCallback(async (payload) => {
    const res = await saveLocation({ projectId: studio.projectId, ...payload });
    if (Array.isArray(res?.locations)) updateLocations(res.locations);
    scheduleKnowledgeBuild();
    return res;
  }, [studio.projectId, scheduleKnowledgeBuild, updateLocations]);

  const handleSaveWardrobe = useCallback(async (payload) => {
    if (!studio.projectId || studio.projectIsDemo) {
      throw new Error('Open a saved project to save wardrobe.');
    }
    const res = await saveWardrobe({ projectId: studio.projectId, ...payload });
    if (Array.isArray(res?.wardrobe)) updateWardrobe(res.wardrobe);
    scheduleKnowledgeBuild();
    return res;
  }, [studio.projectId, studio.projectIsDemo, scheduleKnowledgeBuild, updateWardrobe]);

  const handleGenerateLocation = useCallback(async (locationName) => {
    if (!studio.projectId || studio.projectIsDemo) {
      throw new Error('Open a saved project to generate locations.');
    }
    const res = await generateLocation({ projectId: studio.projectId, locationName });
    if (Array.isArray(res?.locations)) updateLocations(res.locations);
    if (Number.isFinite(res?.credits)) updateCredits(res.credits);
    return res;
  }, [studio.projectId, studio.projectIsDemo, updateLocations, updateCredits]);

  const handleSaveShotstackExport = useCallback(async (shotstackExport) => {
    if (!studio.projectId || studio.projectIsDemo) {
      throw new Error('Open a saved project to save export.');
    }
    const res = await saveShotstackExport({ projectId: studio.projectId, shotstackExport });
    if (res?.shotstack_export) updateShotstackExport(res.shotstack_export);
    return res;
  }, [studio.projectId, studio.projectIsDemo, updateShotstackExport]);

  const goToScriptAnalysis = useCallback(() => navigateCanvas('/script-analysis'), [navigateCanvas]);
  const handleAnalyzeScript = useCallback(async () => {
    const result = await analyzeScript();
    if (result.ok) navigateCanvas('/script-analysis');
  }, [analyzeScript, navigateCanvas]);
  const handleScriptFile = useCallback((file) => selectScriptFile(file), [selectScriptFile]);
  const handleGenerateScript = useCallback(() => generateScript(), [generateScript]);

  // Tell the router the brain is populated so the orb stops being the upload CTA.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (hasAnalysis || hasScriptFlow) document.body.dataset.brainReady = '1';
    else delete document.body.dataset.brainReady;
  }, [hasAnalysis, hasScriptFlow]);

  return (
    <>
      <div id="infinite-bg" className="infinite-bg" aria-hidden="true" />

      <WorkflowStepMenu studio={studio} />

      {/* ── Tools pill (middle-left) ── */}
      {['/characters', '/locations', '/shots'].includes(currentRoute) && (
        <CanvasToolsPill onTool={dispatchCanvasTool} />
      )}

      {/* ── Shared orb ── */}
      <div id="orb-stage">
        <div className="orb" id="orb">
          <button className="orb-btn" aria-label="Click the orb to start">
            <span className="orb-glow" />
            <video className="orb-video" src="/brain_loop_alpha.webm" autoPlay loop muted playsInline />
          </button>
        </div>
      </div>

      {/* ── Launch rocket overlay (cat boards the rocket → warp to shots) ── */}
      <div id="launch-rocket" className="launch-rocket" aria-hidden="true">
        <div className="launch-rocket__craft">
          <img src="/rocket.png" alt="" className="launch-rocket__img" />
          <span className="launch-rocket__cat"><AgentCatIcon /></span>
          <span className="launch-rocket__flame" aria-hidden="true" />
        </div>
      </div>

      <ShotPlanCheckpoint
        {...checkpointProps}
      />

      <main className="screen screen-dashboard is-active" data-route="/dashboard">
        <DashboardScreen onOpenProject={handleOpenProject} />
      </main>

      {/* ── Login screen ── */}
      <div className="screen screen-login" data-route="/login">
        <LoginScreen />
      </div>

      <BrainHubScreen
        hasAnalysis={hasAnalysis}
        hasScript={hasScriptFlow}
        shotsReady={shotsReady}
        hasProject={Boolean(studio.projectId) && !studio.projectIsDemo}
        loading={studio.loading}
        loadError={studio.loadError}
        onRetry={() => studio.projectId && hydrateProject(studio.projectId)}
        onNavigate={navigateCanvas}
      />

      {/* ── Audio Upload screen ── */}
      <div className="screen screen-audio" data-route="/audio">
        <section className="audio-screen">
          <h1 className="screen-label">AUDIO UPLOAD</h1>
          <div className="upload-card" id="cat-card">
            <span className="card-ear card-ear--l" id="cat-ear-l" />
            <span className="card-ear card-ear--r" id="cat-ear-r" />
            <span className="card-glasses" id="cat-glasses">
              <svg viewBox="0 0 26 10" fill="#0c0a09" shapeRendering="crispEdges" aria-hidden="true">
                <rect x="0" y="1" width="26" height="1" />
                <rect x="0" y="2" width="11" height="6" />
                <rect x="15" y="2" width="11" height="6" />
                <rect x="11" y="3" width="4" height="2" />
              </svg>
            </span>
            <label className={`dropzone${isUploading ? ' is-busy' : ''}${hasAudio && !isUploading ? ' is-filled' : ''}`} id="cat-mouth">
              <span className="dropzone-text" id="cat-mouth-text">
                {isUploading
                  ? 'UPLOADING AUDIO TO BACKEND'
                  : hasAudio
                    ? (studio.fileName || 'AUDIO UPLOADED')
                    : 'DROP YOUR AUDIO FILE HERE OR BROWSE'}
              </span>
              <span className={`dropzone-hint${studio.error ? ' is-error' : ''}`}>
                {studio.error
                  ? studio.error
                  : isUploading
                    ? projectLabel
                    : hasAudio
                      ? 'Audio uploaded · drop a new file to replace'
                      : projectLabel}
              </span>
              <input className="dropzone-input" type="file" accept="audio/*" aria-label="Upload audio file" disabled={isUploading} />
            </label>
            <span className="card-foot card-foot--l" id="cat-paw-l" />
            <span className="card-foot card-foot--r" id="cat-paw-r" />
          </div>

          <div className="particle-stream" aria-hidden="true">
            <div className="particle-stream__flow" />
          </div>

          <div className="orb-slot orb-slot--audio" data-orb-slot />
        </section>
      </div>

      <ScriptAnalysisScreen
        onEditScript={() => navigateCanvas('/script')}
        onNext={() => navigateCanvas('/brain')}
        onSaveScenes={handleSaveScriptScenes}
        studio={studio}
      />

      <ScriptUploadScreen
        hasLyrics={hasLyrics}
        hasScript={hasScript}
        isExtractingScript={isExtractingScript}
        isGeneratingScript={isGeneratingScript}
        isAnalyzingScript={studio.scriptStatus === 'analyzing'}
        onAnalyzeScript={handleAnalyzeScript}
        onGenerateScript={handleGenerateScript}
        onNext={goToScriptAnalysis}
        onScriptFile={handleScriptFile}
        projectLabel={projectLabel}
        scriptBusy={scriptBusy}
        studio={studio}
      />

      <EntityCanvasScreen
        emptyLabel="No character templates yet"
        entities={savedCharacters}
        entityType="characters"
        locations={savedLocations}
        names={characterNames}
        onBack={() => navigateCanvas('/brain')}
        onSaveEntity={handleSaveCharacter}
        onSaveWardrobe={handleSaveWardrobe}
        onGenerateEntity={handleGenerateCharacter}
        credits={studio.credits}
        generateCost={GENERATE_CHARACTER_COST}
        projectId={studio.projectId}
        route="/characters"
        title="CHARACTER BRAIN DUMP"
        wardrobe={studio.wardrobe || []}
      />

      <EntityCanvasScreen
        emptyLabel="No location templates yet"
        entities={savedLocations}
        entityType="locations"
        names={locationNames}
        onBack={() => navigateCanvas('/brain')}
        onSaveEntity={handleSaveLocation}
        onGenerateEntity={handleGenerateLocation}
        credits={studio.credits}
        generateCost={GENERATE_LOCATION_COST}
        projectId={studio.projectId}
        route="/locations"
        title="LOCATION BRAIN DUMP"
      />

      <ShotsScreen
        scenes={studio.script?.scenes || []}
        shotList={studio.shotList || []}
        projectId={studio.projectId}
        onEditShotPlan={hasShotPlan ? openShotPlanEditor : null}
        onShotPlanSaved={updateShotPlan}
        onBack={() => navigateCanvas('/brain')}
      />

      <EditorScreen
        projectId={studio.projectId}
        audioUrl={studio.audioUrl}
        projectData={studio.projectState}
        onSaveShotstackExport={handleSaveShotstackExport}
      />

      {/* ── Audio Player screen (pre-analyse) ── */}
      <div className="screen screen-player" data-route="/player">
        <section className="player-screen">
          <h1 className="analysis-title" data-anim>AUDIO ANALYSIS</h1>

          <PlayerCat />

          <div className="player-panel" data-anim>
            <div className="player-filename">{studio.fileName || 'NO TRACK SELECTED'}</div>
            <MusicPlayer
              artworkUrl={studio.artworkUrl}
              canAnalyze={canAnalyze}
              isAnalyzing={isAnalyzing}
              onDurationChange={setAudioDuration}
              src={studio.previewUrl || studio.audioUrl}
              status={playerStatus}
              statusIsError={Boolean(studio.error)}
              title={studio.fileName}
            />
          </div>

          <div className="particle-stream" aria-hidden="true">
            <div className="particle-stream__flow" />
          </div>
          <div className="orb-slot orb-slot--audio" data-orb-slot />
        </section>
      </div>

      {/* ── Audio Analysis screen (results) ── */}
      <div className="screen screen-analysis" data-route="/analysis">
        <section className="analysis-screen">
          <h1 className="analysis-title" data-anim>AUDIO ANALYSIS</h1>

          <div className="analysis-speak" data-anim>
            <AnalysisCat />
            <div className="analysis-actions">
              <button className="aa-btn" type="button" onClick={() => navigateCanvas('/audio')}>Upload New</button>
              <button className="aa-btn" type="button" onClick={() => navigateCanvas('/player')}>Analyse Again</button>
              <button className="aa-btn aa-btn--next" type="button" onClick={() => navigateCanvas('/script')}>Next</button>
            </div>
          </div>

          <div className="analysis-grid">
            <div className="aa-panel aa-lyrics" data-anim>
              <AnalysisLyricsPanel lyrics={lyrics} timedWordCount={timedWordCount} />
            </div>
            <div className="aa-col">
              <div className="aa-panel aa-stats" data-anim>
                <div className="aa-stat"><span className="aa-stat-label">BPM</span><span className="aa-stat-value">{analysisBpm}</span></div>
                <div className="aa-stat"><span className="aa-stat-label">Duration</span><span className="aa-stat-value">{formattedDuration}</span></div>
                <div className="aa-stat"><span className="aa-stat-label">Lyrics</span><span className="aa-stat-value">{lyrics.length || 0} lines</span></div>
                <div className="aa-stat"><span className="aa-stat-label">Genre</span><span className="aa-stat-value">{analysisGenre}</span></div>
              </div>
              <div className="aa-panel aa-insights" data-anim>
                <div className="aa-insights-title">Song Insights</div>
                <p className="aa-theme">{analysisMood}</p>
                <p className="aa-insights-body">{analysisSummary}</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <FoxMascot />
    </>
  );
}
