import { getShotBrainContext } from "@/utils/knowledgeBase";
import { compact, rawShotText } from "./shotImageConstants.js";
import { buildStyleBibleContext } from "./styleBiblePrompt.js";
import {
  normalizeLookupName,
  collectWardrobeItems,
} from "./referenceImages.js";

function buildCharacterLabelMap(shotCharacters) {
  const map = new Map();
  (Array.isArray(shotCharacters) ? shotCharacters : []).forEach((name, index) => {
    const normalized = normalizeLookupName(name);
    if (normalized) map.set(normalized, `CHAR_${String.fromCharCode(65 + index)}`);
  });
  return map;
}

function applyCharLabel(name, charLabelMap) {
  return charLabelMap.get(normalizeLookupName(name)) || name;
}

function buildReferenceContext(referenceImages, charLabelMap = new Map()) {
  if (!referenceImages.length) return "No visual reference images attached.";

  const characterAndWardrobeRefs = referenceImages
    .map((ref, i) => ({ ref, number: i + 1 }))
    .filter(({ ref }) => ref.kind === "character" || ref.kind === "wardrobe");
  const locationRefs = referenceImages
    .map((ref, i) => ({ ref, number: i + 1 }))
    .filter(({ ref }) => ref.kind === "location");
  const continuityRefs = referenceImages
    .map((ref, i) => ({ ref, number: i + 1 }))
    .filter(({ ref }) => ref.kind === "continuity");

  const charImageNumbers = characterAndWardrobeRefs.map(r => r.number);
  const locImageNumbers = locationRefs.map(r => r.number);
  const continuityImageNumbers = continuityRefs.map(r => r.number);

  const manifestLines = [];
  if (charImageNumbers.length) {
    manifestLines.push(`CHARACTER + OUTFIT IDENTITY — Image${charImageNumbers.length > 1 ? "s" : ""} ${charImageNumbers.join(", ")}: use ONLY these for main character faces, bodies, clothing, and accessories.`);
  }
  if (locImageNumbers.length) {
    manifestLines.push(`LOCATION ENVIRONMENT — Image${locImageNumbers.length > 1 ? "s" : ""} ${locImageNumbers.join(", ")}: use ONLY these for architecture, set, materials, lighting, and atmosphere. ANY people visible inside these images are irrelevant production extras — NEVER copy their faces, hair, skin tone, or clothing to the main characters.`);
  }
  if (continuityImageNumbers.length) {
    manifestLines.push(`CONTINUITY — Image ${continuityImageNumbers.join(", ")}: match colour grade and lighting ONLY. Do not copy characters or composition.`);
  }

  const imageLines = referenceImages.map((reference, index) => {
    const number = index + 1;
    let displayName = reference.name;
    if (reference.kind === "character") {
      displayName = applyCharLabel(reference.name, charLabelMap);
    } else if (reference.kind === "wardrobe") {
      const parts = reference.name.split(" @ ");
      displayName = `${applyCharLabel(parts[0], charLabelMap)}${parts[1] ? ` @ ${parts[1]}` : ""}`;
    }

    const base = `  Image ${number} [${reference.kind.toUpperCase()}] "${displayName}"${reference.label ? ` — ${reference.label}` : ""}`;
    if (reference.kind === "character") {
      return `${base}\n    → COPY from this image: exact face shape, skin tone, eye color, nose, lips, hairline, hair color/style, body proportions, age. This is the authoritative face reference.`;
    }
    if (reference.kind === "wardrobe") {
      return `${base}\n    → COPY from this image: exact outfit color, cut, fabric texture, silhouette, accessories, footwear, and styling. Apply this clothing to ${displayName.split(" @ ")[0]}. Do not invent or substitute clothing.`;
    }
    if (reference.kind === "location") {
      return `${base}\n    → COPY from this image: architecture, materials, color palette, spatial layout, set dressing, signage, era markers, atmosphere.\n    → IGNORE: any people or faces inside this image — they are background extras with zero identity relevance.`;
    }
    if (reference.kind === "continuity") {
      return `  Image ${number} [CONTINUITY] — Previous shot reference\n    → MATCH from this image: overall colour grade, lighting direction, ambient light colour, shadow depth, and atmosphere.\n    → DO NOT copy: characters, character faces, outfits, or scene composition from this image.\n    → USE ONLY FOR: ensuring this shot feels like it belongs to the same film as the previous shot.`;
    }
    return base;
  });

  return [
    "━━━ ATTACHED REFERENCE IMAGES — MANIFEST ━━━",
    ...manifestLines,
    "",
    "━━━ PER-IMAGE INSTRUCTIONS (images attached in this exact order) ━━━",
    ...imageLines,
    "",
    "━━━ EXTRACTION RULES — NON-NEGOTIABLE ━━━",
    "1. Main character identity (face, hair, skin tone, age, body) comes ONLY from CHARACTER images. Never from LOCATION images.",
    "2. Outfit details come ONLY from WARDROBE images (if present) or CHARACTER images. Never from LOCATION images.",
    "3. Background people visible in any LOCATION image are irrelevant production extras. Do not use them as character identity.",
    "4. CHARACTER images override any text character description when they conflict. Copy the face, not words about a face.",
    "5. WARDROBE images override any text costume description. Copy the outfit, not a summary of it.",
    "6. LOCATION images override any text location description for environment/atmosphere only — not for character identity.",
    "7. Do not copy reference-sheet backdrops, studio white fills, grid lines, borders, crop boxes, labels, or watermarks.",
    "8. When multiple CHARACTER images show the same person, the face close-up or portrait is the primary identity anchor.",
  ].join("\n");
}

