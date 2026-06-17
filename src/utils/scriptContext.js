/**
 * scriptContext.js
 *
 * Extracts generation-relevant context from a project's script, analysis,
 * characters, and locations data. Used by character, wardrobe, and location
 * image generation routes to make prompts script-aware.
 */

const compact = (v, max = 500) => {
  if (!v) return "";
  const s = String(v).replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
};

// Keywords that indicate an outfit/clothing description nearby
const OUTFIT_KEYWORDS = [
  "wearing", "wears", "dressed in", "dressed", "outfit", "clothes", "clothing",
  "shirt", "t-shirt", "tee", "blouse", "top", "sweater", "hoodie", "jacket",
  "coat", "blazer", "suit", "dress", "skirt", "jeans", "pants", "trousers",
  "shorts", "kurta", "saree", "salwar", "dupatta", "dhoti", "sherwani",
  "lehenga", "anarkali", "churidar", "linen", "denim", "leather",
  "boots", "sneakers", "shoes", "sandals", "heels", "accessories",
  "scarf", "hat", "cap", "turban", "jewellery", "jewelry", "necklace",
  "earrings", "bracelet", "ring", "watch", "sunglasses",
];

// Atmosphere / environment keywords for location context
const ATMOSPHERE_KEYWORDS = [
  "dusty", "golden", "neon", "dark", "bright", "foggy", "misty", "hazy",
  "crowded", "empty", "abandoned", "lush", "barren", "urban", "rural",
  "night", "day", "dawn", "dusk", "sunset", "sunrise", "overcast", "sunny",
  "rain", "wet", "dry", "hot", "cold", "warm", "cool", "humid",
];

