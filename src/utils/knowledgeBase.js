/**
 * knowledgeBase.js
 *
 * Utilities for reading the per-project knowledge base and building
 * context strings that generative agents inject into their prompts.
 *
 * The KB lives at project_state.knowledge_base and is built by
 * POST /api/build-knowledge-base.
 *
 * Shape:
 *   kb.v                        — version number (1)
 *   kb.built_at                 — ISO timestamp
 *   kb.project.preamble         — global narrative context paragraph
 *   kb.project.visual_language  — cinematographic language sentence
 *   kb.characters[NAME]         — per-character data + prompt_lock
 *   kb.locations[NAME]          — per-location data + prompt_lock
 *   kb.style.global_lock        — visual style paragraph
 */

// ─── Guards ───────────────────────────────────────────────────────────────────

/** True when the KB exists and has the minimum required shape. */
export function isKBUsable(kb) {
  return (
    kb != null &&
    typeof kb === "object" &&
    kb.v === 1 &&
    typeof kb.built_at === "string" &&
    kb.project != null &&
    kb.characters != null &&
    kb.locations != null
  );
}

/** Age of the KB in hours. Returns Infinity when no KB. */
export function getKBAgeHours(kb) {
  if (!kb?.built_at) return Infinity;
  return (Date.now() - new Date(kb.built_at).getTime()) / 3_600_000;
}

/** True when KB is older than maxAgeHours (default 48 h). */
export function isKBStale(kb, maxAgeHours = 48) {
  return getKBAgeHours(kb) > maxAgeHours;
}

// ─── Name normalisation ───────────────────────────────────────────────────────

function normKey(name) {
  return String(name || "").replace(/\s+/g, " ").trim().toUpperCase();
}

/** Return the character entry for a given name, or null. */
export function getCharacterEntry(kb, name) {
  if (!isKBUsable(kb)) return null;
  return kb.characters[normKey(name)] ?? null;
}

/** Return the location entry for a given name, or null. */
export function getLocationEntry(kb, name) {
  if (!isKBUsable(kb)) return null;
  return kb.locations[normKey(name)] ?? null;
}

// ─── Prompt_lock extraction ───────────────────────────────────────────────────

/** Return the prompt_lock string for a character, or empty string. */
export function getCharacterLock(kb, name) {
  return getCharacterEntry(kb, name)?.prompt_lock || "";
}

/** Return the prompt_lock string for a location, or empty string. */
export function getLocationLock(kb, name) {
  return getLocationEntry(kb, name)?.prompt_lock || "";
}

/** Return the style global_lock paragraph, or empty string. */
export function getStyleLock(kb) {
  return isKBUsable(kb) ? (kb.style?.global_lock || "") : "";
}

/** Return the project preamble paragraph, or empty string. */
export function getProjectPreamble(kb) {
  return isKBUsable(kb) ? (kb.project?.preamble || "") : "";
}

/** Return the project colour science description, or empty string. */
export function getColorScience(kb) {
  return isKBUsable(kb) ? (kb.project?.color_science || "") : "";
}

/** Return the project lighting language, or empty string. */
export function getLightingLanguage(kb) {
  return isKBUsable(kb) ? (kb.project?.lighting_language || "") : "";
}

/** Return the project editing rhythm, or empty string. */
export function getEditingRhythm(kb) {
  return isKBUsable(kb) ? (kb.project?.editing_rhythm || "") : "";
}

/** Return a character's fashion_style brief, or empty string. */
export function getCharacterFashionStyle(kb, name) {
  return getCharacterEntry(kb, name)?.fashion_style || "";
}

/**
 * Build a rich per-character wardrobe context string for costume generation agents.
 * Includes: prompt_lock, fashion_style, default_outfit, signature_elements, physique.
 */
export function getCharacterWardrobeContext(kb, name) {
  const entry = getCharacterEntry(kb, name);
  if (!entry) return "";
  const parts = [];
  if (entry.prompt_lock)           parts.push(`Identity lock: ${entry.prompt_lock}`);
  if (entry.fashion_style)         parts.push(`Fashion identity: ${entry.fashion_style}`);
  if (entry.default_outfit)        parts.push(`Default outfit: ${entry.default_outfit}`);
  if (entry.signature_elements?.length) parts.push(`Signature elements: ${entry.signature_elements.join("; ")}`);
  if (entry.physique)              parts.push(`Physique: ${entry.physique}`);
  return parts.join("\n");
}

/**
 * Build a rich location context string for costume/image generation agents.
 * Includes: prompt_lock, atmosphere, color_palette, materials, time_and_light.
 */
