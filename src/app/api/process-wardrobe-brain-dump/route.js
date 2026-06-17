import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const ai = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY })
  : null;

const MODEL = process.env.GOOGLE_BRAIN_DUMP_MODEL || "gemini-2.5-flash";
const IMAGE_FETCH_TIMEOUT_MS = 20000;
const IMAGE_MAX_BYTES = 7 * 1024 * 1024;
const MAX_IMAGES_PER_ASSET = 3;

function compact(value, max = 900) {
  if (!value) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function normaliseName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toUpperCase();
}

function extractJsonObject(text) {
  const fenced = text?.match(/```json\s*([\s\S]*?)```/i)?.[1];
  const bare = text?.match(/\{[\s\S]*\}/)?.[0];
  for (const candidate of [fenced, bare, text].filter(Boolean)) {
    try { return JSON.parse(candidate); } catch { /* try next */ }
  }
  return null;
}

function inferMime(url, contentType) {
  const header = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (header.startsWith("image/")) return header;
  const lowerUrl = String(url || "").toLowerCase();
  if (lowerUrl.includes(".jpg") || lowerUrl.includes(".jpeg")) return "image/jpeg";
  if (lowerUrl.includes(".webp")) return "image/webp";
  return "image/png";
}

function normalizeImage(image, index) {
  if (typeof image === "string") return { url: image, label: `Reference ${index + 1}` };
  if (!image || typeof image !== "object") return null;
  const url = image.url || image.image_url || image.publicUrl;
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return {
    url,
    label: compact(image.label || image.name || `Reference ${index + 1}`, 120),
    kind: image.kind || "reference",
  };
}

function collectAssetImages(items = [], kind) {
  const refs = [];
  for (const item of Array.isArray(items) ? items : []) {
    const images = Array.isArray(item?.images) ? item.images : [];
    const selected = images
      .map(normalizeImage)
      .filter(Boolean)
      .sort((a, b) => {
        const aBrain = String(a.kind || "").includes("brain") ? 0 : 1;
        const bBrain = String(b.kind || "").includes("brain") ? 0 : 1;
        return aBrain - bBrain;
      })
      .slice(0, MAX_IMAGES_PER_ASSET);

    for (const image of selected) {
      refs.push({ ...image, entityKind: kind, entityName: item?.name || kind });
    }
  }
  return refs;
}

