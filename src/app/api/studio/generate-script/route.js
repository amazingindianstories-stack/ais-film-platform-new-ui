import { NextResponse } from "next/server";
import { prisma } from "@/utils/prisma";
import { geminiAgent } from "@/utils/geminiAgents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Additive new-UI bridge route. Reuses the frozen geminiAgent.generateScript and
// persists the creative plan into project_state (mirrors /api/analyze's persist).
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
    const { projectId, idea, transcript } = await req.json();
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

    const projectState = project.project_state || {};
    const analysis = projectState.analysis || {};
    const effectiveIdea = String(idea || projectState.script?.summary || analysis.summary || "").trim();
    const effectiveTranscript = Array.isArray(transcript) && transcript.length
      ? transcript
      : (Array.isArray(analysis.lyrics) ? analysis.lyrics : null);

    if (!effectiveIdea && !effectiveTranscript) {
      return NextResponse.json(
        { error: "Add a theme/idea or analyse the track first so there are lyrics to work from." },
        { status: 400 }
      );
    }

    const plan = await geminiAgent.generateScript(
      effectiveIdea || "Create a cinematic music-video plan from the provided lyrics.",
      effectiveTranscript
    );

    if (!plan || !plan.script) {
      return NextResponse.json({ error: "Creative plan generation failed. Please try again." }, { status: 502 });
    }

    const mergedScript = {
      ...(projectState.script || {}),
      ...plan.script,
      summary: plan.script.summary || plan.script.storyline || projectState.script?.summary || effectiveIdea,
      raw_text: projectState.script?.raw_text || plan.script.raw_text || "",
      draft_shot_ideas: Array.isArray(plan.shot_list)
        ? plan.shot_list
        : (projectState.script?.draft_shot_ideas || []),
    };

    const newState = {
      ...projectState,
      script: mergedScript,
      characters: Array.isArray(plan.characters) ? plan.characters : (projectState.characters || []),
      locations: Array.isArray(plan.locations) ? plan.locations : (projectState.locations || []),
      current_step: Math.max(Number(projectState.current_step) || 0, 4),
    };

    try {
      await prisma.project.update({
        where: { id: projectId },
        data: { project_state: newState }
      });
    } catch (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      projectId: cleanProjectId,
      script: newState.script,
      characters: newState.characters,
      locations: newState.locations,
      draft_shot_ideas: newState.script.draft_shot_ideas || [],
      shot_list: Array.isArray(newState.shot_list) ? newState.shot_list : [],
    });
  } catch (error) {
    console.error("[studio/generate-script] failed:", error);
    return NextResponse.json({ error: error.message || "Script generation failed." }, { status: 500 });
  }
}