function buildScriptSceneContext(scenes = []) {
  if (!Array.isArray(scenes) || !scenes.length) return "No script scenes provided.";
  return scenes
    .slice(0, 24)
    .map(scene => {
      const timing = scene?.start !== undefined || scene?.end !== undefined
        ? `${scene.start ?? "?"}-${scene.end ?? "?"}s`
        : "untimed";
      return `- ${timing}: ${compact(scene?.visual || scene?.description, 260)}${scene?.lyrics ? ` | lyrics: ${compact(scene.lyrics, 140)}` : ""}`;
    })
    .join("\n");
}

function buildWardrobeLockContext(wardrobe, shotCharacters, shotLocations, charLabelMap = new Map()) {
  const items = collectWardrobeItems(wardrobe, shotCharacters, shotLocations);
  if (!items.length) return "";
  return items
    .map(item => {
      const label = applyCharLabel(item.character_name, charLabelMap);
      const description = item.description ? ` — exact outfit description: ${compact(item.description, 420)}` : "";
      const imageNote = item.image_url ? " [WARDROBE REFERENCE IMAGE ATTACHED — use it as the visual authority for this outfit]" : " [no image: use this text description as the outfit lock]";
      const outfitName = compact(item.outfit_name, 140) || "base character wardrobe";
      return item.location_name
        ? `${item.location_name}: ${label} wears "${outfitName}"${description}${imageNote}`
        : `${label} outfit option "${outfitName}"${description}${imageNote}`;
    })
    .join("\n");
}

