import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase-admin";
import { isKBUsable, getCharacterEntry, getStyleLock } from "@/utils/knowledgeBase";
import { extractScriptContext, buildCharacterIntelligenceBlock, buildOutfitIntelligenceBlock } from "@/utils/scriptContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const genAI = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
  : null;

const REFERENCE_IMAGE_TIMEOUT_MS = 25000;
const REFERENCE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const ANCHOR_MODEL_FALLBACK = "gemini-2.0-flash-preview-image-generation";
const TIER_1_TERMS = ["face close-up", "close-up", "portrait"];
const TIER_2_TERMS = ["full body front", "front"];
const TIER_3_TERMS = ["outfit", "wardrobe"];

const compact = (value, maxLength = 900) => {
  if (!value) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

function normalizeLookupName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

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

function scoreLabelByTerms(label, terms, fallbackBase = 1000) {
  const lowerLabel = String(label || "").toLowerCase();
  const index = terms.findIndex((term) => lowerLabel.includes(term));
  return index === -1 ? fallbackBase : index;
}

function pickOneByTier(candidates, usedUrls, terms) {
  const tierMatches = candidates
    .filter((candidate) => !usedUrls.has(candidate.url))
    .map((candidate) => ({
      ...candidate,
      score: scoreLabelByTerms(candidate.label, terms),
    }))
    .filter((candidate) => candidate.score < 1000)
    .sort((a, b) => a.score - b.score || a.index - b.index);

  const selected = tierMatches[0] || null;
  if (!selected) return null;
  usedUrls.add(selected.url);
  return selected;
}

function collectAnchorReferenceCandidates(character = {}) {
  const panelRefs = (Array.isArray(character?.images) ? character.images : [])
    .map((image, index) => {
      const normalized = normalizeReferenceImage(image, index);
      return normalized ? { ...normalized, index } : null;
    })
    .filter(Boolean);

  if (!panelRefs.length && character?.sheetUrl && /^https?:\/\//i.test(character.sheetUrl)) {
    return [
      {
        url: character.sheetUrl,
        label: "Full reference sheet",
        index: 0,
      },
    ];
  }

  const usedUrls = new Set();
  const selected = [
    pickOneByTier(panelRefs, usedUrls, TIER_1_TERMS),
    pickOneByTier(panelRefs, usedUrls, TIER_2_TERMS),
    pickOneByTier(panelRefs, usedUrls, TIER_3_TERMS),
  ].filter(Boolean);

  return selected.slice(0, 3);
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
    throw new Error("Reference image is too large for anchor generation");
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > REFERENCE_IMAGE_MAX_BYTES) {
    throw new Error("Reference image is too large for anchor generation");
  }

  return {
    mimeType: inferImageMimeType(reference.url, response.headers.get("content-type")),
    imageBase64: Buffer.from(arrayBuffer).toString("base64"),
  };
}

async function loadReferenceImages(references = []) {
  const loaded = await Promise.all(references.map(async (reference) => {
    try {
      const data = await fetchReferenceImage(reference);
      return {
        ...reference,
        ...data,
      };
    } catch (error) {
      console.warn(`Skipping anchor reference ${reference.label}:`, error?.message || error);
      return null;
    }
  }));

  return loaded.filter(Boolean);
}

