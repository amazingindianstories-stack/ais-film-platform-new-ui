const toText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
};

const toNumber = (value, fallback = null) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = value.match(/-?\d+(\.\d+)?/);
    if (match) return Number(match[0]);
  }
  return fallback;
};

export const VEO_SHOT_DURATIONS = [4, 6, 8];
export const VEO_MAX_DURATION = VEO_SHOT_DURATIONS[VEO_SHOT_DURATIONS.length - 1];

export const snapToVeoDuration = (value, fallback = 6) => {
  const requested = Math.max(toNumber(value, fallback), 0);
  return VEO_SHOT_DURATIONS.find(option => option >= requested) || VEO_SHOT_DURATIONS[VEO_SHOT_DURATIONS.length - 1];
};

const partitionToVeoDurations = (value) => {
  const requested = Math.max(toNumber(value, 6), 4);
  if (requested <= 8) return [snapToVeoDuration(requested)];

  const maxSegments = Math.ceil(requested / 4) + 2;
  let best = null;

  const visit = (parts, total) => {
    if (parts.length > maxSegments) return;
    if (total >= requested - 0.01) {
      const score = {
        overshoot: Math.max(0, total - requested),
        distance: Math.abs(total - requested),
        segments: parts.length,
      };
      if (
        !best ||
        score.distance < best.score.distance ||
        (score.distance === best.score.distance && score.overshoot < best.score.overshoot) ||
        (score.distance === best.score.distance && score.overshoot === best.score.overshoot && score.segments < best.score.segments)
      ) {
        best = { parts, score };
      }
      return;
    }

    VEO_SHOT_DURATIONS
      .slice()
      .reverse()
      .forEach(duration => visit([...parts, duration], total + duration));
  };

  visit([], 0);
  return best?.parts?.length ? best.parts : [8];
};

const maxLineEnd = (lines = []) => {
  if (!Array.isArray(lines)) return null;

  let max = null;
  lines.forEach(line => {
    const lineEnd = toNumber(line?.end);
    if (lineEnd !== null) {
      max = max === null ? lineEnd : Math.max(max, lineEnd);
    }

    if (Array.isArray(line?.words)) {
      line.words.forEach(word => {
        const wordEnd = toNumber(word?.end);
        if (wordEnd !== null) {
          max = max === null ? wordEnd : Math.max(max, wordEnd);
        }
      });
    }
  });

  return max;
};

const maxSceneEnd = (scenes = []) => {
  if (!Array.isArray(scenes)) return null;
  return scenes.reduce((max, scene) => {
    const end = toNumber(scene?.end);
    if (end === null) return max;
    return max === null ? end : Math.max(max, end);
  }, null);
};

const maxShotEnd = (shots = []) => {
  if (!Array.isArray(shots)) return null;
  return shots.reduce((max, shot, index) => {
    const normalized = normalizeShot(shot, index);
    const start = toNumber(normalized.start);
    const duration = Math.max(toNumber(normalized.duration, 0), 0);
    const end = toNumber(normalized.end, start !== null ? start + duration : null);
    if (end === null) return max;
    return max === null ? end : Math.max(max, end);
  }, null);
};

const clampDuration = (value, fallback = 6) => {
  const requested = Math.max(toNumber(value, fallback), 0);
  return Number(requested.toFixed(2));
};

const buildVeoClipPlan = (requestedDuration) => {
  const target = clampDuration(requestedDuration, 6);
  if (target <= 0) return [];

  // Keep the timeline duration exact, then pick Veo source durations that can
  // be trimmed down without ever leaving the editor longer than the music.
  const sourceDurations = partitionToVeoDurations(target);
  let remaining = target;

  return sourceDurations.map(sourceDuration => {
    const duration = Math.min(sourceDuration, remaining);
    remaining = Number((remaining - duration).toFixed(2));
    return {
      duration: Number(duration.toFixed(2)),
      veoDuration: sourceDuration,
    };
  }).filter(segment => segment.duration > 0);
};

const findNextTimelineStart = (shots, index) => {
  for (let nextIndex = index + 1; nextIndex < shots.length; nextIndex += 1) {
    const nextStart = toNumber(shots[nextIndex]?.start);
    if (nextStart !== null) return nextStart;
  }
  return null;
};

const toStringList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map(item => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') return toText(item.name || item.id || item.label || item.title);
        return '';
      })
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }
  if (typeof value === 'object') {
    const label = toText(value.name || value.id || value.label || value.title);
    return label ? [label] : [];
  }
  return [];
};

const toWordList = (words) => {
  if (!Array.isArray(words)) return [];
  return words
    .map(word => {
      if (typeof word === 'string') return { word };
      if (!word || typeof word !== 'object') return null;
      const text = toText(word.word || word.text || word.value);
      if (!text) return null;
      const start = toNumber(word.start);
      const end = toNumber(word.end);
      return {
        word: text,
        ...(start !== null ? { start } : {}),
        ...(end !== null ? { end } : {}),
      };
    })
    .filter(Boolean);
};

