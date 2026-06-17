import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase-admin";
import { getFallbackModels, IMAGE_MODEL_FALLBACKS } from "@/utils/googleModelFallbacks";
import { isKBUsable, getCharacterEntry, getLocationEntry, getStyleLock, getCharacterFashionStyle } from "@/utils/knowledgeBase";
import { extractScriptContext, buildOutfitIntelligenceBlock } from "@/utils/scriptContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const genAI = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
  : null;

const IMAGE_FETCH_TIMEOUT_MS = 25000;
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const PRIMARY_MODEL = "gemini-3-pro-image-preview";

const compact = (v, max = 500) => {
  if (!v) return "";
  const s = String(v).replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
};

function inferMime(url, ct) {
  const h = String(ct || "").split(";")[0].trim().toLowerCase();
  if (h.startsWith("image/")) return h;
  const u = String(url || "").toLowerCase();
  if (u.includes(".jpg") || u.includes(".jpeg")) return "image/jpeg";
  if (u.includes(".webp")) return "image/webp";
  return "image/png";
}

function toSafeSlug(value, fallback = "outfit") {
  const s = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || fallback;
}

function normalizeReferenceImage(image) {
  let d = typeof image === "string" ? { url: image } : image;
  if (!d?.url || !/^https?:\/\//i.test(d.url)) return null;
  return { url: d.url, label: d.label || d.name || "reference" };
}

function pickBestCharacterRefs(character, maxCount = 3) {
  const FACE_TERMS = ["face close-up", "close-up", "portrait", "face front"];
  const BODY_TERMS = ["full body front", "front", "full body"];
  const OUTFIT_TERMS = ["outfit", "wardrobe", "costume"];
  const ALL_TIERS = [...FACE_TERMS, ...BODY_TERMS, ...OUTFIT_TERMS];

  const refs = [];
  const seen = new Set();

  // Identity anchor is the single most reliable locked face reference — always use it first.
  if (character?.anchor_image_url && /^https?:\/\//i.test(character.anchor_image_url)) {
    refs.push({ url: character.anchor_image_url, label: "identity anchor — primary face lock" });
    seen.add(character.anchor_image_url);
  }

  // Then fill remaining slots from panel images, scored by relevance.
  const images = Array.isArray(character?.images) ? character.images : [];
  const panelRefs = images.map(normalizeReferenceImage).filter(Boolean);

  if (!panelRefs.length && character?.sheetUrl && /^https?:\/\//i.test(character.sheetUrl) && !seen.has(character.sheetUrl)) {
    refs.push({ url: character.sheetUrl, label: "full reference sheet" });
    seen.add(character.sheetUrl);
  } else {
    const scored = panelRefs
      .filter(r => !seen.has(r.url))
      .map(r => {
        const l = r.label.toLowerCase();
        const idx = ALL_TIERS.findIndex(t => l.includes(t));
        return { ...r, score: idx === -1 ? 999 : idx };
      })
      .sort((a, b) => a.score - b.score);

    for (const r of scored) {
      if (refs.length >= maxCount) break;
      if (!seen.has(r.url)) { refs.push(r); seen.add(r.url); }
    }
  }

  return refs.slice(0, maxCount);
}

async function fetchImage(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Fetch ${res.status}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > IMAGE_MAX_BYTES) throw new Error("Image too large");
  return {
    url,
    mimeType: inferMime(url, res.headers.get("content-type")),
    data: Buffer.from(buf).toString("base64"),
  };
}

async function loadImages(refs) {
  const results = await Promise.all(refs.map(async r => {
    try { return { ...r, ...(await fetchImage(r.url)) }; }
    catch (err) { console.warn(`[wardrobe-image] skipping ref ${r.url}:`, err.message); return null; }
  }));
  return results.filter(Boolean);
}