function normName(name) {
  return String(name || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function sceneContainsName(scene, name) {
  if (!name) return false;
  const visual = normName(scene?.visual || "");
  const n = normName(name);
  if (!n) return false;
  // Match whole-word or partial name (handles "THE GIRL" matching "girl")
  return visual.includes(n) || n.split(" ").some(part => part.length > 2 && visual.includes(part));
}

/**
 * Extract all script context relevant to a character and/or location.
 *
 * @param {object} opts
 * @param {object} opts.projectState    Full project_state object
 * @param {string} [opts.characterName] Character to look for
 * @param {string} [opts.locationName]  Location to look for
 *
 * @returns {object} Structured context for prompt injection
 */
export function extractScriptContext({ projectState, characterName, locationName } = {}) {
  const script    = projectState?.script   || {};
  const analysis  = projectState?.analysis || {};
  const scenes    = Array.isArray(script.scenes) ? script.scenes : [];
  const transcript = Array.isArray(analysis.lyrics || script.lyrics_timeline)
    ? (analysis.lyrics || script.lyrics_timeline)
    : [];

  const charNorm = normName(characterName);
  const locNorm  = normName(locationName);

  // Scenes that mention the character
  const charScenes = scenes.filter(s => sceneContainsName(s, charNorm));
  // Scenes that mention the location
  const locScenes  = scenes.filter(s => sceneContainsName(s, locNorm));
  // Scenes that mention both (highest relevance for wardrobe)
  const overlapScenes = charNorm && locNorm
    ? scenes.filter(s => sceneContainsName(s, charNorm) && sceneContainsName(s, locNorm))
    : [];

  // --- Outfit extraction ---
  // Prioritise overlap scenes (char + location), then char-only scenes
  const outfitSourceScenes = [...overlapScenes, ...charScenes.filter(s => !overlapScenes.includes(s))];
  const outfitMentions = [];
  for (const scene of outfitSourceScenes) {
    const text  = String(scene.visual || "");
    const lower = text.toLowerCase();
    const hasOutfitKeyword = OUTFIT_KEYWORDS.some(kw => lower.includes(kw));
    if (hasOutfitKeyword) {
      outfitMentions.push(compact(text, 600));
    }
  }

  // --- Location atmosphere extraction ---
  const atmosphereMentions = locScenes
    .map(s => {
      const text  = String(s.visual || "");
      const lower = text.toLowerCase();
      const hasAtmosphere = ATMOSPHERE_KEYWORDS.some(kw => lower.includes(kw));
      return hasAtmosphere ? compact(text, 400) : null;
    })
    .filter(Boolean);

  // --- Character appearance notes ---
  const charAppearanceSentences = charScenes
    .map(s => compact(s.visual || "", 400))
    .filter(Boolean);

  // --- Direct character/location objects from projectState ---
  const characters = Array.isArray(projectState?.characters) ? projectState.characters : [];
  const locations  = Array.isArray(projectState?.locations)  ? projectState.locations  : [];

  const charObj = charNorm
    ? characters.find(c => normName(c?.name) === charNorm || normName(c?.name).split(" ").some(p => charNorm.includes(p)))
    : null;
  const locObj = locNorm
    ? locations.find(l => normName(l?.name) === locNorm || normName(l?.name).split(" ").some(p => locNorm.includes(p)))
    : null;

  // Wardrobe entry for this char × location
  const wardrobe = Array.isArray(projectState?.wardrobe) ? projectState.wardrobe : [];
  const locWardrobeEntry = locObj
    ? wardrobe.find(w => normName(w?.location_name) === normName(locObj.name))
    : null;
  const existingOutfitEntry = locWardrobeEntry && charObj
    ? (locWardrobeEntry.outfits || []).find(o => normName(o?.character_name) === normName(charObj.name))
    : null;

  return {
    // Project-level
    projectTitle:     compact(script.title, 80),
    projectMood:      compact(script.mood || analysis.mood, 300),
    projectGenre:     compact(analysis.genre || analysis.theme, 150),
    projectStoreline: compact(script.storyline || analysis.summary, 600),
    styleBible:       projectState?.style_bible || null,

    // Character
    characterName:       charObj?.name    || characterName || "",
    characterDesc:       compact(charObj?.visual_prompt || charObj?.description, 500),
    characterPersonality: compact(charObj?.personality || charObj?.role, 300),
    characterPhysique:   compact(charObj?.physique || charObj?.appearance, 250),
    characterCostume:    compact(charObj?.costume  || charObj?.wardrobe, 250),

    // Location
    locationName:   locObj?.name    || locationName || "",
    locationDesc:   compact(locObj?.visual_prompt || locObj?.description, 400),
    locationAtmos:  compact(locObj?.atmosphere, 200),

    // Script-derived
    outfitMentions,           // scene visuals that contain explicit outfit info
    charAppearanceSentences,  // all scene visuals for this character
    atmosphereMentions,       // scene visuals with atmosphere info for this location
    overlapVisuals:           overlapScenes.map(s => compact(s.visual, 400)).filter(Boolean),

    // Existing wardrobe entry (if any already saved)
    existingOutfitName:  compact(existingOutfitEntry?.outfit_name, 120),
    existingOutfitDesc:  compact(existingOutfitEntry?.description, 400),
  };
}

/**
 * Build a compact "outfit intelligence" block for prompt injection.
 * Returns either the explicit script-derived outfit or a prediction brief.
 */
export function buildOutfitIntelligenceBlock(ctx) {
  const lines = [];

  if (ctx.outfitMentions.length) {
    lines.push("OUTFIT — FROM SCRIPT (explicit mention found, use this as primary reference):");
    ctx.outfitMentions.forEach((m, i) => lines.push(`  Scene ${i + 1}: ${m}`));
    lines.push("→ The prompt MUST generate the outfit as described in the script above.");
  } else if (ctx.existingOutfitName || ctx.existingOutfitDesc) {
    lines.push("OUTFIT — FROM WARDROBE DATA (use as primary reference):");
    if (ctx.existingOutfitName) lines.push(`  Name: ${ctx.existingOutfitName}`);
    if (ctx.existingOutfitDesc) lines.push(`  Description: ${ctx.existingOutfitDesc}`);
  } else {
    lines.push("OUTFIT — PREDICT FROM CHARACTER + CONTEXT (no explicit outfit in script):");
    if (ctx.characterPersonality) lines.push(`  Character personality: ${ctx.characterPersonality}`);
    if (ctx.characterCostume)     lines.push(`  Character base wardrobe: ${ctx.characterCostume}`);
    if (ctx.locationAtmos)        lines.push(`  Location feel: ${ctx.locationAtmos}`);
    if (ctx.projectMood)          lines.push(`  Project mood: ${ctx.projectMood}`);
    if (ctx.projectGenre)         lines.push(`  Genre: ${ctx.projectGenre}`);
    lines.push("→ Predict an outfit that fits this character's personality, the location's atmosphere, and the overall project mood. Be specific about fabrics, colours, and fit.");
  }

  return lines.join("\n");
}

/**
 * Build a compact "location intelligence" block for prompt injection.
 */
export function buildLocationIntelligenceBlock(ctx) {
  const lines = [];

  if (ctx.overlapVisuals.length) {
    lines.push("LOCATION — FROM SCRIPT (scenes at this location):");
    ctx.overlapVisuals.slice(0, 3).forEach((v, i) => lines.push(`  Scene ${i + 1}: ${v}`));
  } else if (ctx.atmosphereMentions.length) {
    lines.push("LOCATION — ATMOSPHERE FROM SCRIPT:");
    ctx.atmosphereMentions.slice(0, 3).forEach((m, i) => lines.push(`  ${i + 1}: ${m}`));
  }

  if (ctx.locationDesc) {
    lines.push(`Location description: ${ctx.locationDesc}`);
  }
  if (ctx.locationAtmos) {
    lines.push(`Atmosphere: ${ctx.locationAtmos}`);
  }
  if (ctx.projectMood) {
    lines.push(`Project mood: ${ctx.projectMood}`);
  }
  if (ctx.projectGenre) {
    lines.push(`Genre: ${ctx.projectGenre}`);
  }

  return lines.join("\n");
}

/**
 * Build a compact "character intelligence" block for prompt injection.
 */
export function buildCharacterIntelligenceBlock(ctx) {
  const lines = [];

  if (ctx.charAppearanceSentences.length) {
    lines.push("CHARACTER — FROM SCRIPT (how they appear in scenes):");
    ctx.charAppearanceSentences.slice(0, 4).forEach((s, i) => lines.push(`  Scene ${i + 1}: ${s}`));
  }

  if (ctx.characterDesc)         lines.push(`Visual description: ${ctx.characterDesc}`);
  if (ctx.characterPersonality)  lines.push(`Personality: ${ctx.characterPersonality}`);
  if (ctx.characterPhysique)     lines.push(`Physique: ${ctx.characterPhysique}`);
  if (ctx.characterCostume)      lines.push(`Base costume: ${ctx.characterCostume}`);
  if (ctx.projectMood)           lines.push(`Project mood: ${ctx.projectMood}`);
  if (ctx.projectStoreline)      lines.push(`Story context: ${ctx.projectStoreline}`);

  return lines.join("\n");
}
