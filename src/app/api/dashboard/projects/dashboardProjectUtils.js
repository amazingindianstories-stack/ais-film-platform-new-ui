import { createAdminClient } from "@/utils/supabase-admin";
import { createClient as createServerSupabaseClient } from "@/utils/supabase-server";

const MAX_TITLE_LENGTH = 160;

export function errorResponse(message, status = 500) {
  return Response.json({ error: message }, { status });
}

function bearerToken(req) {
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

export async function getDashboardUser(req) {
  const token = bearerToken(req);

  if (token) {
    const supabase = createAdminClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data?.user) return data.user;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) return null;
  return data.user;
}

export function cleanProjectTitle(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LENGTH);
}

export function projectSummary(project) {
  const state = project?.project_state || {};
  const analysis = state.analysis || {};
  const shotList = Array.isArray(state.shot_list) ? state.shot_list : [];

  return {
    id: project.id,
    title: project.title,
    audio_url: project.audio_url,
    created_at: project.created_at,
    updated_at: project.updated_at,
    current_step: state.current_step || 1,
    has_audio: Boolean(project.audio_url),
    has_analysis: Boolean(analysis.summary || analysis.lyrics?.length),
    shot_count: shotList.length,
  };
}

export async function requireDashboardUser(req) {
  const user = await getDashboardUser(req);
  if (!user) {
    return {
      user: null,
      response: errorResponse("Authentication required", 401),
    };
  }

  return { user, response: null };
}

export async function listProjectAssetPaths(supabase, prefix) {
  const out = [];
  const { data, error } = await supabase.storage.from("assets").list(prefix);

  if (error) {
    console.warn(`[dashboard/projects] asset list failed for ${prefix}:`, error.message);
    return out;
  }

  for (const item of data || []) {
    const path = `${prefix}/${item.name}`;
    if (item.id || item.metadata) {
      out.push(path);
    } else {
      out.push(...await listProjectAssetPaths(supabase, path));
    }
  }

  return out;
}

export async function deleteProjectAndAssets({ projectId, userId }) {
  const supabase = createAdminClient();
  const { data: project, error: fetchError } = await supabase
    .from("projects")
    .select("id,user_id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .single();

  if (fetchError || !project) {
    return { error: "Project not found", status: 404 };
  }

  const assetPaths = await listProjectAssetPaths(supabase, projectId);
  if (assetPaths.length) {
    const { error: removeError } = await supabase.storage.from("assets").remove(assetPaths);
    if (removeError) {
      return { error: removeError.message || "Project assets could not be deleted", status: 500 };
    }
  }

  const { error: deleteError } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", userId);

  if (deleteError) {
    return { error: deleteError.message || "Project could not be deleted", status: 500 };
  }

  return { projectId, deletedAssetCount: assetPaths.length };
}
