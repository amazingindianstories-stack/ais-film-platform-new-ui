import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase-admin";

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

function toNumber(value, fallback = null) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.match(/-?\d+(\.\d+)?/);
    if (match) return Number(match[0]);
  }
  return fallback;
}

const round2 = (value) => Number(value.toFixed(2));

function normalizeExactTiming(shots) {
  let cursor = 0;
  return (Array.isArray(shots) ? shots : [])
    .map((shot, index) => {
      const source = shot && typeof shot === "object" ? shot : {};
      const rawDuration = toNumber(source.duration, toNumber(source.end) - toNumber(source.start));
      const duration = Math.max(toNumber(rawDuration, 1), 0.1);
      const start = round2(cursor);
      const end = round2(cursor + duration);
      cursor = end;
      return {
        ...source,
        id: clean(source.id) || `shot-${index}`,
        n: clean(source.n || source.name || source.title) || `Shot ${index + 1}`,
        p: clean(source.p || source.prompt || source.description || source.visual),
        start,
        end,
        duration: round2(duration),
      };
    })
    .filter((shot) => shot.n || shot.p);
}

export async function POST(req) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized backend bridge request." }, { status: 401 });
  }

  try {
    const { projectId, shots } = await req.json();
    const cleanProjectId = clean(projectId);
    if (!cleanProjectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    const shotList = normalizeExactTiming(shots);
    if (!shotList.length) {
      return NextResponse.json({ error: "Add at least one shot before saving timing." }, { status: 400 });
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
    const previousMeta = projectState.shot_list_meta || {};
    const shotListMeta = {
      ...previousMeta,
      source: previousMeta.source || "studio",
      status: previousMeta.status || "draft",
      timing_updated_at: new Date().toISOString(),
      coverage_notes: previousMeta.coverage_notes || `${shotList.length} shots saved as a draft production plan.`,
    };

    const { error: updateError } = await supabase
      .from("projects")
      .update({
        project_state: {
          ...projectState,
          shot_list: shotList,
          shot_list_meta: shotListMeta,
        },
      })
      .eq("id", cleanProjectId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, projectId: cleanProjectId, shot_list: shotList, shot_list_meta: shotListMeta });
  } catch (error) {
    console.error("[studio/save-shot-timing] failed:", error);
    return NextResponse.json({ error: error.message || "Failed to save shot timing." }, { status: 500 });
  }
}
