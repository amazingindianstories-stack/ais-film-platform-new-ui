import { geminiAgent } from "@/utils/geminiAgents";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { idea, transcript } = await req.json();

    if (!idea) {
      return NextResponse.json({ error: "Missing idea" }, { status: 400 });
    }

    console.log("Generating script for idea:", idea.substring(0, 50) + "...");

    // Generate the comprehensive plan using our existing utility
    // (This utility runs on the server here, so it has access to the API key)
    const plan = await geminiAgent.generateScript(idea, transcript);

    return NextResponse.json(plan);
  } catch (error) {
    console.error("Script Generation API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
