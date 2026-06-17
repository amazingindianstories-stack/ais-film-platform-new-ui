import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase-admin";
import { getProjectAudioDuration, normalizeShotListForVeo } from "@/utils/shotList";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req) {
  const expected = process.env.STUDIO_BACKEND_SHARED_SECRET;
  if (!expected) return true;
  return req.headers.get("x-studio-backend-key") === expected;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function countTranscriptWords(lines) {
  if (!Array.isArray(lines)) return 0;
  return lines.reduce((total, line) => total + (Array.isArray(line?.words) ? line.words.length : 0), 0);
}

function wardrobeOutfitCount(wardrobe = []) {
  if (!Array.isArray(wardrobe)) return 0;
  return wardrobe.reduce((total, location) => {
    const outfits = Array.isArray(location?.outfits) ? location.outfits : [];
    return total + outfits.filter((outfit) => (
      clean(outfit?.outfit_name || outfit?.name)
      || clean(outfit?.description || outfit?.outfit_description || outfit?.prompt)
      || outfit?.image_url
      || outfit?.imageUrl
      || outfit?.url
    )).length;
  }, 0);
}

export async function POST(req) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized backend bridge request." }, { status: 401 });
  }

  try {
    const { projectId, shots, source = "manual", coverage_notes = "" } = await req.json();
    const cleanProjectId = clean(projectId);
    if (!cleanProjectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: project, error: fetchError } = await supabase
      .from("projects")
      .select("project_state")
      .eq("id", cleanProjectId)
      .single();

    if (fetchError || !project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const projectState = project.project_state || {};
    const audioDuration = getProjectAudioDuration(projectState);
    const shotList = normalizeShotListForVeo(shots, { audioDuration });
    if (!shotList.length) {
      return NextResponse.json({ error: "Add at least one shot before saving." }, { status: 400 });
    }

    const transcript = projectState.analysis?.lyrics || projectState.script?.lyrics_timeline || [];
    const scenes = Array.isArray(projectState.script?.scenes) ? projectState.script.scenes : [];
    const wardrobe = Array.isArray(projectState.wardrobe) ? projectState.wardrobe : [];
    const shotListMeta = {
      source: clean(source) || "manual",
      status: "draft",
      coverage_notes: clean(coverage_notes) || `${shotList.length} shots saved as a draft production plan.`,
      created_at: new Date().toISOString(),
      required_context: {
        audio_duration_seconds: audioDuration,
        script_scenes: scenes.length,
        transcript_lines: Array.isArray(transcript) ? transcript.length : 0,
        timed_words: countTranscriptWords(transcript),
        characters: Array.isArray(projectState.characters) ? projectState.characters.length : 0,
        locations: Array.isArray(projectState.locations) ? projectState.locations.length : 0,
        wardrobe_locations: wardrobe.length,
        wardrobe_outfits: wardrobeOutfitCount(wardrobe),
        veo_durations: [4, 6, 8],
        max_shot_duration: 8,
        non_negotiables: ["script", "shot_concepts", "characters", "costumes", "wardrobe_by_location", "locations"],
      },
    };

    const newState = {
      ...projectState,
      shot_list: shotList,
      shot_list_meta: shotListMeta,
      current_step: Math.max(Number(projectState.current_step) || 0, 8),
    };

    const { error: updateError } = await supabase
      .from("projects")
      .update({ project_state: newState })
      .eq("id", cleanProjectId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, projectId: cleanProjectId, shot_list: shotList, shot_list_meta: shotListMeta });
  } catch (error) {
    console.error("[studio/save-shot-plan] failed:", error);
    return NextResponse.json({ error: error.message || "Failed to save shot plan." }, { status: 500 });
  }
}
