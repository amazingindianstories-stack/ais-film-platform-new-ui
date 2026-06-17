import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase-admin";
import {
  getFallbackModels,
  IMAGE_MODEL_FALLBACKS,
  runWithModelFallback,
} from "@/utils/googleModelFallbacks";
import {
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODEL_PROVIDER_BYTEDANCE,
  resolveImageModelOption,
} from "@/utils/generationModels";
import { normalizeShot } from "@/utils/shotList";
import {
  MAX_RETRIES,
  IMAGE_GENERATION_TIMEOUT_MS,
  STORAGE_UPLOAD_TIMEOUT_MS,
  QUALITY_CANDIDATE_COUNT,
  STRICT_IDENTITY_LOCK,
  compact,
} from "./shotImageConstants.js";
import {
  normalizeLookupName,
  serializeError,
  withTimeout,
  withRetry,
  createProviderError,
  collectFocusedReferenceImages,
  loadReferenceImages,
  assertNativeWidescreenImage,
} from "./referenceImages.js";
import { qualityCheckImage } from "./qualityCheck.js";
import { generateByteDanceImage } from "./bytedanceProvider.js";
import {
  buildPrompt,
  resolveShotAssets,
  selectImagePrompt,
  extractBackgroundGroups,
} from "./promptBuilder.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const genAI = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY })
  : null;

function getResponseCandidates(result) {
  if (Array.isArray(result?.candidates)) return result.candidates;
  if (Array.isArray(result?.response?.candidates)) return result.response.candidates;
  return [];
}

function getPromptFeedback(result) {
  return result?.promptFeedback || result?.response?.promptFeedback || null;
}

function extractImagePart(result) {
  const candidates = getResponseCandidates(result);
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      const inlineData = part?.inlineData || part?.inline_data;
      const generatedBase64 = inlineData?.data || inlineData?.bytesBase64Encoded || inlineData?.b64Data;
      if (generatedBase64) {
        return {
          imageBase64: generatedBase64,
          mimeType: inlineData?.mimeType || inlineData?.mime_type || "image/png",
        };
      }

      const text = typeof part?.text === "string" ? part.text : "";
      const dataUrlMatch = text.match(/data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/);
      if (dataUrlMatch) {
        return {
          imageBase64: dataUrlMatch[2],
          mimeType: dataUrlMatch[1] || "image/png",
        };
      }
    }
  }
  return null;
}

function inferNoImageReason(result) {
  const candidates = getResponseCandidates(result);
  const finishReason = candidates
    .map(candidate => candidate?.finishReason || candidate?.finish_reason)
    .find(Boolean);
  const promptFeedback = getPromptFeedback(result);
  const promptBlockReason = promptFeedback?.blockReason || promptFeedback?.block_reason;
  return finishReason || promptBlockReason || null;
}

async function generateGoogleImage({ prompt, modelName, shotIndex, referenceImages = [] }) {
  if (!genAI) {
    throw createProviderError("Frame generation is temporarily unavailable.", { status: 500 });
  }

  return runWithModelFallback({
    label: `Shot ${shotIndex + 1} image generation`,
    models: getFallbackModels(modelName || process.env.GOOGLE_IMAGE_MODEL, IMAGE_MODEL_FALLBACKS),
    operation: async (activeModelName) => withRetry(async () => {
      const parts = [
        { text: prompt },
        ...referenceImages.map(reference => ({
          inlineData: {
            mimeType: reference.mimeType,
            data: reference.imageBase64,
          },
        })),
      ];

      const result = await withTimeout(
        () => genAI.models.generateContent({
          model: activeModelName,
          contents: [{ role: "user", parts }],
          config: {
            responseModalities: ["IMAGE"],
            imageConfig: {
              aspectRatio: "16:9",
              imageSize: "1K",
            },
          },
        }),
        IMAGE_GENERATION_TIMEOUT_MS,
        `Image model request (${activeModelName})`
      );

      const extractedImage = extractImagePart(result);

      if (!extractedImage?.imageBase64) {
        const reason = inferNoImageReason(result);
        const err = new Error(reason ? `Image model returned no image data (${reason})` : "Image model returned no image data");
        err.retryable = reason !== "SAFETY" && reason !== "PROHIBITED_CONTENT";
        const candidates = getResponseCandidates(result);
        console.warn(`Shot ${shotIndex + 1} image response had no decodable image payload`, {
          model: activeModelName,
          candidateCount: candidates.length,
          finishReasons: candidates.map(candidate => candidate?.finishReason || candidate?.finish_reason).filter(Boolean),
          promptFeedback: getPromptFeedback(result) || null,
        });
        throw err;
      }

      assertNativeWidescreenImage(
        Buffer.from(extractedImage.imageBase64, "base64"),
        `Shot ${shotIndex + 1} source frame`
      );

      return {
        imageBase64: extractedImage.imageBase64,
        mimeType: extractedImage.mimeType || "image/png",
      };
    }, {
      label: `Shot ${shotIndex + 1} image generation (${activeModelName})`,
      attempts: MAX_RETRIES,
      baseDelayMs: 1100,
    }),
  });
}

