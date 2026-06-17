import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req) {
  const expected = process.env.STUDIO_BACKEND_SHARED_SECRET;
  if (!expected) return true;
  return req.headers.get("x-studio-backend-key") === expected;
}

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeScenes(scenes = []) {
  const seen = new Set();

  return (Array.isArray(scenes) ? scenes : [])
    .map((scene, index) => {
      const visual = text(scene?.visual || scene?.description || scene?.text || scene?.script || scene?.summary);
      if (!visual) return null;

      const baseId = text(scene?.id || scene?.scene_id) || `scene-${index + 1}`;
      const id = seen.has(baseId) ? `${baseId}-${index + 1}` : baseId;
      seen.add(id);

      const start = numberOrNull(scene?.start);
      const end = numberOrNull(scene?.end);
      return {
        ...scene,
        id,
        visual,
        ...(start !== null ? { start } : {}),
        ...(end !== null ? { end } : {}),
        ...(text(scene?.lyrics) ? { lyrics: text(scene.lyrics) } : {}),
        source: scene?.source || "user",
        updated_at: new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

export async function POST(req) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized backend bridge request." }, { status: 401 });
  }

  try {
    const { projectId, scenes } = await req.json();
    const cleanProjectId = text(projectId);
    if (!cleanProjectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    const normalizedScenes = normalizeScenes(scenes);
    if (!normalizedScenes.length) {
      return NextResponse.json({ error: "Add at least one scene before saving." }, { status: 400 });
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
    const now = new Date().toISOString();
    const script = {
      ...(projectState.script || {}),
      scenes: normalizedScenes,
      scenes_user_edited: true,
      scenes_updated_at: now,
      scenes_approved_at: now,
    };

    const newState = {
      ...projectState,
      script,
      current_step: Math.max(Number(projectState.current_step) || 0, 4),
    };

    const { error: updateError } = await supabase
      .from("projects")
      .update({ project_state: newState })
      .eq("id", cleanProjectId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, projectId: cleanProjectId, script });
  } catch (error) {
    console.error("[studio/save-script-analysis] failed:", error);
    return NextResponse.json({ error: error.message || "Failed to save script analysis." }, { status: 500 });
  }
}
