import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { prisma } from "@/utils/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Additive new-UI bridge route. Purifies one character's brain-dump (reference +
// wardrobe images + bio) into a canonical "identity prompt-lock" — the consistency
// technique used across this codebase — and writes it into project_state +
// knowledge_base.characters[name] so every downstream generator reads one source
// of truth. Costs placeholder credits held on project_state.studio_credits.

const ai = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY })
  : null;

const MODEL = process.env.GOOGLE_KB_MODEL || "gemini-2.5-flash";
const IMAGE_FETCH_TIMEOUT_MS = 20000;
const IMAGE_MAX_BYTES = 6 * 1024 * 1024;
const MAX_REFERENCE_IMAGES = 6;
const MAX_WARDROBE_IMAGES = 3;

// Placeholder economy (no real billing yet).
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
  return {
    mimeType: mime,
    data: buf.toString("base64"),
  };
}

function pickUrls(list, limit) {
  return (Array.isArray(list) ? list : [])
    .map((img) => (typeof img === "string" ? { url: img } : img))
    .filter((img) => img?.url && (/^https?:\/\//i.test(img.url) || img.url.startsWith('/uploads/')))
    .slice(0, limit);
}

async function loadCharacterImages(character) {
  const refs = pickUrls(character.images, MAX_REFERENCE_IMAGES).map((i) => ({ ...i, kind: "reference" }));
  const wardrobe = pickUrls(character.wardrobe_images, MAX_WARDROBE_IMAGES).map((i) => ({ ...i, kind: "wardrobe" }));
  const all = [...refs, ...wardrobe];
  const loaded = await Promise.all(all.map(async (ref) => {
    try { return { ...ref, ...(await fetchImage(ref.url)) }; }
    catch (err) { console.warn(`[generate-character] skip image ${ref.url}:`, err.message); return null; }
  }));
  return loaded.filter(Boolean);
}

function buildPrompt(character, loadedImages) {
  const manifest = loadedImages
    .map((img, i) => `  Image ${i + 1}: [${img.kind.toUpperCase()}] ${img.label || "reference"}`)
    .join("\n") || "  None attached.";

  return `You are a character continuity director for an AI film production. Your job is to
distil ONE character's raw brain-dump (reference photos, wardrobe photos, and a written
bio) into a single CANONICAL IDENTITY that downstream image and video generators will reuse
to render this exact person consistently in every shot.

CHARACTER NAME: ${character.name}
WRITTEN BIO / DESCRIPTION: ${compact(character.description || character.visual_prompt, 1200) || "(none provided)"}

ATTACHED REFERENCE IMAGES (treat these as the primary visual truth — reconcile ALL of them
into ONE consistent description; if they conflict, choose the most frequently shown traits):
${manifest}

Rules for the canonical identity:
- Separate IMMUTABLE physical identity (face, physique, hair, skin) from MUTABLE wardrobe.
- Be specific and measurable (approximate age, height/build, skin tone with rough hex, eye
  colour/shape, hair colour/length/texture, distinguishing marks).
- The "prompt_lock" is the most important field: 120–160 words, fully self-contained, NEVER
  use pronouns (always say "${character.name}"), written as a locked visual specification (not a
  story). It must end with EXACTLY: "Maintain this exact physical appearance, facial structure,
  and default outfit in every frame. Apply wardrobe overrides only when explicitly specified."
- WARDROBE: For EACH image labelled [WARDROBE] in the manifest, in the SAME ORDER, add one entry
  to the "wardrobe" array describing THAT specific outfit as a self-contained, prompt-ready spec
  (garments, fabric, colour, fit, footwear, accessories). These outfits are stored and injected
  into shot-generation prompts later, so each description must stand alone. "default_outfit" must
  be the character's primary/signature outfit (usually the first wardrobe entry, or derived from
  the reference images if no wardrobe images were provided).

Return ONLY valid JSON (no markdown) in this shape:
{
  "physique": "height estimate, build, posture, skin tone (descriptive + approx hex)",
  "face": "face shape, eyes (colour+shape), brows, nose, lips, notable features",
  "hair": "colour, length, texture, styling",
  "default_outfit": "the character's default/signature outfit: garments, fabric, colour, fit, footwear, accessories",
  "fashion_style": "their fashion identity in 2-3 sentences (register, silhouette, palette, signature details)",
  "personality_core": "core personality in 1-2 sentences (informs screen presence)",
  "signature_elements": ["3-6 short distinctive identifiers"],
  "wardrobe": [{ "outfit_name": "short label e.g. 'Stage leather jacket'", "description": "prompt-ready outfit spec: garments, fabric, colour, fit, footwear, accessories" }],
  "prompt_lock": "the 120-160 word definitive generation lock described above"
}`;
}

async function runModel(prompt, loadedImages) {
  const parts = [
    { text: prompt },
    ...loadedImages.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
  ];

  // Multimodal first (reference images are the visual truth); fall back to text-only.
  if (loadedImages.length) {
    try {
      const result = await ai.models.generateContent({ model: MODEL, contents: [{ role: "user", parts }] });
      const text = result.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text || "";
      if (text) return text;
    } catch (err) {
      console.warn("[generate-character] multimodal failed, text-only:", err.message);
    }
  }
  const result = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  return result.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text || "";
}

function normalizeCanonical(raw, character) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    personality_core: compact(r.personality_core, 400),
    physique: compact(r.physique, 350),
    face: compact(r.face, 400),
    hair: compact(r.hair, 250),
    default_outfit: compact(r.default_outfit, 350),
    fashion_style: compact(r.fashion_style, 500),
    signature_elements: Array.isArray(r.signature_elements) ? r.signature_elements.slice(0, 6).map((s) => compact(s, 80)) : [],
    wardrobe: [],
    prompt_lock: compact(r.prompt_lock, 1400)
      || `${character.name} — ${compact(character.description || character.visual_prompt, 500)}`,
  };
}