export function getLocationWardrobeContext(kb, name) {
  const entry = getLocationEntry(kb, name);
  if (!entry) return "";
  const parts = [];
  if (entry.prompt_lock)               parts.push(`Location lock: ${entry.prompt_lock}`);
  if (entry.atmosphere)                parts.push(`Atmosphere: ${entry.atmosphere}`);
  if (entry.color_palette)             parts.push(`Colour palette: ${entry.color_palette}`);
  if (entry.materials_and_textures)    parts.push(`Materials: ${entry.materials_and_textures}`);
  if (entry.time_and_light)            parts.push(`Light: ${entry.time_and_light}`);
  if (entry.production_design_notes)   parts.push(`Set dressing: ${entry.production_design_notes}`);
  return parts.join("\n");
}

// ─── Shot brain context builder ─────────────────────────────────────────────

function compactText(value, max = 800) {
  if (!value) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function nameList(values = []) {
  if (!Array.isArray(values)) return [];
  return values
    .map(value => {
      if (typeof value === "string") return value;
      return value?.name || value?.character_name || value?.location_name || "";
    })
    .map(value => String(value || "").trim())
    .filter(Boolean);
}

function shotCharacterNames(shot = {}, scene = {}) {
  return nameList(shot.characters?.length ? shot.characters : scene.characters);
}

function shotLocationNames(shot = {}, scene = {}) {
  if (Array.isArray(shot.locations) && shot.locations.length) return nameList(shot.locations);
  if (shot.location?.name) return [shot.location.name];
  if (shot.location_name) return [shot.location_name];
  if (Array.isArray(scene.locations) && scene.locations.length) return nameList(scene.locations);
  if (scene.location?.name) return [scene.location.name];
  if (scene.location_name) return [scene.location_name];
  return [];
}

function formatWardrobeOverrides(shot = {}) {
  const overrides = shot.wardrobeOverrides || shot.wardrobe_overrides || null;
  const lines = [];
  if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
    for (const [name, value] of Object.entries(overrides)) {
      if (value) lines.push(`${name}: ${compactText(value, 360)}`);
    }
  }

  const direct = shot.costumes || shot.costume || shot.wardrobe || shot.wardrobe_notes;
  if (direct) lines.push(compactText(direct, 600));
  return lines.join("\n");
}