async function generateBestCandidate({ prompt, modelName, shotIndex, referenceImages = [] }) {
  const charWardrobeRefs = referenceImages.filter(r => r.kind === "character" || r.kind === "wardrobe");
  const enforceIdentityLock = STRICT_IDENTITY_LOCK && charWardrobeRefs.length > 0;

  if (!charWardrobeRefs.length || QUALITY_CANDIDATE_COUNT <= 1) {
    return generateGoogleImage({ prompt, modelName, shotIndex, referenceImages });
  }

  return new Promise((resolve, reject) => {
    let settled = 0;
    let bestGeneration = null;
    let bestQuality = null;
    let bestScore = -1;
    let resolved = false;
    const total = QUALITY_CANDIDATE_COUNT;

    const onFail = (candidateIndex, err) => {
      console.warn(`Shot ${shotIndex + 1} candidate ${candidateIndex + 1} failed:`, err?.message);
      settled++;
      if (settled === total && !resolved) {
        resolved = true;
        if (bestGeneration && !enforceIdentityLock) {
          resolve(bestGeneration);
        } else {
          const identityError = new Error(
            bestQuality
              ? `Strict identity lock failed (face=${bestQuality.faceScore}, outfit=${bestQuality.outfitScore})`
              : "Strict identity lock failed (no passing identity candidate)"
          );
          identityError.status = 422;
          identityError.retryable = false;
          reject(identityError);
        }
      }
    };

    for (let i = 0; i < total; i++) {
      const candidateIndex = i;
      generateGoogleImage({ prompt, modelName, shotIndex, referenceImages })
        .then(async (generation) => {
          if (resolved) return;
          const { imageBase64, mimeType } = generation.result;
          const qc = await qualityCheckImage(genAI, imageBase64, mimeType, charWardrobeRefs);
          const score = (qc.faceScore ?? 0) + (qc.outfitScore ?? 0);
          console.log(`Shot ${shotIndex + 1} candidate ${candidateIndex + 1}: face=${qc.faceScore} outfit=${qc.outfitScore} pass=${qc.pass}${qc.issues?.length ? ` issues=${qc.issues.join("; ")}` : ""}`);
          if (score > bestScore) {
            bestScore = score;
            bestGeneration = generation;
            bestQuality = qc;
          }
          settled++;
          if (!resolved && qc.pass) {
            resolved = true;
            resolve(generation);
            return;
          }
          if (settled === total && !resolved) {
            resolved = true;
            if (bestGeneration && !enforceIdentityLock) {
              resolve(bestGeneration);
            } else {
              const identityError = new Error(
                bestQuality
                  ? `Strict identity lock failed (face=${bestQuality.faceScore}, outfit=${bestQuality.outfitScore})`
                  : "Strict identity lock failed (no passing identity candidate)"
              );
              identityError.status = 422;
              identityError.retryable = false;
              reject(identityError);
            }
          }
        })
        .catch((err) => onFail(candidateIndex, err));
    }
  });
}