// Pair each described outfit with the wardrobe image it came from (same order as
// the manifest) so shots can later inject both the text spec and the visual ref.
function buildWardrobeEntries(rawWardrobe, loadedImages) {
  const wardrobeUrls = (loadedImages || []).filter((i) => i.kind === "wardrobe").map((i) => i.url);
  const list = Array.isArray(rawWardrobe) ? rawWardrobe : [];
  const count = Math.max(list.length, wardrobeUrls.length);
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    const w = list[i] || {};
    const description = compact(w.description || w.prompt, 400);
    const image_url = wardrobeUrls[i] || "";
    if (!description && !image_url) continue;
    entries.push({
      outfit_name: compact(w.outfit_name || w.name || `Outfit ${i + 1}`, 80),
      description,
      image_url,
    });
  }
  return entries;
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
  const characterName = String(body.characterName || "").trim();
  if (!projectId) return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
  if (!characterName) return NextResponse.json({ error: "Link a named character template to this card first." }, { status: 400 });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { project_state: true }
  });

  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const projectState = project.project_state || {};
  const characters = Array.isArray(projectState.characters) ? [...projectState.characters] : [];
  const index = characters.findIndex((c) => normalizeName(c?.name) === normalizeName(characterName));
  if (index === -1) {
    return NextResponse.json({ error: `No saved data for "${characterName}". Fill the linked template first.` }, { status: 404 });
  }

  const character = characters[index];
  const hasContent = (character.images?.length || 0) + (character.wardrobe_images?.length || 0) > 0
    || Boolean(character.description);
  if (!hasContent) {
    return NextResponse.json({ error: "Nothing to generate from — add reference images or a description to the template." }, { status: 400 });
  }

  // ── Credits (placeholder) ──────────────────────────────────────────────────
  const balance = Number.isFinite(projectState.studio_credits) ? projectState.studio_credits : DEFAULT_CREDITS;
  if (balance < GENERATE_COST) {
    return NextResponse.json({ error: "Not enough credits to generate this character.", credits: balance, cost: GENERATE_COST }, { status: 402 });
  }

  // ── Purify into a canonical identity lock ──────────────────────────────────
  let canonical;
  try {
    const loadedImages = await loadCharacterImages(character);
    const text = await runModel(buildPrompt(character, loadedImages), loadedImages);
    const raw = extractJsonObject(text);
    if (!raw) return NextResponse.json({ error: "The character agent did not return a usable result. Try again." }, { status: 502 });
    canonical = normalizeCanonical(raw, character);
    canonical.wardrobe = buildWardrobeEntries(raw.wardrobe, loadedImages);
    if (!canonical.default_outfit && canonical.wardrobe[0]?.description) {
      canonical.default_outfit = canonical.wardrobe[0].description;
    }
  } catch (err) {
    if (isQuotaError(err)) {
      return NextResponse.json({
        error: "The AI provider is out of quota/credits right now. Top up Google AI billing and try again — no credits were charged.",
      }, { status: 429 });
    }
    console.error("[generate-character] generation failed:", err);
    return NextResponse.json({ error: "Character generation failed: " + (err.message || err) }, { status: 500 });
  }

  // ── Merge into the character + knowledge base, deduct credits, persist ──────
  const updatedCharacter = {
    ...character,
    canonical,
    prompt_lock: canonical.prompt_lock,
    visual_prompt: canonical.prompt_lock,
    // Wardrobe stored as prompt-ready outfits (text spec + source image url) so
    // shot generation can inject the right look later. `costume` mirrors the
    // primary outfit as a string for the frozen KB-rebuild's outfit fallback.
    wardrobe_outfits: canonical.wardrobe,
    costume: canonical.default_outfit || character.costume || "",
    generated: true,
    generated_at: new Date().toISOString(),
  };
  characters[index] = updatedCharacter;

  const existingKB = projectState.knowledge_base && typeof projectState.knowledge_base === "object"
    ? projectState.knowledge_base : {};
  const kbCharacters = existingKB.characters && typeof existingKB.characters === "object"
    ? { ...existingKB.characters } : {};
  kbCharacters[normalizeName(characterName)] = canonical;

  const newState = {
    ...projectState,
    studio_credits: balance - GENERATE_COST,
    characters,
    knowledge_base: {
      ...existingKB,
      v: existingKB.v || 1,
      built_at: new Date().toISOString(),
      characters: kbCharacters,
    },
  };

  try {
    await prisma.project.update({
      where: { id: projectId },
      data: { project_state: newState }
    });
  } catch (updateError) {
    console.error("[generate-character] persist failed:", updateError);
    return NextResponse.json({ error: "Failed to save the generated character." }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    projectId,
    character: updatedCharacter,
    characters,
    canonical,
    credits: balance - GENERATE_COST,
    cost: GENERATE_COST,
  });
}
