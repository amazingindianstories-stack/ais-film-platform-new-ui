import { geminiAgent } from "@/utils/geminiAgents";
import { getProjectAudioDuration, normalizeShotListForVeo } from "@/utils/shotList";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { projectState } = await req.json();

    if (!projectState) {
      return NextResponse.json({ error: "Missing projectState" }, { status: 400 });
    }

    const result = await geminiAgent.generateShotList(projectState);
    const shots = normalizeShotListForVeo(result, {
      audioDuration: getProjectAudioDuration(projectState),
    });

    if (!shots.length) {
      return NextResponse.json({ error: "No shots were created. Please try again." }, { status: 502 });
    }

    return NextResponse.json({
      shots,
      coverage_notes: result.coverage_notes || result.coverage || '',
    });
  } catch (error) {
    console.error("Shot List Generation API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
