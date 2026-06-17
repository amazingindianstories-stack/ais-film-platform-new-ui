import { NextResponse } from "next/server";
import { getFallbackModels, runWithModelFallback, TEXT_MODEL_FALLBACKS } from "@/utils/googleModelFallbacks";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { isKBUsable, getCharacterEntry, getLocationEntry, getStyleLock, getCharacterFashionStyle, getLocationWardrobeContext, getColorScience, getLightingLanguage } from "@/utils/knowledgeBase";
import { extractScriptContext, buildOutfitIntelligenceBlock, buildLocationIntelligenceBlock } from "@/utils/scriptContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const genAI = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
  : null;

const compact = (v, max = 500) => {
  if (!v) return "";
  const s = String(v).replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
};

function extractJsonArray(text) {
  const fenced = text?.match(/```json\s*([\s\S]*?)```/i)?.[1];
  const arrMatch = text?.match(/\[[\s\S]*\]/)?.[0];
  const objMatch = text?.match(/\{[\s\S]*\}/)?.[0];
  for (const c of [fenced, arrMatch, objMatch && `[${objMatch}]`, text].filter(Boolean)) {
    try {
      const parsed = JSON.parse(c);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch { /* keep trying */ }
  }
  return null;
}

/**
 * POST /api/generate-wardrobe-outfit
 *
 * Generates outfit name + description for one or all characters at a given
 * location, using the KB prompt_locks as the primary source of visual identity.
 *
 * Body:
 *   projectState  — full project_state object (must contain KB if available)
 *   locationName  — which location to style for
 *   characters    — array of { name, description, visual_prompt, costume, personality }
 *                   (subset of project characters to generate for)
 *
 * Returns:
 *   { outfits: [{ character_name, outfit_name, description }] }
 */
export async function POST(req) {
  if (!genAI) {
    return NextResponse.json({ error: "GOOGLE_AI_API_KEY not configured." }, { status: 500 });
  }

  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const { projectState = {}, locationName, characters: requestedChars } = body;

  if (!locationName) {
    return NextResponse.json({ error: "locationName is required." }, { status: 400 });
  }

  const allChars = Array.isArray(projectState?.characters) ? projectState.characters : [];
  const chars = Array.isArray(requestedChars) && requestedChars.length
    ? requestedChars
    : allChars;

  if (!chars.length) {
    return NextResponse.json({ error: "No characters provided." }, { status: 400 });
  }

  const kb = projectState?.knowledge_base;
  const kbUsable = isKBUsable(kb);

  // ── Project-level context ────────────────────────────────────────────────

  const projectTitle    = projectState?.script?.title || "Untitled";
  const projectMood     = compact(projectState?.script?.mood || projectState?.analysis?.mood, 300);
  const projectGenre    = compact(projectState?.analysis?.genre || projectState?.analysis?.theme, 200);
  const projectStory    = compact(projectState?.script?.storyline || projectState?.analysis?.summary, 500);
  const styleLock       = kbUsable ? getStyleLock(kb) : "";

  // ── Location context ──────────────────────────────────────────────────────

  const normLoc = (s) => String(s || "").trim().toLowerCase();
  const locEntry = kbUsable ? getLocationEntry(kb, locationName) : null;
  const allLocations = Array.isArray(projectState?.locations) ? projectState.locations : [];
  const locObj = allLocations.find(l => normLoc(l?.name) === normLoc(locationName));
  const locationContext = kbUsable
    ? (getLocationWardrobeContext(kb, locationName) || locEntry?.prompt_lock || compact(locObj?.visual_prompt || locObj?.description || locationName, 500))
    : compact(locObj?.visual_prompt || locObj?.description || locationName, 500);
  const colorScience = kbUsable ? getColorScience(kb) : "";
  const lightingLang = kbUsable ? getLightingLanguage(kb) : "";

  // What actually HAPPENS at this location — scenes from the script
  const scriptScenes = Array.isArray(projectState?.script?.scenes) ? projectState.script.scenes : [];
  const scenesAtLocation = scriptScenes.filter(s => {
    const vis = normLoc(s?.visual || s?.location || "");
    const parts = normLoc(locationName).split(" ").filter(p => p.length > 3);
    return parts.some(p => vis.includes(p)) || vis.includes(normLoc(locationName));
  }).slice(0, 4);
  const locationActivityBlock = scenesAtLocation.length
    ? scenesAtLocation.map((s, i) => `  Scene ${i + 1}: ${compact(s.visual || s.description, 300)}`).join("\n")
    : "  (No explicit scenes found — infer from location description and project mood)";

  // ── Per-character blocks ──────────────────────────────────────────────────

  const existingWardrobe = Array.isArray(projectState?.wardrobe) ? projectState.wardrobe : [];
  const thisLocWardrobe = existingWardrobe.find(w => normLoc(w?.location_name) === normLoc(locationName));

  const characterBlocks = chars.map(char => {
    const charEntry = kbUsable ? getCharacterEntry(kb, char.name) : null;
    const visualLock = charEntry?.prompt_lock
      || compact(char.visual_prompt || char.description || char.role, 400);
    const physique = charEntry?.physique || compact(char.physique || char.appearance, 200);
    const face     = charEntry?.face     || "";
    const personality  = compact(char.personality || char.role, 200);
    const baseCostume  = compact(charEntry?.default_outfit || char.costume || char.wardrobe, 250);
    const fashionStyle = charEntry?.fashion_style
      || compact(char.fashion_style || char.style_notes, 350);

    // Script context for this character × location
    const ctx = extractScriptContext({ projectState, characterName: char.name, locationName });
    const outfitBlock    = buildOutfitIntelligenceBlock(ctx);

    // What this character already wears at OTHER locations (so we can create contrast)
    const otherLocationOutfits = existingWardrobe
      .filter(w => normLoc(w?.location_name) !== normLoc(locationName))
      .flatMap(w => (w.outfits || [])
        .filter(o => normLoc(o?.character_name) === normLoc(char.name) && (o.outfit_name || o.description))
        .map(o => `    ${w.location_name}: ${o.outfit_name ? `"${o.outfit_name}" — ` : ""}${compact(o.description, 150)}`)
      );

    // Already-saved outfit at THIS location (if any — use as reference / starting point)
    const existingHere = (thisLocWardrobe?.outfits || [])
      .find(o => normLoc(o?.character_name) === normLoc(char.name));

    return {
      name: char.name,
      visualLock,
      physique,
      face,
      personality,
      baseCostume,
      fashionStyle,
      outfitBlock,
      otherLocationOutfits,
      existingHere,
    };
  });

  // ── Ensemble context — who else is at this location ───────────────────────

  const ensembleNames = chars.map(c => c.name);
  const otherCastAtLocation = allChars
    .filter(c => !ensembleNames.includes(c.name))
    .slice(0, 6)
    .map(c => {
      const e = kbUsable ? getCharacterEntry(kb, c.name) : null;
      return `  ${c.name}: ${compact(e?.prompt_lock || c.visual_prompt || c.description, 150)}`;
    });

  // ── Build the prompt ──────────────────────────────────────────────────────

  const charList = characterBlocks.map(c => {
    const lines = [
      `━━ CHARACTER: ${c.name} ━━`,
      `Visual identity: ${c.visualLock}`,
      c.physique      ? `Physique: ${c.physique}` : "",
      c.personality   ? `Personality / role: ${c.personality}` : "",
      c.baseCostume   ? `Base/default wardrobe: ${c.baseCostume}` : "",
      c.fashionStyle  ? `Fashion identity (style sensibility — use to ensure new outfits feel authentically theirs): ${c.fashionStyle}` : "",
      "",
      c.outfitBlock,
    ];
    if (c.existingHere?.outfit_name || c.existingHere?.description) {
      lines.push("", `Previously saved outfit at this location (you may refine or replace):`);
      if (c.existingHere.outfit_name) lines.push(`  Name: ${c.existingHere.outfit_name}`);
      if (c.existingHere.description) lines.push(`  Description: ${compact(c.existingHere.description, 200)}`);
    }
    if (c.otherLocationOutfits.length) {
      lines.push("", `This character's outfits at OTHER locations (make THIS outfit visually distinct from all of these):`);
      c.otherLocationOutfits.forEach(l => lines.push(l));
    }
    return lines.filter(l => l !== null && l !== undefined).join("\n");
  }).join("\n\n");

  const systemPrompt = `You are a lead costume designer and fashion director for a cinematic music video production.

Your job: design a specific, location-tailored outfit for each character at ONE filming location.

CRITICAL RULES:
1. LOCATION-SPECIFICITY: Each outfit must be designed FOR THIS SPECIFIC LOCATION — its environment, time of day, activity, lighting, and atmosphere. The outfit should feel impossible to wear at a different location in this video.
2. VARIETY: If the character has outfits at other locations listed, this outfit MUST look meaningfully different — different palette, silhouette, or formality level. No two locations should produce identical or near-identical outfits.
3. ENSEMBLE COHESION: Characters filmed together at this location should look like they inhabit the same visual world — coordinate palette and style register even while keeping individual identity.
4. CHARACTER IDENTITY: Every outfit must feel true to the character's established look and personality. An outfit that fits the location but feels wrong for the character is a failure.
5. SPECIFICITY: Name exact fabrics, colours (precise descriptive names or hex), fit, footwear, and accessories. A costumer must be able to source or recreate it from your description alone.

Return ONLY a JSON array — no other text, no markdown:
[
  {
    "character_name": "exact name",
    "outfit_name": "3–6 word name that captures this specific look, e.g. 'Rain-Damp Stadium Jacket Look'",
    "description": "3–5 sentences covering: specific garments, exact colours, fabric/texture, fit, footwear, accessories. Location-specific rationale woven in naturally."
  }
]`;

  const userPrompt = `PROJECT: "${projectTitle}"
MOOD: ${projectMood || "Not specified"}
GENRE / THEME: ${projectGenre || "Not specified"}
STORY: ${projectStory || "Not specified"}
${styleLock ? `\nVISUAL STYLE LOCK:\n${styleLock}` : ""}
${colorScience ? `\nCOLOUR SCIENCE (how the grade affects fabric colour rendering): ${colorScience}` : ""}
${lightingLang ? `\nLIGHTING LANGUAGE (determines how outfit materials read on camera): ${lightingLang}` : ""}

━━━ LOCATION TO DRESS FOR ━━━
Name: ${locationName}
Environment + production design:
${locationContext}

What happens at this location (from script):
${locationActivityBlock}
${otherCastAtLocation.length ? `\nOther cast members also at this location (coordinate visually with them):\n${otherCastAtLocation.join("\n")}` : ""}

━━━ CHARACTERS TO DRESS ━━━
${charList}

Design a location-specific outfit for each character. Each outfit must be tailored to "${locationName}" and visually distinct from the character's looks at other locations. Return the JSON array.`;

  const models = getFallbackModels(process.env.GOOGLE_TEXT_MODEL, TEXT_MODEL_FALLBACKS);

  let responseText = "";
  try {
    const { result } = await runWithModelFallback({
      label: "generate-wardrobe-outfit",
      models,
      operation: async (modelName) => {
        const m = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
          .getGenerativeModel({ model: modelName });
        return m.generateContent([systemPrompt, userPrompt]);
      },
    });
    const response = await result.response;
    responseText = response.text();
  } catch (err) {
    console.error("[wardrobe-outfit] generation failed:", err);
    return NextResponse.json({ error: "AI outfit generation failed: " + (err.message || err) }, { status: 500 });
  }

  const outfits = extractJsonArray(responseText);
  if (!outfits?.length) {
    return NextResponse.json({ error: "AI returned invalid outfit data. Please try again." }, { status: 500 });
  }

  // Normalise and validate
  const normalised = outfits.map(o => ({
    character_name: String(o?.character_name || "").trim(),
    outfit_name: String(o?.outfit_name || "").trim(),
    description: String(o?.description || "").trim(),
  })).filter(o => o.character_name);

  return NextResponse.json({
    success: true,
    outfits: normalised,
    location_name: locationName,
    kb_used: kbUsable,
  });
}
