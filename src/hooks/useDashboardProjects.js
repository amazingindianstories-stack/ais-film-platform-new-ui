'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  accessTokenFromRuntime,
  createDashboardProject,
  deleteDashboardProject,
  listDashboardProjects,
} from '@/lib/dashboardClient';

const demoProjects = [
  {
    id: 'demo-midnight-chorus',
    title: 'Midnight Chorus',
    created_at: '2026-05-22T09:00:00.000Z',
    updated_at: '2026-06-01T16:30:00.000Z',
    current_step: 3,
    has_audio: true,
    has_analysis: true,
    shot_count: 12,
    is_demo: true,
  },
  {
    id: 'demo-saffron-rain',
    title: 'Saffron Rain',
    created_at: '2026-05-18T11:20:00.000Z',
    updated_at: '2026-05-30T12:15:00.000Z',
    current_step: 2,
    has_audio: true,
    has_analysis: false,
    shot_count: 0,
    is_demo: true,
  },
  {
    id: 'demo-glass-temple',
    title: 'Glass Temple Draft',
    created_at: '2026-05-12T14:10:00.000Z',
    updated_at: '2026-05-25T08:45:00.000Z',
    current_step: 1,
    has_audio: false,
    has_analysis: false,
    shot_count: 0,
    is_demo: true,
  },
];

function cleanTitle(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

function combineProjectRows(projects = [], summaries = []) {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const summaryById = new Map(summaries.map((summary) => [summary.id, summary]));
  const ids = [...new Set([...projectById.keys(), ...summaryById.keys()])];

  return ids.map((id) => {
    const project = projectById.get(id) || {};
    const summary = summaryById.get(id) || {};
    return {
      ...project,
      ...summary,
      id,
      title: summary.title || project.title || 'Untitled project',
      audio_url: summary.audio_url || project.audio_url || '',
      created_at: summary.created_at || project.created_at || '',
      updated_at: summary.updated_at || project.updated_at || project.created_at || '',
      current_step: summary.current_step || project.project_state?.current_step || 1,
      has_audio: Boolean(summary.has_audio || project.audio_url),
      has_analysis: Boolean(summary.has_analysis || project.project_state?.analysis),
      shot_count: Number(summary.shot_count || project.project_state?.shot_list?.length || 0),
      is_demo: false,
    };
  });
}

function createLocalProject(title) {
  const idPart = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : `${Date.now()}`.slice(-8);
  const now = new Date().toISOString();

  return {
    id: `demo-${idPart}`,
    title,
    created_at: now,
    updated_at: now,
    current_step: 1,
    has_audio: false,
    has_analysis: false,
    shot_count: 0,
    is_demo: true,
  };
}

export function useDashboardProjects() {
  const [projects, setProjects] = useState([]);
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState('');
  const [authMode, setAuthMode] = useState('loading');
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState('');

  const loadProjects = useCallback(async () => {
    const token = accessTokenFromRuntime();
    setAccessToken(token);
    setStatus('loading');
    setError('');

    try {
      const data = await listDashboardProjects({ accessToken: token || undefined });
      setProjects(combineProjectRows(data.projects, data.summaries));
      setUser(data.user || null);
      setAuthMode(token ? 'token' : 'session');
      setStatus('ready');
    } catch (loadError) {
      if (!token && loadError.status === 401) {
        setProjects(demoProjects);
        setUser(null);
        setAuthMode('demo');
        setError('');
        setStatus('demo');
        return;
      }

      setProjects([]);
      setUser(null);
      setAuthMode('error');
      setError(loadError.message || 'Projects could not be loaded.');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const createProject = useCallback(async (value) => {
    const title = cleanTitle(value);
    if (!title) {
      setError('Project title is required.');
      return { ok: false, error: 'Project title is required.' };
    }

    if (authMode === 'demo') {
      const project = createLocalProject(title);
      setProjects((prev) => [project, ...prev]);
      setStatus('demo');
      setError('');
      return { ok: true, project, demo: true };
    }

    setStatus('creating');
    setError('');

    try {
      const data = await createDashboardProject({ title, accessToken: accessToken || undefined });
      const [project] = combineProjectRows([data.project].filter(Boolean), [data.summary].filter(Boolean));
      setProjects((prev) => [project, ...prev.filter((item) => item.id !== project.id)]);
      setAuthMode(accessToken ? 'token' : 'session');
      setStatus('ready');
      return { ok: true, project };
    } catch (createError) {
      if (!accessToken && createError.status === 401) {
        setAuthMode('demo');
      }
      setError(createError.message || 'Project could not be created.');
      setStatus('error');
      return { ok: false, error: createError };
    }
  }, [accessToken, authMode]);

  const removeProject = useCallback(async (projectId) => {
    const id = String(projectId || '');
    if (!id) return { ok: false, error: 'Project id is required.' };

    setDeletingId(id);
    setError('');

    if (authMode === 'demo' || id.startsWith('demo-')) {
      setProjects((prev) => prev.filter((project) => project.id !== id));
      setDeletingId('');
      setStatus(authMode === 'demo' ? 'demo' : 'ready');
      return { ok: true, demo: true };
    }

    try {
      const data = await deleteDashboardProject({ projectId: id, accessToken: accessToken || undefined });
      setProjects((prev) => prev.filter((project) => project.id !== id));
      setDeletingId('');
      setAuthMode(accessToken ? 'token' : 'session');
      setStatus('ready');
      return { ok: true, data };
    } catch (deleteError) {
      setDeletingId('');
      if (!accessToken && deleteError.status === 401) {
        setAuthMode('demo');
      }
      setError(deleteError.message || 'Project could not be deleted.');
      setStatus('error');
      return { ok: false, error: deleteError };
    }
  }, [accessToken, authMode]);

  const metrics = useMemo(() => {
    return {
      total: projects.length,
      withAudio: projects.filter((project) => project.has_audio).length,
      withAnalysis: projects.filter((project) => project.has_analysis).length,
      shotCount: projects.reduce((sum, project) => sum + Number(project.shot_count || 0), 0),
    };
  }, [projects]);

  return {
    projects,
    metrics,
    user,
    status,
    error,
    deletingId,
    authMode,
    isDemo: authMode === 'demo',
    isLoading: status === 'loading',
    isCreating: status === 'creating',
    createProject,
    removeProject,
    refreshProjects: loadProjects,
  };
}
