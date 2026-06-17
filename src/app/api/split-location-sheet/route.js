import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  getFallbackModels,
  runWithModelFallback,
  TEXT_MODEL_FALLBACKS,
} from "@/utils/googleModelFallbacks";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
const PYTHON_SERVICE = process.env.PYTHON_SERVICE_URL || "http://localhost:8001";
const LOCATION_LABEL_FALLBACKS = [
  "ESTABLISHING VIEW",
  "INTERIOR VIEW",
  "EXTERIOR VIEW",
  "DETAIL VIEW",
  "ATMOSPHERE VIEW",
  "WIDE ANGLE",
  "AERIAL VIEW",
  "GROUND LEVEL",
  "NIGHT VIEW",
  "ALT VIEW",
];
const CHARACTER_STYLE_LABELS = [
  "FULL BODY",
  "MID PORTRAIT",
  "PORTRAIT",
  "FRONT VIEW",
  "BACK VIEW",
  "LEFT PROFILE",
  "RIGHT PROFILE",
  "SIDE VIEW",
  "FACE",
  "3/4",
  "CUSTOM CROP",
  "POSE",
];

// ─── Sorting & NMS helpers ────────────────────────────────────────────────────

function sortPanels(panels) {
  return [...panels].sort((a, b) => {
    const rowDiff = Math.floor(a.box_2d[0] / 80) - Math.floor(b.box_2d[0] / 80);
    if (rowDiff !== 0) return rowDiff;
    return a.box_2d[1] - b.box_2d[1];
  });
}

function boxArea(b) {
  return Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
}

function iou(a, b) {
  const yi1 = Math.max(a[0], b[0]), xi1 = Math.max(a[1], b[1]);
  const yi2 = Math.min(a[2], b[2]), xi2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, yi2 - yi1) * Math.max(0, xi2 - xi1);
  const union = boxArea(a) + boxArea(b) - inter;
  return union > 0 ? inter / union : 0;
}

function nms(panels, thresh = 0.4) {
  const sorted = [...panels].sort((a, b) => boxArea(b.box_2d) - boxArea(a.box_2d));
  const keep = [];
  const suppressed = new Set();
  for (let i = 0; i < sorted.length; i++) {
    if (suppressed.has(i)) continue;
    keep.push(sorted[i]);
    for (let j = i + 1; j < sorted.length; j++) {
      if (iou(sorted[i].box_2d, sorted[j].box_2d) > thresh) suppressed.add(j);
    }
  }
  return keep;
}

function normalizeLocationLabel(label, index) {
  const text = typeof label === "string" ? label.trim().toUpperCase() : "";
  const isCharacterLabel = CHARACTER_STYLE_LABELS.some(term => text.includes(term));
  const isTooGeneric = !text || /^ZONE\s*\d*$/i.test(text) || /^VIEW\s*\d*$/i.test(text) || /^NEW\s+VIEW\s*\d*$/i.test(text) || /^SECTION\s*\d*$/i.test(text);
  return isCharacterLabel || isTooGeneric
    ? LOCATION_LABEL_FALLBACKS[index % LOCATION_LABEL_FALLBACKS.length]
    : text;
}

function cleanPanels(panels) {
  return sortPanels(nms((panels || [])
    .filter(p => Array.isArray(p.box_2d) && p.box_2d.length === 4)
    .map(p => ({
      ...p,
      box_2d: p.box_2d.map(v => Math.max(0, Math.min(1000, Number(v) || 0))),
    })))).map((p, index) => ({
      ...p,
      label: normalizeLocationLabel(p.label, index),
    }));
}

// ─── Stage 1: Python microservice (CV + its own Gemini fallback) ──────────────

async function callPythonService(imageBuffer, mimeType) {
  const b64 = imageBuffer.toString("base64");
  const res = await fetch(`${PYTHON_SERVICE}/split`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: b64, mimeType }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Python service HTTP ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.detail || "Python service error");
  console.log(`[Python service - Locations] stage=${data.stage}  panels=${data.count}`);
  return data.panels;
}

// ─── Stage 2: Direct Gemini fallback ──────────────────────────────────────────

