'use client';

import { useMemo, useState } from 'react';
import { useDashboardProjects } from '@/hooks/useDashboardProjects';

const stepLabels = [
  'Draft',
  'Audio',
  'Analysis',
  'Plan',
  'Shots',
  'Clips',
  'Render',
];

function formatUpdated(value) {
  if (!value) return 'Recently';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';

  const today = new Date();
  const diff = today.getTime() - date.getTime();
  const day = 24 * 60 * 60 * 1000;

  if (diff >= 0 && diff < day) return 'Today';
  if (diff >= day && diff < day * 2) return 'Yesterday';

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function projectStage(project) {
  const index = Math.max(0, Math.min(stepLabels.length - 1, Number(project.current_step || 1) - 1));
  return stepLabels[index];
}

function ProjectCard({ project, index, deletingId, onOpen, onDelete }) {
  const isDeleting = deletingId === project.id;
  const statusLabel = project.has_analysis
    ? 'Analysed'
    : project.has_audio ? 'Audio ready' : 'Needs audio';

  return (
    <article className={`dashboard-project dashboard-project--${index % 4}`}>
      <div className="dashboard-project__media" aria-hidden="true">
        <span className="dashboard-project__orb" />
        <span className="dashboard-project__line dashboard-project__line--a" />
        <span className="dashboard-project__line dashboard-project__line--b" />
      </div>

      <div className="dashboard-project__body">
        <div className="dashboard-project__topline">
          <span>{projectStage(project)}</span>
          <span>{formatUpdated(project.updated_at)}</span>
        </div>

        <h2>{project.title}</h2>

        <div className="dashboard-project__chips" aria-label="Project status">
          <span>{statusLabel}</span>
          <span>{Number(project.shot_count || 0)} shots</span>
          {project.is_demo && <span>Demo</span>}
        </div>

        <div className="dashboard-project__actions">
          <button type="button" className="dashboard-icon-btn" onClick={() => onOpen?.(project)}>
            <span aria-hidden="true">↗</span>
            <span>Open</span>
          </button>
          <button
            type="button"
            className="dashboard-icon-btn dashboard-icon-btn--quiet"
            disabled={isDeleting}
            onClick={() => onDelete(project)}
          >
            <span aria-hidden="true">×</span>
            <span>{isDeleting ? 'Deleting' : 'Delete'}</span>
          </button>
        </div>
      </div>
    </article>
  );
}

export default function DashboardScreen({ onOpenProject }) {
  const {
    projects,
    metrics,
    user,
    status,
    error,
    deletingId,
    isDemo,
    isLoading,
    isCreating,
    createProject,
    removeProject,
    refreshProjects,
  } = useDashboardProjects();
  const [title, setTitle] = useState('');

  const greeting = useMemo(() => {
    const name = user?.full_name || user?.email || '';
    if (!name) return 'Project command center';
    return `Welcome back, ${name.split('@')[0].split(' ')[0]}`;
  }, [user]);

  async function handleCreate(event) {
    event.preventDefault();
    const result = await createProject(title);
    if (result.ok) {
      setTitle('');
      onOpenProject?.(result.project);
    }
  }

  async function handleDelete(project) {
    const confirmed = window.confirm(`Delete "${project.title}" and its media files?`);
    if (!confirmed) return;
    await removeProject(project.id);
  }

  return (
    <section className="dashboard-screen" aria-busy={isLoading}>
      <div className="dashboard-shell">
        <header className="dashboard-header" data-anim>
          <div>
            <p className="dashboard-kicker">{isDemo ? 'Demo workspace' : 'Studio workspace'}</p>
            <h1>Project Dashboard</h1>
            <p className="dashboard-subtitle">{greeting}</p>
          </div>

          <button
            type="button"
            className="dashboard-refresh"
            disabled={isLoading || isCreating}
            onClick={refreshProjects}
            aria-label="Refresh projects"
          >
            <span aria-hidden="true">↻</span>
          </button>
        </header>

        <div className="dashboard-command-row">
          <form className="dashboard-new-project" data-anim onSubmit={handleCreate}>
            <label htmlFor="dashboard-project-title">New project</label>
            <div className="dashboard-new-project__control">
              <input
                id="dashboard-project-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Name the next music video"
                disabled={isCreating || isLoading}
              />
              <button type="submit" disabled={isCreating || isLoading || !title.trim()}>
                <span aria-hidden="true">+</span>
                <span>{isCreating ? 'Creating' : 'Create'}</span>
              </button>
            </div>
          </form>

          <div className="dashboard-metrics" data-anim>
            <div>
              <span>{String(metrics.total).padStart(2, '0')}</span>
              <p>Projects</p>
            </div>
            <div>
              <span>{String(metrics.withAudio).padStart(2, '0')}</span>
              <p>Audio</p>
            </div>
            <div>
              <span>{String(metrics.withAnalysis).padStart(2, '0')}</span>
              <p>Analysed</p>
            </div>
            <div>
              <span>{String(metrics.shotCount).padStart(2, '0')}</span>
              <p>Shots</p>
            </div>
          </div>
        </div>

        <div className="dashboard-statusline" data-anim>
          <span>{isLoading ? 'Loading projects' : `${projects.length} active ${projects.length === 1 ? 'project' : 'projects'}`}</span>
          <span>{status === 'error' ? 'Needs attention' : isDemo ? 'Local preview' : 'Backend connected'}</span>
        </div>

        {error && (
          <div className="dashboard-alert" role="status">
            {error}
          </div>
        )}

        <div className="dashboard-grid" data-anim>
          {isLoading && [0, 1, 2].map((item) => (
            <div className="dashboard-project dashboard-project--loading" key={item} />
          ))}

          {!isLoading && projects.map((project, index) => (
            <ProjectCard
              key={project.id}
              project={project}
              index={index}
              deletingId={deletingId}
              onOpen={onOpenProject}
              onDelete={handleDelete}
            />
          ))}

          {!isLoading && projects.length === 0 && (
            <div className="dashboard-empty">
              <h2>No projects yet</h2>
              <p>Create the first one and the canvas will carry it into the workflow.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