const wordsForRange = (words, start, end) => {
  if (!Array.isArray(words) || !words.length) return [];
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return words;

  return words.filter(word => {
    const wordStart = toNumber(word.start);
    const wordEnd = toNumber(word.end);
    if (wordStart === null && wordEnd === null) return true;

    const safeStart = wordStart ?? wordEnd;
    const safeEnd = wordEnd ?? wordStart;
    const midpoint = safeStart + ((safeEnd - safeStart) / 2);
    return midpoint >= start - 0.03 && midpoint < end + 0.03;
  });
};

const lyricTextFromWords = (words) => words
  .map(word => toText(word.word || word.text))
  .filter(Boolean)
  .join(' ')
  .replace(/\s+([,.!?;:])/g, '$1')
  .trim();

const withoutGeneratedVideo = (shot) => {
  const {
    video_url,
    video_path,
    video_duration_seconds,
    video_generated_at,
    video_error,
    video_model,
    video_operation,
    video_source_image_used,
    video_uploaded_at,
    ...rest
  } = shot;
  return rest;
};

const generatedVideoFields = (shot) => ({
  ...(shot.video_url ? { video_url: shot.video_url } : {}),
  ...(shot.video_path ? { video_path: shot.video_path } : {}),
  ...(shot.video_duration_seconds !== undefined ? { video_duration_seconds: shot.video_duration_seconds } : {}),
  ...(shot.video_generated_at ? { video_generated_at: shot.video_generated_at } : {}),
  ...(shot.video_error ? { video_error: shot.video_error } : {}),
  ...(shot.video_model ? { video_model: shot.video_model } : {}),
  ...(shot.video_operation ? { video_operation: shot.video_operation } : {}),
  ...(shot.video_source_image_used !== undefined ? { video_source_image_used: shot.video_source_image_used } : {}),
  ...(shot.video_uploaded_at ? { video_uploaded_at: shot.video_uploaded_at } : {}),
});

const pickDuration = (shot, start, end) => {
  if (start !== null && end !== null && end >= start) {
    return Number((end - start).toFixed(2));
  }

  const duration = toNumber(shot.duration ?? shot.length ?? shot.seconds);
  if (duration !== null) return duration;
  return 5;
};

export function normalizeShot(shot, index = 0) {
  const source = shot && typeof shot === 'object' ? shot : {};
  const start = toNumber(source.start ?? source.start_time ?? source.startTime);
  const end = toNumber(source.end ?? source.end_time ?? source.endTime);
  const duration = pickDuration(source, start, end);
  const characters = toStringList(
    source.characters ||
    source.character_ids ||
    source.character_id ||
    source.character ||
    source.cast
  );
  const locations = toStringList(
    source.locations ||
    source.location_ids ||
    source.location_id ||
    source.location ||
    source.set
  );
  const words = toWordList(source.words || source.key_words || source.vocal_words);
  const n = toText(
    source.n ||
    source.name ||
    source.title ||
    source.shot_title ||
    source.shotTitle
  ) || `Shot ${index + 1}`;
  const p = toText(
    source.p ||
    source.prompt ||
    source.description ||
    source.visual ||
    source.image_prompt ||
    source.video_prompt
  );
  const lyrics = toText(source.lyrics || source.lyric || source.lyric_line || source.vocal_cue);

  return {
    ...source,
    n,
    p,
    duration,
    ...(start !== null ? { start } : {}),
    ...(end !== null ? { end } : {}),
    ...(lyrics ? { lyrics } : {}),
    ...(words.length ? { words } : {}),
    ...(characters.length ? { characters } : {}),
    ...(locations.length ? { locations } : {}),
    ...(toText(source.camera) ? { camera: toText(source.camera) } : {}),
    ...(toText(source.movement) ? { movement: toText(source.movement) } : {}),
    ...(toText(source.shot_size || source.shotSize) ? { shot_size: toText(source.shot_size || source.shotSize) } : {}),
    ...(toText(source.beat || source.story_beat) ? { beat: toText(source.beat || source.story_beat) } : {}),
    ...(toText(source.source_scene || source.scene) ? { source_scene: toText(source.source_scene || source.scene) } : {}),
  };
}

export function normalizeShotList(input) {
  const raw = Array.isArray(input)
    ? input
    : input?.shots || input?.shot_list || input?.shotList || [];

  if (!Array.isArray(raw)) return [];
  return raw
    .map((shot, index) => normalizeShot(shot, index))
    .filter(shot => shot.n || shot.p);
}