export async function POST(req) {
  try {
    const {
      projectId,
      shot,
      shotIndex = 0,
      projectState = {},
      promptOverride,
      model,
      previousShotImageUrl = null,
    } = await req.json();

    if (!projectId || !shot) {
      return NextResponse.json({ error: "Missing projectId or shot" }, { status: 400 });
    }

    const normalizedShot = normalizeShot(shot, shotIndex);
    const selectedImagePrompt = selectImagePrompt(normalizedShot, promptOverride);
    const selectedModel = resolveImageModelOption(model || process.env.GOOGLE_IMAGE_MODEL || DEFAULT_IMAGE_MODEL);
    const shotAssets = resolveShotAssets(normalizedShot, projectState);
    const safeMatchedCharacters = shotAssets.matchedCharacters.filter(character =>
      shotAssets.shotCharacters.some(
        shotName => normalizeLookupName(shotName) === normalizeLookupName(character.name)
      )
    );
    const safeShotAssets = {
      ...shotAssets,
      matchedCharacters: safeMatchedCharacters,
    };

    console.log("Shot character resolution", {
      shotIndex,
      shotTitle: normalizedShot?.n,
      explicitShotCharacters: normalizedShot?.characters || [],
      resolvedShotCharacters: shotAssets.shotCharacters,
      matchedCharacters: shotAssets.matchedCharacters.map(c => c.name),
      backgroundGroups: extractBackgroundGroups(normalizedShot),
    });

    const referenceCandidates = collectFocusedReferenceImages(
      safeMatchedCharacters,
      shotAssets.matchedLocations,
      projectState?.wardrobe,
      shotAssets.shotCharacters,
      shotAssets.shotLocations
    );
    let referenceImages = selectedModel.provider === IMAGE_MODEL_PROVIDER_BYTEDANCE
      ? []
      : await loadReferenceImages(referenceCandidates, shotIndex);

    if (selectedModel.provider !== IMAGE_MODEL_PROVIDER_BYTEDANCE && previousShotImageUrl && /^https?:\/\//i.test(previousShotImageUrl)) {
      const continuityReference = {
        kind: "continuity",
        name: "Previous shot",
        label: "Continuity reference — match colour grade and lighting to this frame",
        url: previousShotImageUrl,
      };
      const continuityImages = await loadReferenceImages([continuityReference], shotIndex);
      if (continuityImages.length) {
        referenceImages = [...referenceImages, ...continuityImages];
      }
    }
    const prompt = buildPrompt({
      shot: normalizedShot,
      projectState,
      promptOverride,
      shotAssets: safeShotAssets,
      referenceImages,
    });
    let imageGeneration = selectedModel.provider === IMAGE_MODEL_PROVIDER_BYTEDANCE
      ? await generateByteDanceImage({ prompt, modelName: selectedModel.value, shotIndex })
      : await generateBestCandidate({ prompt, modelName: selectedModel.value, shotIndex, referenceImages });
    let generatedImage = imageGeneration.result;

    if (selectedModel.provider !== IMAGE_MODEL_PROVIDER_BYTEDANCE) {
      const hasAnchor = safeMatchedCharacters.some((character) => (
        character?.anchor_image_url && /^https?:\/\//i.test(character.anchor_image_url)
      ));
      const charWardrobeRefs = referenceImages.filter((reference) => (
        reference.kind === "character" || reference.kind === "wardrobe"
      ));

      if (hasAnchor && charWardrobeRefs.length) {
        const qcResult = await qualityCheckImage(
          genAI,
          generatedImage.imageBase64,
          generatedImage.mimeType,
          charWardrobeRefs
        );

        if (!qcResult.pass) {
          const anchorRef = referenceImages.find((reference) => reference.kind === "character");
          if (anchorRef) {
            try {
              const repairPrompt = `You are correcting a generated image that failed character identity QC.

The FIRST attached image is the approved character anchor — the correct face, skin tone,
hair, and outfit for this character.
The SECOND attached image is the generated shot that needs correction.

FIX ONLY: face shape, skin tone, hair colour/style, eye colour, and outfit details
to exactly match Image 1 (the anchor).
PRESERVE: all framing, composition, background, environment, lighting, colour grade,
and camera angle from Image 2 (the generated shot).

Output the corrected frame as a native 16:9 photorealistic image.
Do not change anything except what is needed to fix character identity.`;

              const repairGeneration = await generateGoogleImage({
                prompt: repairPrompt,
                modelName: selectedModel.value,
                shotIndex,
                referenceImages: [
                  anchorRef,
                  {
                    kind: "generated",
                    name: "Failed shot",
                    label: "Generated shot to repair",
                    mimeType: generatedImage.mimeType || "image/png",
                    imageBase64: generatedImage.imageBase64,
                  },
                ],
              });

              const repairQcResult = await qualityCheckImage(
                genAI,
                repairGeneration.result.imageBase64,
                repairGeneration.result.mimeType,
                charWardrobeRefs
              );

              if (repairQcResult.pass) {
                imageGeneration = repairGeneration;
                generatedImage = repairGeneration.result;
              } else if (STRICT_IDENTITY_LOCK) {
                throw createProviderError(
                  `Strict identity lock failed after repair (face=${repairQcResult.faceScore}, outfit=${repairQcResult.outfitScore})`,
                  { status: 422, retryable: false }
                );
              }
            } catch (repairError) {
              if (STRICT_IDENTITY_LOCK) {
                throw repairError;
              }
              console.warn(`Shot ${shotIndex + 1} repair pass failed:`, serializeError(repairError));
            }
          } else if (STRICT_IDENTITY_LOCK) {
            throw createProviderError(
              `Strict identity lock failed (face=${qcResult.faceScore}, outfit=${qcResult.outfitScore})`,
              { status: 422, retryable: false }
            );
          }
        }
      }
    }

    const extension = generatedImage.mimeType.includes("jpeg") || generatedImage.mimeType.includes("jpg") ? "jpg" : "png";
    const storagePath = `${projectId}/images/shot-${String(shotIndex + 1).padStart(3, "0")}-${Date.now()}.${extension}`;
    const supabase = createAdminClient();
    const buffer = Buffer.from(generatedImage.imageBase64, "base64");
    generatedImage = null;

    await withRetry(async () => {
      const { error: uploadError } = await withTimeout(
        () => supabase.storage
          .from("assets")
          .upload(storagePath, buffer, {
            contentType: extension === "jpg" ? "image/jpeg" : "image/png",
            upsert: true,
          }),
        STORAGE_UPLOAD_TIMEOUT_MS,
        "Supabase image upload"
      );

      if (uploadError) throw uploadError;
    }, {
      label: `Shot ${shotIndex + 1} image upload`,
      attempts: 2,
      baseDelayMs: 700,
    });

    const { data: { publicUrl } } = supabase.storage.from("assets").getPublicUrl(storagePath);

    return NextResponse.json({
      success: true,
      image_url: publicUrl,
      image_path: storagePath,
      shot: {
        ...normalizedShot,
        p: normalizedShot.p,
        image_url: publicUrl,
        image_path: storagePath,
        image_prompt: compact(selectedImagePrompt, 5600),
        image_model: imageGeneration.model,
        resolved_characters: safeShotAssets.shotCharacters,
        resolved_locations: safeShotAssets.shotLocations,
        matched_character_names: safeMatchedCharacters.map((character) => character.name),
        background_groups: extractBackgroundGroups(normalizedShot),
        image_reference_count: referenceImages.length,
        image_reference_names: referenceImages.map(reference => `${reference.kind}:${reference.name}:${reference.label}`),
        image_generated_at: new Date().toISOString(),
        image_error: null,
      },
    });
  } catch (error) {
    const serialized = serializeError(error);
    console.error("Shot Image Generation API Error:", serialized);
    const responseStatus = Number(serialized.status) || (serialized.retryable ? 503 : 500);
    return NextResponse.json(
      {
        error: serialized.message,
        retryable: serialized.retryable,
        status: serialized.status,
      },
      { status: responseStatus }
    );
  }
}