const GEMINI_PROMPT = `You are analyzing a LOCATION REFERENCE SHEET — a composite image that contains multiple individual views, angles, and zones of the same environment or location.

YOUR TASK: Return a bounding box for EVERY individual distinct view or photograph in the image.

CRITICAL RULES:
1. ONE photograph/view = ONE bounding box. Never combine two separate views into one box.
2. Two views placed side-by-side horizontally → TWO separate boxes.
3. Two views stacked vertically → TWO separate boxes.
4. Include every panel — wide shots, close-up textures, interior details, and atmospheric shots.
5. If a region looks like it contains multiple distinct compositions, split it.
6. Boxes must be tight around each individual photograph.
7. Location sheets typically have 6–12 panels.

For every panel:
  "label"  : describe the view (e.g. "WIDE SHOT", "INTERIOR VIEW", "EXTERIOR ANGLE", "CLOSE-UP DETAIL", "ATMOSPHERE", "AERIAL VIEW", "GOLDEN HOUR")
  "box_2d" : [ymin, xmin, ymax, xmax] — integers 0–1000

Return ONLY a valid JSON array, no markdown, no explanation.`;

async function callGeminiDirect(imageBuffer, mimeType) {
  const { result, model } = await runWithModelFallback({
    label: "Location sheet direct detection",
    models: getFallbackModels(process.env.GOOGLE_TEXT_MODEL, TEXT_MODEL_FALLBACKS),
    operation: async (modelName) => {
      const activeModel = genAI.getGenerativeModel({ model: modelName });
      return activeModel.generateContent([
        GEMINI_PROMPT,
        { inlineData: { data: imageBuffer.toString("base64"), mimeType } },
      ]);
    },
  });
  const text = result.response.text().trim();
  const start = text.indexOf('[');
  const end   = text.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error("Gemini returned no JSON array");

  let panels = JSON.parse(text.substring(start, end + 1));

  panels = panels.map(p => ({
    ...p,
    box_2d: p.box_2d.map(v => Math.max(0, Math.min(1000, v))),
  }));

  panels = nms(panels);
  console.log(`[Gemini direct - Locations] model=${model} panels=${panels.length}`);
  return sortPanels(panels);
}

async function validateLocationSheet(imageBuffer, mimeType) {
  try {
    const { result, model } = await runWithModelFallback({
      label: "Location sheet validation",
      models: getFallbackModels(process.env.GOOGLE_TEXT_MODEL, TEXT_MODEL_FALLBACKS),
      operation: async (modelName) => {
        const activeModel = genAI.getGenerativeModel({ model: modelName });
        return activeModel.generateContent([
          `Analyze whether this uploaded image is primarily a location/environment reference sheet.

Return ONLY JSON:
{
  "is_location_sheet": boolean,
  "confidence": number,
  "reason": "short user-facing reason"
}

Mark false when the image is mostly character/body/face reference panels, product portraits, or non-environment imagery. Mark true when it is mostly architecture, rooms, landscapes, streets, interiors, exteriors, or environmental reference panels.`,
          { inlineData: { data: imageBuffer.toString("base64"), mimeType } },
        ]);
      },
    });
    console.log(`[split-location-sheet] validation model=${model}`);
    const text = result.response.text().trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const verdict = JSON.parse(text.substring(start, end + 1));
    if (verdict?.is_location_sheet === false && Number(verdict.confidence) >= 0.55) {
      return `Heads up: this upload does not look like a location sheet. ${verdict.reason || "It appears to show mostly non-environment imagery."} I still processed the detected panels, but you may want to upload an environment or location reference.`;
    }
  } catch (err) {
    console.warn(`[split-location-sheet] Location validation unavailable: ${err.message}`);
  }

  return null;
}

export async function POST(req) {
  try {
    const { imageUrl } = await req.json();
    if (!imageUrl) return NextResponse.json({ error: "Missing imageUrl" }, { status: 400 });

    const imageResp = await fetch(imageUrl);
    const imageBuffer = Buffer.from(await imageResp.arrayBuffer());
    const mimeType = imageResp.headers.get("content-type") || "image/jpeg";

    let panels;
    const warning = await validateLocationSheet(imageBuffer, mimeType);

    try {
      panels = await callPythonService(imageBuffer, mimeType);
    } catch (err) {
      console.warn(`[split-location-sheet] Python service unavailable — using Gemini direct`);
      panels = await callGeminiDirect(imageBuffer, mimeType);
    }

    return NextResponse.json({ success: true, poses: cleanPanels(panels), warning });
  } catch (error) {
    console.error("split-location-sheet error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