function buildLockedShotFacts(shot, projectState, shotCharacters, shotLocations, charLabelMap = new Map()) {
  const wardrobeLock = buildWardrobeLockContext(projectState?.wardrobe, shotCharacters, shotLocations, charLabelMap);
  const timeOfDay = (() => {
    const text = `${shot.beat || ''} ${shot.visual_style || ''} ${shot.source_scene || ''} ${shot.p || ''}`.toLowerCase();
    if (text.includes('night')) return 'night';
    if (text.includes('dusk') || text.includes('sunset')) return 'dusk/sunset';
    if (text.includes('golden hour')) return 'golden hour';
    if (text.includes('dawn') || text.includes('morning')) return 'dawn/morning';
    return null;
  })();
  const facts = [
    shot.source_scene ? `Source script scene: ${compact(shot.source_scene, 360)}` : "",
    shot.concept ? `Shot concept: ${compact(shot.concept, 520)}` : "",
    shot.costumes || shot.costume || shot.wardrobe ? `Costume/wardrobe lock: ${compact(shot.costumes || shot.costume || shot.wardrobe, 520)}` : "",
    wardrobeLock ? `Wardrobe lock: ${wardrobeLock}` : "",
    shot.continuity || shot.required_continuity || shot.continuity_notes ? `Continuity lock: ${compact(shot.continuity || shot.required_continuity || shot.continuity_notes, 700)}` : "",
    timeOfDay ? `Time of day: ${timeOfDay} — use location references that match this lighting condition` : "",
  ].filter(Boolean);
  const fallback = "- Use the shot prompt, approved script, named characters, base character reference outfits, and locations as locked facts. Blank wardrobe rows are not absence notes.";
  return facts.length ? facts.map(fact => `- ${fact}`).join("\n") : fallback;
}

function buildShotDetailContext(shot) {
  const videoPrompt = shot.video_prompt || shot.motion_prompt || shot.clip_prompt;
  const details = [
    videoPrompt ? `VIDEO CLIP THIS IMAGE ANCHORS:\n${compact(videoPrompt, 2400)}\nThis still frame is the first frame (t=0.00) of the above clip. The video model will use it as the source anchor and begin motion from this exact position. Camera setup, environment layers, character poses, and lighting must match the [00:00.00-...] beat of the video prompt exactly. Do not choose a different moment.` : "",
    shot.visual_style || shot.style || shot.look ? `Visual style: ${compact(shot.visual_style || shot.style || shot.look, 900)}` : "",
    shot.negative_constraints || shot.constraints || shot.avoid ? `Avoid/constraints: ${compact(shot.negative_constraints || shot.constraints || shot.avoid, 1000)}` : "",
    !videoPrompt && (shot.action_timing || shot.timing || shot.actionTiming) ? "Motion timing exists for the later video clip; freeze the opening position from the first beat and do not render timing text, motion trails, or sequential action." : "",
  ].filter(Boolean);

  if (!details.length) {
    return "No separate still-frame detail fields provided; infer a rich still composition from the image prompt, master shot brief, and locked context. The image will be used as the first frame of a video clip.";
  }

  return details.map(detail => `- ${detail}`).join("\n");
}

export function selectImagePrompt(shot, promptOverride) {
  return (
    promptOverride ||
    shot.image_prompt ||
    shot.still_prompt ||
    shot.frame_prompt ||
    shot.keyframe_prompt ||
    shot.p ||
    shot.prompt
  );
}

function buildCharacterImageCrossRef(referenceImages, shotCharacters, charLabelMap = new Map()) {
  const lines = [];
  shotCharacters.forEach(characterName => {
    const normalizedName = normalizeLookupName(characterName);
    const label = applyCharLabel(characterName, charLabelMap);
    const charRefs = referenceImages
      .map((ref, index) => ({ ref, number: index + 1 }))
      .filter(({ ref }) => ref.kind === "character" && normalizeLookupName(ref.name) === normalizedName);
    const wardrobeRefs = referenceImages
      .map((ref, index) => ({ ref, number: index + 1 }))
      .filter(({ ref }) => ref.kind === "wardrobe" && normalizeLookupName(ref.name.split(" @ ")[0]) === normalizedName);
    if (charRefs.length)
      lines.push(`IDENTITY LOCK for ${label}: copy face from Image${charRefs.length > 1 ? "s" : ""} ${charRefs.map(r => r.number).join(", ")}`);
    if (wardrobeRefs.length)
      lines.push(`OUTFIT LOCK for ${label}: copy clothing from Image${wardrobeRefs.length > 1 ? "s" : ""} ${wardrobeRefs.map(r => r.number).join(", ")}`);
  });
  return lines.join("\n");
}

