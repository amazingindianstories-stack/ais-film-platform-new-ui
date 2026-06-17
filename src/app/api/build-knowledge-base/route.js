import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase-admin";
import { getFallbackModels, runWithModelFallback, TEXT_MODEL_FALLBACKS } from "@/utils/googleModelFallbacks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ai = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY })
  : null;

const KB_MODEL = process.env.GOOGLE_KB_MODEL || "gemini-2.5-flash";
const IMAGE_FETCH_TIMEOUT_MS = 20000;
const IMAGE_MAX_BYTES = 6 * 1024 * 1024;
const CHARS_PER_CHARACTER = 3;  // reference images per character
const CHARS_PER_LOCATION = 2;   // reference images per location
const WARDROBE_IMAGES_PER_OUTFIT = 2;

// ─── Helpers ────────────────────────────────────────────────────────────────

const compact = (value, max = 800) => {
  if (!value) return "";
  const s = String(value).replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

function normaliseName(n) {
  return String(n || "").replace(/\s+/g, " ").trim().toUpperCase();
}

function extractJsonObject(text) {
  const fenced = text?.match(/```json\s*([\s\S]*?)```/i)?.[1];
  const bare = text?.match(/\{[\s\S]*\}/)?.[0];
  for (const candidate of [fenced, bare, text].filter(Boolean)) {
    try { return JSON.parse(candidate); } catch { /* keep trying */ }
  }
  return null;
}

function inferMime(url, contentType) {
  const ct = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (ct.startsWith("image/")) return ct;
  const u = String(url || "").toLowerCase();
  if (u.includes(".jpg") || u.includes(".jpeg")) return "image/jpeg";
  if (u.includes(".webp")) return "image/webp";
  return "image/png";
}

async function fetchImage(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Image fetch ${res.status}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > IMAGE_MAX_BYTES) throw new Error("Image too large");
  return {
    url,
    mimeType: inferMime(url, res.headers.get("content-type")),
    data: Buffer.from(buf).toString("base64"),
  };
}

// Priority labels for picking best reference images
const CHAR_PRIORITIES = ["face close-up front", "face close-up", "close-up", "portrait front", "face front", "full body front", "front"];
const LOC_PRIORITIES = ["establishing", "wide", "interior wide", "exterior", "aerial", "atmosphere"];

function scoreLabel(label, priorities) {
  const l = String(label || "").toLowerCase();
  const i = priorities.findIndex(p => l.includes(p));
  return i === -1 ? priorities.length + 1 : i;
}

