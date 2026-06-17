import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase-admin";

const MAX_AUDIO_BYTES = 200 * 1024 * 1024;

function isAuthorized(req) {
  const expected = process.env.STUDIO_BACKEND_SHARED_SECRET;
  if (!expected) return true;
  return req.headers.get("x-studio-backend-key") === expected;
}

function sanitizeFileName(value) {
  return String(value || "track")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

function storagePathFromPublicUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const marker = "/storage/v1/object/public/assets/";
    const index = parsed.pathname.indexOf(marker);
    if (index === -1) return "";
    return decodeURIComponent(parsed.pathname.slice(index + marker.length));
  } catch {
    const parts = String(url).split("/assets/");
    return parts.length > 1 ? decodeURIComponent(parts[parts.length - 1]) : "";
  }
}

export async function POST(req) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized backend bridge request." }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const projectId = String(formData.get("projectId") || "").trim();
    const file = formData.get("file");
    const cleanupPrevious = String(formData.get("cleanupPrevious") || "true") !== "false";

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ error: "Missing audio file." }, { status: 400 });
    }

    if (file.type && !String(file.type).startsWith("audio/")) {
      return NextResponse.json({ error: "Please upload an audio file." }, { status: 400 });
    }

    if (Number(file.size) > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "Audio file must be under 200MB." }, { status: 413 });
    }

    const supabase = createAdminClient();
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("audio_url")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const extension = sanitizeFileName(file.name).split(".").pop() || "audio";
    const fileName = `${Date.now()}-${sanitizeFileName(file.name || `track.${extension}`)}`;
    const storagePath = `${projectId}/audio/${fileName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("assets")
      .upload(storagePath, buffer, {
        contentType: file.type || "audio/mpeg",
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from("assets")
      .getPublicUrl(storagePath);

    const { error: updateError } = await supabase
      .from("projects")
      .update({ audio_url: publicUrl })
      .eq("id", projectId);

    if (updateError) throw updateError;

    if (cleanupPrevious && project.audio_url) {
      const previousPath = storagePathFromPublicUrl(project.audio_url);
      if (previousPath && previousPath !== storagePath) {
        await supabase.storage.from("assets").remove([previousPath]);
      }
    }

    return NextResponse.json({
      success: true,
      audioUrl: publicUrl,
      storagePath,
      projectId,
    });
  } catch (error) {
    console.error("[studio/upload-audio] failed:", error);
    return NextResponse.json(
      { error: error.message || "Audio upload failed." },
      { status: 500 }
    );
  }
}
