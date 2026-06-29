'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  analyzeAudio,
  extractScriptFile,
  formatDuration,
  generateScriptFromLyrics,
  getInitialBackendConfig,
  normalizeAnalysis,
  uploadAudioFile,
  validateAudioFile,
  validateScriptFile,
  saveShotstackExport,
} from '@/lib/backendClient';
import { extractAudioArtworkUrl } from '@/lib/audioArtwork';
import {
  accessTokenFromRuntime,
  getDashboardProject,
} from '@/lib/dashboardClient';

const initialState = () => {
  return {
    projectId: '',
    fileName: '',
    previewUrl: '',
    audioUrl: '',
    artworkUrl: '',
    duration: 0,
    projectIsDemo: false,
    uploadStatus: 'idle',
    analysisStatus: 'idle',
    analysis: null,
    script: null,
    scriptStatus: 'idle',
    scriptFileName: '',
    characters: [],
    locations: [],
    wardrobe: [],
    shotList: [],
    shotListMeta: null,
    knowledgeBase: null,
    projectState: null,
    credits: 100,
    error: '',
    loading: false,   // a real project is currently being hydrated
    loaded: false,    // its project_state has been fetched at least once
    loadError: '',    // last hydration failure (so /brain can show retry, not "fresh")
  };
};

function hasRetainedAnalysis(analysis) {
  if (!analysis) return false;
  return Boolean(
    analysis.summary
    || analysis.genre
    || analysis.mood
    || analysis.bpm
    || analysis.audio_duration_seconds
    || analysis.lyrics?.length
  );
}

function retainedProjectState(project = {}, summary = {}, options = {}) {
  const projectState = project.project_state || {};
  const rawAnalysis = projectState.analysis || null;
  const analysis = rawAnalysis ? normalizeAnalysis(rawAnalysis) : null;
  const audioUrl = String(
    options.audioUrl
    || summary.audio_url
    || project.audio_url
    || ''
  );
  const title = String(options.audioName || project.title || summary.title || '').trim();
  const duration = Number(
    analysis?.audio_duration_seconds
    || projectState.audio_duration_seconds
    || 0
  );

  const scriptState = projectState.script;
  const hasScript = Boolean(
    scriptState
    && (scriptState.summary || scriptState.raw_text || scriptState.scenes?.length || scriptState.file_name)
  );

  return {
    audioUrl,
    previewUrl: audioUrl,
    fileName: audioUrl ? (title || 'Project audio') : '',
    duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    analysis: hasRetainedAnalysis(analysis) ? analysis : null,
    analysisStatus: hasRetainedAnalysis(analysis) ? 'ready' : 'idle',
    uploadStatus: audioUrl ? 'uploaded' : 'idle',
    script: hasScript ? scriptState : null,
    scriptStatus: hasScript ? 'ready' : 'idle',
    scriptFileName: hasScript ? (scriptState.file_name || '') : '',
    characters: Array.isArray(projectState.characters) ? projectState.characters : [],
    locations: Array.isArray(projectState.locations) ? projectState.locations : [],
    wardrobe: Array.isArray(projectState.wardrobe) ? projectState.wardrobe : [],
    shotList: Array.isArray(projectState.shot_list) ? projectState.shot_list : [],
    shotListMeta: projectState.shot_list_meta || null,
    knowledgeBase: projectState.knowledge_base || null,
    projectState,
    credits: Number.isFinite(projectState.studio_credits) ? projectState.studio_credits : 100,
  };
}

function mergeProjectState(prev, patch) {
  return {
    ...(prev.projectState || {}),
    ...patch,
  };
}

