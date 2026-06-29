import { prisma } from "@/utils/prisma";
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

  const project = await prisma.project.findFirst({
    where: { id: projectId, user_id: user.id }
  });

  if (!project) {
    return errorResponse("Project not found", 404);
  }

  return Response.json({
    project: project,
    summary: projectSummary(project),
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
