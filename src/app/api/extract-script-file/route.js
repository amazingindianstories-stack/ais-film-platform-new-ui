import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ai = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY })
  : null;

const MODEL = process.env.GOOGLE_SCRIPT_FILE_MODEL || "gemini-2.5-flash";
const MAX_FILE_BYTES = 18 * 1024 * 1024;
const MAX_TEXT_CHARS = 12000;

function compact(value, max = MAX_TEXT_CHARS) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function extractJsonObject(text) {
  const fenced = text?.match(/```json\s*([\s\S]*?)```/i)?.[1];
  const bare = text?.match(/\{[\s\S]*\}/)?.[0];
  for (const candidate of [fenced, bare, text].filter(Boolean)) {
    try { return JSON.parse(candidate); } catch { /* try next */ }
  }
  return null;
}

function inferMime(file) {
  const fromType = String(file?.type || "").split(";")[0].trim().toLowerCase();
  if (fromType) return fromType;
  const name = String(file?.name || "").toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".md")) return "text/markdown";
  return "text/plain";
}

function isTextFile(file, mimeType) {
  const name = String(file?.name || "").toLowerCase();
  return mimeType.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md");
}

function normalizeResult(raw, fallbackText = "") {
  const moodKeywords = Array.isArray(raw?.mood_keywords)
    ? raw.mood_keywords.map(item => compact(item, 80)).filter(Boolean).slice(0, 8)
    : [];

  return {
    raw_text: compact(raw?.raw_text || fallbackText),
    summary: compact(raw?.summary, 1400),
    mood_keywords: moodKeywords,
    visual_notes: compact(raw?.visual_notes, 900),
    detected_entities: raw?.detected_entities && typeof raw.detected_entities === "object"
      ? raw.detected_entities
      : { characters: [], locations: [] },
  };
}

function buildPrompt(fileName, storyPrompt, moodWords) {
  return `You are reading an uploaded script, treatment, storyboard, or creative brief for a music-video planning app.

File name: ${fileName || "uploaded script"}
User story prompt, if any: ${compact(storyPrompt, 700) || "None"}
Existing mood tags: ${Array.isArray(moodWords) ? moodWords.join(", ") : "None"}

Read the attached file and return ONLY valid JSON:
{
  "raw_text": "usable extracted or condensed source text, preserving story order, scene beats, character names, locations, lyrics/dialogue cues, and visual details",
  "summary": "director-friendly story summary in 4-7 sentences",
  "mood_keywords": ["short mood keyword"],
  "visual_notes": "cinematography, palette, setting, era, wardrobe, props, and production design cues found in the file",
  "detected_entities": {
    "characters": ["exact character names or roles found in the file"],
    "locations": ["exact location names or setting labels found in the file"]
  }
}

Rules:
- Use only information present in the file or the user's prompt.
- Do not invent new plot, cast, or locations.
- If the file is long, condense repeated prose but keep the creative intent and continuity facts.
- Keep raw_text under about ${MAX_TEXT_CHARS} characters.`;
}

export async function POST(req) {
  let formData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid file upload." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function") {
    return NextResponse.json({ error: "Missing script file." }, { status: 400 });
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Script file is too large. Please upload a PDF under 18 MB." }, { status: 413 });
  }

  const mimeType = inferMime(file);
  const storyPrompt = formData.get("storyPrompt") || "";
  let moodWords = [];
  try {
    const parsedMoodWords = JSON.parse(formData.get("moodWords") || "[]");
    moodWords = Array.isArray(parsedMoodWords) ? parsedMoodWords : [];
  } catch {
    moodWords = [];
  }

  if (isTextFile(file, mimeType)) {
    const text = await file.text();
    return NextResponse.json(normalizeResult({ raw_text: text, summary: compact(text, 1400) }, text));
  }

  if (mimeType !== "application/pdf") {
    return NextResponse.json({
      error: "This uploader can read PDF, TXT, and Markdown files. The file was not processed.",
    }, { status: 415 });
  }

  if (!ai) {
    return NextResponse.json({ error: "GOOGLE_AI_API_KEY not configured." }, { status: 500 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parts = [
    { text: buildPrompt(file.name, storyPrompt, moodWords) },
    { inlineData: { mimeType, data: buffer.toString("base64") } },
  ];

  let responseText = "";
  try {
    const result = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts }],
    });
    responseText = result.candidates?.[0]?.content?.parts?.find(part => part.text)?.text || "";
  } catch (error) {
    console.error("Script file extraction failed:", error);
    return NextResponse.json({ error: "Script file extraction failed: " + (error.message || error) }, { status: 500 });
  }

  const raw = extractJsonObject(responseText);
  if (!raw) {
    return NextResponse.json({ error: "The script file could not be read into usable JSON." }, { status: 500 });
  }

  return NextResponse.json(normalizeResult(raw));
}
