import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const genAI = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY })
  : null;

const STYLE_BIBLE_MODEL = process.env.GOOGLE_STYLE_BIBLE_MODEL || "gemini-2.5-flash";
const REFERENCE_IMAGE_TIMEOUT_MS = 25000;
const REFERENCE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const CHARACTER_IMAGES_PER_ASSET = 3;
const LOCATION_IMAGES_PER_ASSET = 2;

const CHARACTER_REFERENCE_PRIORITY = [
  "face close-up front",
  "face close-up",
  "close-up",
  "face front",
  "portrait front",
  "mid portrait",
  "face 3/4",
  "full body front",
  "front",
];

const LOCATION_REFERENCE_PRIORITY = [
  "establishing",
  "wide",
  "wide shot",
  "interior wide",
  "exterior",
  "aerial",
  "ground level",
  "atmosphere",
  "night",
];

const compact = (value, maxLength = 900) => {
  if (!value) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

function inferImageMimeType(url, headerValue) {
  const header = String(headerValue || "").split(";")[0].trim().toLowerCase();
  if (header.startsWith("image/")) return header;
  const lowerUrl = String(url || "").toLowerCase();
  if (lowerUrl.includes(".jpg") || lowerUrl.includes(".jpeg")) return "image/jpeg";
  if (lowerUrl.includes(".webp")) return "image/webp";
  return "image/png";
}

function normalizeReferenceImage(image, index) {
  let imageData = image;
  if (typeof image === "string") {
    const text = image.trim();
    if (text.charAt(0) === "{") {
      try {
        imageData = JSON.parse(text);
      } catch {
        imageData = { url: text };
      }
    } else {
      imageData = { url: text };
    }
  }

  if (!imageData || typeof imageData !== "object") return null;
  const url = imageData.url || imageData.src || imageData.image_url || imageData.publicUrl;
  if (!url || !/^https?:\/\//i.test(url)) return null;

  return {
    url,
    label: compact(imageData.label || imageData.name || `Reference ${index + 1}`, 120),
  };
}

function scoreReferenceLabel(label, index, priorities) {
  const lowerLabel = String(label || "").toLowerCase();
  const priorityIndex = priorities.findIndex((term) => lowerLabel.includes(term));
  const priorityScore = priorityIndex === -1 ? priorities.length + 1 : priorityIndex;
  return priorityScore * 100 + index;
}

function getAssetReferenceImages(asset, { kind, perAssetLimit, priorities, fallbackLabel }) {
  const images = Array.isArray(asset?.images) ? asset.images : [];
  const references = images
    .map((image, index) => {
      const ref = normalizeReferenceImage(image, index);
      if (!ref) return null;
      return {
        ...ref,
        kind,
        name: asset?.name || fallbackLabel,
        score: scoreReferenceLabel(ref.label, index, priorities),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score)
    .slice(0, perAssetLimit);

  if (!references.length && asset?.sheetUrl && /^https?:\/\//i.test(asset.sheetUrl)) {
    references.push({
      kind,
      name: asset?.name || fallbackLabel,
      label: "Full reference sheet",
      url: asset.sheetUrl,
      score: 999,
    });
  }

  return references;
}

function dedupeReferenceImages(references = []) {
  const seen = new Set();
  return references.filter((reference) => {
    if (seen.has(reference.url)) return false;
    seen.add(reference.url);
    return true;
  });
}

function collectStyleBibleReferenceImages(projectState = {}) {
  const characters = Array.isArray(projectState?.characters) ? projectState.characters : [];
  const locations = Array.isArray(projectState?.locations) ? projectState.locations : [];

  const characterRefs = characters.flatMap((character) => (
    getAssetReferenceImages(character, {
      kind: "character",
      perAssetLimit: CHARACTER_IMAGES_PER_ASSET,
      priorities: CHARACTER_REFERENCE_PRIORITY,
      fallbackLabel: "Character",
    })
  ));

  const locationRefs = locations.flatMap((location) => (
    getAssetReferenceImages(location, {
      kind: "location",
      perAssetLimit: LOCATION_IMAGES_PER_ASSET,
      priorities: LOCATION_REFERENCE_PRIORITY,
      fallbackLabel: "Location",
    })
  ));

  return dedupeReferenceImages([...characterRefs, ...locationRefs]);
}

async function fetchReferenceImage(reference) {
  const response = await fetch(reference.url, {
    signal: AbortSignal.timeout(REFERENCE_IMAGE_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Reference image download failed with ${response.status}`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > REFERENCE_IMAGE_MAX_BYTES) {
    throw new Error("Reference image is too large for style bible analysis");
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > REFERENCE_IMAGE_MAX_BYTES) {
    throw new Error("Reference image is too large for style bible analysis");
  }

  const mimeType = inferImageMimeType(reference.url, response.headers.get("content-type"));
  return {
    ...reference,
    mimeType,
    imageBase64: Buffer.from(arrayBuffer).toString("base64"),
  };
}

async function loadReferenceImages(references = []) {
  const loaded = await Promise.all(references.map(async (reference) => {
    try {
      return await fetchReferenceImage(reference);
    } catch (error) {
      console.warn(`Skipping style reference ${reference.kind}:${reference.name}`, error?.message || error);
      return null;
    }
  }));

  return loaded.filter(Boolean);
}

function extractJsonObject(text) {
  if (!text) return null;
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const objectMatch = text.match(/\{[\s\S]*\}/);
  const candidates = [
    fenced?.[1],
    objectMatch?.[0],
    text,
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      try {
        const normalized = candidate
          .replace(/[“”]/g, '"')
          .replace(/[‘’]/g, "'")
          .replace(/([{,]\s*)'([^']+?)'\s*:/g, '$1"$2":')
          .replace(/:\s*'([^']*?)'(\s*[,}])/g, ': "$1"$2');
        return JSON.parse(normalized);
      } catch {
        // Keep trying the next candidate variant.
      }
    }
  }

  return null;
}

function normalizePalette(primaryPalette) {
  const candidateText = Array.isArray(primaryPalette)
    ? primaryPalette.join(" ")
    : String(primaryPalette || "");
  const matches = candidateText.match(/#[0-9a-fA-F]{6}\b/g) || [];
  const unique = [...new Set(matches.map(color => color.toLowerCase()))];
  if (unique.length >= 3) return unique.slice(0, 3);
  if (unique.length === 2) return [...unique, "#a99fff"];
  if (unique.length === 1) return [...unique, "#111723", "#a99fff"];
  return ["#111723", "#3dd6f5", "#a99fff"];
}

function normalizeChoice(value, allowed, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function normalizeStyleBible(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const colorGrade = source.colour_grade && typeof source.colour_grade === "object"
    ? source.colour_grade
    : {};

  return {
    colour_grade: {
      primary_palette: normalizePalette(colorGrade.primary_palette),
      shadow_tone: compact(colorGrade.shadow_tone || "Neutral cinematic shadows", 220),
      highlight_tone: compact(colorGrade.highlight_tone || "Balanced natural highlights", 220),
      saturation: normalizeChoice(colorGrade.saturation, ["low", "medium", "high"], "medium"),
      contrast: normalizeChoice(colorGrade.contrast, ["low", "medium", "high", "very high"], "high"),
    },
    lighting_style: compact(source.lighting_style || "Motivated cinematic practical lighting with directional contrast.", 240),
    camera_rules: compact(source.camera_rules || "Favor medium and wide framings with continuity-safe composition.", 240),
    visual_tone: compact(source.visual_tone || "Grounded cinematic realism with cohesive atmosphere.", 280),
    negative_constraints: compact(source.negative_constraints || "no stylized filters, no cartoon rendering, no text overlays", 320),
    reference_summary: compact(source.reference_summary || "References indicate a cohesive cinematic palette and controlled lighting language.", 420),
  };
}

function buildStyleBiblePrompt(projectState, referenceImages) {
  const manifest = referenceImages
    .map((reference, index) => `- Image ${index + 1} [${reference.kind.toUpperCase()}] ${reference.name}${reference.label ? ` — ${reference.label}` : ""}`)
    .join("\n");

  return `You are a cinematography director analyzing reference images for a music video.
Based on the attached character and location reference images, and the project mood/genre below, define a strict visual style bible for this music video.

Project mood: ${compact(projectState?.analysis?.mood || projectState?.script?.mood, 220)}
Project genre: ${compact(projectState?.analysis?.genre || projectState?.analysis?.theme, 220)}
Project storyline: ${compact(projectState?.script?.storyline || projectState?.analysis?.summary || projectState?.analysis?.theme, 900)}

Attached reference images (in order):
${manifest || "- None"}

Analyze the reference images and return ONLY this JSON, no other text:
{
  "colour_grade": {
    "primary_palette": ["#hex1", "#hex2", "#hex3"],
    "shadow_tone": "description e.g. deep blue-black shadows",
    "highlight_tone": "description e.g. warm amber highlights",
    "saturation": "low | medium | high",
    "contrast": "low | medium | high | very high"
  },
  "lighting_style": "one sentence description e.g. Hard directional side-lighting, motivated by practical neon sources",
  "camera_rules": "one sentence e.g. Predominantly medium and wide shots, handheld feel, no extreme close-ups of faces",
  "visual_tone": "one sentence e.g. Gritty urban realism, desaturated blues and greens, overcast natural light",
  "negative_constraints": "comma-separated list of things to avoid e.g. no soft glowing bokeh, no warm golden filters, no high-key studio lighting",
  "reference_summary": "two sentence description of the dominant visual aesthetic inferred from the reference images"
}`;
}

async function persistStyleBible({ projectId, styleBible, projectState }) {
  if (!projectId) {
    return {
      ...projectState,
      style_bible: styleBible,
    };
  }

  const supabase = createAdminClient();
  const { data: project, error: fetchError } = await supabase
    .from("projects")
    .select("project_state")
    .eq("id", projectId)
    .single();

  if (fetchError) throw fetchError;

  const mergedState = {
    ...(project?.project_state || projectState || {}),
    style_bible: styleBible,
  };

  const { error: updateError } = await supabase
    .from("projects")
    .update({
      project_state: mergedState,
      style_bible: styleBible,
    })
    .eq("id", projectId);

  if (updateError) {
    const message = String(updateError.message || "").toLowerCase();
    const canFallback =
      message.includes("style_bible") &&
      (message.includes("does not exist") || message.includes("schema cache"));

    if (!canFallback) throw updateError;

    const { error: fallbackError } = await supabase
      .from("projects")
      .update({ project_state: mergedState })
      .eq("id", projectId);

    if (fallbackError) throw fallbackError;
  }

  return mergedState;
}

export async function POST(req) {
  try {
    if (!genAI) {
      return NextResponse.json({ error: "Style bible generation is temporarily unavailable." }, { status: 500 });
    }

    const { projectId, projectState = {} } = await req.json();

    const referenceCandidates = collectStyleBibleReferenceImages(projectState);
    if (!referenceCandidates.length) {
      return NextResponse.json({
        error: "No usable character/location reference images were found.",
      }, { status: 400 });
    }

    const referenceImages = await loadReferenceImages(referenceCandidates);
    if (!referenceImages.length) {
      return NextResponse.json({
        error: "Reference images could not be loaded for style analysis.",
      }, { status: 400 });
    }

    const prompt = buildStyleBiblePrompt(projectState, referenceImages);
    const parts = [
      { text: prompt },
      ...referenceImages.map((reference) => ({
        inlineData: {
          mimeType: reference.mimeType,
          data: reference.imageBase64,
        },
      })),
    ];

    const result = await genAI.models.generateContent({
      model: STYLE_BIBLE_MODEL,
      contents: [{ role: "user", parts }],
    });

    const responseText = result.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text || "";
    const styleBible = normalizeStyleBible(extractJsonObject(responseText));
    const mergedState = await persistStyleBible({ projectId, styleBible, projectState });

    return NextResponse.json({
      success: true,
      style_bible: styleBible,
      project_state: mergedState,
      reference_count: referenceImages.length,
      style_model: STYLE_BIBLE_MODEL,
    });
  } catch (error) {
    console.error("Style Bible Generation API Error:", error);
    return NextResponse.json({ error: error?.message || "Style bible generation failed." }, { status: 500 });
  }
}
