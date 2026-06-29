import { NextResponse } from "next/server";
import { prisma } from "@/utils/prisma";

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

export async function POST(req) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized backend bridge request." }, { status: 401 });
  }

  try {
    const { projectId, shotstackExport } = await req.json();
    const cleanProjectId = clean(projectId);
    if (!cleanProjectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { project_state: true }
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const projectState = project.project_state || {};
    const newState = {
      ...projectState,
      shotstack_export: shotstackExport,
      current_step: Math.max(Number(projectState.current_step) || 0, 10),
    };

    try {
      await prisma.project.update({
        where: { id: projectId },
        data: { project_state: newState }
      });
    } catch (updateError) {
      throw updateError;
    }

    return NextResponse.json({ success: true, projectId: cleanProjectId, shotstack_export: shotstackExport });
  } catch (error) {
    console.error("[studio/save-shotstack-export] failed:", error);
    return NextResponse.json({ error: error.message || "Failed to save shotstack export." }, { status: 500 });
  }
}
