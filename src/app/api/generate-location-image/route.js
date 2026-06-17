import { GoogleGenerativeAI } from "@google/generative-ai";
import { isKBUsable, getLocationEntry, getStyleLock } from "@/utils/knowledgeBase";
import { extractScriptContext, buildLocationIntelligenceBlock } from "@/utils/scriptContext";
import {
  getFallbackModels,
  IMAGE_MODEL_FALLBACKS,
  runWithModelFallback,
} from "@/utils/googleModelFallbacks";
import { NextResponse } from "next/server";

const genAI = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
  : null;

async function generateImage(contents, label) {
  const { result, model } = await runWithModelFallback({
    label,
    models: getFallbackModels(process.env.GOOGLE_LOCATION_IMAGE_MODEL || process.env.GOOGLE_IMAGE_MODEL, IMAGE_MODEL_FALLBACKS),
    operation: async (modelName) => {
      const activeModel = genAI.getGenerativeModel({ model: modelName });
      return activeModel.generateContent({
        contents,
        generationConfig: { responseModalities: ["IMAGE"] }
      });
    },
  });

  const response = await result.response;
  const generatedB64 = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
  if (!generatedB64) {
    const reason = response.candidates?.[0]?.finishReason;
    const err = new Error(reason ? `${label} returned no image data (${reason})` : `${label} returned no image data`);
    err.retryable = reason !== "SAFETY";
    throw err;
  }

  return { generatedB64, model };
}

