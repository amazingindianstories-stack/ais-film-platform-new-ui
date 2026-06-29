import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/utils/prisma";
import { storage } from "@/utils/storage";

const MAX_TITLE_LENGTH = 160;

export function errorResponse(message, status = 500) {
  return Response.json({ error: message }, { status });
}

export async function getDashboardUser(req) {
  const session = await getServerSession(authOptions);
  return session?.user || null;
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

export async function listProjectAssetPaths(prefix) {
  const out = [];
  const { data, error } = await storage.from("assets").list(prefix);

  if (error) {
    console.warn(`[dashboard/projects] asset list failed for ${prefix}:`, error?.message || error);
    return out;
  }

  for (const item of data || []) {
    const path = `${prefix}/${item.name}`;
    if (item.id || item.metadata) {
      out.push(path);
    } else {
      out.push(...await listProjectAssetPaths(path));
    }
  }

  return out;
}

export async function deleteProjectAndAssets({ projectId, userId }) {
  const project = await prisma.project.findUnique({
    where: { id: projectId, user_id: userId }
  });

  if (!project) {
    return { error: "Project not found", status: 404 };
  }

  const assetPaths = await listProjectAssetPaths(projectId);
  if (assetPaths.length) {
    const { error: removeError } = await storage.from("assets").remove(assetPaths);
    if (removeError) {
      return { error: removeError.message || "Project assets could not be deleted", status: 500 };
    }
  }

  try {
    await prisma.project.delete({
      where: { id: projectId }
    });
  } catch (deleteError) {
    return { error: deleteError.message || "Project could not be deleted", status: 500 };
  }

  return { projectId, deletedAssetCount: assetPaths.length };
}
