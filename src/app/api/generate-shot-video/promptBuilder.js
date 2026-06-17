import { getShotBrainContext } from "@/utils/knowledgeBase";
import { compact, rawClipText } from "./shotVideoConstants.js";

function normalizeLookupName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

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

function wantedSet(names = []) {
  return new Set((Array.isArray(names) ? names : []).map(normalizeLookupName).filter(Boolean));
}

function matchesWanted(value, wanted) {
  if (!wanted.size) return true;
  return wanted.has(normalizeLookupName(value));
}

function isLegacyOutfitFallback(outfitName, characterName, locationName) {
  const normalizedName = normalizeLookupName(outfitName);
  if (!normalizedName) return false;
  return normalizedName === `${normalizeLookupName(characterName)} outfit for ${normalizeLookupName(locationName)}`;
}

function hasWardrobeOverride(outfit, characterName, locationName) {
  const outfitName = compact(outfit?.outfit_name || outfit?.name, 160);
  const description = compact(outfit?.description || outfit?.outfit_description || outfit?.prompt, 360);
  const hasImage = Boolean(outfit?.image_url || outfit?.imageUrl || outfit?.url);
  const onlyLegacyName = outfitName && !description && !hasImage && isLegacyOutfitFallback(outfitName, characterName, locationName);
  return Boolean(
    !onlyLegacyName && (
      outfitName ||
      description ||
      hasImage
    )
  );
}

function collectWardrobeItems(wardrobe = [], shotCharacters = [], shotLocations = []) {
  if (!Array.isArray(wardrobe)) return [];
  const wantedCharacters = wantedSet(shotCharacters);
  const wantedLocations = wantedSet(shotLocations);

  return wardrobe.flatMap((entry, entryIndex) => {
    const characterScoped = entry?.scope === "character" || entry?.character_name || entry?.character_id;
    const locationName = characterScoped ? "" : (entry?.location_name || entry?.name || `Location ${entryIndex + 1}`);
    const locationId = characterScoped ? "" : (entry?.location_id || entry?.id || "");
    const locationMatches = characterScoped || matchesWanted(locationName, wantedLocations) || matchesWanted(locationId, wantedLocations);
    if (!locationMatches) return [];

    return (Array.isArray(entry?.outfits) ? entry.outfits : [])
      .filter(outfit => {
        const characterName = outfit?.character_name || entry?.character_name || outfit?.name;
        const characterId = outfit?.character_id || entry?.character_id || outfit?.id;
        if (!hasWardrobeOverride(outfit, characterName, locationName || "wardrobe")) return false;
        return matchesWanted(characterName, wantedCharacters) || matchesWanted(characterId, wantedCharacters);
      })
      .map(outfit => ({
        location_name: locationName,
        character_name: outfit?.character_name || entry?.character_name || outfit?.name || "Character",
        outfit_name: isLegacyOutfitFallback(outfit?.outfit_name || outfit?.name, outfit?.character_name || entry?.character_name || outfit?.name, locationName) ? "" : (outfit?.outfit_name || outfit?.name || ""),
        description: outfit?.description || outfit?.outfit_description || outfit?.prompt || "",
        image_url: outfit?.image_url || outfit?.imageUrl || outfit?.url || "",
      }));
  });
}

function describeReferenceSet(items = [], fallbackLabel, charLabelMap = new Map()) {
  if (!Array.isArray(items) || !items.length) return "";
  const isCharacter = String(fallbackLabel || "").toLowerCase().includes("character");
  const extractionHint = isCharacter
    ? "COPY the face, hair, skin tone, body proportions, age, and any visible clothing exactly from these reference views. These are the ONLY valid sources for character identity."
    : "COPY the architecture, materials, color palette, spatial layout, set dressing, and environmental atmosphere from these views. IGNORE any people visible inside these location images — they are irrelevant background extras with zero identity relevance to the main characters.";
  return items
    .map(item => {
      const refs = Array.isArray(item?.images)
        ? item.images
            .map((image, index) => {
              const label = typeof image === "object" && image
                ? image.label || image.name || `Reference ${index + 1}`
                : `Reference ${index + 1}`;
              return compact(label, 70);
            })
            .filter(Boolean)
            .slice(0, 5)
        : [];
      if (!refs.length) return "";
      const displayName = isCharacter
        ? applyCharLabel(item?.name || fallbackLabel, charLabelMap)
        : (item?.name || fallbackLabel);
      return `- ${displayName} [${isCharacter ? "CHARACTER IDENTITY" : "LOCATION ENVIRONMENT"}]: approved reference views include ${refs.join(", ")}. ${extractionHint}`;
    })
    .filter(Boolean)
    .join("\n");
}

