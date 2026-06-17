import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import {
  getFallbackModels,
  runWithModelFallback,
  TEXT_MODEL_FALLBACKS,
} from "@/utils/googleModelFallbacks";
import { CAMERA_STYLE_EXAMPLES } from "@/utils/cameraStyles";
import { getShotBrainContext, isKBUsable, getKBEntityLocksForShot, getStyleLock } from "@/utils/knowledgeBase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const genAI = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
  : null;

function compact(value, max = 600) {
  if (!value) return "";
  const t = String(value).replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

async function generateText(parts) {
  if (!genAI) throw new Error("GOOGLE_AI_API_KEY not configured");
  const primaryModel = process.env.GOOGLE_TEXT_MODEL;
  const models = getFallbackModels(primaryModel, TEXT_MODEL_FALLBACKS);
  const { result } = await runWithModelFallback({
    label: "rewrite-shot-prompt",
    models,
    operation: async (modelName) => {
      const model = genAI.getGenerativeModel({ model: modelName });
      return model.generateContent(parts);
    },
  });
  const response = await result.response;
  return response.text();
}

function buildContextBlock(shot, projectState, mode) {
  const script = projectState?.script || {};
  const chars = Array.isArray(projectState?.characters) ? projectState.characters : [];
  const locs = Array.isArray(projectState?.locations) ? projectState.locations : [];

  const charLines = chars
    .map(c => `- ${c.name}: ${compact(c.visual_prompt || c.description, 200)}${c.costume ? ` | Costume: ${compact(c.costume, 120)}` : ""}`)
    .join("\n");
  const locLines = locs
    .map(l => `- ${l.name}: ${compact(l.visual_prompt || l.description, 200)}`)
    .join("\n");

  return [
    `Shot title: ${shot.n || "Untitled"}`,
    `Shot type: ${mode === "image" ? "still frame (image_prompt)" : "video clip (video_prompt)"}`,
    shot.shot_size ? `Shot size: ${shot.shot_size}` : "",
    shot.camera ? `Camera/lens: ${compact(shot.camera, 120)}` : "",
    shot.movement ? `Movement: ${compact(shot.movement, 120)}` : "",
    shot.beat ? `Story beat: ${compact(shot.beat, 200)}` : "",
    shot.concept ? `Shot concept: ${compact(shot.concept, 300)}` : "",
    shot.characters?.length ? `Characters in shot: ${shot.characters.join(", ")}` : "",
    shot.locations?.length ? `Locations in shot: ${shot.locations.join(", ")}` : "",
    shot.costumes ? `Wardrobe: ${compact(shot.costumes, 200)}` : "",
    shot.continuity ? `Continuity: ${compact(shot.continuity, 200)}` : "",
    shot.action_timing ? `Action timing: ${compact(shot.action_timing, 400)}` : "",
    shot.visual_style ? `Visual style: ${compact(shot.visual_style, 200)}` : "",
    shot.start !== undefined ? `Timeline: ${shot.start}s – ${shot.end}s (${shot.duration || "?"}s duration)` : "",
    shot.lyrics ? `Lyrics cue: ${compact(shot.lyrics, 160)}` : "",
    script.title ? `\nProject: ${script.title}` : "",
    script.mood ? `Mood: ${compact(script.mood, 200)}` : "",
    charLines ? `\nCharacters:\n${charLines}` : "",
    locLines ? `\nLocations:\n${locLines}` : "",
  ].filter(Boolean).join("\n");
}

export async function POST(req) {
  try {
    const { shot, projectState, mode, currentPrompt } = await req.json();

    if (!shot || !mode) {
      return NextResponse.json({ error: "Missing shot or mode" }, { status: 400 });
    }
    if (mode !== "image" && mode !== "video") {
      return NextResponse.json({ error: "mode must be 'image' or 'video'" }, { status: 400 });
    }

    const context = buildContextBlock(shot, projectState, mode);
    const isImage = mode === "image";
    const videoPrompt = shot?.video_prompt || shot?.motion_prompt || shot?.clip_prompt || '';

    // KB entity locks give the rewriter precise visual descriptions for characters/locations
    const kb = projectState?.knowledge_base;
    const kbEntityLocks = isKBUsable(kb) ? getKBEntityLocksForShot(kb, shot) : "";
    const kbStyleLock = isKBUsable(kb) ? getStyleLock(kb) : "";
    const kbBrainContext = getShotBrainContext(kb, shot);

    const systemPrompt = isImage
      ? `You are a cinematography prompt writer for a photorealistic AI image generator. Your job is to write the first-frame anchor image for a video clip.

This image will be uploaded to a video generation model as the source frame (t=0.00). The video model begins all motion from this exact image. Your job is NOT to pick the most cinematic moment — it is to freeze the OPENING position of the video clip so the model can start from it without deviation.

Rules:
- If a video_prompt is provided in the context, derive this image ENTIRELY from the first [MM:SS.ss-...] beat of that video prompt. Use the same camera setup (shot size, lens feel, height, depth of field), same environment layers, and the exact character positions, poses, gazes, and expressions stated for beat one.
- If no video_prompt exists, describe the logical starting position for the shot: characters in their opening stance, camera at its starting position, environment fully visible.
- Describe ONE frozen 16:9 cinematic frame. Include: subject placement, exact pose, facial expression, wardrobe, foreground/midground/background layers, lighting direction and color temperature, lens/framing, textures.
- Every depth layer must be described: what is in foreground (characters, props), midground (set dressing, movement), background (environment, crowd, atmosphere).
- State lighting fully: direction, color temperature, quality (hard/soft/rim/fill).
- Do NOT include: dialogue, sound design, clip duration, bracketed timing, camera moves over time, or editing instructions.
- End the prompt with this exact sentence: "This is the first frame of a [Xs] clip — compose it so the video model can begin the motion from this exact position." (replace [Xs] with the actual duration if known).
- Target 140–260 words.
- Output ONLY the rewritten prompt text. No preamble, no explanation.`
      : `You are a cinematography prompt writer for a photorealistic AI video generator. Your job is to rewrite or improve a video-clip prompt for a music video shot.

Structure every video prompt in this exact order:

1. CAMERA SETUP LINE (no timestamp): shot size (close-up / medium / wide / establishing), lens feel (e.g. 50mm), camera height (eye level / low angle / overhead), depth of field, and camera movement for the full clip (static locked-off / gentle handheld drift / tracking backward / slow push-in).

2. ENVIRONMENT LINE (no timestamp): foreground subject(s), midground props/texture/set dressing, background activity and crowd density, lighting direction and color temperature, atmosphere (dust, steam, haze, golden hour). State what moves in each depth layer throughout the clip.

3. TIMESTAMPED CHARACTER BEATS — one per distinct visual moment, covering the full clip with no gaps:
   [MM:SS.ss-MM:SS.ss] CHARACTER NAME: exact body position, gaze direction, hand placement, facial micro-expression, spoken words or lip movement if any — camera: what the camera does during this beat (locked / drifts left / slow push / rack focus).
   When two characters are in the shot, name both and describe both simultaneously within the same beat.

4. CLOSING LINE: Final frame — what character(s) and camera are doing in the last half-second.

Rules:
- A 4s clip needs ≥2 beats. A 6s clip needs ≥3. An 8s clip needs ≥4.
- Always use the character's actual name, never "the character" or "they".
- Camera movement must be stated in every beat — never leave it ambiguous.
- Environmental layers (foreground / midground / background) must be described and their motion stated.
- Keep movement subtle and filmable: small steps, eye shifts, hand movement, breathing, fabric sway.
- Do NOT include: transitions, cuts, fades, wipes, subtitles, titles, text overlays, borders, split-screen.
- Target 220–420 words. Complex multi-character shots can be longer.
- Output ONLY the rewritten prompt text. No preamble, no explanation, no markdown headers.`;

    const kbSection = [
      kbBrainContext ? `SHOT BRAIN CONTEXT (highest priority - identity, wardrobe, location, style, story):\n${kbBrainContext}` : "",
      kbEntityLocks ? `KNOWLEDGE BASE — CHARACTER & LOCATION LOCKS (highest priority — use these exact descriptions):\n${kbEntityLocks}` : "",
      kbStyleLock   ? `KNOWLEDGE BASE — VISUAL STYLE LOCK:\n${kbStyleLock}` : "",
    ].filter(Boolean).join("\n\n");

    const userPrompt = `${CAMERA_STYLE_EXAMPLES}

---
${kbSection ? `\n${kbSection}\n\n---\n` : ""}
Shot context:
${context}
${isImage && videoPrompt ? `\nVIDEO CLIP THIS IMAGE ANCHORS (derive first frame from its [00:00.00-...] beat):\n${videoPrompt}\n` : ""}
${currentPrompt ? `Current prompt to improve:\n${currentPrompt}\n` : ""}
Write a ${isImage ? "first-frame anchor image" : "video clip"} prompt for this shot that matches or exceeds the quality and specificity of the examples above.`;

    const text = await generateText([systemPrompt, userPrompt]);
    const cleaned = text.replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/, "").trim();

    return NextResponse.json({ prompt: cleaned });
  } catch (error) {
    console.error("rewrite-shot-prompt failed:", error);
    return NextResponse.json({ error: "Prompt rewrite failed. Please try again." }, { status: 500 });
  }
}
