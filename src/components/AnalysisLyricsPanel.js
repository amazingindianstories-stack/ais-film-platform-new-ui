'use client';

import { formatTimestamp } from '@/lib/backendClient';

function lineTime(line) {
  if (line.start === null && line.end === null) return 'untimed';
  return `${formatTimestamp(line.start)} - ${formatTimestamp(line.end)}`;
}

function wordTime(word) {
  if (word.start === null && word.end === null) return '--:--';
  return `${formatTimestamp(word.start)}-${formatTimestamp(word.end)}`;
}

export default function AnalysisLyricsPanel({ lyrics = [], timedWordCount = 0 }) {
  if (!lyrics.length) {
    return <span className="aa-lyrics-text">LYRICS EXTRACTED FROM THE SONG</span>;
  }

  return (
    <div className="aa-lyrics-shell">
      <div className="aa-lyrics-split">
        <section className="aa-lyrics-pane aa-lyrics-pane--lines">
          <div className="aa-lyrics-header">
            <span>Full Lyrics</span>
            <span>{lyrics.length} lines</span>
          </div>

          <div className="aa-lyrics-scroll aa-lyrics-scroll--lines" aria-label="Full lyric transcript">
            <div className="aa-lyrics-preview">
              {lyrics.map((line, index) => (
                <p key={`${line.text}-${index}`}>{line.text}</p>
              ))}
            </div>
          </div>
        </section>

        <section className="aa-lyrics-pane aa-lyrics-pane--words">
          <div className="aa-lyrics-header">
            <span>Word Timings</span>
            <span>{timedWordCount} timed</span>
          </div>

          <div className="aa-lyrics-scroll aa-lyrics-scroll--words" aria-label="Word by word timing spans">
            {lyrics.map((line, index) => (
              <article className="aa-word-section" key={`${line.start ?? index}-words-${line.text}`}>
                <div className="aa-word-section__meta">
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <span>{lineTime(line)}</span>
                </div>

                {line.words?.length ? (
                  <div className="aa-word-grid" aria-label={`Timed words for line ${index + 1}`}>
                    {line.words.map((word, wordIndex) => (
                      <span className="aa-word-chip" key={`${word.word}-${word.start ?? wordIndex}-${wordIndex}`}>
                        <strong>{word.word}</strong>
                        <em>{wordTime(word)}</em>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="aa-word-empty">No word timing returned for this line.</div>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
