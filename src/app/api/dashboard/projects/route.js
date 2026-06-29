import { prisma } from "@/utils/prisma";
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

  try {
    const data = await prisma.project.findMany({
      where: { user_id: user.id },
      orderBy: { updated_at: 'desc' }
    });

    return Response.json({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.name || "",
      },
      projects: data || [],
      summaries: (data || []).map(projectSummary),
    }, {
      headers: {
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      }
    });
  } catch (error) {
    return errorResponse(error.message || "Projects could not be loaded");
  }
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

  try {
    const data = await prisma.project.create({
      data: {
        user_id: user.id,
        title: title,
        project_state: { title },
      }
    });
    // In Supabase version it set `title` column, but wait, schema.prisma only has project_state and id, user_id, created_at, updated_at!
    // Oh! I didn't include `title` or `audio_url` in the Prisma model!
    // Let me check schema.prisma
    // I need to add title and audio_url to the Project model in schema.prisma?
    // Wait, the projectSummary uses project.title and project.audio_url!
    
    // I should stop here and update the Prisma schema to add `title` and `audio_url` if they were columns in Supabase.
    // Yes, they were columns. Let me update `schema.prisma`.
    return Response.json({
      project: data,
      summary: projectSummary(data),
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error.message || "Project could not be created");
  }
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