function pickReferenceImages(asset, { priorities, limit }) {
  const images = Array.isArray(asset?.images) ? asset.images : [];
  const refs = images
    .map((img, idx) => {
      let d = typeof img === "string" ? { url: img } : img;
      if (!d?.url || !/^https?:\/\//i.test(d.url)) return null;
      return { url: d.url, label: d.label || d.name || `ref-${idx}`, score: scoreLabel(d.label, priorities) * 100 + idx };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);

  if (!refs.length && asset?.sheetUrl && /^https?:\/\//i.test(asset.sheetUrl)) {
    refs.push({ url: asset.sheetUrl, label: "full sheet" });
  }
  return refs;
}

function pickWardrobeImages(outfit, limit = WARDROBE_IMAGES_PER_OUTFIT) {
  const images = Array.isArray(outfit?.images) ? outfit.images : [];
  const primary = outfit?.image_url || outfit?.imageUrl || outfit?.url;
  const refs = primary ? [{ url: primary, label: outfit?.outfit_name || outfit?.name || "wardrobe" }, ...images] : images;
  const seen = new Set();
  return refs
    .map((img, idx) => {
      const item = typeof img === "string" ? { url: img } : img;
      if (!item?.url || !/^https?:\/\//i.test(item.url) || seen.has(item.url)) return null;
      seen.add(item.url);
      return { url: item.url, label: item.label || item.name || outfit?.outfit_name || `wardrobe-${idx}` };
    })
    .filter(Boolean)
    .slice(0, limit);
}

function collectReferenceImages(projectState) {
  const characters = Array.isArray(projectState?.characters) ? projectState.characters : [];
  const locations = Array.isArray(projectState?.locations) ? projectState.locations : [];
  const wardrobe = Array.isArray(projectState?.wardrobe) ? projectState.wardrobe : [];
  const seen = new Set();
  const out = [];

  for (const char of characters) {
    for (const ref of pickReferenceImages(char, { priorities: CHAR_PRIORITIES, limit: CHARS_PER_CHARACTER })) {
      if (seen.has(ref.url)) continue;
      seen.add(ref.url);
      out.push({ ...ref, kind: "character", entityName: char.name });
    }
  }
  for (const loc of locations) {
    for (const ref of pickReferenceImages(loc, { priorities: LOC_PRIORITIES, limit: CHARS_PER_LOCATION })) {
      if (seen.has(ref.url)) continue;
      seen.add(ref.url);
      out.push({ ...ref, kind: "location", entityName: loc.name });
    }
  }
  for (const entry of wardrobe) {
    const owner = entry?.character_name || entry?.name || "";
    for (const outfit of Array.isArray(entry?.outfits) ? entry.outfits : []) {
      const characterName = outfit?.character_name || owner || "Character";
      const outfitName = outfit?.outfit_name || outfit?.name || "Wardrobe outfit";
      for (const ref of pickWardrobeImages(outfit)) {
        if (seen.has(ref.url)) continue;
        seen.add(ref.url);
        out.push({ ...ref, kind: "wardrobe", entityName: characterName, label: `${outfitName} outfit` });
      }
    }
  }
  return out;
}

async function loadImages(refs) {
  const results = await Promise.all(
    refs.map(async ref => {
      try { return { ...ref, ...(await fetchImage(ref.url)) }; }
      catch (err) { console.warn(`KB: skipping image ${ref.url}:`, err.message); return null; }
    })
  );
  return results.filter(Boolean);
}

// ─── Prompt builder ──────────────────────────────────────────────────────────

function buildMasterPrompt(projectState, loadedImages) {
  const characters = Array.isArray(projectState?.characters) ? projectState.characters : [];
  const locations = Array.isArray(projectState?.locations) ? projectState.locations : [];
  const wardrobe = Array.isArray(projectState?.wardrobe) ? projectState.wardrobe : [];
  const styleBible = projectState?.style_bible || null;
  const script = projectState?.script || {};
  const analysis = projectState?.analysis || {};

  const imageManifest = loadedImages
    .map((img, i) => `  Image ${i + 1}: [${img.kind.toUpperCase()}] "${img.entityName}" — ${img.label}`)
    .join("\n");

  const characterBlocks = characters.map(c => `
CHARACTER: ${c.name}
Role: ${compact(c.role || c.description, 200)}
Visual description: ${compact(c.visual_prompt || c.description, 500)}
Physique/appearance: ${compact(c.physique || c.appearance, 300)}
Personality: ${compact(c.personality, 300)}
Default outfit: ${compact(c.costume || c.wardrobe || c.outfit || c.costume_prompt, 300)}`).join("\n---\n");

  const locationBlocks = locations.map(l => `
LOCATION: ${l.name}
Description: ${compact(l.description, 400)}
Visual prompt: ${compact(l.visual_prompt || l.description, 500)}
Atmosphere: ${compact(l.atmosphere, 200)}`).join("\n---\n");

  const wardrobeBlock = wardrobe.map(entry => {
    const characterScoped = entry?.scope === "character" || entry?.character_name || entry?.character_id;
    const outfits = Array.isArray(entry.outfits) ? entry.outfits.map(o => {
      const owner = o.character_name || entry.character_name || "Character";
      const label = compact(o.outfit_name || o.description, 160);
      return characterScoped ? `  ${label}` : `  ${owner}: ${label}`;
    }).join("\n") : "";
    return characterScoped
      ? `Character: ${entry.character_name || entry.name}\n${outfits}`
      : `Location: ${entry.location_name}\n${outfits}`;
  }).join("\n");

  const styleBibleBlock = styleBible ? `
Colour palette: ${JSON.stringify(styleBible.colour_grade?.primary_palette)}
Lighting style: ${styleBible.lighting_style}
Camera rules: ${styleBible.camera_rules}
Visual tone: ${styleBible.visual_tone}
Negative constraints: ${styleBible.negative_constraints}
Reference summary: ${styleBible.reference_summary}` : "Not yet generated.";

  return `You are the Master Knowledge Base Agent for a professional AI music video production pipeline.

Your job is to analyse ALL project data — script, characters, locations, wardrobe, style bible, and reference images — and produce an exhaustive, production-grade knowledge base. Other AI agents (image generation, video generation, wardrobe design, shot planning) will inject these fields verbatim into their prompts. This KB is the single source of truth for the entire production.

QUALITY BAR: Professional film/music video production level. Think: the detail you'd find in a director's visual bible, a costume designer's breakdown, and a cinematographer's look-book combined.

The "prompt_lock" fields are the most critical — they are pasted directly into generation prompts and must produce consistent results every single time. They must be:
- Self-contained (never use pronouns — always use the character/location name)
- Visually precise: exact colours (descriptive + approximate hex where useful), specific fabrics, textures, measurements, lighting angles
- 120–160 words for characters, 80–120 words for locations
- Written as a locked visual specification, not a story description

═══ ALL PROJECT DATA ═══

TITLE: ${script.title || "Untitled"}
MOOD: ${compact(script.mood || analysis.mood, 400)}
GENRE / THEME: ${compact(analysis.genre || analysis.theme, 250)}
STORYLINE: ${compact(script.storyline || analysis.summary, 1000)}
SCRIPT SCENES:
${Array.isArray(script.scenes) ? script.scenes.slice(0, 20).map((s, i) => `  Scene ${i + 1}: ${compact(s.visual || s.description, 300)}`).join("\n") : "  None."}

CHARACTERS:
${characterBlocks || "None provided."}

LOCATIONS:
${locationBlocks || "None provided."}

WARDROBE:
${wardrobeBlock || "None provided."}

STYLE BIBLE:
${styleBibleBlock}

ATTACHED REFERENCE IMAGES (use these as the primary visual truth for prompt_locks):
${imageManifest || "None attached."}

═══ REQUIRED OUTPUT — PROFESSIONAL KNOWLEDGE BASE ═══

Return ONLY a valid JSON object. No other text, no markdown fences:

{
  "project": {
    "identity": "3-sentence statement: what this music video IS — story premise, emotional core, and visual world. Specific enough to brief a director of photography.",
    "mood_keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5", "keyword6"],
    "visual_language": "Precise cinematographic brief: dominant focal length(s), aperture feel (deep vs shallow focus), primary shot sizes, camera movement style (static/handheld/gimbal/drone), frame rate feel (24p cinematic/48p hyper-real), and composition philosophy.",
    "color_science": "Detailed colour grade description: shadow colour cast, midtone balance, highlight rolloff, saturation level, dominant palette (name + approximate hex for 3–5 key colours), skin tone treatment, and the overall colour temperature language (warm/cool/split-grade).",
    "lighting_language": "Key light source and quality (hard/soft/diffused), dominant lighting setup (3-point/available light/practicals-driven/motivated naturalistic), shadow treatment (deep/gentle/transparent), and any signature lighting motifs (e.g. shaft of sunlight, neon bounce, golden backlight).",
    "editing_rhythm": "Cut rhythm relative to music (on-beat/off-beat/breathing with the song), dominant transition language (hard cut/dissolve/match-cut/whip), and pacing philosophy (frenetic/contemplative/building).",
    "visual_motifs": ["motif 1 — brief description", "motif 2", "motif 3"],
    "narrative_arc": "1-sentence emotional journey from first frame to last — the transformation or revelation the viewer experiences.",
    "production_rules": ["rule 1: what this production ALWAYS does", "rule 2", "rule 3", "rule 4"],
    "preamble": "4–5 sentence master context paragraph injected at the start of every generation prompt. Must cover: project title + story premise, emotional/visual tone, specific colour and lighting language, cast and locations present, and hard constraints (never invent new characters, never add text overlays, never change location geography, maintain exact character appearance unless wardrobe override specified)."
  },
  "characters": {
    "CHARACTER_NAME_UPPERCASE": {
      "personality_core": "3-sentence portrait: who this person is, what they want, what drives their behaviour in this story. Narrative-agent facing.",
      "emotional_arc": "How this character's emotional state shifts across the video — opening state, turning point, and final state.",
      "screen_presence": "How this character moves and holds themselves on screen — energy level, physicality, gaze direction, relationship to the camera.",
      "relationships": "Their dynamic with each other named character in this production — 1 sentence per relationship.",
      "physique": "Precise: height estimate, build (lean/athletic/stocky/etc.), posture, distinguishing physical characteristics, skin tone (descriptive + approximate hex).",
      "face": "Precise facial description: face shape, bone structure, eye colour + shape + intensity, nose, lips, jawline, hairline. Specific enough to reproduce consistently across 50 frames.",
      "hair": "Hair colour (natural + any treatment), texture (straight/wavy/curly/coiled), length, styling, and any signature hair elements.",
      "default_outfit": "The canonical outfit worn throughout most of the video: specific garments, exact colours (descriptive + hex), fabrics, fit, footwear, accessories. Precise enough for a costumer to source.",
      "fashion_style": "This character's fashion identity as a costume designer's brief: their style register (casual/streetwear/formal/eclectic/etc.), silhouette preferences, palette tendencies, formality range, signature accessories or styling details, and cultural/subcultural references in their aesthetic. 3–4 sentences. Used by the wardrobe AI to design any outfit that feels authentically theirs.",
      "signature_elements": ["distinctive element 1 (e.g. always wears a specific type of jewelry)", "element 2", "element 3"],
      "prompt_lock": "THE DEFINITIVE GENERATION LOCK — 120–160 words. Structure: [CHARACTER NAME], [age range], [ethnicity/background], [physique with posture], [face with all key features], [hair exact description], [default outfit with fabric + colour + fit + footwear + accessories]. Close with exactly: 'Maintain this exact physical appearance, facial structure, and default outfit in every frame. Apply wardrobe overrides only when explicitly specified.'"
    }
  },
  "locations": {
    "LOCATION_NAME_UPPERCASE": {
      "type": "Interior/Exterior, location category (urban street/indoor arena/rural landscape/etc.)",
      "atmosphere": "Mood, energy, and emotional register of this space — how it feels to be there.",
      "time_and_light": "Time of day, season, weather, natural light quality and direction. If interior: dominant light sources (tungsten/fluorescent/neon/windows/practicals).",
      "color_palette": "3–5 dominant colours in this environment (descriptive + approximate hex). Note which colours are architectural vs. atmospheric vs. accent.",
      "materials_and_textures": "Key surface materials — walls, floors, props, vegetation. Specific: worn concrete, brushed steel, weathered wood, AstroTurf, neon-sign-lit glass, etc.",
      "spatial_layout": "Rough geometry: scale (intimate/vast), key sightlines, depth layers (foreground/midground/background elements), and how the camera would naturally move through this space.",
      "production_design_notes": "Specific props, set dressing elements, signage, or environmental details that define this location's identity and must remain consistent.",
      "prompt_lock": "THE DEFINITIVE GENERATION LOCK — 80–120 words. Structure: [LOCATION NAME], [interior/exterior], [time/light], [dominant materials and colours with hex approximations], [atmospheric details], [spatial feel], [key environmental props]. Close with: 'Copy this exact visual environment; do not alter the architecture, colour palette, spatial layout, or lighting conditions.'"
    }
  },
  "style": {
    "cinematography": "Full camera language brief: focal length range, aperture approach (shallow/deep), dominant shot grammar (close-up heavy/wide establishing/intimate medium), camera movement vocabulary, and any signature framing devices.",
    "color_language": "Complete grade description: shadow colour cast + hex, midtone balance, highlight rolloff, overall saturation, skin tone rendering, and 3–5 palette colours with names + hex codes.",
    "lighting_philosophy": "The project's lighting DNA: key light quality and motivation, shadow depth and transparency, fill ratio, backlight treatment, and any location-specific lighting signatures.",
    "texture_and_grain": "Film stock feel, grain/noise level, sharpness vs. softness bias, lens flare treatment, and any deliberate optical signatures.",
    "global_lock": "A 150–200 word master visual consistency paragraph. Combines: project identity + colour grade + cinematography + lighting + mood + hard production rules. Every generation agent appends this to their prompt. Must be specific enough that two separate AI models produce visually consistent results.",
    "do": ["specific visual rule 1 this production always does", "rule 2", "rule 3", "rule 4", "rule 5", "rule 6"],
    "dont": ["specific visual mistake this production never makes", "dont 2", "dont 3", "dont 4", "dont 5", "dont 6"]
  }
}`;
}

// ─── Normaliser ──────────────────────────────────────────────────────────────

function normaliseKB(raw, projectState) {
  const r = raw && typeof raw === "object" ? raw : {};
  const characters = Array.isArray(projectState?.characters) ? projectState.characters : [];
  const locations = Array.isArray(projectState?.locations) ? projectState.locations : [];

  // Normalise character keys
  const normChars = {};
  const rawChars = r.characters && typeof r.characters === "object" ? r.characters : {};
  for (const [k, v] of Object.entries(rawChars)) {
    normChars[normaliseName(k)] = {
      personality_core:    compact(v?.personality_core, 500),
      emotional_arc:       compact(v?.emotional_arc, 300),
      screen_presence:     compact(v?.screen_presence, 300),
      relationships:       compact(v?.relationships, 400),
      physique:            compact(v?.physique, 300),
      face:                compact(v?.face, 400),
      hair:                compact(v?.hair, 200),
      default_outfit:      compact(v?.default_outfit, 400),
      fashion_style:       compact(v?.fashion_style, 500),
      signature_elements:  Array.isArray(v?.signature_elements) ? v.signature_elements.slice(0, 6) : [],
      prompt_lock:         compact(v?.prompt_lock, 900),
    };
  }
  // Ensure every character in projectState has at least a fallback entry
  for (const char of characters) {
    const key = normaliseName(char.name);
    if (!normChars[key]) {
      const fallback = compact(char.visual_prompt || char.description || char.role, 500);
      normChars[key] = {
        personality_core:    compact(char.personality || char.role, 400),
        emotional_arc:       "",
        screen_presence:     "",
        relationships:       "",
        physique:            compact(char.physique || char.appearance, 250),
        face:                "",
        hair:                "",
        default_outfit:      compact(char.costume || char.wardrobe, 300),
        fashion_style:       "",
        signature_elements:  [],
        prompt_lock:         `${char.name} — ${fallback}`,
      };
    }
  }

  // Normalise location keys
  const normLocs = {};
  const rawLocs = r.locations && typeof r.locations === "object" ? r.locations : {};
  for (const [k, v] of Object.entries(rawLocs)) {
    normLocs[normaliseName(k)] = {
      type:                      compact(v?.type, 100),
      atmosphere:                compact(v?.atmosphere, 400),
      time_and_light:            compact(v?.time_and_light, 300),
      color_palette:             compact(v?.color_palette, 300),
      materials_and_textures:    compact(v?.materials_and_textures, 300),
      spatial_layout:            compact(v?.spatial_layout, 300),
      production_design_notes:   compact(v?.production_design_notes, 400),
      prompt_lock:               compact(v?.prompt_lock, 700),
    };
  }
  for (const loc of locations) {
    const key = normaliseName(loc.name);
    if (!normLocs[key]) {
      normLocs[key] = {
        type:                    "",
        atmosphere:              compact(loc.atmosphere || loc.description, 300),
        time_and_light:          "",
        color_palette:           "",
        materials_and_textures:  "",
        spatial_layout:          "",
        production_design_notes: "",
        prompt_lock:             `${loc.name} — ${compact(loc.visual_prompt || loc.description, 400)}`,
      };
    }
  }

  const proj  = r.project && typeof r.project === "object" ? r.project : {};
  const style = r.style   && typeof r.style   === "object" ? r.style   : {};

  return {
    v: 1,
    built_at: new Date().toISOString(),
    project: {
      identity:          compact(proj.identity, 500),
      mood_keywords:     Array.isArray(proj.mood_keywords) ? proj.mood_keywords.slice(0, 8) : [],
      visual_language:   compact(proj.visual_language, 400),
      color_science:     compact(proj.color_science, 400),
      lighting_language: compact(proj.lighting_language, 350),
      editing_rhythm:    compact(proj.editing_rhythm, 300),
      visual_motifs:     Array.isArray(proj.visual_motifs) ? proj.visual_motifs.slice(0, 6) : [],
      narrative_arc:     compact(proj.narrative_arc, 300),
      production_rules:  Array.isArray(proj.production_rules) ? proj.production_rules.slice(0, 8) : [],
      preamble:          compact(proj.preamble, 1200),
    },
    characters: normChars,
    locations:  normLocs,
    style: {
      cinematography:       compact(style.cinematography, 400),
      color_language:       compact(style.color_language, 400),
      lighting_philosophy:  compact(style.lighting_philosophy, 350),
      texture_and_grain:    compact(style.texture_and_grain, 250),
      global_lock:          compact(style.global_lock, 1000),
      do:   Array.isArray(style.do)   ? style.do.slice(0, 8)   : [],
      dont: Array.isArray(style.dont) ? style.dont.slice(0, 8) : [],
    },
  };
}

// ─── Persist ─────────────────────────────────────────────────────────────────

async function persistKB({ projectId, kb, projectState }) {
  const merged = { ...(projectState || {}), knowledge_base: kb };
  if (!projectId) return merged;

  const supabase = createAdminClient();
  const { data: row, error: fetchErr } = await supabase
    .from("projects")
    .select("project_state")
    .eq("id", projectId)
    .single();
  if (fetchErr) throw fetchErr;

  const next = { ...(row?.project_state || {}), knowledge_base: kb };

  const { error: upErr } = await supabase
    .from("projects")
    .update({ project_state: next })
    .eq("id", projectId);
  if (upErr) throw upErr;

  return next;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req) {
  if (!ai) {
    return NextResponse.json({ error: "GOOGLE_AI_API_KEY not configured." }, { status: 500 });
  }

  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const { projectId, projectState = {}, force = false } = body;

  // ── Server-side cooldown guard ───────────────────────────────────────────
  // Absolute minimum: 10 minutes between rebuilds (unless force=true).
  // The client debouncer is the primary gate; this is the safety net.
  const KB_MIN_INTERVAL_MS = 10 * 60 * 1000;
  const existingKB = projectState?.knowledge_base;
  if (!force && existingKB?.built_at) {
    const ageMs = Date.now() - new Date(existingKB.built_at).getTime();
    if (ageMs < KB_MIN_INTERVAL_MS) {
      console.log(`[KB] Skipping rebuild — last built ${Math.round(ageMs / 60000)}m ago (cooldown: 10m)`);
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "cooldown",
        knowledge_base: existingKB,
      });
    }
  }

  // Collect and load reference images
  const refCandidates = collectReferenceImages(projectState);
  const loadedImages = await loadImages(refCandidates);

  const prompt = buildMasterPrompt(projectState, loadedImages);

  // Build parts array: text prompt + inline images
  const parts = [
    { text: prompt },
    ...loadedImages.map(img => ({
      inlineData: { mimeType: img.mimeType, data: img.data },
    })),
  ];

  let responseText = "";
  try {
    const models = getFallbackModels(KB_MODEL, TEXT_MODEL_FALLBACKS);

    // Try multimodal first (with images), fallback to text-only if needed
    const hasImages = loadedImages.length > 0;

    if (hasImages) {
      try {
        const result = await ai.models.generateContent({
          model: KB_MODEL,
          contents: [{ role: "user", parts }],
        });
        responseText = result.candidates?.[0]?.content?.parts?.find(p => p.text)?.text || "";
      } catch (imgErr) {
        console.warn("KB: multimodal attempt failed, trying text-only:", imgErr.message);
        // Fall through to text-only below
      }
    }

    if (!responseText) {
      // Text-only fallback using the existing runWithModelFallback helper
      const { result } = await runWithModelFallback({
        label: "knowledge-base-build",
        models,
        operation: async (modelName) => {
          const m = ai.models || { generateContent: (opts) => ai.getGenerativeModel({ model: modelName }).generateContent(opts.contents[0].parts.find(p => p.text).text) };
          return ai.models.generateContent({
            model: modelName,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
          });
        },
      });
      responseText = result?.candidates?.[0]?.content?.parts?.find(p => p.text)?.text || "";
    }
  } catch (err) {
    console.error("KB: generation failed:", err);
    return NextResponse.json({ error: "Knowledge base generation failed: " + (err.message || err) }, { status: 500 });
  }

  const raw = extractJsonObject(responseText);
  if (!raw) {
    return NextResponse.json({ error: "Model did not return valid JSON for the knowledge base." }, { status: 500 });
  }

  const kb = normaliseKB(raw, projectState);

  let updatedState;
  try {
    updatedState = await persistKB({ projectId, kb, projectState });
  } catch (err) {
    console.error("KB: persist failed:", err);
    return NextResponse.json({ error: "Failed to save knowledge base: " + (err.message || err) }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    knowledge_base: kb,
    project_state: updatedState,
    reference_images_used: loadedImages.length,
    characters_documented: Object.keys(kb.characters).length,
    locations_documented: Object.keys(kb.locations).length,
  });
}
