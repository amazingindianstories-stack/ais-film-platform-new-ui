import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { prisma } from "@/utils/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Additive new-UI bridge route. Mirrors generate-character for locations: it
// reconciles a location's reference + ANGLE images (multiple viewpoints) + notes
// into canonical SPATIAL DATA — geometry, sightlines, materials, light — plus a
// location "prompt-lock", and writes it into project_state.locations[i] and
// knowledge_base.locations[name] so shot generation places cameras consistently.
// Costs the same placeholder credits as character generation.

const ai = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY })
  : null;

const MODEL = process.env.GOOGLE_KB_MODEL || "gemini-2.5-flash";
const IMAGE_FETCH_TIMEOUT_MS = 20000;
const IMAGE_MAX_BYTES = 6 * 1024 * 1024;
const MAX_REFERENCE_IMAGES = 4;
const MAX_ANGLE_IMAGES = 6; // more angles → better spatial reconstruction

const DEFAULT_CREDITS = 100;
const GENERATE_COST = 20;

function isAuthorized(req) {
  const expected = process.env.STUDIO_BACKEND_SHARED_SECRET;
  if (!expected) return true;
  return req.headers.get("x-studio-backend-key") === expected;
}

const normalizeName = (value) => String(value || "").trim().toLowerCase();

