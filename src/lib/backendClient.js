const MAX_AUDIO_BYTES = 200 * 1024 * 1024;

// Screen segments are part of the canvas route grammar (/<projectId>/<screen>), so the
// first path segment is the projectId only when it isn't one of these.
const KNOWN_SCREEN_SEGMENTS = new Set([
  "dashboard",
  "audio",
  "player",
  "analysis",
  "script",
  "script-analysis",
  "characters",
  "locations",
  "shots",
  "start",
  "brain",
]);

export function projectIdFromPath() {
  if (typeof window === "undefined") return "";
  const seg = window.location.pathname.split("/").filter(Boolean)[0];
  if (!seg || KNOWN_SCREEN_SEGMENTS.has(seg)) return "";
  return decodeURIComponent(seg);
}

export function getInitialBackendConfig() {
  if (typeof window === "undefined") {
    return { projectId: "", audioUrl: "", audioName: "" };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    projectId:
      params.get("projectId")
      || projectIdFromPath()
      || process.env.NEXT_PUBLIC_STUDIO_PROJECT_ID
      || "",
    audioUrl: params.get("audioUrl") || process.env.NEXT_PUBLIC_STUDIO_AUDIO_URL || "",
    audioName: params.get("audioName") || "",
  };
}

export function validateAudioFile(file) {
  if (!file) return "Choose an audio file first.";
  if (file.type && !file.type.startsWith("audio/")) {
    return "Please choose an audio file.";
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return "Audio file must be under 200MB.";
  }
  return "";
}

async function readJson(response) {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok || data.error) {
    throw new Error(data.error || data.detail || `Request failed with ${response.status}`);
  }
  return data;
}

export async function uploadAudioFile(file, { projectId }) {
  const formData = new FormData();
  formData.set("projectId", projectId);
  formData.set("file", file);

  const response = await fetch("/api/studio/upload-audio", {
    method: "POST",
    body: formData,
  });

  return readJson(response);
}

export async function analyzeAudio({ projectId, audioUrl, audioDurationSeconds }) {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      audioUrl,
      audioDurationSeconds,
    }),
  });

  return readJson(response);
}

const SCRIPT_FILE_RE = /\.(pdf|txt|md)$/i;

export function validateScriptFile(file) {
  if (!file) return "Choose a script file first.";
  const type = String(file.type || "").toLowerCase();
  const okType = type === "application/pdf" || type.startsWith("text/") || SCRIPT_FILE_RE.test(file.name || "");
  if (!okType) return "Upload a PDF, TXT, or Markdown script file.";
  if (file.size > 18 * 1024 * 1024) return "Script file must be under 18MB.";
  return "";
}

export async function extractScriptFile(file, { projectId, storyPrompt = "", moodWords = [] }) {
  const formData = new FormData();
  formData.set("projectId", projectId);
  formData.set("file", file);
  formData.set("storyPrompt", storyPrompt || "");
  formData.set("moodWords", JSON.stringify(Array.isArray(moodWords) ? moodWords : []));

  const response = await fetch("/api/studio/extract-script", {
    method: "POST",
    body: formData,
  });

  return readJson(response);
}

export async function generateScriptFromLyrics({ projectId, idea, transcript }) {
  const response = await fetch("/api/studio/generate-script", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, idea, transcript }),
  });

  return readJson(response);
}

export async function saveScriptAnalysis({ projectId, scenes }) {
  const response = await fetch("/api/studio/save-script-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, scenes }),
  });

  return readJson(response);
}

// Save a character into project_state.characters. Pass `files` (reference or
// wardrobe images, by `kind`) and/or `bio` (the description). Returns the
// merged character + the full characters array.
export async function saveCharacter({ projectId, name, bio, kind = "reference", files = [], removePath } = {}) {
  const formData = new FormData();
  formData.set("projectId", projectId);
  formData.set("name", name);
  if (bio != null) formData.set("bio", bio);
  formData.set("kind", kind);
  if (removePath) formData.set("removePath", removePath);
  for (const file of files) formData.append("files", file);

  const response = await fetch("/api/studio/save-character", {
    method: "POST",
    body: formData,
  });

  return readJson(response);
}

// Placeholder credit economy (display only — the server is the source of truth).
export const GENERATE_CHARACTER_COST = 20;
export const GENERATE_LOCATION_COST = 20;

