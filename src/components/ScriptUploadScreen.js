import { useState } from 'react';

export default function ScriptUploadScreen({
  studio,
  projectLabel,
  hasLyrics,
  hasScript,
  scriptBusy,
  isExtractingScript,
  isGeneratingScript,
  isAnalyzingScript,
  onAnalyzeScript,
  onGenerateScript,
  onNext,
  onScriptFile,
}) {
  const [isPasteMode, setIsPasteMode] = useState(false);
  const [pastedText, setPastedText] = useState('');

  const handlePasteSubmit = () => {
    if (!pastedText.trim()) return;
    const file = new File([pastedText], "pasted_script.txt", { type: "text/plain" });
    void onScriptFile(file);
  };

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
              {isAnalyzingScript ? 'Analysing Script...' : 'Analyse Script'}
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
          {!isPasteMode ? (
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
          ) : (
            <div className="dropzone paste-zone" style={{ cursor: 'text', padding: '1rem', boxSizing: 'border-box' }}>
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="PASTE YOUR SCRIPT TEXT HERE..."
                disabled={scriptBusy}
                style={{ 
                  flex: 1, 
                  width: '100%', 
                  background: 'transparent', 
                  color: 'var(--mine-100)', 
                  border: 'none', 
                  outline: 'none',
                  padding: '0', 
                  resize: 'none',
                  minHeight: '130px',
                  fontFamily: 'var(--font-accent)',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  lineHeight: '1.4'
                }}
              />
              <button 
                type="button" 
                className="aa-btn" 
                onClick={handlePasteSubmit}
                disabled={scriptBusy || !pastedText.trim()}
                style={{ alignSelf: 'center', marginTop: 'auto' }}
              >
                Submit Pasted Script
              </button>
              {hasScript && !scriptBusy && (
                <span className="dropzone-hint" style={{ marginTop: '12px' }}>
                  Script saved - analyse to preview it, or use next to continue
                </span>
              )}
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: '0.65rem' }}>
            <button
              type="button"
              onClick={() => setIsPasteMode(!isPasteMode)}
              style={{
                background: 'none',
                border: 'none',
                color: '#0c0a09',
                fontFamily: 'var(--font-accent)',
                textTransform: 'uppercase',
                fontSize: '0.75rem',
                fontWeight: 800,
                letterSpacing: '0.08em',
                cursor: 'pointer',
                opacity: 0.8
              }}
              onMouseOver={(e) => e.target.style.opacity = 1}
              onMouseOut={(e) => e.target.style.opacity = 0.8}
            >
              {isPasteMode ? 'Wait, I have a file to upload' : 'Paste Script Text Instead'}
            </button>
          </div>

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