function buildLocationImageCrossRef(referenceImages, shotLocations) {
  const lines = [];
  shotLocations.forEach(locationName => {
    const normalizedName = normalizeLookupName(locationName);
    const locRefs = referenceImages
      .map((ref, index) => ({ ref, number: index + 1 }))
      .filter(({ ref }) => ref.kind === "location" && normalizeLookupName(ref.name) === normalizedName);
    if (locRefs.length)
      lines.push(`ENVIRONMENT LOCK for ${locationName}: copy architecture and atmosphere from Image${locRefs.length > 1 ? "s" : ""} ${locRefs.map(r => r.number).join(", ")}`);
  });
  return lines.join("\n");
}

function buildBackgroundGroupContext(shot, projectState) {
  const activeGroups = extractBackgroundGroups(shot);
  if (!activeGroups.length) return "No recurring background group required.";

  const memory = projectState?.background_groups || {};
  const memoryEntries = Object.entries(memory).map(([key, value]) => ({
    key,
    normalized: normalizeLookupName(key),
    profile: value,
  }));

  const lines = activeGroups.map(group => {
    const key = String(group).trim();
    const normalized = normalizeLookupName(key);
    const directProfile = memory[key] || memory[key.toLowerCase()];
    const entryMatch = memoryEntries.find(entry => entry.normalized === normalized)?.profile;
    const profile = directProfile || entryMatch || null;

    if (!profile || typeof profile !== "object") {
      return `- ${key}: recurring social group, keep casting and styling broadly consistent across scenes, but visually secondary to the leads.`;
    }

    return `- ${key}: ${profile.count_range || "small group"}, ${profile.gender_mix || "mixed gender"}, ${profile.age_range || "young adults"}, ${profile.style_summary || "cohesive everyday styling"}, ${profile.ethnicity_note || "consistent social-group appearance"}, ${profile.continuity_note || "recurs across scenes as the same social circle"}`;
  });

  return [
    "Use background extras only if the shot naturally requires them.",
    "",
    "Active recurring background groups in this shot:",
    ...lines,
    "",
    "Rules for background groups:",
    "1. Background groups are NOT the main subject unless explicitly stated.",
    "2. Keep them visually subordinate to named main characters.",
    "3. Maintain approximate count, age vibe, styling, and social identity across shots.",
    "4. Do NOT make background extras look like the named lead characters.",
    "5. Do NOT copy faces from location references.",
    "6. If a recurring group appears again, they should feel like the same social circle, but not require exact face-perfect identity lock.",
    "7. Use natural variation within the same group identity, not random unrelated people.",
    "8. If no active background group is specified, keep extras minimal or omit them.",
  ].join("\n");
}

