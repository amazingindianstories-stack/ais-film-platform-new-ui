import {
  FACE_SCORE_THRESHOLD,
  OUTFIT_SCORE_THRESHOLD,
  QUALITY_CHECK_TIMEOUT_MS,
  QUALITY_CHECK_MODEL,
  QUALITY_CHECK_MODEL_FALLBACKS,
} from "./shotImageConstants.js";
import { withTimeout } from "./referenceImages.js";

function qcModels() {
  const models = [...QUALITY_CHECK_MODEL_FALLBACKS];
  if (!models.includes(QUALITY_CHECK_MODEL)) models.unshift(QUALITY_CHECK_MODEL);
  return models.length ? models : ["gemini-2.5-flash"];
}

function parseQcResponse(result) {
  const text = result.candidates?.[0]?.content?.parts?.find(p => p.text)?.text || "";
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) throw new Error("Could not parse quality check JSON");
  return JSON.parse(jsonMatch[0]);
}

export async function qualityCheckImage(genAI, generatedBase64, generatedMimeType, characterAndWardrobeRefs) {
  if (!genAI || !characterAndWardrobeRefs.length) {
    return { faceScore: 10, outfitScore: 10, pass: true, issues: [] };
  }

  try {
    const hasWardrobeRef = characterAndWardrobeRefs.some(r => r.kind === "wardrobe");
    const refParts = characterAndWardrobeRefs.map(ref => ({
      inlineData: { mimeType: ref.mimeType, data: ref.imageBase64 },
    }));
    const candidatePart = {
      inlineData: { mimeType: generatedMimeType || "image/png", data: generatedBase64 },
    };
    const textPart = {
      text: `You are a quality-control inspector for an AI music video pipeline.

The first ${refParts.length} image${refParts.length > 1 ? "s are" : " is"} approved reference${refParts.length > 1 ? "s" : ""} showing character identity (faces, hair, skin tone, body) and wardrobe/outfits.
The LAST image is a generated shot candidate to evaluate.

Score the candidate out of 10:
- face_score: How closely the main character's face, skin tone, hair, and body match the character references. 10 = perfect match, 1 = completely different person.
- outfit_score: How closely the clothing/outfit matches the wardrobe references${hasWardrobeRef ? "" : " (no wardrobe references provided — set to 10)"}. 10 = exact match.

PASS requires face_score >= ${FACE_SCORE_THRESHOLD} AND outfit_score >= ${hasWardrobeRef ? OUTFIT_SCORE_THRESHOLD : 0}.

Respond with ONLY this JSON, no other text:
{"face_score": <0-10>, "outfit_score": <0-10>, "pass": <true|false>, "issues": ["brief issue"]}`,
    };

    let parsed = null;
    let lastError = null;
    for (const model of qcModels()) {
      try {
        const result = await withTimeout(
          () => genAI.models.generateContent({
            model,
            contents: [{ role: "user", parts: [...refParts, candidatePart, textPart] }],
          }),
          QUALITY_CHECK_TIMEOUT_MS,
          `Image quality check (${model})`
        );
        parsed = parseQcResponse(result);
        break;
      } catch (error) {
        lastError = error;
        const message = String(error?.message || "");
        const status = Number(error?.status || error?.code || error?.cause?.status || error?.cause?.code || 0);
        const modelMissing = status === 404 ||
          message.includes("no longer available") ||
          message.includes("not found");
        if (!modelMissing) break;
      }
    }

    if (!parsed) throw lastError || new Error("Quality check model did not return a valid response");
    const faceScore = Number(parsed.face_score ?? 0);
    const outfitScore = Number(parsed.outfit_score ?? (hasWardrobeRef ? 0 : 10));
    const thresholdPass = faceScore >= FACE_SCORE_THRESHOLD &&
      (hasWardrobeRef ? outfitScore >= OUTFIT_SCORE_THRESHOLD : true);
    return {
      faceScore,
      outfitScore,
      // Pass is computed server-side from strict thresholds so model JSON cannot
      // silently relax identity checks.
      pass: thresholdPass,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    };
  } catch (error) {
    console.warn(`Quality check failed, rejecting candidate (${error.message})`);
    // Fail closed when identity references exist: if we cannot verify face/outfit,
    // we must not accept the frame as strict identity-safe.
    return {
      faceScore: 0,
      outfitScore: 0,
      pass: false,
      issues: ['quality-check-unavailable'],
    };
  }
}
