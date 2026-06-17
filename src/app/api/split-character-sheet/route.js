import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  getFallbackModels,
  runWithModelFallback,
  TEXT_MODEL_FALLBACKS,
} from "@/utils/googleModelFallbacks";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
const PYTHON_SERVICE = process.env.PYTHON_SERVICE_URL || "http://localhost:8001";

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
  console.log(`[Python service] stage=${data.stage}  panels=${data.count}`);
  return data.panels; // already sorted + NMS'd by the service
}

// ─── Stage 2: Direct Gemini fallback (if Python service is offline) ───────────

const GEMINI_PROMPT = `You are analyzing a CHARACTER DESIGN REFERENCE SHEET — a single composite image that contains multiple individual photographs of the same character arranged side-by-side.

YOUR TASK: Return a bounding box for EVERY individual photograph in the image.

CRITICAL RULES:
1. ONE photograph = ONE bounding box. Never combine two photographs into one box.
2. Two photos placed side-by-side horizontally → TWO separate boxes, one for each.
3. Two photos stacked vertically → TWO separate boxes, one for each.
4. A 2×2 grid of four small photos → FOUR separate boxes.
5. Include every panel — full-body shots AND small close-up crops.
6. If a region looks like it has 2 faces or 2 distinct poses, it is 2 panels.
7. Boxes must be tight around each individual photo (do not include adjacent photos).
8. Do NOT split one continuous photograph into multiple boxes.
9. Character sheets typically have 6–12 panels. If you find fewer than 6, look again.

STEP-BY-STEP (think before outputting):
A. Count the number of distinct person-views you can see (each angle/framing = 1).
B. Locate the exact pixel boundary of each one.
C. Output a box for each.

For every panel:
  "label"  : describe the framing (e.g. "FRONT VIEW", "LEFT PROFILE", "BACK VIEW", "FACE CLOSE-UP FRONT", "FACE CLOSE-UP BACK", "3/4 LEFT", "3/4 RIGHT")
  "box_2d" : [ymin, xmin, ymax, xmax] — integers 0–1000

Return ONLY a valid JSON array, no markdown, no explanation.`;

async function callGeminiDirect(imageBuffer, mimeType) {
  const { result, model } = await runWithModelFallback({
    label: "Character sheet direct detection",
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

  // Clamp coordinates to [0, 1000]
  panels = panels.map(p => ({
    ...p,
    box_2d: p.box_2d.map(v => Math.max(0, Math.min(1000, v))),
  }));

  panels = nms(panels);
  console.log(`[Gemini direct] model=${model} panels=${panels.length}`);
  return sortPanels(panels);
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req) {
  try {
    const { imageUrl } = await req.json();
    if (!imageUrl) return NextResponse.json({ error: "Missing imageUrl" }, { status: 400 });

    const imageResp = await fetch(imageUrl);
    const imageBuffer = Buffer.from(await imageResp.arrayBuffer());
    const mimeType = imageResp.headers.get("content-type") || "image/jpeg";

    let panels;

    // Try Python service (handles any separator color via CV + its own Gemini fallback)
    try {
      panels = await callPythonService(imageBuffer, mimeType);
    } catch (err) {
      console.warn(`[split-character-sheet] Python service unavailable (${err.message}) — using Gemini direct`);
      panels = await callGeminiDirect(imageBuffer, mimeType);
    }

    console.log(`[split-character-sheet] Final: ${panels.length} panels`);
    return NextResponse.json({ success: true, poses: panels });
  } catch (error) {
    console.error("split-character-sheet error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