async function fetchImage(ref) {
  const response = await fetch(ref.url, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Image fetch ${response.status}`);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > IMAGE_MAX_BYTES) throw new Error("Image too large");
  return {
    ...ref,
    mimeType: inferMime(ref.url, response.headers.get("content-type")),
    data: Buffer.from(buffer).toString("base64"),
  };
}

async function loadImages(refs) {
  const loaded = await Promise.all(refs.map(async (ref) => {
    try { return await fetchImage(ref); }
    catch (error) {
      console.warn("Brain dump: skipping image", ref.url, error.message);
      return null;
    }
  }));
  return loaded.filter(Boolean);
}

function buildPrompt(projectState, loadedImages, targets) {
  const script = projectState?.script || {};
  const analysis = projectState?.analysis || {};
  const characters = Array.isArray(projectState?.characters) ? projectState.characters : [];
  const locations = Array.isArray(projectState?.locations) ? projectState.locations : [];
  const styleBible = projectState?.style_bible || {};

  const imageManifest = loadedImages
    .map((image, index) => `Image ${index + 1}: [${image.entityKind}] ${image.entityName} - ${image.label}`)
    .join("\n");

  const characterBlocks = characters.map(character => `
CHARACTER: ${character.name}
Role: ${compact(character.role || character.description, 240)}
Brain dump notes: ${compact(character.brain_dump_notes, 700)}
Tags: ${(character.brain_dump_tags || []).join(", ")}
Existing fashion style: ${compact(character.fashion_style, 500)}
Default outfit: ${compact(character.default_outfit || character.costume || character.wardrobe, 500)}
Signature elements: ${(character.signature_elements || []).join(", ")}`).join("\n---\n");

  const locationBlocks = locations.map(location => `
LOCATION: ${location.name}
Brain dump notes: ${compact(location.brain_dump_notes || location.description, 700)}
Tags: ${(location.brain_dump_tags || []).join(", ")}
Existing atmosphere: ${compact(location.atmosphere, 500)}
Colour notes: ${compact(location.color_palette, 400)}
Time/light: ${compact(location.time_and_light, 400)}
Materials: ${compact(location.materials_and_textures, 400)}`).join("\n---\n");

  return `You are a production brain agent for a film and music-video AI studio.

Convert rough user brain-dump notes and reference images into strict structured JSON. Do not invent new core characters or locations. Only summarize and refine the named assets below.

Targets requested: ${targets.join(", ")}

PROJECT STORY:
Title: ${compact(script.title || "Untitled", 160)}
Story summary: ${compact(script.summary || script.storyline || analysis.summary, 1200)}
Script/raw text: ${compact(script.raw_text, 1800)}
Mood keywords: ${(script.mood_keywords || []).join(", ") || compact(script.mood || analysis.mood, 300)}
Global style notes: ${compact(styleBible.global_notes || styleBible.visual_tone, 900)}

CHARACTERS:
${characterBlocks || "None."}

LOCATIONS:
${locationBlocks || "None."}

ATTACHED REFERENCE IMAGES:
${imageManifest || "None."}

Return ONLY valid JSON with this shape:
{
  "characters": {
    "CHARACTER NAME": {
      "fashion_style": "3-4 sentence costume designer brief",
      "default_outfit": "canonical outfit with garments, colour, fabric, fit, footwear, accessories",
      "signature_elements": ["short phrase", "short phrase"],
      "physique": "optional refined physical description",
      "hair": "optional refined hair description"
    }
  },
  "locations": {
    "LOCATION NAME": {
      "atmosphere": "screen mood of the space",
      "time_and_light": "time, weather, light source, direction, quality",
      "color_palette": "dominant colours with descriptive names and rough hex if useful",
      "materials_and_textures": "surfaces, props, textures",
      "spatial_layout": "geometry, scale, sightlines, camera movement paths",
      "production_design_notes": "set dressing and continuity details"
    }
  },
  "style_bible": {
    "global_notes": "clean summary of the user's visual tone notes",
    "visual_tone": "short global tone brief",
    "lighting_style": "project-wide lighting summary",
    "camera_rules": "project-wide camera language",
    "reference_summary": "what the references imply visually",
    "negative_constraints": "things to avoid for consistency"
  }
}`;
}

function normalizeResult(raw) {
  const characters = {};
  const rawCharacters = raw?.characters && typeof raw.characters === "object" ? raw.characters : {};
  for (const [name, value] of Object.entries(rawCharacters)) {
    characters[normaliseName(name)] = {
      fashion_style: compact(value?.fashion_style, 800),
      default_outfit: compact(value?.default_outfit, 700),
      signature_elements: Array.isArray(value?.signature_elements)
        ? value.signature_elements.map(item => compact(item, 120)).filter(Boolean).slice(0, 8)
        : [],
      physique: compact(value?.physique, 400),
      hair: compact(value?.hair, 300),
    };
  }

  const locations = {};
  const rawLocations = raw?.locations && typeof raw.locations === "object" ? raw.locations : {};
  for (const [name, value] of Object.entries(rawLocations)) {
    locations[normaliseName(name)] = {
      atmosphere: compact(value?.atmosphere, 600),
      time_and_light: compact(value?.time_and_light, 500),
      color_palette: compact(value?.color_palette, 500),
      materials_and_textures: compact(value?.materials_and_textures, 500),
      spatial_layout: compact(value?.spatial_layout, 500),
      production_design_notes: compact(value?.production_design_notes, 600),
    };
  }

  return {
    characters,
    locations,
    style_bible: raw?.style_bible && typeof raw.style_bible === "object" ? {
      global_notes: compact(raw.style_bible.global_notes, 900),
      visual_tone: compact(raw.style_bible.visual_tone, 700),
      lighting_style: compact(raw.style_bible.lighting_style, 700),
      camera_rules: compact(raw.style_bible.camera_rules, 700),
      reference_summary: compact(raw.style_bible.reference_summary, 700),
      negative_constraints: compact(raw.style_bible.negative_constraints, 700),
    } : {},
  };
}

function mergeProjectState(projectState, normalized) {
  const characters = (Array.isArray(projectState?.characters) ? projectState.characters : []).map(character => {
    const refined = normalized.characters[normaliseName(character?.name)];
    if (!refined) return character;
    return {
      ...character,
      fashion_style: refined.fashion_style || character.fashion_style,
      default_outfit: refined.default_outfit || character.default_outfit,
      signature_elements: refined.signature_elements.length ? refined.signature_elements : character.signature_elements,
      physique: refined.physique || character.physique,
      hair: refined.hair || character.hair,
      brain_dump_refined_at: new Date().toISOString(),
    };
  });

  const locations = (Array.isArray(projectState?.locations) ? projectState.locations : []).map(location => {
    const refined = normalized.locations[normaliseName(location?.name)];
    if (!refined) return location;
    return {
      ...location,
      atmosphere: refined.atmosphere || location.atmosphere,
      time_and_light: refined.time_and_light || location.time_and_light,
      color_palette: refined.color_palette || location.color_palette,
      materials_and_textures: refined.materials_and_textures || location.materials_and_textures,
      spatial_layout: refined.spatial_layout || location.spatial_layout,
      production_design_notes: refined.production_design_notes || location.production_design_notes,
      brain_dump_refined_at: new Date().toISOString(),
    };
  });

  return {
    ...projectState,
    characters,
    locations,
    style_bible: {
      ...(projectState?.style_bible || {}),
      ...normalized.style_bible,
      brain_dump_refined_at: new Date().toISOString(),
    },
  };
}

async function persistProjectState(projectId, projectState) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("projects")
    .update({ project_state: projectState })
    .eq("id", projectId);
  if (error) throw error;
}

async function maybeRebuildKB(req, projectId, projectState, rebuildKnowledgeBase) {
  if (!rebuildKnowledgeBase) return { projectState };
  const response = await fetch(new URL("/api/build-knowledge-base", req.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, projectState, force: true }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    return { projectState, knowledgeBaseError: data.error || "Knowledge base rebuild failed." };
  }
  return {
    projectState: data.project_state || { ...projectState, knowledge_base: data.knowledge_base },
    knowledgeBase: data.knowledge_base,
  };
}

export async function POST(req) {
  if (!ai) {
    return NextResponse.json({ error: "GOOGLE_AI_API_KEY not configured." }, { status: 500 });
  }

  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const {
    projectId,
    projectState = {},
    targets = ["characters", "locations", "style"],
    rebuildKnowledgeBase = false,
  } = body;

  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
  }

  const refs = [
    ...collectAssetImages(projectState.characters, "character"),
    ...collectAssetImages(projectState.locations, "location"),
  ];
  const loadedImages = await loadImages(refs);
  const prompt = buildPrompt(projectState, loadedImages, targets);
  const parts = [
    { text: prompt },
    ...loadedImages.map(image => ({
      inlineData: { mimeType: image.mimeType, data: image.data },
    })),
  ];

  let responseText = "";
  try {
    const result = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts }],
    });
    responseText = result.candidates?.[0]?.content?.parts?.find(part => part.text)?.text || "";
  } catch (error) {
    console.error("Brain dump processing failed:", error);
    return NextResponse.json({ error: "Brain dump processing failed: " + (error.message || error) }, { status: 500 });
  }

  const raw = extractJsonObject(responseText);
  if (!raw) {
    return NextResponse.json({ error: "Model did not return valid JSON." }, { status: 500 });
  }

  const normalized = normalizeResult(raw);
  let nextProjectState = mergeProjectState(projectState, normalized);

  try {
    await persistProjectState(projectId, nextProjectState);
    const kbResult = await maybeRebuildKB(req, projectId, nextProjectState, rebuildKnowledgeBase);
    nextProjectState = kbResult.projectState;
    if (kbResult.knowledgeBase) nextProjectState.knowledge_base = kbResult.knowledgeBase;
    if (kbResult.knowledgeBase || kbResult.knowledgeBaseError) {
      await persistProjectState(projectId, nextProjectState);
    }

    return NextResponse.json({
      success: true,
      project_state: nextProjectState,
      refined_characters: Object.keys(normalized.characters).length,
      refined_locations: Object.keys(normalized.locations).length,
      reference_images_used: loadedImages.length,
      knowledge_base_error: kbResult.knowledgeBaseError || null,
    });
  } catch (error) {
    console.error("Brain dump persist failed:", error);
    return NextResponse.json({ error: "Failed to save brain dump processing: " + (error.message || error) }, { status: 500 });
  }
}