function buildWardrobeLockContext(wardrobe, shotCharacters, shotLocations, charLabelMap = new Map()) {
  const items = collectWardrobeItems(wardrobe, shotCharacters, shotLocations);
  if (!items.length) return "";
  return items
    .map(item => {
      const label = applyCharLabel(item.character_name, charLabelMap);
      const description = item.description ? ` — exact outfit description: ${compact(item.description, 420)}` : "";
      const imageNote = item.image_url ? " [WARDROBE REFERENCE IMAGE EXISTS — preserve it exactly in this clip]" : " [no image: use this text description as the outfit lock]";
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
    timeOfDay ? `Time of day: ${timeOfDay} — maintain this lighting condition throughout the full clip` : "",
  ].filter(Boolean);
  const fallback = "- Use the shot prompt, approved script, named characters, base character reference outfits, and locations as locked facts. Blank wardrobe rows are not absence notes.";
  return facts.length ? facts.map(fact => `- ${fact}`).join("\n") : fallback;
}

function parseTimestampBlocks(text) {
  const blocks = [];
  const re = /\[(\d+):(\d+(?:\.\d+)?)-(\d+):(\d+(?:\.\d+)?)\]/g;
  let match;
  let lastIndex = 0;
  const parts = [];
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    const start = parseInt(match[1], 10) * 60 + parseFloat(match[2]);
    const end = parseInt(match[3], 10) * 60 + parseFloat(match[4]);
    parts.push({ type: 'ts', start, end, value: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push({ type: 'text', value: text.slice(lastIndex) });
  return parts;
}

function formatTimestamp(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds - m * 60;
  return `${String(m).padStart(2, '0')}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}

function injectRelativeTimestamps(text, videoDuration) {
  if (!text || !videoDuration) return text;
  const parts = parseTimestampBlocks(text);
  const tsParts = parts.filter(p => p.type === 'ts');

  if (tsParts.length > 0) {
    const originalEnd = Math.max(...tsParts.map(p => p.end));
    const originalStart = Math.min(...tsParts.map(p => p.start));
    const originalSpan = originalEnd - originalStart || originalEnd || 1;
    const scale = videoDuration / originalSpan;
    return parts.map(p => {
      if (p.type === 'text') return p.value;
      const newStart = Math.max(0, (p.start - originalStart) * scale);
      const newEnd = Math.min(videoDuration, (p.end - originalStart) * scale);
      return `[${formatTimestamp(newStart)}-${formatTimestamp(newEnd)}]`;
    }).join('');
  }

  const lines = text.split('\n');
  const shotLineRe = /^(SHOT\s*\d+|shot\s*\d+|BEAT\s*\d+|\[\d)/i;
  const beatIndices = lines.reduce((acc, line, i) => {
    if (shotLineRe.test(line.trim())) acc.push(i);
    return acc;
  }, []);

  if (beatIndices.length < 2) return text;

  const interval = videoDuration / beatIndices.length;
  const newLines = [...lines];
  beatIndices.forEach((lineIdx, i) => {
    const start = parseFloat((i * interval).toFixed(2));
    const end = parseFloat(Math.min((i + 1) * interval, videoDuration).toFixed(2));
    newLines[lineIdx] = `[${formatTimestamp(start)}-${formatTimestamp(end)}] ${newLines[lineIdx]}`;
  });
  return newLines.join('\n');
}

function buildShotDetailContext(shot, videoDuration) {
  const rawTiming = shot.action_timing || shot.timing || shot.actionTiming;
  const timedTiming = rawTiming ? injectRelativeTimestamps(rawTiming, videoDuration) : null;
  const details = [
    timedTiming ? `Action timing (timestamps relative to this ${videoDuration}s clip): ${compact(timedTiming, 2000)}` : "",
    shot.visual_style || shot.style || shot.look ? `Visual style: ${compact(shot.visual_style || shot.style || shot.look, 1000)}` : "",
    shot.sound_design || shot.soundDesign || shot.audio_notes ? `Sound/ambience note for visual mood only; do not generate audio: ${compact(shot.sound_design || shot.soundDesign || shot.audio_notes, 700)}` : "",
    shot.negative_constraints || shot.constraints || shot.avoid ? `Avoid/constraints: ${compact(shot.negative_constraints || shot.constraints || shot.avoid, 1200)}` : "",
  ].filter(Boolean);

  if (!details.length) {
    return `No separate action-timing fields provided; infer subtle realistic micro-actions across the full ${videoDuration || 5}s clip and preserve the source frame.`;
  }

  return details.map(detail => `- ${detail}`).join("\n");
}

function buildTimedWords(words) {
  if (!Array.isArray(words) || !words.length) return "none";
  return words
    .slice(0, 80)
    .map(word => `${word.word || word.text || ""}(${word.start ?? "?"}-${word.end ?? "?"})`)
    .join(", ");
}

function buildTranscriptContext(lines) {
  if (!Array.isArray(lines) || !lines.length) return "No transcript lines provided.";
  return lines
    .slice(0, 30)
    .map(line => {
      const timing = line.start !== undefined || line.end !== undefined
        ? `${line.start ?? "?"}-${line.end ?? "?"}s`
        : "untimed";
      return `- ${timing}: ${compact(line.text || line.lyrics || line.line, 240)}`;
    })
    .join("\n");
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

export function selectVideoPrompt(shot, promptOverride) {
  return (
    promptOverride ||
    shot.video_prompt ||
    shot.motion_prompt ||
    shot.clip_prompt ||
    shot.p ||
    shot.prompt
  );
}

export function buildPrompt({ shot, projectState, promptOverride, usedSourceImage, videoDuration }) {
  const characters = projectState?.characters || [];
  const locations = projectState?.locations || [];
  const namesFrom = (items = []) => {
    if (!Array.isArray(items)) return [];
    return items.map(item => item?.name).filter(Boolean);
  };
  const selectedByName = (items = [], names = []) => {
    if (!Array.isArray(items) || !Array.isArray(names)) return [];
    const wanted = new Set(names.map(name => String(name).toLowerCase()));
    return items.filter(item => wanted.has(String(item?.name || "").toLowerCase()));
  };

  const shotCharacters = shot.characters?.length ? shot.characters : namesFrom(characters);
  const shotLocations = shot.locations?.length ? shot.locations : namesFrom(locations);

  const kbContext = getShotBrainContext(projectState?.knowledge_base, shot);
  const matchedCharacters = selectedByName(characters, shotCharacters);
  const matchedLocations = selectedByName(locations, shotLocations);

  const charLabelMap = buildCharacterLabelMap(shotCharacters);

  const anonymousCharacterList = shotCharacters.map(n => applyCharLabel(n, charLabelMap)).join(", ") || "No visible character required";

  const characterContext = matchedCharacters.map(character => {
    const label = applyCharLabel(character.name, charLabelMap);
    const costumeText = character.costume ? ` Costume/wardrobe: ${compact(character.costume, 260)}` : "";
    return `- ${label}: ${compact(character.visual_prompt || character.description || character.role, 500)}${costumeText}`;
  }).join("\n");

  const locationContext = matchedLocations.map(location => (
    `- ${location.name}: ${compact(location.visual_prompt || location.description, 500)}`
  )).join("\n");
  const characterReferenceContext = describeReferenceSet(matchedCharacters, "Character", charLabelMap);
  const locationReferenceContext = describeReferenceSet(matchedLocations, "Location", charLabelMap);

  const shotAction = rawClipText(
    selectVideoPrompt(shot, promptOverride),
    6400,
    "Raw uninterrupted source-footage shot matching the shot title and project context."
  );
  const safeCamera = rawClipText(shot.camera, 300, "plain 16:9 source-footage framing");
  const safeMovement = rawClipText(shot.movement, 300, "simple stable camera movement");
  const safeImagePrompt = rawClipText(shot.image_prompt, 1600);

  return `
Generate one raw source-footage video shot for a music video editor.
This is not the final music video edit. The user will add cuts, transitions, stylization, titles, overlays, and effects later.
The clip must be native 16:9 widescreen with normal full-frame composition. Do not create vertical, square, letterboxed, pillarboxed, split-screen, bordered, framed, matted, or wall-like compositions.

SHOT TITLE:
${shot.n}

RAW SOURCE SHOT ACTION:
${shotAction}

SHOT DETAIL FIELDS:
${buildShotDetailContext(shot, videoDuration)}

TIMING AND VOCAL CUE:
Song time: ${shot.start ?? "unknown"}s to ${shot.end ?? "unknown"}s, planned shot duration ${shot.duration || 5}s
Lyrics: ${compact(shot.lyrics || "", 650)}
Timed words: ${buildTimedWords(shot.words)}
Use the lyric timing only as a timing and emotional cue. This generator is not receiving the song audio, so do not stage exact mouth-to-word lip sync.

PROJECT STORY CONTEXT:
Title: ${projectState?.script?.title || "Untitled music video"}
Mood: ${compact(projectState?.script?.mood || projectState?.analysis?.mood, 650)}
Storyline: ${compact(projectState?.script?.storyline || projectState?.analysis?.summary, 900)}
Genre/theme: ${compact(projectState?.analysis?.genre || projectState?.analysis?.theme, 400)}
BPM: ${projectState?.analysis?.bpm || "unknown"}
Script scenes:
${buildScriptSceneContext(projectState?.script?.scenes)}

VOCAL TRANSCRIPT CONTEXT:
${buildTranscriptContext(projectState?.transcript)}

SHOT NON-NEGOTIABLES:
${buildLockedShotFacts(shot, projectState, shotCharacters, shotLocations, charLabelMap)}
${kbContext ? `\nSHOT BRAIN CONTEXT (pre-distilled master context — highest priority for identity, wardrobe, location, style, and story):\n${kbContext}` : ""}

CHARACTER CONTINUITY:
Characters are referred to by anonymous production labels below. These labels carry no real-world name association. Do NOT look up any label or associate it with any celebrity, athlete, politician, actor, musician, or public figure. Appearance comes ONLY from the CHARACTER reference sets and description text.
Use only these characters when characters are visible:
${anonymousCharacterList}
${characterContext || "No character visual reference text provided."}

LOCATION CONTINUITY:
Use only these named locations/sets:
${shotLocations.join(", ") || "No specific location required"}
${locationContext || "No location visual reference text provided."}

APPROVED VISUAL REFERENCE SETS:
${characterReferenceContext || locationReferenceContext ? [characterReferenceContext, locationReferenceContext].filter(Boolean).join("\n") : "No approved character/location reference sets listed."}
When a source image is provided, treat it as the approved first frame. Preserve subject identity, clothing, location, and lighting palette exactly for the full clip duration — the reference sets above confirm what those should look like.

CAMERA, MOTION, AND STYLE:
- Shot size: ${shot.shot_size || "plain source-footage framing"}
- Camera/lens: ${safeCamera}
- Movement: ${safeMovement}
- Story beat: ${shot.beat || "match the shot action and lyric emotion"}
- Still-image continuity prompt: ${safeImagePrompt}
- Source image provided: ${usedSourceImage ? "yes, it has verified native 16:9 dimensions; preserve subject identity, location, lighting, palette, and full-width composition" : "no, infer continuity from the text context and generate native 16:9 from scratch"}

Rules:
1. Output one plain continuous photorealistic source clip. No cuts, no edits, no simulated transitions, no text, no captions, no labels, no watermarks, no borders, no UI, no split screens, no title cards, no matte boxes, no black panels, and no visible transition devices.
2. Treat the approved script, shot concept, named characters, explicit wardrobe overrides, costume/outfit images from the source frame, base character reference outfits, named locations, and source frame as non-negotiable production locks. Do not rename, redesign, replace, merge, or contradict them.
2a. Do NOT invent new named characters, new named locations, new relationships, or alternate outfits. Use only the characters, locations, style rules, and wardrobe overrides listed above.
3. Preserve continuity with the named characters, locations, source image, wardrobe, lighting, lens language, and emotional arc.
4. CHARACTER IDENTITY — CRITICAL: Main character faces, skin tone, hair, and body must match the CHARACTER reference set only. Any people visible inside LOCATION reference images are irrelevant background extras. Do NOT carry their faces, skin tone, hair, or clothing into the main characters at any point in the clip.
5. Make the clip visually rich and grounded: foreground, midground, background, props, texture, clothing fabric, facial expression, body posture, environment geography, and practical lighting must remain readable.
5. Follow action timing when present. The timestamps in the action timing block are relative to this clip's duration (0s to ${videoDuration || 5}s). Stage each beat at exactly the indicated moment, keeping movement subtle, natural, and realistic.
6. Keep camera motion simple, stable, and usable as raw footage. If the prompt says static, locked-off, no zoom, no pan, or no camera movement, obey it exactly for the full clip.
7. Do not invent extra main characters unless the shot explicitly asks for background extras.
8. GENERATE SILENT VIDEO. Do not include sound, ambient noise, dialogue, or music. The video will be layered over a separate audio track.
9. AVOID: black walls, black wipes, black bars, iris wipes, curtains, scene-change transitions, text, subtitles, captions, logo, watermark, title card, UI, split screen, deformed hands, warped face, extra limbs, face morphing, flicker, or bad anatomy.
10. Make the clip ready for the user to edit later: clear first frame, readable action, stable composition, natural depth, and consistent lighting.
11. Start the readable action immediately in the first second. Do not add slow pre-roll, delayed entrances, or empty establishing time before the beat.
12. Avoid close-up visible mouths forming specific lyrics. For singer/rapper shots, use loose performance energy, side/profile angles, silhouette, microphone movement, dance, reactions, or cutaways so imperfect lip sync is not visible.
13. Compose safely for 16:9 center crop with the main subject inside the central safe area for the full clip.
14. Keep the shot as a single scene and camera setup. Do not simulate an edit, wipe, curtain, blackout, lens cap pass, or object passing close to camera as a transition.
15. If any shot text implies a transition, montage, or final edited music-video moment, ignore that part and reinterpret it as plain continuous raw action within the same 16:9 shot.
16. Do not imitate a square photo, album cover, portrait frame, theatrical curtain reveal, stage drape, vignette, or bordered picture-in-picture inside the 16:9 canvas.
17. Keep the tone grounded, natural, and serious unless the user explicitly requested a different tone.
`;
}

function stripPromptSection(prompt, header, nextHeader) {
  const start = prompt.indexOf(header);
  if (start < 0) return prompt;
  const end = nextHeader ? prompt.indexOf(nextHeader, start) : -1;
  if (end < 0) return `${prompt.slice(0, start).trimEnd()}\n`;
  return `${prompt.slice(0, start).trimEnd()}\n\n${prompt.slice(end).trimStart()}`;
}

export function buildAudioSafePrompt(prompt) {
  if (!prompt) return "";
  let safePrompt = String(prompt);

  safePrompt = stripPromptSection(safePrompt, "TIMING AND VOCAL CUE:", "PROJECT STORY CONTEXT:");
  safePrompt = stripPromptSection(safePrompt, "VOCAL TRANSCRIPT CONTEXT:", "SHOT NON-NEGOTIABLES:");

  safePrompt = safePrompt
    .replace(/lyrics?:/gi, "timing cue:")
    .replace(/\bvocal\b/gi, "performance")
    .replace(/\bsinging\b/gi, "expressive performance")
    .replace(/\bvoice\b/gi, "expression")
    .replace(/\baudio\b/gi, "soundtrack")
    .replace(/\bmusic\b/gi, "backing track")
    .replace(/\blip[-\s]?sync\b/gi, "mouth movement matching");

  return `${safePrompt.trim()}\n\nAUDIO FILTER FALLBACK MODE:\nTreat this as visual-only generation. Avoid any dependence on lyrics, vocals, dialogue, or spoken-word cues.\n`;
}
