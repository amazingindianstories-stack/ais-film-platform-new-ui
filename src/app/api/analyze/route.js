import { GoogleGenerativeAI } from "@google/generative-ai";
import { createAdminClient } from "@/utils/supabase-admin";
import {
  getFallbackModels,
  runWithModelFallback,
  TRANSCRIPT_MODEL_FALLBACKS,
} from "@/utils/googleModelFallbacks";
import { NextResponse } from "next/server";

const genAI = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
  : null;

export async function POST(req) {
  try {
    const { projectId, audioUrl, audioDurationSeconds } = await req.json();

    if (!projectId || !audioUrl) {
      return NextResponse.json({ error: "Missing projectId or audioUrl" }, { status: 400 });
    }

    if (!genAI) {
      return NextResponse.json({ error: "Song analysis is temporarily unavailable." }, { status: 500 });
    }

    console.log(`Starting analysis for project ${projectId} with audio ${audioUrl}`);

    // 1. Fetch the audio file from Supabase URL
    const audioResp = await fetch(audioUrl);
    if (!audioResp.ok) throw new Error("Failed to fetch audio from URL");
    
    const audioBuffer = Buffer.from(await audioResp.arrayBuffer());
    const mimeType = audioResp.headers.get("content-type") || "audio/mpeg";

    const prompt = `
      Analyze this audio track (it's a song/music piece). 
      1. Identify the core theme, mood, and emotional journey.
      2. Identify the genre and BPM.
      3. CRITICAL: Transcribe the lyrics with WORD-BY-WORD start and end timestamps. 
         - Do not just provide line-level timing.
         - For every line, provide a list of every single word with its precise timing.
      
      Return the analysis STRICTLY as a JSON object with this structure:
      {
        "theme": "string",
        "mood": "string",
        "genre": "string",
        "bpm": number,
        "summary": "string",
        "lyrics": [
          { 
            "text": "The full line of lyrics", 
            "start": 0.0, 
            "end": 4.5,
            "words": [
              { "word": "The", "start": 0.0, "end": 0.5 },
              { "word": "full", "start": 0.6, "end": 1.2 },
              ...
            ]
          },
          ...
        ]
      }
    `;

    console.log("Sending to Gemini...");
    const { result, model } = await runWithModelFallback({
      label: "Transcript/audio analysis",
      models: getFallbackModels(process.env.GOOGLE_TRANSCRIPT_MODEL, TRANSCRIPT_MODEL_FALLBACKS),
      operation: async (modelName) => {
        const activeModel = genAI.getGenerativeModel({ model: modelName });
        return activeModel.generateContent([
          prompt,
          {
            inlineData: {
              data: audioBuffer.toString("base64"),
              mimeType: mimeType
            }
          }
        ]);
      },
    });
    const response = await result.response;
    const text = response.text();
    
    // Robust JSON extraction
    let analysis;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      analysis = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("Could not find JSON in Gemini response: " + text);
    }

    console.log(`Analysis complete using ${model}:`, analysis.theme);

    const transcriptEndSeconds = Array.isArray(analysis.lyrics)
      ? analysis.lyrics.reduce((max, line) => {
          const lineEnd = Number(line?.end);
          const wordEnd = Array.isArray(line?.words)
            ? line.words.reduce((wordMax, word) => {
                const end = Number(word?.end);
                return Number.isFinite(end) ? Math.max(wordMax, end) : wordMax;
              }, 0)
            : 0;
          return Math.max(max, Number.isFinite(lineEnd) ? lineEnd : 0, wordEnd);
        }, 0)
      : 0;

    // 4. Update the project in Supabase
    const supabase = createAdminClient();
    
    // Fetch current state to merge
    const { data: project, error: fetchError } = await supabase
      .from('projects')
      .select('project_state')
      .eq('id', projectId)
      .single();

    if (fetchError) throw fetchError;

    const newState = {
      ...project.project_state,
      ...(Number.isFinite(Number(audioDurationSeconds)) && Number(audioDurationSeconds) > 0
        ? { audio_duration_seconds: Number(Number(audioDurationSeconds).toFixed(2)) }
        : {}),
      analysis: {
        ...analysis,
        audio_duration_seconds: Number.isFinite(Number(audioDurationSeconds)) && Number(audioDurationSeconds) > 0
          ? Number(Number(audioDurationSeconds).toFixed(2))
          : project.project_state?.audio_duration_seconds,
        transcript_end_seconds: Number(transcriptEndSeconds.toFixed(2)),
        analysis_model: model,
      },
      current_step: 2 // Move to next step logically
    };

    const { error: updateError } = await supabase
      .from('projects')
      .update({ project_state: newState })
      .eq('id', projectId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, analysis: newState.analysis });

  } catch (error) {
    console.error("Analysis API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
