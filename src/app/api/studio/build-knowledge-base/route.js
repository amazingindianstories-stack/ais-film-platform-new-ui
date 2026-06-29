import { NextResponse } from "next/server";
import { prisma } from "@/utils/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Additive new-UI bridge route. Loads the latest project_state, then reuses the
// frozen /api/build-knowledge-base (the master KB agent) to translate characters /
// locations / style into project_state.knowledge_base prompt-locks.
function isAuthorized(req) {
  const expected = process.env.STUDIO_BACKEND_SHARED_SECRET;
  if (!expected) return true;
  return req.headers.get("x-studio-backend-key") === expected;
}

export async function POST(req) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized backend bridge request." }, { status: 401 });
  }

  try {
    const { projectId } = await req.json().catch(() => ({}));
    const cleanProjectId = String(projectId || "").trim();
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

    const res = await fetch(new URL("/api/build-knowledge-base", req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: cleanProjectId, projectState: project.project_state || {} }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      return NextResponse.json(
        { error: data.error || `Knowledge base build failed with ${res.status}` },
        { status: res.status >= 400 ? res.status : 502 }
      );
    }

    return NextResponse.json({
      success: true,
      projectId: cleanProjectId,
      knowledge_base: data.knowledge_base || null,
      skipped: Boolean(data.skipped),
    });
  } catch (error) {
    console.error("[studio/build-knowledge-base] failed:", error);
    return NextResponse.json({ error: error.message || "Knowledge base build failed." }, { status: 500 });
  }
}