function buildAnchorPrompt(character = {}, projectState = {}) {
  const triggerCharLabel = "CHAR_ANCHOR";

  const kb = projectState?.knowledge_base;
  const kbUsable = isKBUsable(kb);
  const charEntry = kbUsable ? getCharacterEntry(kb, character.name) : null;
  const styleLock = kbUsable ? getStyleLock(kb) : "";

  // KB prompt_lock gives richer, pre-distilled visual identity than raw fields
  const charIdentityLock = charEntry?.prompt_lock
    || compact(character.visual_prompt || character.description, 400);
  const charPhysique = charEntry?.physique || "";
  const charFace = charEntry?.face || "";

  // Script-derived character intelligence
  const ctx = extractScriptContext({ projectState, characterName: character.name });
  const charIntelligence  = buildCharacterIntelligenceBlock(ctx);
  const outfitIntelligence = buildOutfitIntelligenceBlock(ctx);

  return `Generate a single 21:9 ultra-wide CHARACTER REFERENCE SHEET for a music video production.
This is the definitive locked identity document for this character — it will be used to maintain perfect visual consistency across every shot, image, and video clip in the production.

Anonymous production label: ${triggerCharLabel}

CHARACTER IDENTITY — copy exactly from the attached reference images:
- Image 1 (primary face reference): copy exact face shape, skin tone, eye colour, nose, lips, hairline, hair colour and texture, age, and body proportions.
- Image 2 if present: copy exact outfit, clothing colour, fabric weave and texture, silhouette, accessories, and footwear precisely.
- Image 3 if present: use as secondary outfit and body proportion confirmation.

CHARACTER DESCRIPTION (use when reference images are insufficient or to confirm details):
${charIdentityLock}
${charPhysique ? `Physique: ${charPhysique}` : ""}
${charFace ? `Face: ${charFace}` : ""}
Costume: ${compact(charEntry?.default_outfit || character.costume, 300)}
${styleLock ? `\nProject visual style reference: ${compact(styleLock, 200)}` : ""}

SCRIPT & STORY INTELLIGENCE (how the character appears in the story — use to inform appearance):
${charIntelligence}

${outfitIntelligence}

CANVAS AND LAYOUT:
- Single 21:9 horizontal sheet — do NOT generate a 16:9 frame
- Plain warm beige or soft neutral studio backdrop throughout, clean and consistent
- 9 panels arranged as follows:
  PANEL 1 (large, far left, approximately 30% of canvas width): large mid portrait — waist to top of head, slight 3/4 angle, main identity panel
  PANEL 2: full-body front standing — head to toe, arms relaxed at sides, full costume visible
  PANEL 3: full-body left profile standing — complete silhouette visible
  PANEL 4: full-body right profile standing — complete silhouette visible
  PANEL 5: full-body back standing — rear view, hair and back of costume visible
  PANEL 6 (top-right area): close-up front portrait — head and upper chest, straight-on
  PANEL 7 (top-right area): close-up back head portrait — rear head and shoulders
  PANEL 8 (bottom-right area): close-up left three-quarter portrait — left side face and shoulder
  PANEL 9 (bottom-right area): close-up right three-quarter portrait — right side face and shoulder
- Clean white or beige visible dividers or spacing between all panels
- Character's face and full costume must be identical and consistent across all 9 panels

FRAMING AND QUALITY RULES:
1. Never crop face or costume details in any panel — show the full required area in each panel
2. Full-body panels must show the complete figure head-to-toe with no cropping
3. Close-up panels must include the full head and upper chest/shoulder area
4. Soft diffused frontal studio lighting — face fully lit, no harsh shadows anywhere
5. Neutral relaxed pose in all panels — no action, no dramatic expression
6. Photorealistic, sharp focus on face, outfit details, fabric texture, and accessories in every panel
7. No text, no labels, no borders, no watermarks — clean production-art presentation
8. This is a costume and identity reference document, not a movie scene

OUTPUT: One single 21:9 photorealistic character reference sheet ready for a professional film production costume and visual effects department.`;
}

function parseGeneratedImage(result) {
  const imagePart = result?.candidates?.[0]?.content?.parts?.find((part) => part.inlineData);
  const generatedBase64 = imagePart?.inlineData?.data;
  if (!generatedBase64) {
    const reason = result?.candidates?.[0]?.finishReason;
    throw new Error(reason ? `Anchor model returned no image data (${reason})` : "Anchor model returned no image data");
  }

  return {
    imageBase64: generatedBase64,
    mimeType: imagePart?.inlineData?.mimeType || "image/png",
  };
}