function buildWardrobeImagePrompt({ character, outfit, location, kb, projectState }) {
  const kbUsable = isKBUsable(kb);
  const charEntry = kbUsable ? getCharacterEntry(kb, character.name) : null;
  const locEntry = kbUsable ? getLocationEntry(kb, location.name) : null;
  const styleLock = kbUsable ? getStyleLock(kb) : "";

  // KB prompt_lock is the richest identity source; fall back to raw fields.
  const charLock = charEntry?.prompt_lock
    || compact(character.visual_prompt || character.description, 500);
  const charPhysique    = charEntry?.physique || "";
  const charFace        = charEntry?.face || "";
  const charFashionStyle = charEntry?.fashion_style || getCharacterFashionStyle(kb, character.name) || "";

  const locContext = locEntry?.prompt_lock
    || compact(location.visual_prompt || location.description || location.name, 300);

  // Script context — outfit from script takes precedence over the provided outfit fields
  const ctx = extractScriptContext({ projectState, characterName: character.name, locationName: location.name });
  const outfitIntelligence = buildOutfitIntelligenceBlock(ctx);

  // Project-level style / mood — used for colour grade and lighting language.
  const script = projectState?.script || {};
  const analysis = projectState?.analysis || {};
  const projectStyleContext = [
    styleLock ? `Visual style lock: ${compact(styleLock, 400)}` : "",
    script.mood || analysis.mood ? `Project mood: ${compact(script.mood || analysis.mood, 180)}` : "",
    analysis.genre || analysis.theme ? `Genre / theme: ${compact(analysis.genre || analysis.theme, 120)}` : "",
  ].filter(Boolean).join("\n");

  return `Generate a single 21:9 ultra-wide WARDROBE REFERENCE SHEET for a music video production costume department.

PURPOSE: This sheet documents the exact outfit worn by ${character.name} at the location "${location.name}". It is the locked costume reference — production uses it to recreate this exact look consistently across every shot at this location.

━━━ FACE & IDENTITY LOCK (highest priority — do not deviate) ━━━
Image 1 attached is the PRIMARY IDENTITY ANCHOR for ${character.name}. This is the locked reference face.
COPY EXACTLY: face shape, skin tone, eye colour and shape, nose, lips, jawline, hairline, hair colour and texture, age appearance, and body proportions. Every panel must show the same person.
${charFace ? `Face details: ${charFace}` : ""}
${charPhysique ? `Physique: ${charPhysique}` : ""}
${charLock ? `Full character identity: ${charLock}` : ""}
${charFashionStyle ? `Fashion identity (their style sensibility — the outfit must feel authentically theirs): ${charFashionStyle}` : ""}
RULE: The character's face is identical in every single panel. Do NOT alter, idealise, or genericise the face. If the reference image shows a specific person, reproduce that specific person faithfully.

━━━ OUTFIT TO DOCUMENT ━━━
Name: ${compact(outfit.outfit_name, 120)}
Description: ${compact(outfit.description, 700)}

SCRIPT & CONTEXT (use to verify or enhance the outfit above):
${outfitIntelligence}

━━━ PROJECT VISUAL STYLE (apply to colour grade and lighting language) ━━━
${projectStyleContext || "Clean, neutral studio lighting. Professional music video production quality."}

LOCATION ATMOSPHERE for "${location.name}" (informs lighting quality only — do not render the location as background):
${locContext}

━━━ CANVAS AND LAYOUT ━━━
- Single 21:9 horizontal sheet — do NOT generate a 16:9 frame
- Plain neutral studio backdrop (warm beige or soft off-white) — matches project colour tone
- 9 panels arranged as follows:
  PANEL 1 (large, far left, ~30% canvas width): large mid portrait — waist to top of head, slight 3/4 angle, primary identity + outfit panel
  PANEL 2: full-body front standing — head to toe, arms relaxed at sides, complete outfit visible
  PANEL 3: full-body left profile — complete left-side silhouette
  PANEL 4: full-body right profile — complete right-side silhouette
  PANEL 5: full-body back — rear view showing back of garments, hair, accessories
  PANEL 6 (top-right): close-up front portrait — head and upper chest, neckline and upper garment detail
  PANEL 7 (top-right): close-up back — rear head, collar, upper back garment
  PANEL 8 (bottom-right): close-up left three-quarter — face and left shoulder, fabric texture
  PANEL 9 (bottom-right): close-up right three-quarter — face and right shoulder, fabric texture
- Clean visible white or beige dividers between all panels
- Outfit must be absolutely identical across all 9 panels

━━━ PRODUCTION RULES ━━━
1. FACE CONSISTENCY IS MANDATORY — the same person must appear in every panel. Any deviation in face shape, skin tone, or features is a production failure.
2. Never crop any outfit element — show the full required area for each panel type
3. Full-body panels must show complete figure head-to-toe with footwear clearly visible
4. Close-up panels must include the full head and sufficient upper body to read garment construction
5. Both face sharpness AND outfit detail must be excellent — they are equally important
6. Soft diffused frontal studio lighting — face fully lit with no harsh shadows
7. Natural relaxed pose — neutral expression, no action or drama
8. No text, labels, borders, or watermarks
9. Photorealistic — this is a physical costume document, not an illustration

OUTPUT: One single 21:9 photorealistic wardrobe reference sheet.`;
}

