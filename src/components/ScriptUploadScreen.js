export default function ScriptUploadScreen({
  studio,
  projectLabel,
  hasLyrics,
  hasScript,
  scriptBusy,
  isExtractingScript,
  isGeneratingScript,
  onAnalyzeScript,
  onGenerateScript,
  onNext,
  onScriptFile,
}) {
  const handleDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void onScriptFile(file);
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) void onScriptFile(file);
    event.target.value = '';
  };

  return (
    <div className="screen screen-script" data-route="/script">
      <section className="audio-screen">
        <h1 className="screen-label">SCRIPT UPLOAD</h1>

        <button
          type="button"
          className="script-generate-btn"
          onClick={() => void onGenerateScript()}
          disabled={!hasLyrics || scriptBusy}
          title={hasLyrics ? 'Generate the creative plan from the analysed lyrics' : 'Analyse the track first'}
        >
          Generate Script From Lyrics
        </button>

        <div className="script-speak" data-anim>
          <div className="analysis-actions analysis-actions--script">
            <button
              className="aa-btn"
              disabled={!hasScript || scriptBusy}
              onClick={onAnalyzeScript}
              type="button"
            >
              Analyse Script
            </button>
            {hasScript && (
              <button
                className="aa-btn aa-btn--next"
                disabled={scriptBusy}
                onClick={onNext}
                type="button"
              >
                Next
              </button>
            )}
          </div>
        </div>

        <div className="upload-card">
          <span className="card-ear card-ear--l" />
          <span className="card-ear card-ear--r" />
          <span className="card-glasses">
            <svg viewBox="0 0 26 10" fill="#0c0a09" shapeRendering="crispEdges" aria-hidden="true">
              <rect x="0" y="1" width="26" height="1" />
              <rect x="0" y="2" width="11" height="6" />
              <rect x="15" y="2" width="11" height="6" />
              <rect x="11" y="3" width="4" height="2" />
            </svg>
          </span>
          <label
            className={`dropzone${isExtractingScript ? ' is-busy' : ''}${hasScript && !scriptBusy ? ' is-filled' : ''}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <span className="dropzone-text">
              {isExtractingScript
                ? 'READING SCRIPT FILE'
                : hasScript
                  ? (studio.scriptFileName || 'SCRIPT READY')
                  : 'DROP YOUR SCRIPT FILE HERE OR BROWSE'}
            </span>
            <span className={`dropzone-hint${studio.error ? ' is-error' : ''}`}>
              {studio.error
                ? studio.error
                : hasScript
                  ? 'Script saved - analyse to preview it, or use next to continue'
                  : `${projectLabel} - PDF, TXT, or Markdown`}
            </span>
            <input
              aria-label="Upload script file"
              accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
              className="dropzone-input"
              disabled={scriptBusy}
              onChange={handleFileChange}
              type="file"
            />
          </label>
          <span className="card-foot card-foot--l" />
          <span className="card-foot card-foot--r" />
        </div>

        {isGeneratingScript && <div className="script-generating">GENERATING SCRIPT...</div>}

        <div className="particle-stream" aria-hidden="true">
          <div className="particle-stream__flow" />
        </div>
        <div className="orb-slot orb-slot--audio" data-orb-slot />
      </section>
    </div>
  );
}
