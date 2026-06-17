import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

// Additive new-UI bridge route. Mirrors save-character for locations: uploads
// location reference + angle images to Supabase storage and merges the location
// (name, description, images, angle_images) into project_state.locations — the
// same slice the knowledge-base builder and the spatial location agent read.
function isAuthorized(req) {
  const expected = process.env.STUDIO_BACKEND_SHARED_SECRET;
  if (!expected) return true;
  return req.headers.get("x-studio-backend-key") === expected;
}

function sanitize(value, fallback = "item") {
  return String(value || fallback)
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || fallback;
}

const normalizeName = (value) => String(value || "").trim().toLowerCase();

export async function POST(req) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized backend bridge request." }, { status: 401 });
  }

  let formData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const projectId = String(formData.get("projectId") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const bio = formData.get("bio");
  const kind = String(formData.get("kind") || "reference").trim() === "angle" ? "angle" : "reference";
  const removePath = String(formData.get("removePath") || "").trim();
  const files = formData.getAll("files").filter((f) => f && typeof f.arrayBuffer === "function");

  if (!projectId) return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Location needs a name." }, { status: 400 });

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

    // Upload any provided images.
    const uploaded = [];
    for (const file of files) {
      if (Number(file.size) > MAX_IMAGE_BYTES) continue;
      const path = `${projectId}/locations/${sanitize(name)}/${kind}/${Date.now()}-${sanitize(file.name, "image")}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: uploadError } = await supabase.storage
        .from("assets")
        .upload(path, buffer, { contentType: file.type || "image/png", upsert: false });
      if (uploadError) continue;
      const { data: { publicUrl } } = supabase.storage.from("assets").getPublicUrl(path);
      uploaded.push({ url: publicUrl, path, kind, label: `${name} ${kind}`, uploaded_at: new Date().toISOString() });
    }

    const projectState = project.project_state || {};
    const locations = Array.isArray(projectState.locations) ? [...projectState.locations] : [];
    let index = locations.findIndex((l) => normalizeName(l?.name) === normalizeName(name));
    if (index === -1) {
      locations.push({ name, description: "", visual_prompt: "", images: [], angle_images: [] });
      index = locations.length - 1;
    }

    const existing = { ...locations[index] };
    existing.name = name;
    if (bio != null) {
      existing.description = String(bio);
      if (!existing.visual_prompt) existing.visual_prompt = String(bio);
    }
    if (removePath) {
      existing.images = (existing.images || []).filter((img) => img?.path !== removePath);
      existing.angle_images = (existing.angle_images || []).filter((img) => img?.path !== removePath);
      try {
        await supabase.storage.from("assets").remove([removePath]);
      } catch (cleanupError) {
        console.warn("[studio/save-location] storage cleanup failed:", cleanupError?.message);
      }
    }
    if (uploaded.length) {
      if (kind === "angle") {
        existing.angle_images = [...(existing.angle_images || []), ...uploaded];
      } else {
        existing.images = [...(existing.images || []), ...uploaded];
      }
    }
    locations[index] = existing;

    const newState = { ...projectState, locations };
    const { error: updateError } = await supabase
      .from("projects")
      .update({ project_state: newState })
      .eq("id", projectId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, projectId, location: existing, entity: existing, locations });
  } catch (error) {
    console.error("[studio/save-location] failed:", error);
    return NextResponse.json({ error: error.message || "Failed to save location." }, { status: 500 });
  }
}
