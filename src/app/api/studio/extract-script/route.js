import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_FILE_BYTES = 18 * 1024 * 1024;

// Additive new-UI bridge route. Stores the script file in Supabase, reuses the
// frozen /api/extract-script-file for parsing, then persists into project_state.script.
function isAuthorized(req) {
  const expected = process.env.STUDIO_BACKEND_SHARED_SECRET;
  if (!expected) return true;
  return req.headers.get("x-studio-backend-key") === expected;
}

function sanitizeFileName(value) {
  return String(value || "script")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

export async function POST(req) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized backend bridge request." }, { status: 401 });
  }

  let formData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid file upload." }, { status: 400 });
  }

  const projectId = String(formData.get("projectId") || "").trim();
  const file = formData.get("file");
  const storyPrompt = formData.get("storyPrompt") || "";
  const moodWords = formData.get("moodWords") || "[]";

  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
  }
  if (!file || typeof file.arrayBuffer !== "function") {
    return NextResponse.json({ error: "Missing script file." }, { status: 400 });
  }
  if (Number(file.size) > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Script file must be under 18MB." }, { status: 413 });
  }

  try {
    const supabase = createAdminClient();
    const { data: project, error: fetchError } = await supabase
      .from("projects")
      .select("project_state")
      .eq("id", projectId)
      .single();

    if (fetchError || !project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // 1) Store the uploaded file in Supabase storage (assets/<projectId>/scripts/).
    const storagePath = `${projectId}/scripts/${Date.now()}-${sanitizeFileName(file.name || "script")}`;
    let fileUrl = "";
    const { error: uploadError } = await supabase.storage
      .from("assets")
      .upload(storagePath, buffer, { contentType: file.type || "application/octet-stream", upsert: false });
    if (!uploadError) {
      fileUrl = supabase.storage.from("assets").getPublicUrl(storagePath).data.publicUrl;
    }

    // 2) Reuse the frozen extractor for the actual parsing.
    const forward = new FormData();
    forward.set("file", new Blob([buffer], { type: file.type || "application/octet-stream" }), file.name || "script");
    forward.set("storyPrompt", storyPrompt);
    forward.set("moodWords", moodWords);

    let extracted = {};
    let extractionStatus = "stored";
    let extractionError = "";
    try {
      const extractRes = await fetch(new URL("/api/extract-script-file", req.url), {
        method: "POST",
        body: forward,
      });
      const data = await extractRes.json().catch(() => ({}));
      if (extractRes.ok && !data.error) {
        extracted = data;
        extractionStatus = "ready";
      } else {
        extractionError = data.error || `Extraction failed with ${extractRes.status}`;
        extractionStatus = "failed";
      }
    } catch (err) {
      extractionError = err.message || "Extraction failed.";
      extractionStatus = "failed";
    }

    const projectState = project.project_state || {};
    const existingScript = projectState.script || {};
    const moodKeywords = Array.isArray(extracted.mood_keywords) && extracted.mood_keywords.length
      ? extracted.mood_keywords
      : (existingScript.mood_keywords || []);

    const mergedScript = {
      ...existingScript,
      raw_text: extracted.raw_text || existingScript.raw_text || "",
      summary: extracted.summary || existingScript.summary || "",
      mood_keywords: moodKeywords,
      mood: moodKeywords.join(", ") || existingScript.mood || "",
      file_url: fileUrl || existingScript.file_url || "",
      file_path: storagePath,
      file_name: file.name || existingScript.file_name || "",
      file_type: file.type || existingScript.file_type || "",
      file_extraction_status: extractionStatus,
      file_extraction_error: extractionError,
      file_summary: extracted.summary || existingScript.file_summary || "",
      file_visual_notes: extracted.visual_notes || existingScript.file_visual_notes || "",
      file_detected_entities: extracted.detected_entities || existingScript.file_detected_entities || null,
      file_uploaded_at: new Date().toISOString(),
    };

    const newState = {
      ...projectState,
      script: mergedScript,
      ...(extracted.visual_notes
        ? { style_bible: { ...(projectState.style_bible || {}), global_notes: extracted.visual_notes } }
        : {}),
    };

    const { error: updateError } = await supabase
      .from("projects")
      .update({ project_state: newState })
      .eq("id", projectId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, projectId, script: newState.script });
  } catch (error) {
    console.error("[studio/extract-script] failed:", error);
    return NextResponse.json({ error: error.message || "Script extraction failed." }, { status: 500 });
  }
}
