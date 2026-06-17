import { createAdminClient } from "@/utils/supabase-admin";
import {
  deleteProjectAndAssets,
  errorResponse,
  projectSummary,
  requireDashboardUser,
} from "../dashboardProjectUtils";

export async function GET(req, context) {
  const { user, response } = await requireDashboardUser(req);
  if (response) return response;

  const { projectId } = await context.params;
  if (!projectId) {
    return errorResponse("projectId is required", 400);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    return errorResponse("Project not found", 404);
  }

  return Response.json({
    project: data,
    summary: projectSummary(data),
  });
}

export async function DELETE(req, context) {
  const { user, response } = await requireDashboardUser(req);
  if (response) return response;

  const { projectId } = await context.params;
  if (!projectId) {
    return errorResponse("projectId is required", 400);
  }

  const result = await deleteProjectAndAssets({ projectId, userId: user.id });
  if (result.error) {
    return errorResponse(result.error, result.status);
  }

  return Response.json({ success: true, ...result });
}