export async function POST(req) {
  try {
    if (!genAI) {
      return NextResponse.json({ error: "Location generation is temporarily unavailable." }, { status: 500 });
    }

    const {
      base64,
      mimeType,
      label,
      locationDescription,
      angleDescription,
      locationName,
      projectState,
    } = await req.json();

    // Pull KB location + style locks if available
    const kb = projectState?.knowledge_base;
    const kbUsable = isKBUsable(kb);
    const locEntry = kbUsable && locationName ? getLocationEntry(kb, locationName) : null;
    const kbStyleLock = kbUsable ? getStyleLock(kb) : "";
    const kbLocationContext = locEntry?.prompt_lock
      ? `\nKNOWLEDGE BASE LOCATION LOCK:\n${locEntry.prompt_lock}`
      : "";
    const kbStyleContext = kbStyleLock
      ? `\nKNOWLEDGE BASE VISUAL STYLE:\n${kbStyleLock}`
      : "";

    // Script-derived location intelligence
    const scriptCtx = locationName
      ? extractScriptContext({ projectState, locationName })
      : null;
    const scriptLocationBlock = scriptCtx
      ? buildLocationIntelligenceBlock(scriptCtx)
      : "";
    const scriptLocationContext = scriptLocationBlock
      ? `\nSCRIPT & STORY INTELLIGENCE (how this location appears in the story):\n${scriptLocationBlock}`
      : "";

    // 1. REFERENCE-LOCKED GENERATION (Sequential Flow)
    if (base64 && locationDescription && angleDescription) {
      console.log(`NB Pro generating reference-locked location angle: ${label}`);

      const prompt = `Generate a single cinematic LOCATION REFERENCE VIEW locked to the master reference image provided.

STRICT ENVIRONMENT IDENTITY LOCK — copy from the master reference image:
Preserve the exact architecture, materials, surface textures, props, signage, colour palette, vegetation, weather atmosphere, and spatial layout. Every identifiable environmental detail must match.

TARGET VIEW FOR THIS PANEL: ${angleDescription}
LOCATION DETAILS: ${locationDescription}
${kbLocationContext}
${scriptLocationContext}

RULES:
1. Change ONLY the camera angle and viewpoint — the environment itself must be identical to the master
2. Output one clean photorealistic cinematic location view — not a collage, not a moodboard
3. Cinematic production-design quality: show depth, foreground detail, midground, background layers
4. No text, labels, split panels, borders, watermarks, or unrelated locations
5. This view must sit visually beside the master reference as the same place from a different angle`;

      const { generatedB64, model } = await generateImage([{
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: mimeType || "image/png", data: base64 } }
          ]
        }], `Location reference-locked view (${label || "view"})`);

      return NextResponse.json({ success: true, imageBase64: generatedB64, image_model: model });
    }

    // 2. FULL LOCATION SHEET — single 21:9 image, no angleDescription required
    // Triggered when only locationDescription is provided (no base64, no angle).
    if (locationDescription) {
      console.log(`Generating full 21:9 location reference sheet: ${label || locationName}`);

      const fullPrompt = `Generate a single 21:9 ultra-wide LOCATION REFERENCE SHEET for a music video production.

PURPOSE: This sheet is the definitive environment reference for this location. Production will use it to recreate the exact setting for every shot filmed here — maintaining consistent architecture, materials, colour, atmosphere, and lighting across all scenes.

LOCATION BRIEF:
${locationDescription}
${kbLocationContext}
${kbStyleContext}
${scriptLocationContext}

CANVAS AND LAYOUT:
- Single 21:9 horizontal sheet — do NOT generate a 16:9 frame
- Consistent time of day, weather, and atmosphere across all panels
- 8–9 panels covering a full 360° view of the location plus key details:
  PANEL 1 (large, far left, ~30% canvas width): establishing wide shot — the definitive hero view of the location showing full environment
  PANEL 2: wide shot from opposite direction — 180° reverse of panel 1
  PANEL 3: left flank view — 90° left of panel 1
  PANEL 4: right flank view — 90° right of panel 1
  PANEL 5: interior or foreground close-up — a key set-dressing detail, prop, or surface texture that defines the space
  PANEL 6: overhead or elevated angle — bird's eye or high angle showing spatial layout
  PANEL 7: low angle / ground level — character's eye-level view showing environment depth and floor surface
  PANEL 8: key atmospheric detail — lighting condition, sky, ambient element (dust, neon, foliage, crowd density) that defines the mood
  PANEL 9 (optional): secondary area or adjacent space within the same location
- Clean visible dividers or spacing between all panels
- Every panel must be clearly readable as the same location

PRODUCTION RULES:
1. No text, no labels, no borders, no watermarks — clean production-art presentation
2. Photorealistic cinematic quality — foreground, midground, background layers all present
3. Architecture, materials, signage, props, and colour palette must be identical across all panels
4. Lighting direction and time of day must be consistent across all panels
5. No people, no characters in any panel — environment only
6. Make every environmental detail distinctive and repeatable: a filmmaker must be able to recreate this set
${kbStyleLock ? "7. Follow the visual style lock above for colour grade and lighting language." : ""}

OUTPUT: One single 21:9 photorealistic location reference sheet ready for a professional production design department.`;

      const { generatedB64, model } = await generateImage(
        [{ role: "user", parts: [{ text: fullPrompt }] }],
        `Location master generation (${label || "wide"})`
      );

      return NextResponse.json({ success: true, imageBase64: generatedB64, image_model: model });
    } 

    // 3. REFINEMENT MODE (From Sheet Crops)
    if (base64 && mimeType) {
      console.log(`NB Pro performing location refinement on: ${label}`);
      
      const refinementPrompt = `
        Clean up this location sheet crop into a professional standalone asset.
        1. Identify the central view and erase all neighboring parts or grid lines.
        2. Re-render the environment in a pristine, cinematic presentation.
        3. Output exactly ONE single high-quality view.
      `;

      const { generatedB64, model } = await generateImage([{
          role: "user",
          parts: [
            { text: refinementPrompt },
            { inlineData: { mimeType: mimeType || "image/jpeg", data: base64 } }
          ]
        }], `Location crop refinement (${label || "crop"})`);

      return NextResponse.json({ success: true, imageBase64: generatedB64, image_model: model });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  } catch (error) {
    console.error("NB Pro Location API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