function formatShotStoryBeat(shot = {}, scene = {}) {
  const lines = [
    scene.scene_id || scene.id ? `Scene: ${scene.scene_id || scene.id}` : "",
    scene.description || scene.visual ? `Scene beat: ${compactText(scene.description || scene.visual, 600)}` : "",
    shot.source_scene ? `Source scene: ${compactText(shot.source_scene, 600)}` : "",
    scene.emotional_focus ? `Scene emotional focus: ${compactText(scene.emotional_focus, 400)}` : "",
    shot.n || shot.title ? `Shot: ${compactText(shot.n || shot.title, 240)}` : "",
    shot.beat || shot.concept ? `Shot story beat: ${compactText(shot.beat || shot.concept, 700)}` : "",
    shot.emotionalState || shot.emotional_state ? `Emotional state: ${compactText(shot.emotionalState || shot.emotional_state, 400)}` : "",
    shot.relationshipBeats || shot.relationship_beats ? `Relationship beats: ${nameList(shot.relationshipBeats || shot.relationship_beats).join("; ")}` : "",
    shot.lyrics ? `Lyric cue: ${compactText(shot.lyrics, 400)}` : "",
    shot.beatType || shot.beat_type ? `Musical beat type: ${shot.beatType || shot.beat_type}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

/**
 * Build the full film-brain context for one shot.
 *
 * This is stricter than getKBContextForShot: it includes wardrobe identity,
 * scene/story beats, musical cues, and per-shot wardrobe overrides so
 * downstream agents receive a director/wardrobe/DoP packet instead of loose
 * prompt fragments.
 */
export function getShotBrainContext(kb, shot = {}, scene = {}) {
  const sections = [];

  if (isKBUsable(kb)) {
    const preamble = getProjectPreamble(kb);
    if (preamble) sections.push(`[KB PROJECT CONTEXT]\n${preamble}`);

    const characterLocks = shotCharacterNames(shot, scene)
      .map(name => getCharacterLock(kb, name))
      .filter(Boolean);
    if (characterLocks.length) {
      sections.push(`[KB CHARACTER LOCKS]\n${characterLocks.join("\n\n")}`);
    }

    const wardrobe = shotCharacterNames(shot, scene)
      .map(name => getCharacterWardrobeContext(kb, name))
      .filter(Boolean);
    if (wardrobe.length) {
      sections.push(`[CHARACTER WARDROBE CONTEXT]\n${wardrobe.join("\n\n")}`);
    }

    const locationName = shotLocationNames(shot, scene)[0];
    const locationLock = locationName ? getLocationWardrobeContext(kb, locationName) : "";
    if (locationLock) sections.push(`[KB LOCATION LOCK]\n${locationLock}`);

    const styleLock = getStyleLock(kb);
    if (styleLock) sections.push(`[KB VISUAL STYLE LOCK]\n${styleLock}`);
  }

  const storyBeat = formatShotStoryBeat(shot, scene);
  if (storyBeat) sections.push(`[SHOT STORY BEAT]\n${storyBeat}`);

  const wardrobeOverrides = formatWardrobeOverrides(shot);
  if (wardrobeOverrides) sections.push(`[WARDROBE OVERRIDES]\n${wardrobeOverrides}`);

  return sections.join("\n\n");
}

// ─── Shot-scoped context builder ─────────────────────────────────────────────

/**
 * Build a multi-section KB context string scoped to a specific shot.
 *
 * Includes:
 *   - Project preamble (if present)
 *   - Character prompt_locks for characters named in the shot
 *   - Location prompt_lock for the first location in the shot
 *   - Style global_lock
 *
 * Returns empty string if KB is unusable.
 */
export function getKBContextForShot(kb, shot) {
  if (!isKBUsable(kb)) return "";

  const charNames  = Array.isArray(shot?.characters) ? shot.characters : [];
  const locNames   = Array.isArray(shot?.locations)  ? shot.locations  : [];

  const sections = [];

  const preamble = getProjectPreamble(kb);
  if (preamble) sections.push(`[KB PROJECT CONTEXT]\n${preamble}`);

  const charLocks = charNames
    .map(n => getCharacterLock(kb, n))
    .filter(Boolean);
  if (charLocks.length) {
    sections.push(`[KB CHARACTER LOCKS]\n${charLocks.join("\n\n")}`);
  }

  const locLock = locNames.length ? getLocationLock(kb, locNames[0]) : "";
  if (locLock) sections.push(`[KB LOCATION LOCK]\n${locLock}`);

  const styleLock = getStyleLock(kb);
  if (styleLock) sections.push(`[KB VISUAL STYLE LOCK]\n${styleLock}`);

  return sections.join("\n\n");
}

/**
 * Lightweight version — returns only character + location locks (no preamble/style).
 * Used in contexts where global context is already provided separately.
 */
export function getKBEntityLocksForShot(kb, shot) {
  if (!isKBUsable(kb)) return "";

  const charNames = Array.isArray(shot?.characters) ? shot.characters : [];
  const locNames  = Array.isArray(shot?.locations)  ? shot.locations  : [];

  const parts = [
    ...charNames.map(n => getCharacterLock(kb, n)).filter(Boolean),
    ...(locNames.length ? [getLocationLock(kb, locNames[0])].filter(Boolean) : []),
  ];

  return parts.join("\n\n");
}

// ─── Shot-list generation context ────────────────────────────────────────────

/**
 * Build the full KB context block for shot list generation.
 * Includes preamble + all character locks + all location locks + style lock.
 */
export function getKBContextForShotList(kb) {
  if (!isKBUsable(kb)) return "";

  const sections = [];

  const preamble = getProjectPreamble(kb);
  if (preamble) sections.push(`KNOWLEDGE BASE — PROJECT IDENTITY\n${preamble}`);

  const charEntries = Object.entries(kb.characters || {});
  if (charEntries.length) {
    const blocks = charEntries
      .map(([, entry]) => entry?.prompt_lock)
      .filter(Boolean)
      .join("\n\n");
    if (blocks) sections.push(`KNOWLEDGE BASE — CHARACTER LOCKS (use these exact descriptions)\n${blocks}`);
  }

  const locEntries = Object.entries(kb.locations || {});
  if (locEntries.length) {
    const blocks = locEntries
      .map(([, entry]) => entry?.prompt_lock)
      .filter(Boolean)
      .join("\n\n");
    if (blocks) sections.push(`KNOWLEDGE BASE — LOCATION LOCKS (use these exact environments)\n${blocks}`);
  }

  const styleLock = getStyleLock(kb);
  if (styleLock) sections.push(`KNOWLEDGE BASE — VISUAL STYLE LOCK\n${styleLock}`);

  return sections.join("\n\n");
}

// ─── Summary helpers (for UI display) ────────────────────────────────────────

/** Return a summary object for display in the UI. */
export function getKBSummary(kb) {
  if (!isKBUsable(kb)) {
    return { usable: false, built_at: null, age_hours: null, characters: 0, locations: 0, has_style: false };
  }
  return {
    usable: true,
    built_at: kb.built_at,
    age_hours: Math.round(getKBAgeHours(kb) * 10) / 10,
    stale: isKBStale(kb),
    characters: Object.keys(kb.characters).length,
    locations: Object.keys(kb.locations).length,
    has_style: Boolean(kb.style?.global_lock),
    mood_keywords: kb.project?.mood_keywords || [],
  };
}