function extractBackgroundGroups(shot) {
  const explicit = []
    .concat(shot?.background_group ?? [])
    .concat(shot?.background_groups ?? [])
    .concat(shot?.extras ?? [])
    .concat(shot?.supporting_cast ?? [])
    .flatMap(value => Array.isArray(value) ? value : [value])
    .filter(Boolean)
    .map(value => String(value).trim());

  const text = [
    shot?.p,
    shot?.image_prompt,
    shot?.prompt,
    shot?.source_scene,
    shot?.concept,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const inferred = [];
  const knownGroups = [
    "friends",
    "gang",
    "crew",
    "classmates",
    "party crowd",
    "dancers",
    "villagers",
    "bar patrons",
    "club crowd",
    "wedding guests",
    "students",
    "office staff",
  ];

  for (const group of knownGroups) {
    if (text.includes(group)) inferred.push(group);
  }

  const seen = new Set();
  return [...explicit, ...inferred].filter(group => {
    const normalized = normalizeLookupName(group);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export { extractBackgroundGroups };

const namesFrom = (items = []) => {
  if (!Array.isArray(items)) return [];
  return items
    .map(item => compact(item?.name, 120))
    .filter(Boolean);
};

function normalizeProvidedNames(values = []) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => {
      if (typeof value === "string") return compact(value, 120);
      if (value && typeof value === "object") {
        return compact(value.name || value.character_name || value.location_name, 120);
      }
      return "";
    })
    .filter(Boolean);
}

const selectedByName = (items = [], names = []) => {
  if (!Array.isArray(items) || !Array.isArray(names)) return [];
  const wanted = new Set(names.map(normalizeLookupName).filter(Boolean));
  return items.filter(item => wanted.has(normalizeLookupName(item?.name)));
};

function inferShotCharactersFromText(shot, characters = []) {
  const text = [
    shot?.image_prompt,
    shot?.prompt,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (Array.isArray(characters) ? characters : [])
    .filter(character => {
      const name = normalizeLookupName(character?.name);
      return name && text.includes(name);
    })
    .map(character => character.name);
}

function isExplicitEnsembleShot(shot) {
  const text = [
    shot?.p,
    shot?.image_prompt,
    shot?.prompt,
    shot?.source_scene,
    shot?.concept,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (shot?.ensemble === true || shot?.group_shot === true) return true;

  return [
    "all characters",
    "entire group",
    "full ensemble",
    "everyone together",
    "the whole group",
    "all of them together",
  ].some(phrase => text.includes(phrase));
}

function isLikelyEnvironmentOnlyShot(shot, inferredCharacters = []) {
  if (Array.isArray(inferredCharacters) && inferredCharacters.length > 0) return false;

  const text = [
    shot?.n,
    shot?.p,
    shot?.image_prompt,
    shot?.prompt,
    shot?.source_scene,
    shot?.concept,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const explicitNoLeadCues = [
    "no character",
    "no characters",
    "without character",
    "without characters",
    "without main character",
    "no lead character",
    "empty frame",
    "location only",
    "set only",
    "b-roll",
  ];
  if (explicitNoLeadCues.some(phrase => text.includes(phrase))) return true;

  const environmentCues = [
    "establishing shot",
    "establishing",
    "atmosphere shot",
    "environment shot",
    "wide environment",
    "street atmosphere",
    "location atmosphere",
    "set atmosphere",
  ];

  return environmentCues.some(phrase => text.includes(phrase));
}

export function resolveShotAssets(shot, projectState) {
  const characters = projectState?.characters || [];
  const locations = projectState?.locations || [];
  const explicitShotCharacters = normalizeProvidedNames(shot?.characters);
  const inferredCharacters = inferShotCharactersFromText(shot, characters);
  let shotCharacters = [];

  if (explicitShotCharacters.length > 0) {
    shotCharacters = (!isExplicitEnsembleShot(shot) && isLikelyEnvironmentOnlyShot(shot, inferredCharacters))
      ? inferredCharacters
      : explicitShotCharacters;
  } else if (isExplicitEnsembleShot(shot)) {
    shotCharacters = namesFrom(characters);
  } else {
    shotCharacters = inferredCharacters;
  }

  const explicitShotLocations = normalizeProvidedNames(shot?.locations);
  const shotLocations = explicitShotLocations.length ? explicitShotLocations : namesFrom(locations);
  const matchedCharacters = selectedByName(characters, shotCharacters);
  const matchedLocations = selectedByName(locations, shotLocations);

  return {
    characters,
    locations,
    shotCharacters,
    shotLocations,
    matchedCharacters,
    matchedLocations,
  };
}

export function buildPrompt({ shot, projectState, promptOverride, shotAssets = null, referenceImages = [] }) {
  const {
    shotCharacters,
    shotLocations,
    matchedCharacters,
    matchedLocations,
  } = shotAssets || resolveShotAssets(shot, projectState);

  const kbContext = getShotBrainContext(projectState?.knowledge_base, shot);

  const charLabelMap = buildCharacterLabelMap(shotCharacters);

  const anonymousCharacterList = shotCharacters.map(n => applyCharLabel(n, charLabelMap)).join(', ') || 'No visible character required';

  const characterContext = matchedCharacters.map(character => {
    const label = applyCharLabel(character.name, charLabelMap);
    const costumeText = character.costume ? ` Costume/wardrobe: ${compact(character.costume, 260)}` : '';
    return `- ${label}: ${compact(character.visual_prompt || character.description || character.role, 450)}${costumeText}`;
  }).join('\n');

  const locationContext = matchedLocations.map(location => (
    `- ${location.name}: ${compact(location.visual_prompt || location.description, 450)}`
  )).join('\n');

  const shotPrompt = rawShotText(
    selectImagePrompt(shot, promptOverride),
    5600,
    'Photorealistic still frame matching the shot title and project context.'
  );
  const hasAnchor = matchedCharacters.some((character) => (
    character?.anchor_image_url && /^https?:\/\//i.test(character.anchor_image_url)
  ));
  const openingInstruction = hasAnchor
    ? `You are editing and adapting a character anchor frame for a specific music video shot.
You have 3-4 reference images attached (in order):
- Image 1 is the CHARACTER ANCHOR: the definitive identity lock for this character.
  PRESERVE EXACTLY: face shape, skin tone, eye colour, hair colour/style, nose, lips,
  body proportions, and outfit details. These must be IDENTICAL to Image 1 in the output.
- Image 2 (if present) is the WARDROBE reference: copy exact clothing details.
- Image 3 (if present) is the LOCATION reference: use for environment, architecture,
  atmosphere, and background only. NEVER copy faces from this image.
- Image 4 (if present) is the PREVIOUS SHOT continuity reference: match colour grade
  and lighting ONLY.

You are NOT generating from scratch. You are placing this specific character (from
Image 1) into the shot described below, while preserving their identity completely.`
    : `Generate one raw 16:9 source frame for a later music video edit.
This is not a poster, title card, collage, transition frame, or finished music-video effect.
The image must be native widescreen 16:9 with no vertical, square, letterboxed, pillarboxed, split-screen, collage, or bordered framing.`;
  const safeCamera = rawShotText(shot.camera, 300, 'plain 16:9 source-footage framing');
  const safeMovement = rawShotText(shot.movement, 300, 'clear simple motion direction');

  return `
${openingInstruction}

SHOT TITLE:
${shot.n}

STILL FRAME PROMPT:
${shotPrompt}

SHOT DETAIL FIELDS:
${buildShotDetailContext(shot)}

NONVISUAL TIMING AND VOCAL CONTEXT:
${shot.start ?? 'unknown'}s to ${shot.end ?? 'unknown'}s, duration ${shot.duration || 5}s
Lyrics: ${compact(shot.lyrics || '', 500)}
Timed words: ${Array.isArray(shot.words) ? shot.words.map(word => `${word.word}(${word.start ?? '?'}-${word.end ?? '?'})`).join(', ') : 'none'}
Use this only for mood and story placement. Do not render lyrics, subtitles, speech, sound, time markers, or sequential timing in the image.

PROJECT STORY AND SCRIPT LOCKS:
Title: ${projectState?.script?.title || 'Untitled music video'}
Mood: ${compact(projectState?.script?.mood || projectState?.analysis?.mood, 500)}
Storyline/concept: ${compact(projectState?.script?.storyline || projectState?.analysis?.summary || projectState?.analysis?.theme, 900)}
Genre/theme: ${compact(projectState?.analysis?.genre || projectState?.analysis?.theme, 360)}
Script scenes:
${buildScriptSceneContext(projectState?.script?.scenes)}

SHOT NON-NEGOTIABLES:
${buildLockedShotFacts(shot, projectState, shotCharacters, shotLocations, charLabelMap)}
${kbContext ? `\nSHOT BRAIN CONTEXT (pre-distilled master context - highest priority for identity, wardrobe, location, style, and story):\n${kbContext}` : ""}

CHARACTER CONTINUITY:
Characters in this shot are referred to by anonymous production labels below. These labels carry no real-world name association. Do NOT look up any label or associate it with any celebrity, athlete, politician, actor, musician, or public figure. Appearance comes ONLY from the CHARACTER reference images and description text.
Use only these characters when characters are visible:
${anonymousCharacterList}
${characterContext || 'No character visual reference text provided.'}
${referenceImages.length ? buildCharacterImageCrossRef(referenceImages, shotCharacters, charLabelMap) : ''}
Only the named shot characters listed in this shot may be rendered as identifiable foreground or midground characters.
Characters not listed for this shot must NOT appear as recognisable people.
If the scene includes extras, they must be generic or belong only to the active background groups for this shot.
Never import characters from other scenes just because reference images exist elsewhere in the project.
If zero named characters are assigned to this shot, do not invent a lead character.

BACKGROUND GROUP CONTINUITY:
${buildBackgroundGroupContext(shot, projectState)}

LOCATION CONTINUITY:
Use only these named locations/sets:
${shotLocations.join(', ') || 'No specific location required'}
${locationContext || 'No location visual reference text provided.'}
${referenceImages.length ? buildLocationImageCrossRef(referenceImages, shotLocations) : ''}

ATTACHED VISUAL REFERENCES:
${buildReferenceContext(referenceImages, charLabelMap)}

CAMERA AND STYLE:
- Shot size: ${shot.shot_size || 'plain source-footage framing'}
- Camera: ${safeCamera}
- Movement implied by still: ${safeMovement}
- Story beat: ${shot.beat || 'match the shot prompt'}
- Overall project mood: ${compact(projectState?.script?.mood || projectState?.analysis?.mood, 500)}
- Genre/theme: ${compact(projectState?.analysis?.genre || projectState?.analysis?.theme, 300)}

${buildStyleBibleContext(projectState?.style_bible)}

Still-frame rules:
1. Output exactly one photorealistic raw source frame. No text, captions, labels, watermarks, borders, UI, split panels, title cards, black bars, wipes, or transition devices.
2. Treat the approved script, shot concept, named characters, explicit wardrobe overrides, costume/outfit images, base character reference outfits, and named locations as non-negotiable production locks. Do not rename, redesign, replace, merge, or contradict them.
2a. Do NOT invent new named characters, new named locations, new relationships, or alternate outfits. Use only the characters, locations, style rules, and wardrobe overrides listed above.
3. Preserve character and location continuity from the provided context and attached reference images. When text and reference images disagree, follow the attached reference images.
4. CHARACTER IDENTITY — CRITICAL: Main characters' faces, skin tone, hair, and body must come ONLY from CHARACTER and WARDROBE reference images. Any people visible inside LOCATION reference images are irrelevant background extras — do NOT use them as the basis for any main character's appearance. This is the single most common generation error and must be treated as a hard, inviolable constraint.
5. Make the frame visually rich and specific: foreground, midground, background, props, texture, clothing fabric, facial expression, body posture, environment geography, and practical lighting must all feel intentionally designed.
6. This frame is the first frame (t=0.00) of the video clip described in SHOT DETAIL FIELDS. The video model receives this image as its source anchor and generates motion starting from it. If a video prompt is provided, derive this frame from the [00:00.00-...] beat only — same camera setup, same character position, same lighting. A frame that contradicts the video prompt's opening beat will cause the video model to deviate immediately.
7. If the still-frame prompt is short, expand internally using the locked context instead of generating a generic image.
8. Do not invent extra main characters unless the shot clearly needs background extras.
9. Keep the main subject inside a 16:9 center-safe composition so the follow-up video generation and final render do not crop faces or bodies awkwardly.
10. Do not frame a close-up mouth singing a lyric; use performance posture, gesture, profile, silhouette, dance, reaction, or atmosphere instead.
11. Keep the tone grounded, natural, and serious unless the user explicitly requested a different tone.
12. Ignore video-only instructions such as clip duration, dialogue, sound design, bracketed action timing, camera motion over time, or "the video should last". Freeze the single most cinematic moment.
13. Only render named main characters that are explicitly assigned to this shot. Do not include any other project characters unless this is an explicit ensemble shot.
14. If background extras are needed, use only the declared recurring background groups for this shot or generic non-hero extras.
15. Never turn background extras into lookalikes of the lead characters.
`;
}
