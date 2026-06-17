export const dynamic = 'force-dynamic';
import { createAdminClient } from "@/utils/supabase-admin";
import {
  cleanProjectTitle,
  deleteProjectAndAssets,
  errorResponse,
  projectSummary,
  requireDashboardUser,
} from "./dashboardProjectUtils";

export async function GET(req) {
  const { user, response } = await requireDashboardUser(req);
  if (response) return response;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return errorResponse(error.message || "Projects could not be loaded");
  }

  return Response.json({
    user: {
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || "",
    },
    projects: data || [],
    summaries: (data || []).map(projectSummary),
  }, {
    headers: {
      "Cache-Control": "no-store, max-age=0, must-revalidate",
    }
  });
}

export async function POST(req) {
  const { user, response } = await requireDashboardUser(req);
  if (response) return response;

  let payload = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const title = cleanProjectTitle(payload.title);
  if (!title) {
    return errorResponse("Project title is required", 400);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .insert([{ user_id: user.id, title }])
    .select()
    .single();

  if (error) {
    return errorResponse(error.message || "Project could not be created");
  }

  return Response.json({
    project: data,
    summary: projectSummary(data),
  }, { status: 201 });
}

export async function DELETE(req) {
  const { user, response } = await requireDashboardUser(req);
  if (response) return response;

  const url = new URL(req.url);
  let projectId = url.searchParams.get("projectId") || "";

  if (!projectId) {
    try {
      const payload = await req.json();
      projectId = String(payload.projectId || "");
    } catch {
      projectId = "";
    }
  }

  if (!projectId) {
    return errorResponse("projectId is required", 400);
  }

  const result = await deleteProjectAndAssets({ projectId, userId: user.id });
  if (result.error) {
    return errorResponse(result.error, result.status);
  }

  return Response.json({ success: true, ...result });
}