export function getProjectAudioDuration(projectState = {}) {
  const explicitAudioDuration = toNumber(
    projectState?.audio_duration_seconds ??
    projectState?.audioDuration ??
    projectState?.analysis?.audio_duration_seconds ??
    projectState?.analysis?.track_duration_seconds
  );

  if (explicitAudioDuration !== null && explicitAudioDuration > 0) {
    return Number(explicitAudioDuration.toFixed(2));
  }

  const transcript = projectState?.analysis?.lyrics || projectState?.script?.lyrics_timeline || [];
  const fallbackDuration = [
    maxLineEnd(transcript),
    maxSceneEnd(projectState?.script?.scenes),
    maxShotEnd(projectState?.shot_list),
  ].reduce((max, value) => {
    if (value === null || value <= 0) return max;
    return max === null ? value : Math.max(max, value);
  }, null);

  return fallbackDuration !== null ? Number(fallbackDuration.toFixed(2)) : null;
}

export function getPlannedVideoDuration(shot, fallback = 6) {
  const timelineDuration = Math.max(toNumber(shot?.duration, fallback), 0);
  const planned = toNumber(shot?.veo_duration_seconds ?? shot?.video_duration_seconds);

  if (planned !== null && planned >= timelineDuration - 0.01) {
    return planned;
  }

  return snapToVeoDuration(Math.max(timelineDuration, 4), fallback);
}

export function normalizeShotListForVeo(input, options = {}) {
  const shots = normalizeShotList(input);
  const audioDuration = typeof options === 'number'
    ? options
    : toNumber(options?.audioDuration);
  let cursor = 0;

  return shots.flatMap((shot, index) => {
    const sourceStart = toNumber(shot.start, cursor);
    const baseDuration = clampDuration(
      shot.duration,
      toNumber(shot.end) !== null && toNumber(shot.start) !== null
        ? toNumber(shot.end) - toNumber(shot.start)
        : 6
    );
    const safeStart = Number(Math.max(sourceStart, cursor, 0).toFixed(2));
    const nextStart = findNextTimelineStart(shots, index);
    const nextStartDuration = nextStart !== null && nextStart > safeStart
      ? Number((nextStart - safeStart).toFixed(2))
      : null;
    const finalShotDuration = index === shots.length - 1 && audioDuration !== null && audioDuration > safeStart
      ? Number((audioDuration - safeStart).toFixed(2))
      : null;
    const requestedDuration = Math.max(
      baseDuration,
      nextStartDuration ?? 0,
      finalShotDuration ?? 0
    );
    const remainingTrackDuration = audioDuration !== null
      ? Number(Math.max(audioDuration - safeStart, 0).toFixed(2))
      : null;
    const targetDuration = remainingTrackDuration !== null
      ? Math.min(requestedDuration, remainingTrackDuration)
      : requestedDuration;

    if (targetDuration <= 0) {
      cursor = safeStart;
      return [];
    }

    const plan = buildVeoClipPlan(targetDuration);
    let localStart = safeStart;

    const pieces = plan.map(({ duration, veoDuration }, partIndex) => {
      const isSplit = plan.length > 1;
      const segmentStart = Number(localStart.toFixed(2));
      const segmentEnd = Number((localStart + duration).toFixed(2));
      const sourceWords = Array.isArray(shot.words) ? shot.words : [];
      const segmentWords = wordsForRange(sourceWords, segmentStart, segmentEnd);
      const segmentLyrics = segmentWords.length
        ? lyricTextFromWords(segmentWords)
        : (sourceWords.length ? '' : shot.lyrics);
      const generatedDuration = toNumber(shot.video_duration_seconds);
      const canReuseGeneratedVideo = Boolean(shot.video_url) &&
        !isSplit &&
        (generatedDuration === null || generatedDuration >= duration - 0.01);
      const nextShot = normalizeShot({
        ...withoutGeneratedVideo(shot),
        ...(canReuseGeneratedVideo ? generatedVideoFields(shot) : {}),
        n: isSplit ? `${shot.n} ${partIndex + 1}` : shot.n,
        start: segmentStart,
        end: segmentEnd,
        duration,
        lyrics: segmentLyrics,
        words: segmentWords,
        veo_duration_seconds: veoDuration,
        source_scene: shot.source_scene || shot.n,
      }, index + partIndex);
      localStart += duration;
      return nextShot;
    });

    cursor = localStart;
    return pieces;
  });
}

export function getShotTimingLabel(shot) {
  const start = toNumber(shot?.start);
  const end = toNumber(shot?.end);
  if (start !== null && end !== null) return `${start}s - ${end}s`;
  if (start !== null) return `${start}s`;
  return `${toNumber(shot?.duration, 5)}s`;
}

export function countTranscriptWords(lines) {
  if (!Array.isArray(lines)) return 0;
  return lines.reduce((total, line) => total + (Array.isArray(line?.words) ? line.words.length : 0), 0);
}