function toSafeSlug(value, fallback = "character") {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

async function persistAnchorToProject({ projectId, character, projectState, anchorImageUrl }) {
  if (!projectId) {
    const sourceCharacters = Array.isArray(projectState?.characters) ? projectState.characters : [];
    const normalizedTarget = normalizeLookupName(character?.name);
    const updatedCharacters = sourceCharacters.map((item) => {
      if (normalizeLookupName(item?.name) !== normalizedTarget) return item;
      return {
        ...item,
        anchor_image_url: anchorImageUrl,
        anchor_generated_at: new Date().toISOString(),
      };
    });

    return {
      ...(projectState || {}),
      characters: updatedCharacters,
    };
  }

  const supabase = createAdminClient();
  const { data: project, error: fetchError } = await supabase
    .from("projects")
    .select("project_state")
    .eq("id", projectId)
    .single();

  if (fetchError) throw fetchError;

  const normalizedTarget = normalizeLookupName(character?.name);
  const sourceState = project?.project_state || projectState || {};
  const sourceCharacters = Array.isArray(sourceState?.characters) ? sourceState.characters : [];
  let found = false;
  const updatedCharacters = sourceCharacters.map((item) => {
    if (normalizeLookupName(item?.name) !== normalizedTarget) return item;
    found = true;
    return {
      ...item,
      anchor_image_url: anchorImageUrl,
      anchor_generated_at: new Date().toISOString(),
    };
  });

  const mergedState = {
    ...sourceState,
    characters: found
      ? updatedCharacters
      : [
          ...updatedCharacters,
          {
            ...(character || {}),
            anchor_image_url: anchorImageUrl,
            anchor_generated_at: new Date().toISOString(),
          },
        ],
  };

  const { error: updateError } = await supabase
    .from("projects")
    .update({ project_state: mergedState })
    .eq("id", projectId);

  if (updateError) throw updateError;
  return mergedState;
}

export async function POST(req) {
  try {
    if (!genAI) {
      return NextResponse.json({ error: "Character anchor generation is temporarily unavailable." }, { status: 500 });
    }

    const { projectId, character = {}, projectState = {} } = await req.json();
    if (!projectId || !character?.name) {
      return NextResponse.json({ error: "Missing projectId or character.name" }, { status: 400 });
    }

    const referenceCandidates = collectAnchorReferenceCandidates(character);
    const hasTextFallback = Boolean(compact(character.visual_prompt || character.description, 40));
    if (!referenceCandidates.length && !hasTextFallback) {
      return NextResponse.json({ error: "Character needs reference images or a visual prompt for anchor generation." }, { status: 400 });
    }

    const loadedRefs = await loadReferenceImages(referenceCandidates);
    if (!loadedRefs.length && !hasTextFallback) {
      return NextResponse.json({ error: "Character references could not be loaded and no visual prompt was provided." }, { status: 400 });
    }

    try {
      const anchorPrompt = buildAnchorPrompt(character, projectState);
      const anchorModelName =
        process.env.GOOGLE_ANCHOR_MODEL ||
        process.env.GOOGLE_IMAGE_MODEL ||
        ANCHOR_MODEL_FALLBACK;
      const parts = [
        { text: anchorPrompt },
        ...loadedRefs.map((ref) => ({
          inlineData: { mimeType: ref.mimeType, data: ref.imageBase64 },
        })),
      ];

      const activeModel = genAI.getGenerativeModel({ model: anchorModelName });
      const result = await activeModel.generateContent({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["IMAGE"] },
      });
      const response = await result.response;

      const generated = parseGeneratedImage(response);
      const extension = generated.mimeType.includes("jpeg") || generated.mimeType.includes("jpg") ? "jpg" : "png";
      const storagePath = `${projectId}/anchors/${toSafeSlug(character.name)}-anchor-${Date.now()}.${extension}`;
      const buffer = Buffer.from(generated.imageBase64, "base64");
      const supabase = createAdminClient();

      const { error: uploadError } = await supabase.storage
        .from("assets")
        .upload(storagePath, buffer, {
          contentType: extension === "jpg" ? "image/jpeg" : "image/png",
          upsert: true,
        });

      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("assets").getPublicUrl(storagePath);

      await persistAnchorToProject({
        projectId,
        character,
        projectState,
        anchorImageUrl: publicUrl,
      });

      return NextResponse.json({
        success: true,
        character_name: character.name,
        anchor_image_url: publicUrl,
      });
    } catch (error) {
      console.error("Character anchor generation failed:", error);
      return NextResponse.json({
        success: false,
        reason: error?.message || "Anchor generation failed.",
      });
    }
  } catch (error) {
    console.error("Character Anchor API Error:", error);
    return NextResponse.json({ error: error?.message || "Character anchor route failed." }, { status: 500 });
  }
}
