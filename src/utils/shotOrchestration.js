import { getShotBrainContext, isKBUsable } from "@/utils/knowledgeBase";
import { createAdminClient } from "@/utils/supabase-admin";

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeName(value) {
  return cleanText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getProjectShots(projectState = {}) {
  return [
    ...asArray(projectState.shots),
    ...asArray(projectState.shot_list),
    ...asArray(projectState.shot_plan?.shots),
  ];
}

function getProjectScenes(projectState = {}) {
  return [
    ...asArray(projectState.scenes),
    ...asArray(projectState.script?.scenes),
    ...asArray(projectState.shot_plan?.scenes),
  ];
}

function namesFrom(values = []) {
  return asArray(values)
    .map(value => (typeof value === "string" ? value : value?.name || value?.character_name || value?.location_name))
    .map(cleanText)
    .filter(Boolean);
}

export function findShot(projectState, shotId) {
  const target = normalizeName(shotId);
  if (!target) return null;
  return getProjectShots(projectState).find((shot, index) => {
    const keys = [
      shot?.id,
      shot?.shot_id,
      shot?.n,
      shot?.title,
      `shot-${index + 1}`,
      String(index + 1),
    ].map(normalizeName);
    return keys.includes(target);
  }) || null;
}

export function findScene(projectState, sceneId, shot = {}) {
  const target = normalizeName(sceneId || shot.scene_id || shot.sceneId);
  const scenes = getProjectScenes(projectState);
  if (target) {
    const direct = scenes.find((scene, index) => {
      const keys = [
        scene?.id,
        scene?.scene_id,
        scene?.title,
        `scene-${index + 1}`,
        String(index + 1),
      ].map(normalizeName);
      return keys.includes(target);
    });
    if (direct) return direct;
  }

  if (shot.source_scene) {
    const source = normalizeName(shot.source_scene);
    return scenes.find(scene => source.includes(normalizeName(scene?.visual || scene?.description))) || null;
  }

  return null;
}

export function buildShotContext({ projectId, projectState, sceneId, shotId, shot: providedShot = null }) {
  const shot = providedShot || findShot(projectState, shotId);
  if (!shot) throw new Error("Shot not found for orchestration.");

  const scene = findScene(projectState, sceneId, shot) || {};
  const characters = namesFrom(shot.characters).map(name => ({
    name,
    roleInShot: cleanText(shot.role_in_shot || shot.roleInShot || ""),
    emotionalState: cleanText(shot.emotional_state || shot.emotionalState || shot.beat || ""),
    relationshipBeats: namesFrom(shot.relationship_beats || shot.relationshipBeats),
  }));
  const locationNames = namesFrom(shot.locations);
  const locationName = cleanText(shot.location_name || shot.location?.name || locationNames[0] || scene.location_name);

  return {
    projectId,
    kb: projectState?.knowledge_base || null,
    sceneId: cleanText(sceneId || scene.scene_id || scene.id || shot.scene_id),
    shotId: cleanText(shotId || shot.shot_id || shot.id || shot.n),
    shot,
    scene,
    timecode: {
      startBeat: Number(shot.start ?? shot.startBeat ?? 0),
      durationBeats: Number(shot.duration ?? shot.durationBeats ?? 0),
    },
    characters,
    location: {
      name: locationName,
      timeOfDay: cleanText(shot.time_of_day || shot.timeOfDay || scene.time_of_day),
      weather: cleanText(shot.weather || scene.weather),
    },
    wardrobeOverrides: shot.wardrobeOverrides || shot.wardrobe_overrides || null,
    musicalMoment: {
      lyric: cleanText(shot.lyrics || shot.lyric),
      beatType: cleanText(shot.beat_type || shot.beatType || "ambient"),
    },
    brainContext: getShotBrainContext(projectState?.knowledge_base, shot, scene),
  };
}

export function validateAgentJson(value, requiredKeys = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Agent output must be a JSON object." };
  }
  const missing = requiredKeys.filter(key => value[key] === undefined || value[key] === null);
  if (missing.length) {
    return { ok: false, error: `Agent output missing required keys: ${missing.join(", ")}` };
  }
  return { ok: true };
}

function mentionedNames(text, names) {
  const body = ` ${cleanText(text).toLowerCase()} `;
  return names.filter(name => {
    const normalized = normalizeName(name);
    return normalized && body.includes(` ${normalized} `);
  });
}

export function runConsistencyReferee({ shotContext, projectState, proposed }) {
  const text = typeof proposed === "string" ? proposed : JSON.stringify(proposed || {});
  const allCharacterNames = namesFrom(projectState?.characters?.map(character => character?.name));
  const allLocationNames = namesFrom(projectState?.locations?.map(location => location?.name));
  const allowedCharacters = shotContext.characters.map(character => character.name);
  const allowedLocations = [shotContext.location?.name].filter(Boolean);
  const violations = [];

  const disallowedCharacters = mentionedNames(text, allCharacterNames)
    .filter(name => !allowedCharacters.map(normalizeName).includes(normalizeName(name)));
  if (disallowedCharacters.length) {
    violations.push(`Remove unassigned characters: ${disallowedCharacters.join(", ")}`);
  }

  const disallowedLocations = mentionedNames(text, allLocationNames)
    .filter(name => !allowedLocations.map(normalizeName).includes(normalizeName(name)));
  if (disallowedLocations.length) {
    violations.push(`Remove unassigned locations: ${disallowedLocations.join(", ")}`);
  }

  if (/new outfit|different outfit|wardrobe change|alternate costume/i.test(text) && !shotContext.wardrobeOverrides) {
    violations.push("Wardrobe change mentioned without a shot wardrobe override.");
  }

  if (!isKBUsable(shotContext.kb)) {
    violations.push("Project knowledge base is missing or stale for strict generation.");
  }

  if (!violations.length) return { status: "ok" };
  return {
    status: "requires_fix",
    violations,
    corrected: {
      instruction: "Revise the proposed shot using only the allowed project brain context.",
      allowed_characters: allowedCharacters,
      allowed_locations: allowedLocations,
      brain_context: shotContext.brainContext,
    },
  };
}

export async function loadProjectState(projectId) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .select("project_state")
    .eq("id", projectId)
    .single();
  if (error) throw error;
  return data?.project_state || {};
}

export async function planShot(projectId, sceneId, shotId) {
  const projectState = await loadProjectState(projectId);
  const shotContext = buildShotContext({ projectId, projectState, sceneId, shotId });
  return {
    operation: "planShot",
    shotContext,
    requiredOutput: ["story_beat", "blocking", "camera", "wardrobe_notes"],
  };
}

export async function generateShotStoryboard(projectId, sceneId, shotId) {
  const projectState = await loadProjectState(projectId);
  const shotContext = buildShotContext({ projectId, projectState, sceneId, shotId });
  return {
    operation: "generateShotStoryboard",
    shotContext,
    referee: runConsistencyReferee({ shotContext, projectState, proposed: shotContext.brainContext }),
  };
}

export async function generateShotVideo(projectId, sceneId, shotId) {
  const projectState = await loadProjectState(projectId);
  const shotContext = buildShotContext({ projectId, projectState, sceneId, shotId });
  return {
    operation: "generateShotVideo",
    shotContext,
    referee: runConsistencyReferee({ shotContext, projectState, proposed: shotContext.brainContext }),
  };
}