function compact(value, maxLength = 600) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function extractJsonObject(text) {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function inferMime(url, contentType) {
  const ct = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (ct.startsWith("image/")) return ct;
  const u = String(url || "").toLowerCase();
  if (u.includes(".jpg") || u.includes(".jpeg")) return "image/jpeg";
  if (u.includes(".webp")) return "image/webp";
  return "image/png";
}

import fs from 'fs/promises';
import path from 'path';

async function fetchImage(url) {
  let buf;
  let mime;
  if (url.startsWith('/uploads/')) {
    const localPath = path.join(process.cwd(), 'public', url);
    buf = await fs.readFile(localPath);
    mime = inferMime(url);
  } else {
    const res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Image fetch ${res.status}`);
    const arrayBuf = await res.arrayBuffer();
    buf = Buffer.from(arrayBuf);
    mime = inferMime(url, res.headers.get("content-type"));
  }
  if (buf.byteLength > IMAGE_MAX_BYTES) throw new Error("Image too large");
  return { mimeType: mime, data: buf.toString("base64") };
}

function pickUrls(list, limit) {
  return (Array.isArray(list) ? list : [])
    .map((img) => (typeof img === "string" ? { url: img } : img))
    .filter((img) => img?.url && (/^https?:\/\//i.test(img.url) || img.url.startsWith('/uploads/')))
    .slice(0, limit);
}

async function loadLocationImages(location) {
  const refs = pickUrls(location.images, MAX_REFERENCE_IMAGES).map((i) => ({ ...i, kind: "reference" }));
  const angles = pickUrls(location.angle_images, MAX_ANGLE_IMAGES).map((i) => ({ ...i, kind: "angle" }));
  const all = [...refs, ...angles];
  const loaded = await Promise.all(all.map(async (ref) => {
    try { return { ...ref, ...(await fetchImage(ref.url)) }; }
    catch (err) { console.warn(`[generate-location] skip image ${ref.url}:`, err.message); return null; }
  }));
  return loaded.filter(Boolean);
}

function buildPrompt(location, loadedImages) {
  const manifest = loadedImages
    .map((img, i) => `  Image ${i + 1}: [${img.kind.toUpperCase()}] ${img.label || "view"}`)
    .join("\n") || "  None attached.";

  return `You are a location continuity supervisor + virtual art director for an AI film
production. Reconcile ONE location's reference image(s), MULTIPLE angle/viewpoint images, and
written notes into a single CANONICAL SPATIAL MODEL that downstream image and video generators
will reuse to render this exact place consistently from any camera angle.

LOCATION NAME: ${location.name}
WRITTEN NOTES / DESCRIPTION: ${compact(location.description || location.visual_prompt, 1200) || "(none provided)"}

ATTACHED IMAGES (the [ANGLE] images are different viewpoints of the SAME place — cross-reference
them to reconstruct the geometry; if they conflict, prefer the most frequently shown features):
${manifest}

Build the spatial model so a camera can be placed anywhere and stay consistent:
- Reconstruct rough GEOMETRY and layout (scale, key sightlines, depth layers fg/mg/bg, where
  walls/openings/landmarks sit relative to each other, how the camera moves through the space).
- Lock materials, colour palette (with approx hex), light sources/direction, and signature props.
- The "prompt_lock" is the most important field: 80–120 words, fully self-contained, NEVER use
  pronouns (always say "${location.name}"), written as a locked visual environment spec. It must
  end with EXACTLY: "Copy this exact visual environment; do not alter the architecture, colour
  palette, spatial layout, or lighting conditions."

Return ONLY valid JSON (no markdown) in this shape:
{
  "type": "Interior/Exterior + category (urban street/indoor arena/rural landscape/etc.)",
  "atmosphere": "mood and emotional register of the space",
  "time_and_light": "time of day, weather, light sources, quality + direction",
  "color_palette": "3-5 dominant colours (descriptive + approx hex)",
  "materials_and_textures": "key surfaces/materials (specific)",
  "spatial_layout": "geometry: scale, sightlines, depth layers fg/mg/bg, landmark positions, and natural camera movement through the space",
  "production_design_notes": "specific props / set dressing / signage that must stay consistent",
  "prompt_lock": "the 80-120 word definitive environment lock described above"
}`;
}

async function runModel(prompt, loadedImages) {
  const parts = [
    { text: prompt },
    ...loadedImages.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
  ];
  if (loadedImages.length) {
    try {
      const result = await ai.models.generateContent({ model: MODEL, contents: [{ role: "user", parts }] });
      const text = result.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text || "";
      if (text) return text;
    } catch (err) {
      console.warn("[generate-location] multimodal failed, text-only:", err.message);
    }
  }
  const result = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  return result.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text || "";
}

function normalizeCanonical(raw, location) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    type: compact(r.type, 100),
    atmosphere: compact(r.atmosphere, 400),
    time_and_light: compact(r.time_and_light, 300),
    color_palette: compact(r.color_palette, 300),
    materials_and_textures: compact(r.materials_and_textures, 300),
    spatial_layout: compact(r.spatial_layout, 500),
    production_design_notes: compact(r.production_design_notes, 400),
    prompt_lock: compact(r.prompt_lock, 1000)
      || `${location.name} — ${compact(location.description || location.visual_prompt, 400)}`,
  };
}

function isQuotaError(err) {
  return err?.status === 429
    || /RESOURCE_EXHAUSTED|credits are depleted|quota|\b429\b/i.test(err?.message || "");
}

export async function POST(req) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized backend bridge request." }, { status: 401 });
  }
  if (!ai) {
    return NextResponse.json({ error: "GOOGLE_AI_API_KEY is not configured." }, { status: 500 });
  }

  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const projectId = String(body.projectId || "").trim();
  const locationName = String(body.locationName || body.characterName || "").trim();
  if (!projectId) return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
  if (!locationName) return NextResponse.json({ error: "Link a named location template to this card first." }, { status: 400 });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { project_state: true }
  });

  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const projectState = project.project_state || {};
  const locations = Array.isArray(projectState.locations) ? [...projectState.locations] : [];
  const index = locations.findIndex((l) => normalizeName(l?.name) === normalizeName(locationName));
  if (index === -1) {
    return NextResponse.json({ error: `No saved data for "${locationName}". Fill the linked template first.` }, { status: 404 });
  }

  const location = locations[index];
  const hasContent = (location.images?.length || 0) + (location.angle_images?.length || 0) > 0
    || Boolean(location.description);
  if (!hasContent) {
    return NextResponse.json({ error: "Nothing to generate from — add reference/angle images or a description." }, { status: 400 });
  }

  const balance = Number.isFinite(projectState.studio_credits) ? projectState.studio_credits : DEFAULT_CREDITS;
  if (balance < GENERATE_COST) {
    return NextResponse.json({ error: "Not enough credits to generate this location.", credits: balance, cost: GENERATE_COST }, { status: 402 });
  }

  let canonical;
  let anglesUsed = 0;
  try {
    const loadedImages = await loadLocationImages(location);
    anglesUsed = loadedImages.filter((i) => i.kind === "angle").length;
    const text = await runModel(buildPrompt(location, loadedImages), loadedImages);
    const raw = extractJsonObject(text);
    if (!raw) return NextResponse.json({ error: "The location agent did not return a usable result. Try again." }, { status: 502 });
    canonical = normalizeCanonical(raw, location);
  } catch (err) {
    if (isQuotaError(err)) {
      return NextResponse.json({
        error: "The AI provider is out of quota/credits right now. Top up Google AI billing and try again — no credits were charged.",
      }, { status: 429 });
    }
    console.error("[generate-location] generation failed:", err);
    return NextResponse.json({ error: "Location generation failed: " + (err.message || err) }, { status: 500 });
  }

  const updatedLocation = {
    ...location,
    canonical,
    prompt_lock: canonical.prompt_lock,
    visual_prompt: canonical.prompt_lock,
    spatial_layout: canonical.spatial_layout,
    generated: true,
    generated_at: new Date().toISOString(),
  };
  locations[index] = updatedLocation;

  const existingKB = projectState.knowledge_base && typeof projectState.knowledge_base === "object"
    ? projectState.knowledge_base : {};
  const kbLocations = existingKB.locations && typeof existingKB.locations === "object"
    ? { ...existingKB.locations } : {};
  kbLocations[normalizeName(locationName)] = canonical;

  const nextState = {
    ...projectState,
    studio_credits: balance - GENERATE_COST,
    locations,
    knowledge_base: {
      ...existingKB,
      v: existingKB.v || 1,
      built_at: new Date().toISOString(),
      locations: kbLocations,
    },
  };

  try {
    await prisma.project.update({
      where: { id: projectId },
      data: { project_state: nextState }
    });
  } catch (updateError) {
    throw updateError;
  }

  return NextResponse.json({
    success: true,
    projectId,
    location: updatedLocation,
    entity: updatedLocation,
    locations,
    canonical,
    angles_used: anglesUsed,
    credits: balance - GENERATE_COST,
    cost: GENERATE_COST,
  });
}