export async function saveLocation({ projectId, name, bio, kind = "reference", files = [], removePath } = {}) {
  const formData = new FormData();
  formData.set("projectId", projectId);
  formData.set("name", name);
  if (bio != null) formData.set("bio", bio);
  formData.set("kind", kind);
  if (removePath) formData.set("removePath", removePath);
  for (const file of files) formData.append("files", file);

  const response = await fetch("/api/studio/save-location", { method: "POST", body: formData });
  return readJson(response);
}

export async function saveWardrobe({
  projectId,
  characterName,
  locationName,
  characterId,
  locationId,
  outfitId,
  outfitName,
  description,
  files = [],
  removePath,
} = {}) {
  const formData = new FormData();
  formData.set("projectId", projectId);
  formData.set("characterName", characterName);
  if (locationName) formData.set("locationName", locationName);
  if (characterId) formData.set("characterId", characterId);
  if (locationId) formData.set("locationId", locationId);
  if (outfitId) formData.set("outfitId", outfitId);
  if (outfitName != null) formData.set("outfitName", outfitName);
  if (description != null) formData.set("description", description);
  if (removePath) formData.set("removePath", removePath);
  for (const file of files) formData.append("files", file);

  const response = await fetch("/api/studio/save-wardrobe", {
    method: "POST",
    body: formData,
  });

  return readJson(response);
}

// Reconcile a location template's reference + angle images into canonical spatial
// data (a location prompt-lock) and write it into the knowledge base.
export async function generateLocation({ projectId, locationName }) {
  const response = await fetch("/api/studio/generate-location", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, locationName }),
  });
  return readJson(response);
}

// Purify a linked character template into a canonical identity lock and write it
// into the knowledge base. Costs placeholder credits (deducted server-side).
export async function generateCharacter({ projectId, characterName }) {
  const response = await fetch("/api/studio/generate-character", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, characterName }),
  });
  return readJson(response);
}

// Translate the project's characters/locations/style into the knowledge base
// (project_state.knowledge_base) via the frozen master KB agent.
export async function buildKnowledgeBase(projectId) {
  const response = await fetch("/api/studio/build-knowledge-base", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  });

  return readJson(response);
}

export async function saveShotstackExport({ projectId, shotstackExport }) {
  const response = await fetch("/api/studio/save-shotstack-export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, shotstackExport }),
  });

  return readJson(response);
}


export function normalizeAnalysis(raw) {
  const analysis = raw?.analysis || raw || {};
  const lyrics = Array.isArray(analysis.lyrics)
    ? analysis.lyrics.map(normalizeLyricLine).filter((line) => line.text || line.words.length)
    : [];

  return {
    ...analysis,
    lyrics,
    bpm: Number.isFinite(Number(analysis.bpm)) ? Number(analysis.bpm) : null,
    audio_duration_seconds: Number.isFinite(Number(analysis.audio_duration_seconds))
      ? Number(analysis.audio_duration_seconds)
      : null,
  };
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeLyricWord(word) {
  if (typeof word === "string") {
    return { word: word.trim(), start: null, end: null };
  }

  const text = String(word?.word || word?.text || word?.value || "").trim();
  return {
    word: text,
    start: toFiniteNumber(word?.start),
    end: toFiniteNumber(word?.end),
  };
}

function normalizeLyricLine(line) {
  if (typeof line === "string") {
    return {
      text: line.trim(),
      start: null,
      end: null,
      words: [],
    };
  }

  return {
    ...line,
    text: String(line?.text || line?.lyrics || line?.line || "").trim(),
    start: toFiniteNumber(line?.start),
    end: toFiniteNumber(line?.end),
    words: Array.isArray(line?.words)
      ? line.words.map(normalizeLyricWord).filter((word) => word.word)
      : [],
  };
}

export function formatDuration(seconds) {
  const safeSeconds = Number.isFinite(Number(seconds)) ? Math.max(0, Number(seconds)) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = Math.floor(safeSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

export function formatTimestamp(seconds) {
  const hasValue = seconds !== null && seconds !== undefined && seconds !== "";
  const safeSeconds = hasValue && Number.isFinite(Number(seconds)) ? Math.max(0, Number(seconds)) : null;
  if (safeSeconds === null) return "--:--";

  const minutes = Math.floor(safeSeconds / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const hundredths = Math.floor((safeSeconds % 1) * 100);
  return `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

export function countTimedWords(lyrics) {
  if (!Array.isArray(lyrics)) return 0;
  return lyrics.reduce((count, line) => {
    const words = Array.isArray(line?.words) ? line.words : [];
    return count + words.filter((word) => word.start !== null || word.end !== null).length;
  }, 0);
}