async function uploadToStorage({ projectId, characterName, locationName, imageBase64, mimeType }) {
  if (!projectId) return null;
  const ext = mimeType?.includes("png") ? "png" : "jpg";
  const slug = `${toSafeSlug(characterName)}-${toSafeSlug(locationName)}-wardrobe-${Date.now()}.${ext}`;
  const storagePath = `${projectId}/wardrobe/${slug}`;

  const supabase = createAdminClient();
  const buffer = Buffer.from(imageBase64, "base64");
  const { error } = await supabase.storage.from("assets").upload(storagePath, buffer, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage.from("assets").getPublicUrl(storagePath);
  return { publicUrl, storagePath };
}

/**
 * POST /api/generate-wardrobe-image
 *
 * Generates a full-body outfit reference image for one character at one location.
 *
 * Body:
 *   projectId     — project ID (for storage upload)
 *   projectState  — full project_state (for KB)
 *   character     — { name, visual_prompt, description, images, anchor_image_url }
 *   outfit        — { outfit_name, description }
 *   location      — { name, visual_prompt, description }
 *
 * Returns:
 *   { image_url, image_path, character_name, location_name }
 */
export async function POST(req) {
  if (!genAI) {
    return NextResponse.json({ error: "GOOGLE_AI_API_KEY not configured." }, { status: 500 });
  }

  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const { projectId, projectState = {}, character, outfit, location } = body;

  if (!character?.name || !outfit?.description || !location?.name) {
    return NextResponse.json(
      { error: "character.name, outfit.description, and location.name are required." },
      { status: 400 }
    );
  }

  // Load character reference images
  const refCandidates = pickBestCharacterRefs(character);
  const loadedRefs = await loadImages(refCandidates);

  const kb = projectState?.knowledge_base;
  const prompt = buildWardrobeImagePrompt({ character, outfit, location, kb, projectState });

  const parts = [
    { text: prompt },
    ...loadedRefs.map(r => ({ inlineData: { mimeType: r.mimeType, data: r.data } })),
  ];

  // Mirror the exact pattern from generate-character-anchor which is known to work:
  // - getGenerativeModel without generationConfig
  // - generateContent with responseModalities: ["IMAGE"]
  // - await result.response to unwrap the SDK wrapper
  // - access response.candidates[0] for the image part
  const modelChain = getFallbackModels(PRIMARY_MODEL, IMAGE_MODEL_FALLBACKS);

  let imageBase64, mimeType;
  let lastErr;
  for (const modelName of modelChain) {
    try {
      const m = genAI.getGenerativeModel({ model: modelName });
      const result = await m.generateContent({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["IMAGE"] },
      });
      const response = await result.response;
      const imagePart = response?.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      if (!imagePart?.inlineData?.data) {
        const reason = response?.candidates?.[0]?.finishReason;
        throw new Error(reason ? `Model returned no image (${reason})` : "Model returned no image data");
      }
      imageBase64 = imagePart.inlineData.data;
      mimeType = imagePart.inlineData.mimeType || "image/png";
      break; // success
    } catch (err) {
      lastErr = err;
      console.warn(`[wardrobe-image] model ${modelName} failed:`, err.message);
      // Only continue fallback for server/quota errors, not content errors
      const msg = String(err.message || "").toLowerCase();
      const isRetryable = msg.includes("quota") || msg.includes("rate") || msg.includes("unavailable") || msg.includes("overload") || err?.status >= 500;
      if (!isRetryable) break;
    }
  }

  if (!imageBase64) {
    console.error("[wardrobe-image] all models failed:", lastErr);
    return NextResponse.json({ error: "Outfit image generation failed: " + (lastErr?.message || lastErr) }, { status: 500 });
  }

  // Upload to storage
  let imageUrl = null;
  let imagePath = null;
  if (projectId) {
    try {
      const uploaded = await uploadToStorage({ projectId, characterName: character.name, locationName: location.name, imageBase64, mimeType });
      imageUrl = uploaded?.publicUrl || null;
      imagePath = uploaded?.storagePath || null;
    } catch (err) {
      console.error("[wardrobe-image] upload failed:", err);
      return NextResponse.json({ error: "Image generated but upload failed: " + (err.message || err) }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    image_url: imageUrl,
    image_path: imagePath,
    character_name: character.name,
    location_name: location.name,
    kb_used: isKBUsable(kb),
  });
}