export function useStudioBackend() {
  const [state, setState] = useState(initialState);
  const objectUrlRef = useRef('');
  const artworkUrlRef = useRef('');
  const artworkRequestRef = useRef(0);
  const projectRequestRef = useRef(0);

  useEffect(() => () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    if (artworkUrlRef.current) {
      URL.revokeObjectURL(artworkUrlRef.current);
    }
  }, []);

  const hydrateProject = useCallback(async (projectId, options = {}) => {
    const nextProjectId = String(projectId || '').trim();
    if (!nextProjectId || options.isDemo) return { ok: false };

    const requestId = projectRequestRef.current + 1;
    projectRequestRef.current = requestId;
    setState((prev) => ({ ...prev, loading: true, loadError: '' }));

    // Transient failures (backend briefly down/slow, network blip → 5xx / no
    // response) are retried a few times with backoff before surfacing an error.
    // Auth failures (401/403) and missing rows (404) are NOT retried.
    const MAX_ATTEMPTS = 3;
    let data = null;
    let lastError = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      if (projectRequestRef.current !== requestId) return { ok: false, stale: true };
      try {
        data = await getDashboardProject({
          projectId: nextProjectId,
          accessToken: accessTokenFromRuntime() || undefined,
        });
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        const status = Number(err?.status) || 0;
        const retryable = status === 0 || status >= 500; // network / server, not auth
        if (!retryable || attempt === MAX_ATTEMPTS - 1) break;
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
      }
    }

    if (projectRequestRef.current !== requestId) return { ok: false, stale: true };

    if (lastError) {
      setState((prev) => {
        if (prev.projectId !== nextProjectId) return { ...prev, loading: false };
        return {
          ...prev,
          loading: false,
          loadError: lastError.message || 'Project could not be loaded.',
          error: prev.audioUrl ? '' : (lastError.message || 'Saved project audio could not be loaded.'),
        };
      });
      return { ok: false, error: lastError };
    }

    const retained = retainedProjectState(data.project, data.summary, options);
    setState((prev) => {
      if (prev.projectId !== nextProjectId) return { ...prev, loading: false };
      return {
        ...prev,
        ...retained,
        projectIsDemo: false,
        error: '',
        loading: false,
        loaded: true,
        loadError: '',
      };
    });
    return { ok: true, project: data.project, summary: data.summary };
  }, []);

  useEffect(() => {
    const config = getInitialBackendConfig();
    if (!config.projectId) return;

    setState((prev) => ({
      ...prev,
      projectId: config.projectId,
      projectIsDemo: false,
      fileName: config.audioName || prev.fileName,
      previewUrl: config.audioUrl || prev.previewUrl,
      audioUrl: config.audioUrl || prev.audioUrl,
      uploadStatus: config.audioUrl ? 'uploaded' : prev.uploadStatus,
    }));

    void hydrateProject(config.projectId, {
      audioName: config.audioName,
      audioUrl: config.audioUrl,
    });
  }, [hydrateProject]);

  const setAudioDuration = useCallback((duration) => {
    const nextDuration = Number(duration);
    if (!Number.isFinite(nextDuration) || nextDuration <= 0) return;
    setState((prev) => ({ ...prev, duration: nextDuration }));
  }, []);

  const selectProject = useCallback((projectId, options = {}) => {
    const nextProjectId = String(projectId || '').trim();
    const audioUrl = options.audioUrl && !options.isDemo ? String(options.audioUrl) : '';
    const retained = options.project && !options.isDemo
      ? retainedProjectState(options.project, options.summary, options)
      : {
          audioUrl,
          previewUrl: audioUrl,
          fileName: audioUrl ? (options.audioName || 'Project audio') : '',
          duration: 0,
          analysis: null,
          analysisStatus: 'idle',
          uploadStatus: audioUrl ? 'uploaded' : 'idle',
          script: null,
          scriptStatus: 'idle',
          scriptFileName: '',
          characters: [],
          locations: [],
          wardrobe: [],
          shotList: [],
          shotListMeta: null,
          knowledgeBase: null,
          projectState: null,
          credits: 100,
        };

    setState((prev) => ({
      ...prev,
      projectId: nextProjectId,
      projectIsDemo: Boolean(options.isDemo),
      ...retained,
      artworkUrl: '',
      error: '',
      loaded: Boolean(options.project?.project_state && !options.isDemo),
      loading: false,
      loadError: '',
    }));

    if (nextProjectId && !options.isDemo && !options.project?.project_state) {
      void hydrateProject(nextProjectId, options);
    }

    return nextProjectId;
  }, [hydrateProject]);

  const updateCharacters = useCallback((characters) => {
    if (!Array.isArray(characters)) return;
    setState((prev) => ({
      ...prev,
      characters,
      projectState: mergeProjectState(prev, { characters }),
      error: '',
    }));
  }, []);

  const updateLocations = useCallback((locations) => {
    if (!Array.isArray(locations)) return;
    setState((prev) => ({
      ...prev,
      locations,
      projectState: mergeProjectState(prev, { locations }),
      error: '',
    }));
  }, []);

  const updateWardrobe = useCallback((wardrobe) => {
    if (!Array.isArray(wardrobe)) return;
    setState((prev) => ({
      ...prev,
      wardrobe,
      projectState: mergeProjectState(prev, { wardrobe }),
      error: '',
    }));
  }, []);

  const updateScript = useCallback((script) => {
    if (!script) return;
    setState((prev) => ({
      ...prev,
      script,
      scriptStatus: 'ready',
      scriptFileName: script.file_name || prev.scriptFileName,
      projectState: mergeProjectState(prev, { script }),
      error: '',
    }));
  }, []);

  const updateShotPlan = useCallback(({ shotList, shotListMeta }) => {
    setState((prev) => ({
      ...prev,
      shotList: Array.isArray(shotList) ? shotList : prev.shotList,
      shotListMeta: shotListMeta || prev.shotListMeta,
      projectState: mergeProjectState(prev, {
        ...(Array.isArray(shotList) ? { shot_list: shotList } : {}),
        ...(shotListMeta ? { shot_list_meta: shotListMeta } : {}),
      }),
      error: '',
    }));
  }, []);

  const updateShotstackExport = useCallback((shotstackExport) => {
    setState((prev) => ({
      ...prev,
      projectState: mergeProjectState(prev, { shotstack_export: shotstackExport }),
      error: '',
    }));
  }, []);

  const updateKnowledgeBase = useCallback((knowledgeBase) => {
    if (!knowledgeBase) return;
    setState((prev) => ({
      ...prev,
      knowledgeBase,
      projectState: mergeProjectState(prev, { knowledge_base: knowledgeBase }),
      error: '',
    }));
  }, []);

  const updateCredits = useCallback((credits) => {
    if (!Number.isFinite(credits)) return;
    setState((prev) => ({ ...prev, credits }));
  }, []);

  const selectAudioFile = useCallback(async (file) => {
    const validationError = validateAudioFile(file);
    if (validationError) {
      setState((prev) => ({ ...prev, error: validationError }));
      return { ok: false, error: validationError };
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    if (artworkUrlRef.current) {
      URL.revokeObjectURL(artworkUrlRef.current);
      artworkUrlRef.current = '';
    }

    const previewUrl = URL.createObjectURL(file);
    objectUrlRef.current = previewUrl;
    const artworkRequestId = artworkRequestRef.current + 1;
    artworkRequestRef.current = artworkRequestId;

    const canUseBackend = Boolean(state.projectId && !state.projectIsDemo);

    setState((prev) => ({
      ...prev,
      fileName: file.name,
      previewUrl,
      audioUrl: '',
      artworkUrl: '',
      analysis: null,
      analysisStatus: 'idle',
      uploadStatus: canUseBackend ? 'uploading' : 'local',
      error: canUseBackend ? '' : (
        state.projectIsDemo
          ? 'Demo projects are local previews until auth is connected.'
          : 'Open this UI with ?projectId=PROJECT_ID to save audio to the backend.'
      ),
    }));

    void extractAudioArtworkUrl(file)
      .then((artworkUrl) => {
        if (artworkRequestRef.current !== artworkRequestId) {
          if (artworkUrl) URL.revokeObjectURL(artworkUrl);
          return;
        }

        artworkUrlRef.current = artworkUrl || '';
        setState((prev) => ({
          ...prev,
          artworkUrl: artworkUrl || '',
        }));
      })
      .catch(() => {
        if (artworkRequestRef.current === artworkRequestId) {
          setState((prev) => ({ ...prev, artworkUrl: '' }));
        }
      });

    if (!canUseBackend) {
      return { ok: true, localOnly: true };
    }

    try {
      const uploaded = await uploadAudioFile(file, { projectId: state.projectId });
      setState((prev) => ({
        ...prev,
        audioUrl: uploaded.audioUrl,
        uploadStatus: 'uploaded',
        projectState: mergeProjectState(prev, {
          audio_url: uploaded.audioUrl,
          audio_duration_seconds: prev.duration || undefined,
        }),
        error: '',
      }));
      return { ok: true, audioUrl: uploaded.audioUrl };
    } catch (error) {
      setState((prev) => ({
        ...prev,
        uploadStatus: 'failed',
        error: error.message || 'Upload failed.',
      }));
      return { ok: false, error };
    }
  }, [state.projectId, state.projectIsDemo]);

  const analyzeTrack = useCallback(async () => {
    if (!state.projectId || state.projectIsDemo) {
      const error = state.projectIsDemo
        ? 'Demo projects cannot update the backend. Open an authenticated project first.'
        : 'Add ?projectId=PROJECT_ID so analysis can update the backend project.';
      setState((prev) => ({ ...prev, error }));
      return { ok: false, error };
    }

    if (!state.audioUrl) {
      const error = 'Wait for the audio upload to finish before analysis.';
      setState((prev) => ({ ...prev, error }));
      return { ok: false, error };
    }

    setState((prev) => ({
      ...prev,
      analysisStatus: 'analyzing',
      error: '',
    }));

    try {
      const data = await analyzeAudio({
        projectId: state.projectId,
        audioUrl: state.audioUrl,
        audioDurationSeconds: state.duration || undefined,
      });
      const analysis = normalizeAnalysis(data);
      setState((prev) => ({
        ...prev,
        analysis,
        analysisStatus: 'ready',
        duration: analysis.audio_duration_seconds || prev.duration,
        projectState: mergeProjectState(prev, { analysis }),
        error: '',
      }));
      return { ok: true, analysis };
    } catch (error) {
      setState((prev) => ({
        ...prev,
        analysisStatus: 'failed',
        error: error.message || 'Analysis failed.',
      }));
      return { ok: false, error };
    }
  }, [state.audioUrl, state.duration, state.projectId, state.projectIsDemo]);

  const selectScriptFile = useCallback(async (file) => {
    const validationError = validateScriptFile(file);
    if (validationError) {
      setState((prev) => ({ ...prev, error: validationError }));
      return { ok: false, error: validationError };
    }
    if (!state.projectId || state.projectIsDemo) {
      const error = 'Open an authenticated project (?projectId=...) to save the script.';
      setState((prev) => ({ ...prev, error }));
      return { ok: false, error };
    }

    setState((prev) => ({ ...prev, scriptStatus: 'extracting', scriptFileName: file.name, error: '' }));
    try {
      const data = await extractScriptFile(file, {
        projectId: state.projectId,
        storyPrompt: state.script?.summary || '',
        moodWords: state.script?.mood_keywords || [],
      });
      setState((prev) => ({
        ...prev,
        script: data.script || prev.script,
        scriptStatus: 'ready',
        scriptFileName: data.script?.file_name || file.name,
        projectState: mergeProjectState(prev, data.script ? { script: data.script } : {}),
        error: '',
      }));
      return { ok: true, script: data.script };
    } catch (error) {
      setState((prev) => ({ ...prev, scriptStatus: 'failed', error: error.message || 'Script extraction failed.' }));
      return { ok: false, error };
    }
  }, [state.projectId, state.projectIsDemo, state.script]);

  const generateScript = useCallback(async () => {
    if (!state.projectId || state.projectIsDemo) {
      const error = 'Open an authenticated project (?projectId=...) to generate the script.';
      setState((prev) => ({ ...prev, error }));
      return { ok: false, error };
    }
    const transcript = Array.isArray(state.analysis?.lyrics) ? state.analysis.lyrics : null;
    const idea = state.script?.summary || state.analysis?.summary || '';
    if (!transcript && !idea) {
      const error = 'Analyse the track first so there are lyrics to generate from.';
      setState((prev) => ({ ...prev, error }));
      return { ok: false, error };
    }

    setState((prev) => ({ ...prev, scriptStatus: 'generating', error: '' }));
    try {
      const data = await generateScriptFromLyrics({ projectId: state.projectId, idea, transcript });
      setState((prev) => ({
        ...prev,
        script: data.script || prev.script,
        characters: Array.isArray(data.characters) && data.characters.length ? data.characters : prev.characters,
        locations: Array.isArray(data.locations) && data.locations.length ? data.locations : prev.locations,
        projectState: mergeProjectState(prev, {
          ...(data.script ? { script: data.script } : {}),
          ...(Array.isArray(data.characters) && data.characters.length ? { characters: data.characters } : {}),
          ...(Array.isArray(data.locations) && data.locations.length ? { locations: data.locations } : {}),
        }),
        scriptStatus: 'ready',
        error: '',
      }));
      return { ok: true, script: data.script };
    } catch (error) {
      setState((prev) => ({ ...prev, scriptStatus: 'failed', error: error.message || 'Script generation failed.' }));
      return { ok: false, error };
    }
  }, [state.projectId, state.projectIsDemo, state.analysis, state.script]);

  const analyzeScript = useCallback(async () => {
    if (!state.projectId || state.projectIsDemo) {
      const error = 'Open an authenticated project (?projectId=...) to analyse the script.';
      setState((prev) => ({ ...prev, error }));
      return { ok: false, error };
    }
    const rawText = state.script?.raw_text || state.script?.summary || '';
    if (!rawText) {
      const error = 'Upload or paste a script first.';
      setState((prev) => ({ ...prev, error }));
      return { ok: false, error };
    }

    setState((prev) => ({ ...prev, scriptStatus: 'analyzing', error: '' }));
    try {
      const data = await generateScriptFromLyrics({ projectId: state.projectId, idea: rawText, transcript: null });
      setState((prev) => ({
        ...prev,
        script: data.script || prev.script,
        characters: Array.isArray(data.characters) && data.characters.length ? data.characters : prev.characters,
        locations: Array.isArray(data.locations) && data.locations.length ? data.locations : prev.locations,
        projectState: mergeProjectState(prev, {
          ...(data.script ? { script: data.script } : {}),
          ...(Array.isArray(data.characters) && data.characters.length ? { characters: data.characters } : {}),
          ...(Array.isArray(data.locations) && data.locations.length ? { locations: data.locations } : {}),
        }),
        scriptStatus: 'ready',
        error: '',
      }));
      return { ok: true, script: data.script };
    } catch (error) {
      setState((prev) => ({ ...prev, scriptStatus: 'failed', error: error.message || 'Script analysis failed.' }));
      return { ok: false, error };
    }
  }, [state.projectId, state.projectIsDemo, state.script]);

  const projectLabel = state.projectIsDemo
    ? `Demo ${state.projectId.replace(/^demo-/, '').slice(0, 8) || 'project'}`
    : state.projectId
    ? `Project ${state.projectId.slice(0, 8)}`
    : 'No project connected';

  return {
    state,
    projectLabel,
    formattedDuration: formatDuration(state.analysis?.audio_duration_seconds || state.duration),
    selectAudioFile,
    analyzeTrack,
    selectScriptFile,
    generateScript,
    analyzeScript,
    hydrateProject,
    updateCharacters,
    updateLocations,
    updateWardrobe,
    updateScript,
    updateShotPlan,
    updateKnowledgeBase,
    updateCredits,
    setAudioDuration,
    selectProject,
    updateShotstackExport,
  };
}
