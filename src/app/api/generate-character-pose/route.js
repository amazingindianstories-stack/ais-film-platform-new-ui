import { GoogleGenerativeAI } from "@google/generative-ai";
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
    models: getFallbackModels(process.env.GOOGLE_CHARACTER_IMAGE_MODEL || process.env.GOOGLE_IMAGE_MODEL, IMAGE_MODEL_FALLBACKS),
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
      return NextResponse.json({ error: "Character generation is temporarily unavailable." }, { status: 500 });
    }

    const { 
      base64, 
      mimeType, 
      label, 
      characterDescription, 
      angleDescription,
      sheetPrompt,
    } = await req.json();

    if (characterDescription && sheetPrompt) {
      console.log(`NB Pro generating full character sheet: ${label || "CHARACTER SHEET"}`);

      const prompt = `
        FICTIONAL CHARACTER — FULL REFERENCE SHEET.
        This character is entirely fictional. The character name is a production label only.
        Do NOT associate the character name with any real-world person, celebrity, athlete, politician, or public figure.
        Do NOT look up the name or infer appearance from cultural associations. Appearance is defined by the supplied description${base64 ? " and attached reference image" : ""}.

        TASK:
        Generate exactly ONE complete character design sheet image.

        CHARACTER DETAILS:
        ${characterDescription}

        SHEET PROMPT:
        ${sheetPrompt}

        RULES:
        1. Output a single 21:9 horizontal character sheet, not separate images.
        2. Preserve the exact same character identity, wardrobe, body proportions, hair, skin tone, accessories, and age across every panel.
        3. Do not crop faces, heads, feet, or costume details.
        4. No text labels, watermarks, extra people, extra sheets, or detached panels.
      `;

      const parts = [{ text: prompt }];
      if (base64) {
        parts.push({ inlineData: { mimeType: mimeType || "image/png", data: base64 } });
      }

      const { generatedB64, model } = await generateImage(
        [{ role: "user", parts }],
        `Character full sheet (${label || "sheet"})`
      );

      return NextResponse.json({ success: true, imageBase64: generatedB64, image_model: model });
    }

    // 1. REFERENCE-LOCKED GENERATION (Sequential Flow)
    if (base64 && characterDescription && angleDescription) {
      console.log(`NB Pro generating reference-locked angle: ${label}`);

      const prompt = `
        FICTIONAL CHARACTER — PRODUCTION IDENTITY LOCK.
        This character is entirely fictional. The character name is a production label only.
        Do NOT associate the character name with any real-world person, celebrity, athlete, politician, or public figure.
        Do NOT look up the name or infer appearance from cultural associations. Appearance is defined SOLELY by the attached reference image and the description below.

        MATCH THIS EXACT CHARACTER from the provided master reference image.
        TARGET ANGLE: ${angleDescription}
        CHARACTER DETAILS: ${characterDescription}

        RULES:
        1. Preserve the exact face, skull shape, eyes, nose, lips, skin tone, hairline, hairstyle, body proportions, wardrobe, accessories, and age as shown in the reference image.
        2. Change ONLY the camera angle/framing/pose needed for "${label}".
        3. Output one clean professional reference image on a white or soft neutral studio background.
        4. No text, labels, split panels, grids, borders, watermarks, or extra people.
        5. Keep this view consistent enough to sit beside the other reference images as the same person.
      `;

      const { generatedB64, model } = await generateImage([{
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: mimeType || "image/png", data: base64 } }
          ]
        }], `Character reference-locked angle (${label || "angle"})`);

      return NextResponse.json({ success: true, imageBase64: generatedB64, image_model: model });
    }

    // 2. TWO-STAGE MASTER GENERATION (Stage 1: Original Face → Stage 2: Reference-Locked Angle)
    // This prevents celebrity name lookup (e.g. "Mahi" → MS Dhoni) by never exposing
    // the character name during face generation. Stage 1 creates an original face from
    // physical description only; Stage 2 uses that face image as a pixel-locked reference.
    if (characterDescription && angleDescription) {
      console.log(`NB Pro: 2-stage master generation for label=${label}`);

      // STAGE 1: Generate a face portrait from physical description only — no character name exposed
      const stage1Prompt = `FICTIONAL PERSON FACE PORTRAIT — PRODUCTION ASSET.
You are creating a completely original fictional person for a creative production.
Do NOT associate this with any real-world person, celebrity, athlete, politician, or public figure.
Generate a photorealistic face portrait based ONLY on the physical description below.

PHYSICAL DESCRIPTION:
${characterDescription}

OUTPUT RULES:
- One person only, face and upper body (chest-up), front-facing
- Photorealistic cinematic studio lighting on a clean white or soft neutral background
- Make the face, hair, skin tone, age, and any visible clothing highly distinctive and repeatable
- The person must be a completely original fictional individual
- No text, labels, borders, watermarks, or collage`;

      const { generatedB64: stage1B64, model: _stage1Model } = await generateImage(
        [{ role: "user", parts: [{ text: stage1Prompt }] }],
        `Character 2-stage: face portrait (${label || "front"})`
      );

      // STAGE 2: Use stage-1 face as a pixel-locked reference to generate the target angle
      const stage2Prompt = `FICTIONAL CHARACTER — REFERENCE-LOCKED ANGLE GENERATION.
The attached image is an approved face reference for a completely fictional character.
Do NOT associate this character with any real-world person, celebrity, or public figure.

TASK: Generate a new view of this EXACT fictional character.
TARGET ANGLE: ${angleDescription}
CHARACTER CONTEXT: ${characterDescription}

RULES:
1. The face in the output MUST exactly match the attached reference image — same facial structure, skin tone, eyes, nose, lips, hairline, hair color/style, and age.
2. Change ONLY what is needed for the target angle, pose, or framing.
3. Preserve body proportions, outfit, and accessories from the reference.
4. Output one clean professional studio image on a white or soft neutral background.
5. No text, labels, split panels, grids, borders, watermarks, or extra people.`;

      const { generatedB64, model } = await generateImage(
        [{
          role: "user",
          parts: [
            { text: stage2Prompt },
            { inlineData: { mimeType: "image/png", data: stage1B64 } }
          ]
        }],
        `Character 2-stage: reference-locked angle (${label || "front"})`
      );

      return NextResponse.json({ success: true, imageBase64: generatedB64, image_model: model });
    }

    // 3. REFINEMENT MODE (From Sheet Crops)
    if (base64 && mimeType) {
      console.log(`NB Pro performing solo refinement on: ${label}`);
      
      const refinementPrompt = `
        STRICT SOLO SUBJECT ISOLATION.
        Clean up this character sheet crop into a professional standalone asset.
        1. Identify the central character and erase all neighboring parts or grid lines.
        2. Re-render the character in a pristine white studio background.
        3. Output exactly ONE single character body.
      `;

      const { generatedB64, model } = await generateImage([{
          role: "user",
          parts: [
            { text: refinementPrompt },
            { inlineData: { mimeType: mimeType || "image/jpeg", data: base64 } }
          ]
        }], `Character crop refinement (${label || "crop"})`);

      return NextResponse.json({ success: true, imageBase64: generatedB64, image_model: model });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  } catch (error) {
    console.error("NB Pro API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
